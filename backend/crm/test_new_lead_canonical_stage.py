import io
import uuid
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile

from core.models import Student, Program
from crm.models import PipelineStage, Campaign, WebhookEndpoint, LeadInteraction
from crm.utils import (
    get_canonical_new_lead_stage,
    get_canonical_new_lead_stage_id,
    get_canonical_converted_stage,
    get_canonical_converted_stage_id,
)
from core.serializers import StudentSerializer

User = get_user_model()


class NewLeadCanonicalStageTests(TestCase):
    """
    Critical Business Rule Test Suite: NEW LEAD STAGE
    Proves that:
    1. A freshly pushed lead enters canonical "New Lead" stage.
    2. A manually created lead enters canonical "New Lead" stage.
    3. An imported lead (CSV, batch, Google sync, bulk) enters canonical "New Lead" stage.
    4. An existing lead in Follow-up or other valid stage is NOT reset to "New Lead" by subsequent updates/syncs.
    5. A converted lead is NOT accidentally reverted to "New Lead".
    6. All lead-creation paths produce the exact same canonical stage.
    """

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username='admin_canonical',
            password='Password@123',
            email='admin_canonical@example.com',
            role='SUPER_ADMIN'
        )
        self.client.force_authenticate(user=self.admin)

        self.program = Program.objects.create(name='Classical Dance')

        # Set up pipeline stages
        self.stage_new = PipelineStage.objects.create(name='New Lead', order=1, is_default=True)
        self.stage_followup = PipelineStage.objects.create(name='Follow-up', order=2)
        self.stage_in_discussion = PipelineStage.objects.create(name='In Discussion', order=3)
        self.stage_converted = PipelineStage.objects.create(name='Converted', order=4)
        self.stage_dropped = PipelineStage.objects.create(name='Dropped', order=5)

        # Campaign setup
        self.campaign = Campaign.objects.create(
            name='Test Google Ads Campaign',
            platform='GOOGLE',
            section='REGULAR',
            secret_token=uuid.uuid4()
        )

        # Webhook endpoint setup
        self.webhook_endpoint = WebhookEndpoint.objects.create(
            name='Website Landing Page Webhook',
            secret_token=uuid.uuid4(),
            is_active=True
        )

    def test_canonical_stage_resolvers(self):
        """Verifies get_canonical_new_lead_stage and get_canonical_converted_stage resolve dynamically."""
        stage = get_canonical_new_lead_stage()
        self.assertEqual(stage.id, self.stage_new.id)
        self.assertEqual(stage.name, 'New Lead')
        self.assertEqual(get_canonical_new_lead_stage_id(), str(self.stage_new.id))

        converted_stage = get_canonical_converted_stage()
        self.assertEqual(converted_stage.id, self.stage_converted.id)
        self.assertEqual(converted_stage.name, 'Converted')
        self.assertEqual(get_canonical_converted_stage_id(), str(self.stage_converted.id))

    def test_freshly_pushed_lead_enters_new_lead_via_generic_webhook(self):
        """1a. Freshly pushed lead from generic webhook enters canonical 'New Lead'."""
        url = f"/api/crm/webhooks/{self.webhook_endpoint.secret_token}/lead/"
        payload = {
            "name": "Arjun Sharma",
            "phone": "+919876543210",
            "email": "arjun.sharma@example.com",
            "city": "Mumbai"
        }
        res = self.client.post(url, payload, format='json')
        self.assertIn(res.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])

        student = Student.objects.get(mobile="+919876543210")
        canonical_id = get_canonical_new_lead_stage_id()
        self.assertEqual(student.lead_status, canonical_id)
        self.assertEqual(student.lead_status, str(self.stage_new.id))

    def test_freshly_pushed_lead_enters_new_lead_via_campaign_webhook(self):
        """1b. Freshly pushed lead from campaign webhook enters canonical 'New Lead'."""
        url = f"/api/crm/webhooks/campaign/{self.campaign.secret_token}/lead/"
        payload = {
            "name": "Diya Patel",
            "phone": "+919876543211",
            "email": "diya.patel@example.com"
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        student = Student.objects.get(mobile="+919876543211")
        canonical_id = get_canonical_new_lead_stage_id()
        self.assertEqual(student.lead_status, canonical_id)
        self.assertEqual(student.lead_status, str(self.stage_new.id))

    def test_manually_created_lead_enters_new_lead_via_api_no_status(self):
        """2a. Manually created lead via POST /api/students/ without lead_status enters 'New Lead'."""
        payload = {
            "first_name": "Kavya",
            "last_name": "Iyer",
            "mobile": "+919876543212",
            "email": "kavya.iyer@example.com",
            "program_type": self.program.id
        }
        res = self.client.post("/api/students/", payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        student = Student.objects.get(mobile="+919876543212")
        canonical_id = get_canonical_new_lead_stage_id()
        self.assertEqual(student.lead_status, canonical_id)

    def test_manually_created_lead_enters_new_lead_via_legacy_new_payload(self):
        """2b. Manually created lead via POST /api/students/ sending lead_status='NEW' enters canonical ID."""
        payload = {
            "first_name": "Meera",
            "last_name": "Nair",
            "mobile": "+919876543213",
            "email": "meera.nair@example.com",
            "program_type": self.program.id,
            "lead_status": "NEW"
        }
        res = self.client.post("/api/students/", payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        student = Student.objects.get(mobile="+919876543213")
        canonical_id = get_canonical_new_lead_stage_id()
        self.assertEqual(student.lead_status, canonical_id)
        self.assertEqual(student.lead_status, str(self.stage_new.id))

    def test_manually_created_lead_enters_new_lead_via_serializer_direct(self):
        """2c. Manually created lead via StudentSerializer directly enters canonical 'New Lead'."""
        serializer = StudentSerializer(data={
            "first_name": "Ananya",
            "last_name": "Verma",
            "mobile": "+919876543214",
            "email": "ananya.verma@example.com",
            "program_type": self.program.id
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        student = serializer.save()

        canonical_id = get_canonical_new_lead_stage_id()
        self.assertEqual(student.lead_status, canonical_id)

    def test_imported_lead_enters_new_lead_via_csv(self):
        """3a. CSV imported leads enter canonical 'New Lead' stage (and never fallback to '2')."""
        csv_content = (
            "Name,Mobile,Email,Place,Course\n"
            "Rahul Roy,+919876543220,rahul.roy@example.com,Kochi,Classical\n"
            "Sneha Das,+919876543221,sneha.das@example.com,Kolkata,Classical\n"
        )
        csv_file = SimpleUploadedFile("leads.csv", csv_content.encode('utf-8'), content_type="text/csv")

        url = f"/api/crm/campaigns/{self.campaign.id}/bulk_upload/"
        res = self.client.post(url, {'file': csv_file}, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        lead1 = Student.objects.get(mobile="+919876543220")
        lead2 = Student.objects.get(mobile="+919876543221")

        canonical_id = get_canonical_new_lead_stage_id()
        self.assertEqual(lead1.lead_status, canonical_id)
        self.assertEqual(lead2.lead_status, canonical_id)
        # Explicit check that it did NOT fallback to '2' (Follow-up)
        self.assertNotEqual(lead1.lead_status, '2')
        self.assertNotEqual(lead2.lead_status, '2')

    def test_imported_lead_enters_new_lead_via_bulk_upload_batch(self):
        """3b. Bulk batch uploaded leads enter canonical 'New Lead' stage."""
        batch_payload = {
            "rows": [
                {
                    "first_name": "Vikas",
                    "last_name": "Gupta",
                    "mobile": "+919876543222",
                    "email": "vikas.gupta@example.com"
                }
            ]
        }
        url = f"/api/crm/campaigns/{self.campaign.id}/bulk_upload_batch/"
        res = self.client.post(url, batch_payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        lead = Student.objects.get(mobile="+919876543222")
        canonical_id = get_canonical_new_lead_stage_id()
        self.assertEqual(lead.lead_status, canonical_id)
        self.assertNotEqual(lead.lead_status, '2')

    def test_imported_lead_enters_new_lead_via_bulk_student_create_view(self):
        """3c. BulkStudentCreateView imports leads directly into canonical 'New Lead'."""
        import pandas as pd
        df = pd.DataFrame([{
            'first_name': 'Tara',
            'last_name': 'Menon',
            'mobile': '+919876543223',
            'email': 'tara.menon@example.com',
            'program_name': self.program.name
        }])
        csv_buffer = io.StringIO()
        df.to_csv(csv_buffer, index=False)
        csv_file = SimpleUploadedFile("bulk_students.csv", csv_buffer.getvalue().encode('utf-8'), content_type="text/csv")

        res = self.client.post('/api/bulk/upload-students/', {'file': csv_file}, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        lead = Student.objects.get(mobile="+919876543223")
        canonical_id = get_canonical_new_lead_stage_id()
        self.assertEqual(lead.lead_status, canonical_id)

    def test_existing_lead_in_followup_not_reset_on_subsequent_update(self):
        """4a. Updating an existing lead in Follow-up stage does NOT reset it to New Lead."""
        user = User.objects.create_user(username='followup_student', password='Password@123', role='STUDENT')
        lead = Student.objects.create(
            user=user,
            crm_student_id='NATYA-FU-01',
            first_name='Rohan',
            last_name='Kapoor',
            mobile='+919876543230',
            email='rohan.kapoor@example.com',
            program_type=self.program,
            lead_status=str(self.stage_followup.id)
        )

        # Update unrelated fields (e.g. city, last_name, cre_update)
        patch_res = self.client.patch(
            f"/api/students/{lead.id}/",
            {"perm_city": "Bengaluru", "last_name": "Kapoor-Updated"},
            format='json'
        )
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)

        lead.refresh_from_db()
        self.assertEqual(lead.lead_status, str(self.stage_followup.id))
        self.assertNotEqual(lead.lead_status, get_canonical_new_lead_stage_id())

    def test_existing_lead_in_followup_not_reset_on_webhook_resync(self):
        """4b. Re-pushing an existing lead in Follow-up via Webhook logs re-engagement and does NOT reset stage."""
        user = User.objects.create_user(username='followup_resync', password='Password@123', role='STUDENT')
        lead = Student.objects.create(
            user=user,
            crm_student_id='NATYA-FU-02',
            first_name='Pooja',
            last_name='Bose',
            mobile='+919876543231',
            email='pooja.bose@example.com',
            program_type=self.program,
            lead_status=str(self.stage_followup.id)
        )

        # Re-send same contact via generic webhook
        url = f"/api/crm/webhooks/{self.webhook_endpoint.secret_token}/lead/"
        res = self.client.post(url, {
            "name": "Pooja Bose",
            "phone": "+919876543231",
            "email": "pooja.bose@example.com"
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        lead.refresh_from_db()
        self.assertEqual(lead.lead_status, str(self.stage_followup.id))
        self.assertNotEqual(lead.lead_status, get_canonical_new_lead_stage_id())

    def test_converted_lead_not_reverted_to_new_lead_on_update(self):
        """5a. Converted lead is NOT accidentally reverted to 'New Lead' upon update or re-sync."""
        user = User.objects.create_user(username='converted_student', password='Password@123', role='STUDENT')
        lead = Student.objects.create(
            user=user,
            crm_student_id='NATYA-CONV-01',
            first_name='Suresh',
            last_name='Pillai',
            mobile='+919876543240',
            email='suresh.pillai@example.com',
            program_type=self.program,
            lead_status=get_canonical_converted_stage_id()
        )

        patch_res = self.client.patch(
            f"/api/students/{lead.id}/",
            {"perm_city": "Chennai"},
            format='json'
        )
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)

        lead.refresh_from_db()
        self.assertEqual(lead.lead_status, get_canonical_converted_stage_id())
        self.assertNotEqual(lead.lead_status, get_canonical_new_lead_stage_id())

    def test_payment_transitions_to_converted_stage_never_new_lead(self):
        """5b. Marking a PAYMENT_PENDING student as paid moves them to Converted stage."""
        user = User.objects.create_user(username='paying_student', password='Password@123', role='STUDENT')
        lead = Student.objects.create(
            user=user,
            crm_student_id='NATYA-PAY-01',
            first_name='Aditya',
            last_name='Nath',
            mobile='+919876543241',
            email='aditya.nath@example.com',
            program_type=self.program,
            lead_status='PAYMENT_PENDING',
            total_fee=5000.0,
            paid_fee=0.0
        )

        res = self.client.post(f"/api/students/{lead.id}/mark_as_paid/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        lead.refresh_from_db()
        self.assertEqual(lead.lead_status, get_canonical_converted_stage_id())
        self.assertEqual(lead.lead_status, str(self.stage_converted.id))
        self.assertNotEqual(lead.lead_status, get_canonical_new_lead_stage_id())

    def test_all_creation_paths_use_same_canonical_stage(self):
        """6. All creation pathways assign the exact same canonical stage ID."""
        canonical_stage = get_canonical_new_lead_stage()
        canonical_id = str(canonical_stage.id)

        # 1. Generic webhook
        self.client.post(
            f"/api/crm/webhooks/{self.webhook_endpoint.secret_token}/lead/",
            {"name": "Path Lead 1", "phone": "+919876543251", "email": "p1@test.com"},
            format='json'
        )
        lead_webhook = Student.objects.get(mobile="+919876543251")

        # 2. Campaign webhook
        self.client.post(
            f"/api/crm/webhooks/campaign/{self.campaign.secret_token}/lead/",
            {"name": "Path Lead 2", "phone": "+919876543252", "email": "p2@test.com"},
            format='json'
        )
        lead_camp_webhook = Student.objects.get(mobile="+919876543252")

        # 3. Manual API creation
        self.client.post(
            "/api/students/",
            {"first_name": "Path", "last_name": "Lead 3", "mobile": "+919876543253", "email": "p3@test.com", "program_type": self.program.id},
            format='json'
        )
        lead_manual = Student.objects.get(mobile="+919876543253")

        # 4. Batch upload
        self.client.post(
            f"/api/crm/campaigns/{self.campaign.id}/bulk_upload_batch/",
            {"rows": [{"first_name": "Path", "last_name": "Lead 4", "mobile": "+919876543254", "email": "p4@test.com"}]},
            format='json'
        )
        lead_batch = Student.objects.get(mobile="+919876543254")

        # Assert ALL paths produced the exact same canonical stage
        statuses = [
            lead_webhook.lead_status,
            lead_camp_webhook.lead_status,
            lead_manual.lead_status,
            lead_batch.lead_status
        ]

        self.assertEqual(len(set(statuses)), 1, f"Expected all creation paths to have the same stage, but got: {statuses}")
        self.assertEqual(statuses[0], canonical_id)
        self.assertEqual(statuses[0], str(self.stage_new.id))

        # Check PipelineStage lookup verifies "New Lead"
        resolved_stage = PipelineStage.objects.get(id=int(statuses[0]))
        self.assertEqual(resolved_stage.name, "New Lead")
