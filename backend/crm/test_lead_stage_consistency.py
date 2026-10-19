from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from core.models import Student, Program
from crm.models import PipelineStage, LeadInteraction

User = get_user_model()


class LeadStageConsistencyTests(TestCase):
    """
    Test suite for CRM Lead Stage Inconsistency:
    Verifies that Student.lead_status values 'NEW' and '1' are treated as equivalent
    representations of the 'New Lead' stage across filtering, dashboard stats,
    and stage transitions.
    """

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username='admin_consistency',
            password='password123',
            email='admin_consistency@example.com',
            role='SUPER_ADMIN'
        )
        self.client.force_authenticate(user=self.admin)

        self.program = Program.objects.create(name='Dance Program')

        # Pipeline stages
        self.stage_new = PipelineStage.objects.create(name='New Lead', order=1, is_default=True)
        self.stage_followup = PipelineStage.objects.create(name='Follow-up', order=2)
        self.stage_enrolled = PipelineStage.objects.create(name='Enrolled', order=3)

        # 1. Lead with legacy lead_status = 'NEW'
        self.u1 = User.objects.create_user(username='student_new_1', password='password123', role='STUDENT')
        self.lead_legacy_new = Student.objects.create(
            user=self.u1,
            crm_student_id='NATYA-L1',
            first_name='Aarav',
            last_name='Legacy',
            mobile='+919800000001',
            program_type=self.program,
            lead_status='NEW'
        )

        # 2. Lead with dynamic stage ID lead_status = '1'
        self.u2 = User.objects.create_user(username='student_id_1', password='password123', role='STUDENT')
        self.lead_id_new = Student.objects.create(
            user=self.u2,
            crm_student_id='NATYA-L2',
            first_name='Priya',
            last_name='Dynamic',
            mobile='+919800000002',
            program_type=self.program,
            lead_status=str(self.stage_new.id)
        )

        # 3. Lead in Follow-up stage with numeric stage ID
        self.u3 = User.objects.create_user(username='student_followup_id', password='password123', role='STUDENT')
        self.lead_followup_id = Student.objects.create(
            user=self.u3,
            crm_student_id='NATYA-L3',
            first_name='Rohan',
            last_name='FollowupID',
            mobile='+919800000003',
            program_type=self.program,
            lead_status=str(self.stage_followup.id)
        )

        # 4. Lead in Follow-up stage with legacy code
        self.u4 = User.objects.create_user(username='student_followup_legacy', password='password123', role='STUDENT')
        self.lead_followup_legacy = Student.objects.create(
            user=self.u4,
            crm_student_id='NATYA-L4',
            first_name='Kavita',
            last_name='FollowupLegacy',
            mobile='+919800000004',
            program_type=self.program,
            lead_status='FOLLOW_UP'
        )

        # 5. Lead in Enrolled stage
        self.u5 = User.objects.create_user(username='student_enrolled', password='password123', role='STUDENT')
        self.lead_enrolled = Student.objects.create(
            user=self.u5,
            crm_student_id='NATYA-L5',
            first_name='Siddharth',
            last_name='Enrolled',
            mobile='+919800000005',
            program_type=self.program,
            lead_status='ENROLLED'
        )

    def test_filter_new_stage_by_numeric_id_returns_both(self):
        """Filtering with ?lead_status=<stage_id> returns both 'NEW' and stage ID records."""
        res = self.client.get(f'/api/students/?lead_status={self.stage_new.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data if isinstance(res.data, list) else res.data.get('results', [])
        ids = [s['id'] for s in results]

        self.assertIn(self.lead_legacy_new.id, ids)
        self.assertIn(self.lead_id_new.id, ids)
        self.assertNotIn(self.lead_followup_id.id, ids)
        self.assertNotIn(self.lead_followup_legacy.id, ids)
        self.assertNotIn(self.lead_enrolled.id, ids)

    def test_filter_new_stage_by_legacy_code_returns_both(self):
        """Filtering with ?lead_status=NEW returns both 'NEW' and stage ID records."""
        res = self.client.get('/api/students/?lead_status=NEW')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data if isinstance(res.data, list) else res.data.get('results', [])
        ids = [s['id'] for s in results]

        self.assertIn(self.lead_legacy_new.id, ids)
        self.assertIn(self.lead_id_new.id, ids)
        self.assertNotIn(self.lead_followup_id.id, ids)

    def test_filter_new_stage_by_name_returns_both(self):
        """Filtering with ?lead_status=New Lead returns both 'NEW' and stage ID records."""
        res = self.client.get('/api/students/?lead_status=New Lead')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data if isinstance(res.data, list) else res.data.get('results', [])
        ids = [s['id'] for s in results]

        self.assertIn(self.lead_legacy_new.id, ids)
        self.assertIn(self.lead_id_new.id, ids)

    def test_filter_followup_stage_returns_both_id_and_legacy(self):
        """Filtering with ?lead_status=<followup_id> returns both FOLLOW_UP and followup ID records."""
        res = self.client.get(f'/api/students/?lead_status={self.stage_followup.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data if isinstance(res.data, list) else res.data.get('results', [])
        ids = [s['id'] for s in results]

        self.assertIn(self.lead_followup_id.id, ids)
        self.assertIn(self.lead_followup_legacy.id, ids)
        self.assertNotIn(self.lead_legacy_new.id, ids)
        self.assertNotIn(self.lead_id_new.id, ids)

    def test_dashboard_stats_combines_new_lead_counts(self):
        """Dashboard pipeline_stages returns exactly one entry for 'New Lead' combining 'NEW' and stage ID counts."""
        res = self.client.get('/api/crm/dashboard-stats/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        pipeline_stages = res.data.get('pipeline_stages', [])
        new_lead_entries = [p for p in pipeline_stages if p['name'] == 'New Lead']

        # Must have exactly 1 combined entry for New Lead
        self.assertEqual(len(new_lead_entries), 1, f"Expected 1 'New Lead' entry, found: {new_lead_entries}")
        # Combined count must equal 2 (lead_legacy_new + lead_id_new)
        self.assertEqual(new_lead_entries[0]['count'], 2)
        # ID must be the canonical stage ID
        self.assertEqual(str(new_lead_entries[0]['id']), str(self.stage_new.id))

    def test_dashboard_stats_other_stages_correct(self):
        """Dashboard stats correctly combines and reports other stages (Follow-up = 2)."""
        res = self.client.get('/api/crm/dashboard-stats/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        pipeline_stages = res.data.get('pipeline_stages', [])
        followup_entries = [p for p in pipeline_stages if p['name'] == 'Follow-up']

        self.assertEqual(len(followup_entries), 1)
        self.assertEqual(followup_entries[0]['count'], 2)

    def test_stage_transition_note_logging(self):
        """Transitioning from 'NEW' to Follow-up stage logs clean note with resolved names."""
        patch_res = self.client.patch(
            f'/api/students/{self.lead_legacy_new.id}/',
            {'lead_status': str(self.stage_followup.id)}
        )
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)

        self.lead_legacy_new.refresh_from_db()
        self.assertEqual(self.lead_legacy_new.lead_status, str(self.stage_followup.id))

        interaction = LeadInteraction.objects.filter(student=self.lead_legacy_new).first()
        self.assertIsNotNone(interaction)
        self.assertIn("Status changed from 'New Lead' to 'Follow-up'", interaction.notes)
