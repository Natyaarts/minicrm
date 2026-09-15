import io
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from core.models import Student, Program
from crm.models import LeadInteraction, PipelineStage, Task
from crm.serializers import LeadInteractionSerializer

User = get_user_model()

class LegacyDataSafetyAndBackwardCompatibilityTest(TestCase):
    """
    Production Safety Test Suite:
    Verifies that existing/legacy CRM records created before the call-logging update
    remain 100% intact, readable, filterable, reportable, and functional without any data loss or breakage.
    """

    def setUp(self):
        self.client = APIClient()
        self.sales_rep = User.objects.create_user(
            username='legacy_bde_rep',
            password='password123',
            email='legacy_rep@example.com',
            role='SALES',
            first_name='Priya',
            last_name='Sharma'
        )
        self.admin = User.objects.create_superuser(
            username='admin_user',
            password='password123',
            email='admin@example.com'
        )
        self.client.force_authenticate(user=self.admin)

        self.program = Program.objects.create(name='Kathak Diploma')
        self.student_user = User.objects.create_user(
            username='rahul_student',
            password='password123',
            email='rahul.verma@example.com',
            role='STUDENT'
        )

        # 1. Existing Legacy Student
        self.legacy_student = Student.objects.create(
            user=self.student_user,
            crm_student_id='NATYA-9001',
            first_name='Rahul',
            last_name='Verma',
            mobile='+919876543210',
            program_type=self.program,
            lead_status='FOLLOW_UP',
            assigned_to=self.sales_rep
        )

        # 2. Existing Legacy Audio File
        self.legacy_audio_content = b'RIFF....WAVEfmt ....data....legacy_audio_bytes'
        self.legacy_audio_file = SimpleUploadedFile(
            name='legacy_recording_123.mp3',
            content=self.legacy_audio_content,
            content_type='audio/mpeg'
        )

        # 3. Existing Legacy LeadInteraction (Simulating rows created BEFORE new columns existed)
        # All new columns default/nullable (mobile_call_id=None, customer_number='', recording_url='', is_matched=None)
        self.legacy_call_interaction = LeadInteraction.objects.create(
            student=self.legacy_student,
            author=self.sales_rep,
            interaction_type='CALL',
            call_duration=145,
            notes='Legacy call discussion about Kathak syllabus.',
            audio_recording=self.legacy_audio_file
        )

        # 4. Existing Legacy Note Interaction
        self.legacy_note_interaction = LeadInteraction.objects.create(
            student=self.legacy_student,
            author=self.sales_rep,
            interaction_type='NOTE',
            notes='Legacy manual note added by BDE.'
        )

    def test_legacy_lead_interaction_fields_preserved(self):
        """Verify that historical record fields have not been altered or wiped."""
        record = LeadInteraction.objects.get(id=self.legacy_call_interaction.id)
        self.assertEqual(record.student.id, self.legacy_student.id)
        self.assertEqual(record.author.id, self.sales_rep.id)
        self.assertEqual(record.interaction_type, 'CALL')
        self.assertEqual(record.call_duration, 145)
        self.assertEqual(record.notes, 'Legacy call discussion about Kathak syllabus.')
        self.assertTrue(record.audio_recording)
        self.assertIsNone(record.mobile_call_id)
        self.assertIsNone(record.provider_call_id)

    def test_legacy_record_serialization_and_retrieval(self):
        """Verify that serializer produces backwards-compatible fields for legacy rows."""
        serializer = LeadInteractionSerializer(self.legacy_call_interaction)
        data = serializer.data

        self.assertEqual(data['id'], self.legacy_call_interaction.id)
        self.assertEqual(data['student'], self.legacy_student.id)
        self.assertEqual(data['student_name'], 'Rahul Verma')
        self.assertEqual(data['student_phone'], '+919876543210')
        self.assertEqual(data['formatted_call_duration'], '2m 25s')
        self.assertIn('legacy_recording_123', data['recording_file_or_url'])

    def test_legacy_record_listing_and_filtering_api(self):
        """Verify API endpoints list and filter legacy interactions without error."""
        # List all interactions
        res = self.client.get('/api/crm/interactions/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data if isinstance(res.data, list) else res.data.get('results', [])
        ids = [item['id'] for item in results]
        self.assertIn(self.legacy_call_interaction.id, ids)
        self.assertIn(self.legacy_note_interaction.id, ids)

        # Filter by student_id
        res_filtered = self.client.get(f'/api/crm/interactions/?student_id={self.legacy_student.id}')
        self.assertEqual(res_filtered.status_code, status.HTTP_200_OK)
        filtered_results = res_filtered.data if isinstance(res_filtered.data, list) else res_filtered.data.get('results', [])
        self.assertEqual(len(filtered_results), 2)

        # Filter by interaction_type
        res_calls_only = self.client.get('/api/crm/interactions/?interaction_type=CALL')
        self.assertEqual(res_calls_only.status_code, status.HTTP_200_OK)
        call_results = res_calls_only.data if isinstance(res_calls_only.data, list) else res_calls_only.data.get('results', [])
        self.assertTrue(any(r['id'] == self.legacy_call_interaction.id for r in call_results))

    def test_legacy_record_in_analytics_and_bde_reports(self):
        """Verify Call Analytics and BDE Reports compute metrics from legacy records."""
        res = self.client.get('/api/crm/call-analytics/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        summary = res.data.get('summary', {})
        self.assertGreaterEqual(summary.get('total_duration', 0), 145)

        # BDE Report
        res_bde = self.client.get(f'/api/crm/bde-report/{self.sales_rep.id}/')
        self.assertEqual(res_bde.status_code, status.HTTP_200_OK)
        metrics = res_bde.data.get('metrics', {})
        self.assertEqual(metrics.get('total_calls'), 1)
        self.assertEqual(metrics.get('total_call_duration'), 145)

    def test_existing_student_relationships_and_pipeline_unmodified(self):
        """Verify existing student lead status, assignment, and note history remain intact."""
        student = Student.objects.get(id=self.legacy_student.id)
        self.assertEqual(student.lead_status, 'FOLLOW_UP')
        self.assertEqual(student.assigned_to.id, self.sales_rep.id)
        self.assertEqual(student.mobile, '+919876543210')
        self.assertEqual(student.crm_interactions.count(), 2)

    def test_additive_behavior_does_not_mutate_legacy_records(self):
        """Verify creating new unmatched call logs leaves existing legacy rows untouched."""
        # Log a new unmatched call
        new_call_res = self.client.post('/api/crm/interactions/', {
            'mobile_call_id': 'new_unmatched_call_999',
            'customer_number': '9988776655',
            'call_direction': 'INCOMING',
            'call_status': 'CONNECTED',
            'call_duration': 60
        }, format='json')
        self.assertEqual(new_call_res.status_code, status.HTTP_201_CREATED)

        # Re-verify legacy row is completely untouched
        self.legacy_call_interaction.refresh_from_db()
        self.assertEqual(self.legacy_call_interaction.student_id, self.legacy_student.id)
        self.assertEqual(self.legacy_call_interaction.call_duration, 145)
        self.assertIsNone(self.legacy_call_interaction.mobile_call_id)
