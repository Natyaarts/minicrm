from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta, date

from core.models import Student, Program
from crm.models import PipelineStage, LeadInteraction, Task
from crm.utils import (
    get_canonical_new_lead_stage,
    get_canonical_converted_stage,
    get_whatsapp_connected_stage_values,
)

User = get_user_model()


class TeamReportsComprehensiveTests(TestCase):
    """
    Comprehensive test suite for CRM Module -> Team Reports & Detailed Sales Rep Report:
    Covers all 14 required cases:
    1. Newly assigned lead with no interactions is NOT CONNECTED.
    2. Lead with an unanswered call is CONTACTED BUT NOT CONNECTED.
    3. Lead with a failed call is not counted as connected.
    4. Lead with a successful call is CONNECTED.
    5. Lead with a confirmed WhatsApp connection appears in WHATSAPP CONNECTED.
    6. Sending a WhatsApp message alone does not automatically mean customer connected.
    7. Lead with only a note is not automatically classified as connected.
    8. Multiple calls for same lead do not inflate unique connected-lead counts.
    9. Mutually exclusive categories: total_assigned == connected + contacted_not_connected + not_connected.
    10. Leads assigned to another representative do not affect selected rep's report.
    11. Date filters correctly affect counts consistently.
    12. Assigned-lead count matches unique leads in assigned-leads list and leaderboard card.
    13. Call recordings and Master Activity Timeline continue to work.
    14. Existing permissions remain enforced.
    """

    def setUp(self):
        self.client = APIClient()

        # Admin User
        self.admin = User.objects.create_superuser(
            username='admin_reports',
            password='password123',
            email='admin_reports@example.com',
            role='SUPER_ADMIN'
        )

        # Sales Rep 1
        self.rep1 = User.objects.create_user(
            username='rep_one',
            password='password123',
            email='rep1@example.com',
            role='SALES'
        )

        # Sales Rep 2
        self.rep2 = User.objects.create_user(
            username='rep_two',
            password='password123',
            email='rep2@example.com',
            role='SALES'
        )

        # Sales Manager
        self.manager = User.objects.create_user(
            username='sales_mgr',
            password='password123',
            email='manager@example.com',
            role='SALES_MANAGER'
        )

        self.program = Program.objects.create(name='Classical Music')

        # Stages
        self.stage_new = get_canonical_new_lead_stage()
        self.stage_converted = get_canonical_converted_stage()

        # Authenticate as admin by default
        self.client.force_authenticate(user=self.admin)

    def _create_lead(self, assigned_to, crm_id, name="Test Lead", stage=None, created_date=None):
        u = User.objects.create_user(
            username=f"u_{crm_id.lower().replace('-', '_')}",
            password='password123',
            role='STUDENT'
        )
        lead = Student.objects.create(
            user=u,
            crm_student_id=crm_id,
            first_name=name.split()[0],
            last_name=" ".join(name.split()[1:]) if len(name.split()) > 1 else "",
            mobile='+919876500000',
            program_type=self.program,
            lead_status=str(stage.id) if stage else str(self.stage_new.id),
            assigned_to=assigned_to
        )
        if created_date:
            lead.created_at = created_date
            lead.save(update_fields=['created_at'])
            u.date_joined = created_date
            u.save(update_fields=['date_joined'])
        return lead

    # 1. Newly assigned lead with no interactions is NOT CONNECTED
    def test_01_newly_assigned_lead_with_no_interactions_is_not_connected(self):
        lead = self._create_lead(self.rep1, 'LEAD-01', name="Ananya Rao")

        res = self.client.get(f'/api/crm/bde-report/{self.rep1.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        metrics = res.data['metrics']

        self.assertEqual(metrics['total_assigned'], 1)
        self.assertEqual(metrics['connected_leads'], 0)
        self.assertEqual(metrics['contacted_not_connected_leads'], 0)
        self.assertEqual(metrics['not_connected_leads'], 1)

        lead_item = res.data['leads'][0]
        self.assertEqual(lead_item['connection_status'], 'NOT_CONNECTED')

    # 2. Lead with an unanswered call is CONTACTED BUT NOT CONNECTED
    def test_02_lead_with_unanswered_call_is_contacted_but_not_connected(self):
        lead = self._create_lead(self.rep1, 'LEAD-02', name="Bhavna Sharma")
        LeadInteraction.objects.create(
            student=lead,
            author=self.rep1,
            interaction_type='CALL',
            call_status='UNANSWERED',
            call_duration=0,
            notes='Called customer, no response.'
        )

        res = self.client.get(f'/api/crm/bde-report/{self.rep1.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        metrics = res.data['metrics']

        self.assertEqual(metrics['total_assigned'], 1)
        self.assertEqual(metrics['connected_leads'], 0)
        self.assertEqual(metrics['contacted_not_connected_leads'], 1)
        self.assertEqual(metrics['not_connected_leads'], 0)

        lead_item = res.data['leads'][0]
        self.assertEqual(lead_item['connection_status'], 'CONTACTED_NOT_CONNECTED')

    # 3. Lead with a failed call is not counted as connected
    def test_03_lead_with_failed_call_is_not_counted_as_connected(self):
        lead = self._create_lead(self.rep1, 'LEAD-03', name="Chetan Patel")
        LeadInteraction.objects.create(
            student=lead,
            author=self.rep1,
            interaction_type='CALL',
            call_status='FAILED',
            call_duration=0,
            notes='Network error, call failed.'
        )

        res = self.client.get(f'/api/crm/bde-report/{self.rep1.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        metrics = res.data['metrics']

        self.assertEqual(metrics['connected_leads'], 0)
        self.assertEqual(metrics['contacted_not_connected_leads'], 1)
        self.assertEqual(metrics['not_connected_leads'], 0)

    # 4. Lead with a successful call is CONNECTED
    def test_04_lead_with_successful_call_is_connected(self):
        lead = self._create_lead(self.rep1, 'LEAD-04', name="Deepa Nair")
        LeadInteraction.objects.create(
            student=lead,
            author=self.rep1,
            interaction_type='CALL',
            call_status='CONNECTED',
            call_duration=120,
            notes='Discussed course curriculum and fees.'
        )

        res = self.client.get(f'/api/crm/bde-report/{self.rep1.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        metrics = res.data['metrics']

        self.assertEqual(metrics['connected_leads'], 1)
        self.assertEqual(metrics['contacted_not_connected_leads'], 0)
        self.assertEqual(metrics['not_connected_leads'], 0)

        lead_item = res.data['leads'][0]
        self.assertEqual(lead_item['connection_status'], 'CONNECTED')

    # 5. Lead with confirmed WhatsApp connection appears in WHATSAPP CONNECTED
    def test_05_lead_with_confirmed_whatsapp_connection(self):
        # A: WhatsApp interaction with CONNECTED status
        lead_wa_inter = self._create_lead(self.rep1, 'LEAD-WA-1', name="Esha Gupta")
        LeadInteraction.objects.create(
            student=lead_wa_inter,
            author=self.rep1,
            interaction_type='WHATSAPP',
            call_status='CONNECTED',
            notes='Customer responded on WhatsApp confirming interest.'
        )

        # B: Lead moved to a canonical WhatsApp Connected stage
        stage_wa = PipelineStage.objects.create(name='WhatsApp Connected', order=3)
        lead_wa_stage = self._create_lead(self.rep1, 'LEAD-WA-2', name="Farhan Khan", stage=stage_wa)

        res = self.client.get(f'/api/crm/bde-report/{self.rep1.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        metrics = res.data['metrics']

        self.assertEqual(metrics['total_assigned'], 2)
        self.assertEqual(metrics['whatsapp_connected'], 2)
        self.assertEqual(metrics['connected_leads'], 2)
        self.assertEqual(metrics['contacted_not_connected_leads'], 0)
        self.assertEqual(metrics['not_connected_leads'], 0)

    # 6. Sending a WhatsApp message alone does NOT automatically mean customer connected
    def test_06_whatsapp_message_sent_alone_is_not_connected(self):
        lead = self._create_lead(self.rep1, 'LEAD-06', name="Gaurav Joshi")
        # WhatsApp message sent, default status (no connection confirmed)
        LeadInteraction.objects.create(
            student=lead,
            author=self.rep1,
            interaction_type='WHATSAPP',
            notes='Sent brochure on WhatsApp.'
        )

        res = self.client.get(f'/api/crm/bde-report/{self.rep1.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        metrics = res.data['metrics']

        self.assertEqual(metrics['whatsapp_connected'], 0)
        self.assertEqual(metrics['connected_leads'], 0)
        self.assertEqual(metrics['not_connected_leads'], 1)

    # 7. Lead with only a note is NOT automatically classified as connected
    def test_07_lead_with_only_a_note_is_not_connected(self):
        lead = self._create_lead(self.rep1, 'LEAD-07', name="Harish Verma")
        LeadInteraction.objects.create(
            student=lead,
            author=self.rep1,
            interaction_type='NOTE',
            notes='Checked profile, looks like a good fit.'
        )

        res = self.client.get(f'/api/crm/bde-report/{self.rep1.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        metrics = res.data['metrics']

        self.assertEqual(metrics['total_notes'], 1)
        self.assertEqual(metrics['connected_leads'], 0)
        self.assertEqual(metrics['contacted_not_connected_leads'], 0)
        self.assertEqual(metrics['not_connected_leads'], 1)

    # 8. Multiple calls for same lead do NOT inflate unique connected-lead counts
    def test_08_multiple_calls_do_not_inflate_unique_connected_lead_counts(self):
        lead = self._create_lead(self.rep1, 'LEAD-08', name="Ishaan Roy")
        # 3 failed/unanswered calls
        for i in range(3):
            LeadInteraction.objects.create(
                student=lead,
                author=self.rep1,
                interaction_type='CALL',
                call_status='UNANSWERED',
                call_duration=0,
                notes=f'Attempt {i+1}'
            )
        # 2 connected calls
        for i in range(2):
            LeadInteraction.objects.create(
                student=lead,
                author=self.rep1,
                interaction_type='CALL',
                call_status='CONNECTED',
                call_duration=90,
                notes=f'Call {i+1} connected'
            )

        res = self.client.get(f'/api/crm/bde-report/{self.rep1.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        metrics = res.data['metrics']

        self.assertEqual(metrics['total_calls'], 5)
        self.assertEqual(metrics['connected_calls'], 2)
        self.assertEqual(metrics['unsuccessful_calls'], 3)
        self.assertEqual(metrics['total_assigned'], 1)
        # Unique lead count must be exactly 1
        self.assertEqual(metrics['connected_leads'], 1)
        self.assertEqual(metrics['contacted_not_connected_leads'], 0)
        self.assertEqual(metrics['not_connected_leads'], 0)

    # 9. A lead is not counted in multiple mutually exclusive lead-status categories
    def test_09_mutual_exclusivity_across_all_categories(self):
        # 1: fresh lead -> NOT_CONNECTED
        self._create_lead(self.rep1, 'LEAD-M1', name="Lead Fresh")
        # 2: note-only lead -> NOT_CONNECTED
        l2 = self._create_lead(self.rep1, 'LEAD-M2', name="Lead NoteOnly")
        LeadInteraction.objects.create(student=l2, author=self.rep1, interaction_type='NOTE', notes='Note')
        # 3: unanswered call -> CONTACTED_NOT_CONNECTED
        l3 = self._create_lead(self.rep1, 'LEAD-M3', name="Lead Unanswered")
        LeadInteraction.objects.create(student=l3, author=self.rep1, interaction_type='CALL', call_status='UNANSWERED')
        # 4: busy call -> CONTACTED_NOT_CONNECTED
        l4 = self._create_lead(self.rep1, 'LEAD-M4', name="Lead Busy")
        LeadInteraction.objects.create(student=l4, author=self.rep1, interaction_type='CALL', call_status='BUSY')
        # 5: connected call -> CONNECTED
        l5 = self._create_lead(self.rep1, 'LEAD-M5', name="Lead Connected")
        LeadInteraction.objects.create(student=l5, author=self.rep1, interaction_type='CALL', call_status='CONNECTED', call_duration=60)

        res = self.client.get(f'/api/crm/bde-report/{self.rep1.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        metrics = res.data['metrics']

        self.assertEqual(metrics['total_assigned'], 5)
        self.assertEqual(metrics['connected_leads'], 1)
        self.assertEqual(metrics['contacted_not_connected_leads'], 2)
        self.assertEqual(metrics['not_connected_leads'], 2)

        # Mathematical mutual exclusivity check: Total = Connected + Contacted Not Connected + Not Connected
        self.assertEqual(
            metrics['connected_leads'] + metrics['contacted_not_connected_leads'] + metrics['not_connected_leads'],
            metrics['total_assigned']
        )

    # 10. Leads assigned to another representative do NOT affect selected rep's report
    def test_10_leads_assigned_to_another_rep_isolated(self):
        # Rep 2 has 3 connected leads
        for i in range(3):
            l = self._create_lead(self.rep2, f'LEAD-R2-{i}', name=f"Rep2 Lead {i}")
            LeadInteraction.objects.create(
                student=l,
                author=self.rep2,
                interaction_type='CALL',
                call_status='CONNECTED',
                call_duration=100
            )

        # Rep 1 has 1 unanswered lead
        l1 = self._create_lead(self.rep1, 'LEAD-R1-1', name="Rep1 Lead 1")
        LeadInteraction.objects.create(
            student=l1,
            author=self.rep1,
            interaction_type='CALL',
            call_status='UNANSWERED'
        )

        res1 = self.client.get(f'/api/crm/bde-report/{self.rep1.id}/')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        m1 = res1.data['metrics']
        self.assertEqual(m1['total_assigned'], 1)
        self.assertEqual(m1['connected_leads'], 0)
        self.assertEqual(m1['contacted_not_connected_leads'], 1)

        res2 = self.client.get(f'/api/crm/bde-report/{self.rep2.id}/')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        m2 = res2.data['metrics']
        self.assertEqual(m2['total_assigned'], 3)
        self.assertEqual(m2['connected_leads'], 3)
        self.assertEqual(m2['contacted_not_connected_leads'], 0)

    # 11. Date filters correctly affect counts
    def test_11_date_filters_affect_counts(self):
        now = timezone.now()
        yesterday = now - timedelta(days=1)
        last_week = now - timedelta(days=7)

        # Lead from last week
        l_old = self._create_lead(self.rep1, 'LEAD-OLD', name="Old Lead", created_date=last_week)
        old_call = LeadInteraction.objects.create(
            student=l_old,
            author=self.rep1,
            interaction_type='CALL',
            call_status='CONNECTED',
            call_duration=60
        )
        old_call.date = last_week
        old_call.save(update_fields=['date'])

        # Lead from today
        l_new = self._create_lead(self.rep1, 'LEAD-NEW', name="Today Lead", created_date=now)
        new_call = LeadInteraction.objects.create(
            student=l_new,
            author=self.rep1,
            interaction_type='CALL',
            call_status='CONNECTED',
            call_duration=80
        )
        new_call.date = now
        new_call.save(update_fields=['date'])

        # Filter by today's date
        today_str = now.date().isoformat()
        res_filtered = self.client.get(f'/api/crm/bde-report/{self.rep1.id}/?start_date={today_str}&end_date={today_str}')
        self.assertEqual(res_filtered.status_code, status.HTTP_200_OK)
        m_filtered = res_filtered.data['metrics']
        self.assertEqual(m_filtered['total_assigned'], 1)
        self.assertEqual(m_filtered['connected_leads'], 1)
        self.assertEqual(m_filtered['total_calls'], 1)

        # Unfiltered includes both
        res_all = self.client.get(f'/api/crm/bde-report/{self.rep1.id}/')
        self.assertEqual(res_all.status_code, status.HTTP_200_OK)
        m_all = res_all.data['metrics']
        self.assertEqual(m_all['total_assigned'], 2)
        self.assertEqual(m_all['connected_leads'], 2)
        self.assertEqual(m_all['total_calls'], 2)

    # 12. Assigned-lead count matches unique leads in assigned-leads list and leaderboard
    def test_12_assigned_lead_count_matches_lead_list_and_leaderboard(self):
        self._create_lead(self.rep1, 'LEAD-L1', name="Lead Alpha")
        self._create_lead(self.rep1, 'LEAD-L2', name="Lead Beta")
        self._create_lead(self.rep1, 'LEAD-L3', name="Lead Gamma")

        res_bde = self.client.get(f'/api/crm/bde-report/{self.rep1.id}/')
        self.assertEqual(res_bde.status_code, status.HTTP_200_OK)
        self.assertEqual(res_bde.data['metrics']['total_assigned'], 3)
        self.assertEqual(len(res_bde.data['leads']), 3)

        # Check Team Reports / Leaderboard card API
        res_dash = self.client.get('/api/crm/dashboard-stats/')
        self.assertEqual(res_dash.status_code, status.HTTP_200_OK)
        rep1_card = next((r for r in res_dash.data['leaderboard'] if r['id'] == self.rep1.id), None)
        self.assertIsNotNone(rep1_card)
        self.assertEqual(rep1_card['assigned'], 3)
        self.assertIn('role', rep1_card)

    # 13. Call recordings and Master Activity Timeline continue to work
    def test_13_call_recordings_and_master_activity_timeline_work(self):
        lead = self._create_lead(self.rep1, 'LEAD-REC-1', name="Kiran Reddy")
        interaction = LeadInteraction.objects.create(
            student=lead,
            author=self.rep1,
            interaction_type='CALL',
            call_direction='OUTGOING',
            call_status='CONNECTED',
            call_duration=154,
            notes='Full discussion recorded',
            recording_url='https://telephony.example.com/recordings/call_154.mp3'
        )

        res = self.client.get(f'/api/crm/bde-report/{self.rep1.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(res.data['timeline']), 1)

        item = next((t for t in res.data['timeline'] if t['id'] == interaction.id), None)
        self.assertIsNotNone(item)
        self.assertEqual(item['type'], 'CALL')
        self.assertEqual(item['call_duration'], 154)
        self.assertEqual(item['formatted_call_duration'], '2m 34s')
        self.assertEqual(item['audio_url'], 'https://telephony.example.com/recordings/call_154.mp3')
        self.assertEqual(item['student_crm_id'], 'LEAD-REC-1')

    # 14. Existing permissions remain enforced
    def test_14_existing_permissions_remains_enforced(self):
        # Unauthenticated request rejected
        unauth_client = APIClient()
        res_unauth = unauth_client.get(f'/api/crm/bde-report/{self.rep1.id}/')
        self.assertEqual(res_unauth.status_code, status.HTTP_401_UNAUTHORIZED)

        # Sales Rep 1 accessing Rep 2 falls back to self (per existing RBAC rule)
        client_rep1 = APIClient()
        client_rep1.force_authenticate(user=self.rep1)
        res_rep1 = client_rep1.get(f'/api/crm/bde-report/{self.rep2.id}/')
        self.assertEqual(res_rep1.status_code, status.HTTP_200_OK)
        # Non-manager sales user is strictly scoped to own profile
        self.assertEqual(res_rep1.data['bde']['id'], self.rep1.id)

        # Sales Manager can access Rep 1 and Rep 2
        client_mgr = APIClient()
        client_mgr.force_authenticate(user=self.manager)
        res_mgr1 = client_mgr.get(f'/api/crm/bde-report/{self.rep1.id}/')
        self.assertEqual(res_mgr1.status_code, status.HTTP_200_OK)
        self.assertEqual(res_mgr1.data['bde']['id'], self.rep1.id)
        res_mgr2 = client_mgr.get(f'/api/crm/bde-report/{self.rep2.id}/')
        self.assertEqual(res_mgr2.status_code, status.HTTP_200_OK)
        self.assertEqual(res_mgr2.data['bde']['id'], self.rep2.id)
