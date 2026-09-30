import io
import uuid
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework import status, serializers

from core.models import Student, Program, Course
from core.serializers import StudentSerializer
from crm.models import Campaign, PipelineStage, WebhookEndpoint, LeadInteraction
from crm.services.deduplication import (
    lookup_existing_student,
    record_reengagement_interaction,
    normalize_lead_phone,
    normalize_lead_email
)

User = get_user_model()


class LeadDeduplicationTestSuite(TestCase):
    """
    Comprehensive test suite validating Phase 1 lead deduplication:
    Strict prevention of duplicate lead/student/user creation across all 8 ingestion channels.
    """

    def setUp(self):
        self.client = APIClient()

        # Admin user for auth
        self.admin = User.objects.create_superuser(
            username='admin_dedup_test',
            password='Password@123',
            email='admin_dedup@example.com',
            role='SUPER_ADMIN'
        )
        self.client.force_authenticate(user=self.admin)

        # Sales Rep
        self.sales_rep = User.objects.create_user(
            username='rep_dedup_test',
            password='Password@123',
            email='rep_dedup@example.com',
            role='SALES',
            first_name='Ananya',
            last_name='Nair'
        )

        # Base program
        self.program = Program.objects.create(name='Natya Career Academy')
        self.stage_new = PipelineStage.objects.create(name='New', order=1)

        # Test Campaign
        self.campaign = Campaign.objects.create(
            name='Career Academy Digital Ad',
            section='CAREER_ACADEMY',
            secret_token=uuid.uuid4()
        )
        self.campaign.auto_assign_to.add(self.sales_rep)

        # Webhook endpoint
        self.webhook_endpoint = WebhookEndpoint.objects.create(
            name='Test Google Form Endpoint',
            secret_token=uuid.uuid4(),
            is_active=True
        )

        # Primary seeded student
        self.seeded_user = User.objects.create_user(
            username='user_primary_lead',
            email='akshaya.akku@gmail.com',
            first_name='Akshaya',
            last_name='Akku',
            role='STUDENT'
        )
        self.seeded_student = Student.objects.create(
            user=self.seeded_user,
            crm_student_id='NATYA-8119',
            first_name='Akshaya',
            last_name='Akku',
            email='akshaya.akku@gmail.com',
            mobile='+917356679007',
            program_type=self.program,
            campaign=self.campaign,
            assigned_to=self.sales_rep,
            lead_status=str(self.stage_new.id),
            is_active=True
        )

    # 1. Phone normalization variations
    def test_phone_formatting_variations(self):
        variations = [
            '7356679007',
            '+917356679007',
            '917356679007',
            '07356679007',
            '+91 73566-79007',
            'p: 7356679007',
            'p; +91 73566 79007'
        ]
        for phone_val in variations:
            norm = normalize_lead_phone(phone_val)
            self.assertEqual(norm, '+917356679007', f"Failed for variation: {phone_val}")

    # 2. Email case & whitespace normalization
    def test_email_case_and_whitespace(self):
        variations = [
            '  Akshaya.Akku@Gmail.Com  ',
            'AKSHAYA.AKKU@GMAIL.COM',
            'akshaya.akku@gmail.com'
        ]
        for email_val in variations:
            norm = normalize_lead_email(email_val)
            self.assertEqual(norm, 'akshaya.akku@gmail.com', f"Failed for email: {email_val}")

    # 3. Placeholder values must NOT collide
    def test_placeholder_phone_email_ignored(self):
        placeholders_phone = ['NA', 'N/A', 'NIL', 'NONE', '0', '0000000000', '', None]
        for p in placeholders_phone:
            self.assertEqual(normalize_lead_phone(p), '', f"Placeholder should be empty: {p}")

        placeholders_email = ['NA', 'N/A', 'NIL', 'NONE', 'temp@webhook.temp', 'test@example.com', '', None]
        for e in placeholders_email:
            self.assertEqual(normalize_lead_email(e), '', f"Placeholder email should be empty: {e}")

    # 4. Centralized lookup by mobile and by email
    def test_centralized_lookup(self):
        # By mobile
        dup_student, reason = lookup_existing_student(mobile='7356679007')
        self.assertIsNotNone(dup_student)
        self.assertEqual(dup_student.id, self.seeded_student.id)

        # By email
        dup_student, reason = lookup_existing_student(email='AKSHAYA.AKKU@GMAIL.COM')
        self.assertIsNotNone(dup_student)
        self.assertEqual(dup_student.id, self.seeded_student.id)

        # Non-duplicate
        unique_student, _ = lookup_existing_student(mobile='9998887776', email='unique@gmail.com')
        self.assertIsNone(unique_student)

    # 5. CSV bulk upload duplicate handling -> creates DUPLICATE Student record
    def test_csv_upload_duplicate_prevention(self):
        initial_student_count = Student.objects.count()
        initial_user_count = User.objects.count()

        # CSV with 1 duplicate row (Akshaya) and 1 new row (Rahul)
        csv_content = (
            "Full Name,Contact,Email,Place\n"
            "Akshaya Akku,7356679007,akshaya.akku@gmail.com,Kochi\n"
            "Rahul Varma,9876543210,rahul.varma@gmail.com,Trivandrum\n"
        )
        csv_file = SimpleUploadedFile("leads.csv", csv_content.encode('utf-8'), content_type="text/csv")

        url = f"/api/crm/campaigns/{self.campaign.id}/bulk_upload/"
        response = self.client.post(url, {'file': csv_file}, format='multipart')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # 2 new students created: 1 normal (Rahul), 1 DUPLICATE (Akshaya)
        self.assertEqual(Student.objects.count(), initial_student_count + 2)
        self.assertEqual(User.objects.count(), initial_user_count + 2)

        # Original seeded student is completely unchanged
        self.seeded_student.refresh_from_db()
        self.assertEqual(self.seeded_student.assigned_to, self.sales_rep)
        self.assertEqual(self.seeded_student.lead_status, str(self.stage_new.id))

        # New duplicate record has lead_status=DUPLICATE, assigned_to=None, and unusable password
        dup_record = Student.objects.filter(mobile='+917356679007', lead_status='DUPLICATE').first()
        self.assertIsNotNone(dup_record)
        self.assertIsNone(dup_record.assigned_to)
        self.assertEqual(dup_record.campaign, self.campaign)
        self.assertFalse(dup_record.user.has_usable_password())


    # 6. Batch JSON upload duplicate handling -> creates DUPLICATE Student record
    def test_batch_upload_duplicate_prevention(self):
        initial_student_count = Student.objects.count()
        initial_user_count = User.objects.count()

        payload = {
            'rows': [
                {'full_name': 'Akshaya Akku', 'mobile': '+91 73566 79007', 'email': 'akshaya@example.com'},
                {'full_name': 'Meera Kumar', 'mobile': '9123456789', 'email': 'meera@gmail.com'}
            ]
        }

        url = f"/api/crm/campaigns/{self.campaign.id}/bulk_upload_batch/"
        response = self.client.post(url, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', [])
        self.assertEqual(len(results), 2)
        # Both rows succeed in creating Student records
        self.assertEqual(results[0]['status'], 'SUCCESS')
        self.assertEqual(results[1]['status'], 'SUCCESS')

        # Total created = 2 (1 duplicate lead, 1 normal lead)
        self.assertEqual(Student.objects.count(), initial_student_count + 2)
        self.assertEqual(User.objects.count(), initial_user_count + 2)

        # Original student preserved unchanged
        self.seeded_student.refresh_from_db()
        self.assertEqual(self.seeded_student.assigned_to, self.sales_rep)

        # Duplicate lead created with DUPLICATE status and no assignment
        dup_lead = Student.objects.get(crm_student_id=results[0]['crm_id'])
        self.assertEqual(dup_lead.lead_status, 'DUPLICATE')
        self.assertIsNone(dup_lead.assigned_to)

    # 7. Dynamic Webhook duplicate re-engagement and DUPLICATE lead creation
    def test_dynamic_webhook_duplicate(self):
        initial_student_count = Student.objects.count()
        initial_user_count = User.objects.count()

        payload = {
            'name': 'Akshaya Akku',
            'phone': '7356679007',
            'email': 'akshaya.akku@gmail.com',
            'campaign_id': self.campaign.id,
            'event_id': 'evt_webhook_101'
        }

        url = f"/api/crm/webhooks/{self.webhook_endpoint.secret_token}/lead/"
        response = self.client.post(url, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get('is_duplicate'))

        # 1 new duplicate Student and User created
        self.assertEqual(Student.objects.count(), initial_student_count + 1)
        self.assertEqual(User.objects.count(), initial_user_count + 1)

        # Original seeded student preserved unchanged
        self.seeded_student.refresh_from_db()
        self.assertEqual(self.seeded_student.assigned_to, self.sales_rep)
        self.assertEqual(self.seeded_student.lead_status, str(self.stage_new.id))

        # Interaction note logged on the existing student
        interaction = LeadInteraction.objects.filter(student=self.seeded_student).first()
        self.assertIsNotNone(interaction)
        self.assertIn("evt_webhook_101", interaction.notes)

        # Newly created duplicate record has lead_status=DUPLICATE and assigned_to=None
        dup_student = Student.objects.get(id=response.data.get('student_id'))
        self.assertEqual(dup_student.lead_status, 'DUPLICATE')
        self.assertIsNone(dup_student.assigned_to)
        self.assertEqual(dup_student.campaign, self.campaign)

    # 8. Webhook Idempotency: repeated webhook does NOT create multiple notes
    def test_webhook_idempotency_on_retry(self):
        payload = {
            'name': 'Akshaya Akku',
            'phone': '7356679007',
            'email': 'akshaya.akku@gmail.com',
            'campaign_id': self.campaign.id,
            'event_id': 'evt_retry_test_999'
        }

        url = f"/api/crm/webhooks/{self.webhook_endpoint.secret_token}/lead/"
        # First delivery
        self.client.post(url, payload, format='json')
        count_1 = LeadInteraction.objects.filter(student=self.seeded_student, notes__contains='evt_retry_test_999').count()
        self.assertEqual(count_1, 1)

        # Retry delivery
        self.client.post(url, payload, format='json')
        count_2 = LeadInteraction.objects.filter(student=self.seeded_student, notes__contains='evt_retry_test_999').count()
        self.assertEqual(count_2, 1)

    # 9. Campaign Webhook duplicate re-engagement and DUPLICATE lead creation
    def test_campaign_webhook_duplicate(self):
        initial_student_count = Student.objects.count()
        initial_user_count = User.objects.count()

        payload = {
            'name': 'Akshaya Akku',
            'phone': '7356679007',
            'email': 'akshaya.akku@gmail.com',
            'event_id': 'camp_evt_202'
        }

        url = f"/api/crm/webhooks/campaign/{self.campaign.secret_token}/lead/"
        response = self.client.post(url, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get('is_duplicate'))
        self.assertEqual(response.data.get('status'), 'DUPLICATE')
        self.assertEqual(response.data.get('assigned_to'), 'Unassigned')

        # 1 new duplicate Student and User created
        self.assertEqual(Student.objects.count(), initial_student_count + 1)
        self.assertEqual(User.objects.count(), initial_user_count + 1)

        # Original student preserved unchanged
        self.seeded_student.refresh_from_db()
        self.assertEqual(self.seeded_student.assigned_to, self.sales_rep)

        # Duplicate lead created
        dup_student = Student.objects.get(id=response.data.get('student_id'))
        self.assertEqual(dup_student.lead_status, 'DUPLICATE')
        self.assertIsNone(dup_student.assigned_to)
        self.assertEqual(dup_student.campaign, self.campaign)

    # 10. Meta Facebook Lead Ads Webhook duplicate re-engagement and DUPLICATE lead creation
    def test_meta_webhook_duplicate(self):
        self.campaign.meta_form_id = 'form_123'
        self.campaign.meta_auto_import = True
        self.campaign.meta_access_token = 'EAAB_test_access_token'
        self.campaign.save()

        initial_student_count = Student.objects.count()
        initial_user_count = User.objects.count()

        payload = {
            'object': 'page',
            'entry': [{
                'id': 'page_123',
                'changes': [{
                    'field': 'leadgen',
                    'value': {
                        'leadgen_id': 'meta_lead_998877',
                        'ad_id': 'ad_123',
                        'form_id': 'form_123'
                    }
                }]
            }]
        }

        # Mock requests.get for Meta Graph API inside views_meta
        from unittest.mock import patch
        mock_graph_response = {
            'id': 'meta_lead_998877',
            'field_data': [
                {'name': 'full_name', 'values': ['Akshaya Akku']},
                {'name': 'phone_number', 'values': ['+917356679007']},
                {'name': 'email', 'values': ['akshaya.akku@gmail.com']}
            ]
        }

        with patch('requests.get') as mock_get:
            mock_get.return_value.status_code = 200
            mock_get.return_value.json.return_value = mock_graph_response

            url = "/api/crm/meta/webhook/"
            response = self.client.post(url, payload, format='json')

            self.assertEqual(response.status_code, status.HTTP_200_OK)
            # 1 new duplicate Student created
            self.assertEqual(Student.objects.count(), initial_student_count + 1)
            self.assertEqual(User.objects.count(), initial_user_count + 1)

            # Original student preserved unchanged
            self.seeded_student.refresh_from_db()
            self.assertEqual(self.seeded_student.assigned_to, self.sales_rep)

            # Re-engagement note created on original student
            interaction = LeadInteraction.objects.filter(student=self.seeded_student, notes__contains='meta_lead_998877').first()
            self.assertIsNotNone(interaction)

            # New duplicate created with DUPLICATE status, unassigned, and matching meta_lead_id
            dup_student = Student.objects.get(meta_lead_id='meta_lead_998877')
            self.assertEqual(dup_student.lead_status, 'DUPLICATE')
            self.assertIsNone(dup_student.assigned_to)
            self.assertEqual(dup_student.campaign, self.campaign)

    # 11. StudentSerializer / Public Application Form validation error on duplicate
    def test_student_serializer_duplicate_prevention(self):
        initial_student_count = Student.objects.count()
        initial_user_count = User.objects.count()

        serializer_data = {
            'first_name': 'Akshaya',
            'last_name': 'Akku',
            'mobile': '7356679007',
            'email': 'akshaya.akku@gmail.com',
            'program_type': self.program.id,
            'sales_section': 'CAREER_ACADEMY'
        }

        serializer = StudentSerializer(data=serializer_data)
        self.assertTrue(serializer.is_valid(), serializer.errors)

        with self.assertRaises(serializers.ValidationError):
            serializer.save()

        # Ensure no new Student or User created
        self.assertEqual(Student.objects.count(), initial_student_count)
        self.assertEqual(User.objects.count(), initial_user_count)

    # 12. Inactive / Soft-deleted student duplicate matching
    def test_inactive_student_duplicate_matching(self):
        # Soft-delete seeded student
        self.seeded_student.is_active = False
        self.seeded_student.save()

        # Lookup should still find it and report as inactive lead match
        dup_student, reason = lookup_existing_student(mobile='7356679007')
        self.assertIsNotNone(dup_student)
        self.assertIn("Inactive Lead", reason)
        self.assertEqual(dup_student.id, self.seeded_student.id)

    # 13. Google Sheets API sync duplicate handling -> creates DUPLICATE Student record
    def test_google_sheet_api_sync_duplicate(self):
        from unittest.mock import patch, MagicMock
        initial_student_count = Student.objects.count()
        initial_user_count = User.objects.count()

        self.campaign.google_spreadsheet_id = 'test_sheet_123'
        self.campaign.google_sheet_name = 'Leads'
        self.campaign.google_auto_sync = True
        self.campaign.google_last_synced_row = 1
        self.campaign.save()

        mock_sheet_data = {
            'values': [
                ['First Name', 'Last Name', 'Mobile', 'Email'],
                ['Akshaya', 'Akku', '+917356679007', 'akshaya.akku@gmail.com'],
                ['Gopika', 'Menon', '9447123456', 'gopika@gmail.com']
            ]
        }

        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.json.return_value = mock_sheet_data

        with patch('crm.views_google.get_refreshed_access_token', return_value='mock_google_token'), \
             patch('crm.views_google.requests.get', return_value=mock_res):
            
            url = '/api/crm/google/sync/'
            response = self.client.post(url, {'campaign_id': self.campaign.id}, format='json')

            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(response.data.get('imported'), 2)
            self.assertEqual(response.data.get('skipped'), 0)

            # 2 new students created: Gopika (normal) and Akshaya (DUPLICATE)
            self.assertEqual(Student.objects.count(), initial_student_count + 2)
            self.assertEqual(User.objects.count(), initial_user_count + 2)

            # Original student preserved unchanged
            self.seeded_student.refresh_from_db()
            self.assertEqual(self.seeded_student.assigned_to, self.sales_rep)

            # Duplicate record created
            dup_record = Student.objects.filter(mobile='+917356679007', lead_status='DUPLICATE').first()
            self.assertIsNotNone(dup_record)
            self.assertIsNone(dup_record.assigned_to)

    # 14. Google Sheets CLI sync duplicate handling -> creates DUPLICATE Student record
    def test_google_sheet_cli_sync_duplicate(self):
        from unittest.mock import patch, MagicMock
        from django.core.management import call_command
        initial_student_count = Student.objects.count()
        initial_user_count = User.objects.count()

        self.campaign.status = 'ACTIVE'
        self.campaign.google_spreadsheet_id = 'test_sheet_cli_123'
        self.campaign.google_sheet_name = 'Leads'
        self.campaign.google_auto_sync = True
        self.campaign.google_last_synced_row = 1
        self.campaign.save()

        mock_sheet_data = {
            'values': [
                ['First Name', 'Last Name', 'Mobile', 'Email'],
                ['Akshaya', 'Akku', '7356679007', 'akshaya.akku@gmail.com'],
                ['Haritha', 'Nair', '9447987654', 'haritha@gmail.com']
            ]
        }

        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.json.return_value = mock_sheet_data

        with patch('crm.management.commands.run_google_sync.get_refreshed_access_token', return_value='mock_google_token'), \
             patch('crm.management.commands.run_google_sync.requests.get', return_value=mock_res):
            
            call_command('run_google_sync')

            # 2 new students created: Haritha (normal) and Akshaya (DUPLICATE)
            self.assertEqual(Student.objects.count(), initial_student_count + 2)
            self.assertEqual(User.objects.count(), initial_user_count + 2)

            # Original student preserved unchanged
            self.seeded_student.refresh_from_db()
            self.assertEqual(self.seeded_student.assigned_to, self.sales_rep)

            # Duplicate record created
            dup_record = Student.objects.filter(mobile='+917356679007', lead_status='DUPLICATE').first()
            self.assertIsNotNone(dup_record)
            self.assertIsNone(dup_record.assigned_to)

    # 15. Core Bulk Excel/CSV upload duplicate handling -> creates DUPLICATE Student record
    def test_core_bulk_upload_duplicate(self):
        initial_student_count = Student.objects.count()
        initial_user_count = User.objects.count()

        csv_content = (
            "first_name,last_name,email,mobile,program_name\n"
            "Akshaya,Akku,akshaya.akku@gmail.com,7356679007,Natya Career Academy\n"
            "Deepa,Suresh,deepa.suresh@gmail.com,9847112233,Natya Career Academy\n"
        )
        csv_file = SimpleUploadedFile("core_students.csv", csv_content.encode('utf-8'), content_type="text/csv")

        url = "/api/bulk/upload-students/"
        response = self.client.post(url, {'file': csv_file}, format='multipart')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('success_count'), 2)
        self.assertEqual(len(response.data.get('errors', [])), 0)

        # 2 new students created: Deepa (normal) and Akshaya (DUPLICATE)
        self.assertEqual(Student.objects.count(), initial_student_count + 2)
        self.assertEqual(User.objects.count(), initial_user_count + 2)

        # Original student preserved unchanged
        self.seeded_student.refresh_from_db()
        self.assertEqual(self.seeded_student.assigned_to, self.sales_rep)

        # Duplicate record created
        dup_record = Student.objects.filter(mobile='+917356679007', lead_status='DUPLICATE').first()
        self.assertIsNotNone(dup_record)
        self.assertIsNone(dup_record.assigned_to)


    # 16. Core Bulk upload LMS/Wise ID update for existing student
    def test_core_bulk_upload_lms_id_update_for_existing_student(self):
        initial_student_count = Student.objects.count()
        initial_user_count = User.objects.count()

        # CSV with existing student Akshaya and an lms_id to update
        csv_content = (
            "first_name,last_name,email,mobile,program_name,lms_id\n"
            "Akshaya,Akku,akshaya.akku@gmail.com,7356679007,Natya Career Academy,WISE-98765\n"
        )
        csv_file = SimpleUploadedFile("core_update_lms.csv", csv_content.encode('utf-8'), content_type="text/csv")

        url = "/api/bulk/upload-students/"
        response = self.client.post(url, {'file': csv_file}, format='multipart')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('success_count'), 1)
        self.assertEqual(len(response.data.get('errors', [])), 0)

        # 0 new students or users created
        self.assertEqual(Student.objects.count(), initial_student_count)
        self.assertEqual(User.objects.count(), initial_user_count)

        # Existing student record updated with LMS ID
        self.seeded_student.refresh_from_db()
        self.assertEqual(self.seeded_student.lms_student_id, "WISE-98765")

    # 17. Duplicate leads query isolation and view-only access
    def test_duplicate_leads_view_only_query(self):
        # Create a DUPLICATE lead
        dup_user = User.objects.create_user(
            username='user_dup_lead_view',
            email='dupview@example.com',
            first_name='Duplicate',
            last_name='Lead',
            role='STUDENT'
        )
        dup_student = Student.objects.create(
            user=dup_user,
            crm_student_id='NATYA-DUP-01',
            first_name='Duplicate',
            last_name='Lead',
            email='dupview@example.com',
            mobile='+919999000011',
            program_type=self.program,
            lead_status='DUPLICATE',
            is_active=True
        )

        # Normal lead list (no lead_status filter) must NOT include duplicate leads
        res_normal = self.client.get('/api/students/')
        self.assertEqual(res_normal.status_code, status.HTTP_200_OK)
        normal_ids = [item['id'] for item in res_normal.data.get('results', res_normal.data)]
        self.assertNotIn(dup_student.id, normal_ids)
        self.assertIn(self.seeded_student.id, normal_ids)

        # Filtering with lead_status=DUPLICATE returns duplicate leads and isolates normal leads
        res_dup = self.client.get('/api/students/?lead_status=DUPLICATE')
        self.assertEqual(res_dup.status_code, status.HTTP_200_OK)
        dup_ids = [item['id'] for item in res_dup.data.get('results', res_dup.data)]
        self.assertIn(dup_student.id, dup_ids)
        self.assertNotIn(self.seeded_student.id, dup_ids)

        # Direct retrieve (view details) is accessible
        res_detail = self.client.get(f'/api/students/{dup_student.id}/')
        self.assertEqual(res_detail.status_code, status.HTTP_200_OK)
        self.assertEqual(res_detail.data['id'], dup_student.id)
        self.assertEqual(res_detail.data['lead_status'], 'DUPLICATE')

    # 18. Duplicate leads cannot be assigned via CRM bulk_assign API
    def test_duplicate_leads_cannot_be_bulk_assigned_crm_endpoint(self):
        dup_user = User.objects.create_user(username='u_dup_crm_bulk', email='dup_crm@example.com', role='STUDENT')
        dup_student = Student.objects.create(
            user=dup_user,
            crm_student_id='NATYA-DUP-02',
            first_name='DupCRM',
            mobile='+919999000022',
            program_type=self.program,
            lead_status='DUPLICATE',
            assigned_to=None,
            is_active=True
        )

        normal_user = User.objects.create_user(username='u_norm_crm_bulk', email='norm_crm@example.com', role='STUDENT')
        normal_student = Student.objects.create(
            user=normal_user,
            crm_student_id='NATYA-NORM-02',
            first_name='NormCRM',
            mobile='+919999000033',
            program_type=self.program,
            lead_status='NEW',
            assigned_to=None,
            is_active=True
        )

        res = self.client.post('/api/crm/leads/bulk_assign/', {
            'lead_ids': [dup_student.id, normal_student.id],
            'sales_user_id': self.sales_rep.id
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Verify normal lead got assigned
        normal_student.refresh_from_db()
        self.assertEqual(normal_student.assigned_to, self.sales_rep)

        # Verify duplicate lead was protected and remained unassigned
        dup_student.refresh_from_db()
        self.assertIsNone(dup_student.assigned_to)

    # 19. Duplicate leads cannot be assigned or unassigned via core bulk_assign action
    def test_duplicate_leads_cannot_be_bulk_assigned_core_endpoint(self):
        dup_user = User.objects.create_user(username='u_dup_core_bulk', email='dup_core@example.com', role='STUDENT')
        dup_student = Student.objects.create(
            user=dup_user,
            crm_student_id='NATYA-DUP-03',
            first_name='DupCore',
            mobile='+919999000044',
            program_type=self.program,
            lead_status='DUPLICATE',
            assigned_to=None,
            is_active=True
        )

        normal_user = User.objects.create_user(username='u_norm_core_bulk', email='norm_core@example.com', role='STUDENT')
        normal_student = Student.objects.create(
            user=normal_user,
            crm_student_id='NATYA-NORM-03',
            first_name='NormCore',
            mobile='+919999000055',
            program_type=self.program,
            lead_status='NEW',
            assigned_to=None,
            is_active=True
        )

        # 1. Bulk assign test
        res = self.client.post('/api/students/bulk_assign/', {
            'student_ids': [dup_student.id, normal_student.id],
            'user_id': self.sales_rep.id
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Normal lead got assigned
        normal_student.refresh_from_db()
        self.assertEqual(normal_student.assigned_to, self.sales_rep)

        # Duplicate lead remained unassigned
        dup_student.refresh_from_db()
        self.assertIsNone(dup_student.assigned_to)

        # 2. Bulk unassign test: Seed an existing assigned duplicate lead
        dup_assigned_user = User.objects.create_user(username='u_dup_assigned_bulk', email='dup_ass@example.com', role='STUDENT')
        dup_assigned_student = Student.objects.create(
            user=dup_assigned_user,
            crm_student_id='NATYA-DUP-03-ASS',
            first_name='DupAssigned',
            mobile='+919999000045',
            program_type=self.program,
            lead_status='DUPLICATE',
            assigned_to=self.sales_rep,
            is_active=True
        )

        res_unassign = self.client.post('/api/students/bulk_assign/', {
            'student_ids': [dup_assigned_student.id, normal_student.id],
            'user_id': None
        }, format='json')
        self.assertEqual(res_unassign.status_code, status.HTTP_200_OK)

        # Normal lead got unassigned
        normal_student.refresh_from_db()
        self.assertIsNone(normal_student.assigned_to)

        # Existing assigned duplicate lead was NOT unassigned
        dup_assigned_student.refresh_from_db()
        self.assertEqual(dup_assigned_student.assigned_to, self.sales_rep)

    # 20. Single PATCH on DUPLICATE lead cannot assign a sales rep
    def test_duplicate_leads_cannot_be_single_assigned_patch(self):
        dup_user = User.objects.create_user(username='u_dup_patch', email='dup_patch@example.com', role='STUDENT')
        dup_student = Student.objects.create(
            user=dup_user,
            crm_student_id='NATYA-DUP-04',
            first_name='DupPatch',
            mobile='+919999000066',
            program_type=self.program,
            lead_status='DUPLICATE',
            assigned_to=None,
            is_active=True
        )

        res = self.client.patch(f'/api/students/{dup_student.id}/', {
            'assigned_to': self.sales_rep.id
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('assigned_to', res.data)

        # Verify database record was not modified
        dup_student.refresh_from_db()
        self.assertIsNone(dup_student.assigned_to)
