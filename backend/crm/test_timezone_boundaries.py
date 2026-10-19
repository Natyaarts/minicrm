import datetime
from zoneinfo import ZoneInfo
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from core.models import Program, Student
from crm.models import PipelineStage, LeadInteraction, Campaign

User = get_user_model()
KOLKATA_TZ = ZoneInfo("Asia/Kolkata")

class TimezoneBoundaryFilterTests(TestCase):
    """
    Automated regression tests verifying day-boundary and timezone filter behavior
    in the Asia/Kolkata timezone (+05:30) across:
    1. CRM Dashboard stats (/api/crm/dashboard-stats/)
    2. Student drill-down records (/api/students/)
    3. Call Analytics (/api/crm/call-analytics/)
    4. BDE Report (/api/crm/bde-report/<id>/)

    Verifies inclusive start and end dates, exclusion of out-of-range records,
    and documents SQLite vs PostgreSQL midnight offset behavior.
    """

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username='admin_tz_test',
            password='password123',
            email='admin_tz@example.com',
            role='SUPER_ADMIN'
        )
        self.bde = User.objects.create_user(
            username='bde_tz_rep',
            password='password123',
            email='bde_tz@example.com',
            role='SALES',
            first_name='Kavita',
            last_name='Nair'
        )
        self.client.force_authenticate(user=self.admin)

        self.prog = Program.objects.create(name='Classical Music')
        self.campaign = Campaign.objects.create(name='TZ Test Campaign', budget=20000)
        self.stage_new = PipelineStage.objects.create(name='New Lead', order=1)

        # Target date range: 2026-05-10 to 2026-05-15 (in Asia/Kolkata)
        self.dt_day_before = datetime.datetime(2026, 5, 9, 18, 0, 0, tzinfo=KOLKATA_TZ)
        self.dt_start_day = datetime.datetime(2026, 5, 10, 10, 0, 0, tzinfo=KOLKATA_TZ)
        self.dt_middle_day = datetime.datetime(2026, 5, 12, 12, 0, 0, tzinfo=KOLKATA_TZ)
        self.dt_end_day = datetime.datetime(2026, 5, 15, 18, 0, 0, tzinfo=KOLKATA_TZ)
        self.dt_day_after = datetime.datetime(2026, 5, 16, 10, 0, 0, tzinfo=KOLKATA_TZ)

        # Create 5 Students and associated Call Interactions
        self.students = {}
        specs = [
            ('s_before', 'Lead Before', self.dt_day_before),
            ('s_start', 'Lead Start', self.dt_start_day),
            ('s_middle', 'Lead Middle', self.dt_middle_day),
            ('s_end', 'Lead End', self.dt_end_day),
            ('s_after', 'Lead After', self.dt_day_after),
        ]
        for key, name, dt in specs:
            u = User.objects.create_user(username=f'user_{key}', password='password123', role='STUDENT')
            User.objects.filter(id=u.id).update(date_joined=dt)
            st = Student.objects.create(
                user=u,
                crm_student_id=f'TZ-{key.upper()}',
                first_name=name,
                last_name='Lead',
                program_type=self.prog,
                assigned_to=self.bde,
                campaign=self.campaign,
                lead_status=str(self.stage_new.id),
                is_active=True
            )
            Student.objects.filter(id=st.id).update(created_at=dt)
            self.students[key] = Student.objects.get(id=st.id)

            li = LeadInteraction.objects.create(
                student=self.students[key],
                author=self.bde,
                interaction_type='CALL',
                call_direction='OUTGOING',
                call_status='CONNECTED',
                call_duration=120
            )
            LeadInteraction.objects.filter(id=li.id).update(date=dt)

    def test_crm_dashboard_totals_respect_date_boundaries(self):
        """Verify CRM Dashboard stats include exactly records on/between start and end dates."""
        res = self.client.get('/api/crm/dashboard-stats/?start_date=2026-05-10&end_date=2026-05-15')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Exactly 3 leads should be counted (s_start, s_middle, s_end)
        self.assertEqual(res.data['total_leads'], 3)
        self.assertEqual(res.data['assigned_leads'], 3)

        # Call analytics summary within dashboard stats: exactly 3 calls
        self.assertEqual(res.data['connected_calls'], 3)
        self.assertEqual(res.data['outgoing_calls'], 3)

    def test_student_drilldown_matches_dashboard_totals_at_boundaries(self):
        """Verify /api/students/ returns identical 3 records as dashboard stats."""
        res = self.client.get('/api/students/?start_date=2026-05-10&end_date=2026-05-15')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        results = res.data if isinstance(res.data, list) else res.data.get('results', [])
        returned_crm_ids = [r['crm_student_id'] for r in results]

        self.assertEqual(len(returned_crm_ids), 3)
        self.assertIn('TZ-S_START', returned_crm_ids)
        self.assertIn('TZ-S_MIDDLE', returned_crm_ids)
        self.assertIn('TZ-S_END', returned_crm_ids)
        self.assertNotIn('TZ-S_BEFORE', returned_crm_ids)
        self.assertNotIn('TZ-S_AFTER', returned_crm_ids)

    def test_call_analytics_respects_date_boundaries(self):
        """Verify Call Analytics endpoint includes calls on boundary dates and excludes outside."""
        res = self.client.get('/api/crm/call-analytics/?start_date=2026-05-10&end_date=2026-05-15')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        summary = res.data.get('summary', {})
        self.assertEqual(summary.get('total_calls'), 3)
        self.assertEqual(summary.get('total_duration'), 360)
        self.assertEqual(summary.get('outgoing_calls'), 3)

        history = res.data.get('history', [])
        history_client_names = [h.get('client') for h in history]
        self.assertIn('Lead Start Lead', history_client_names)
        self.assertIn('Lead End Lead', history_client_names)
        self.assertNotIn('Lead Before Lead', history_client_names)
        self.assertNotIn('Lead After Lead', history_client_names)

    def test_bde_report_respects_date_boundaries(self):
        """Verify BDE Report endpoint calculates metrics only within the boundary range."""
        res = self.client.get(f'/api/crm/bde-report/{self.bde.id}/?start_date=2026-05-10&end_date=2026-05-15')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        metrics = res.data.get('metrics', {})
        self.assertEqual(metrics.get('total_assigned'), 3)
        self.assertEqual(metrics.get('total_calls'), 3)
        self.assertEqual(metrics.get('total_call_duration'), 360)

        lead_names = [l.get('name') for l in res.data.get('leads', [])]
        self.assertIn('Lead Start Lead', lead_names)
        self.assertIn('Lead Middle Lead', lead_names)
        self.assertIn('Lead End Lead', lead_names)
        self.assertNotIn('Lead Before Lead', lead_names)
        self.assertNotIn('Lead After Lead', lead_names)
