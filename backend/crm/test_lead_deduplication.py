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

    # 5. CSV bulk upload duplicate prevention
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
        # Exactly 1 new student created (Rahul), 0 for Akshaya
        self.assertEqual(Student.objects.count(), initial_student_count + 1)
        self.assertEqual(User.objects.count(), initial_user_count + 1)
        self.assertIn("Duplicates skipped: 1", response.data['message'])

    # 6. Batch JSON upload duplicate prevention
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
        # Row 1 skipped as duplicate
        self.assertEqual(results[0]['status'], 'SKIPPED_DUPLICATE')
        self.assertEqual(results[0]['crm_id'], 'NATYA-8119')
        # Row 2 success
        self.assertEqual(results[1]['status'], 'SUCCESS')

        # Total created = 1
        self.assertEqual(Student.objects.count(), initial_student_count + 1)
        self.assertEqual(User.objects.count(), initial_user_count + 1)

    # 7. Dynamic Webhook duplicate re-engagement
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
        self.assertEqual(response.data.get('crm_id'), 'NATYA-8119')

        # No new students or users created
        self.assertEqual(Student.objects.count(), initial_student_count)
        self.assertEqual(User.objects.count(), initial_user_count)

        # Interaction note logged on the existing student
        interaction = LeadInteraction.objects.filter(student=self.seeded_student).first()
        self.assertIsNotNone(interaction)
        self.assertIn("evt_webhook_101", interaction.notes)

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

    # 9. Campaign Webhook duplicate re-engagement
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
        self.assertEqual(response.data.get('crm_id'), 'NATYA-8119')

        self.assertEqual(Student.objects.count(), initial_student_count)
        self.assertEqual(User.objects.count(), initial_user_count)

    # 10. Meta Facebook Lead Ads Webhook duplicate re-engagement
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
            # 0 new students created
            self.assertEqual(Student.objects.count(), initial_student_count)
            self.assertEqual(User.objects.count(), initial_user_count)

            # Re-engagement note created
            interaction = LeadInteraction.objects.filter(student=self.seeded_student, notes__contains='meta_lead_998877').first()
            self.assertIsNotNone(interaction)

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

    # 13. Google Sheets API sync duplicate prevention
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
            self.assertEqual(response.data.get('imported'), 1)
            self.assertEqual(response.data.get('skipped'), 1)

            # Exactly 1 new student created (Gopika), 0 for Akshaya duplicate
            self.assertEqual(Student.objects.count(), initial_student_count + 1)
            self.assertEqual(User.objects.count(), initial_user_count + 1)

    # 14. Google Sheets CLI sync duplicate prevention
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

            # Exactly 1 new student created (Haritha), 0 for Akshaya duplicate
            self.assertEqual(Student.objects.count(), initial_student_count + 1)
            self.assertEqual(User.objects.count(), initial_user_count + 1)

    # 15. Core Bulk Excel/CSV upload duplicate prevention
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
        self.assertEqual(response.data.get('success_count'), 1)
        self.assertEqual(len(response.data.get('errors', [])), 1)
        self.assertIn("Skipped duplicate lead", response.data['errors'][0])

        # Exactly 1 new student created (Deepa), 0 for Akshaya duplicate
        self.assertEqual(Student.objects.count(), initial_student_count + 1)
        self.assertEqual(User.objects.count(), initial_user_count + 1)

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
