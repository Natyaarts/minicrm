from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta, date
from rest_framework.test import APIClient
from rest_framework import status

from core.models import Student, Program, SubProgram, Course, Batch
from crm.models import Campaign, LeadInteraction, PipelineStage, Task

User = get_user_model()

class ComprehensiveFilterRegressionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        
        # Super Admin
        self.super_admin = User.objects.create_user(
            username='admin_filter',
            email='admin_filter@example.com',
            password='password123',
            role='SUPER_ADMIN'
        )

        # Sales Manager (BOTH)
        self.sales_manager = User.objects.create_user(
            username='mgr_filter',
            email='mgr_filter@example.com',
            password='password123',
            role='SALES_MANAGER',
            sales_section='BOTH'
        )

        # Sales Rep 1 (REGULAR)
        self.sales_rep1 = User.objects.create_user(
            username='rep1_filter',
            email='rep1_filter@example.com',
            password='password123',
            role='SALES',
            sales_section='REGULAR'
        )

        # Sales Rep 2 (CAREER_ACADEMY)
        self.sales_rep2 = User.objects.create_user(
            username='rep2_filter',
            email='rep2_filter@example.com',
            password='password123',
            role='SALES',
            sales_section='CAREER_ACADEMY'
        )

        # Student user (unauthorized for internal dashboards)
        self.student_user = User.objects.create_user(
            username='student_filter',
            email='student_filter@example.com',
            password='password123',
            role='STUDENT'
        )

        # Programs
        self.prog_regular = Program.objects.create(name='Regular Arts')
        self.prog_career = Program.objects.create(name='Career Academy Arts')

        # SubPrograms
        self.sub_reg = SubProgram.objects.create(name='STED Reg', program=self.prog_regular)
        self.sub_car = SubProgram.objects.create(name='STED Car', program=self.prog_career)

        # Courses
        self.course_reg = Course.objects.create(name='Bharatanatyam Regular', sub_program=self.sub_reg, fee_amount=5000)
        self.course_car = Course.objects.create(name='Kuchipudi Career', sub_program=self.sub_car, fee_amount=15000)

        # Batches
        self.batch_reg = Batch.objects.create(name='Batch Reg 1', course=self.course_reg, start_date=date.today(), primary_mentor=self.super_admin)

        # Pipeline stages
        self.stage_new = PipelineStage.objects.create(name='New Lead', order=1)
        self.stage_followup = PipelineStage.objects.create(name='Follow-up', order=2)
        self.stage_converted = PipelineStage.objects.create(name='Converted / Enrolled', order=3)
        self.stage_dropped = PipelineStage.objects.create(name='Dropped Lead', order=4)

        # Campaigns
        self.camp_a = Campaign.objects.create(
            name='Summer Campaign A',
            platform='FACEBOOK',
            section='REGULAR',
            budget=20000,
            status='ACTIVE'
        )
        self.camp_b = Campaign.objects.create(
            name='Monsoon Campaign B',
            platform='GOOGLE',
            section='CAREER_ACADEMY',
            budget=30000,
            status='ACTIVE'
        )

        # Leads for Campaign A (assigned to rep 1)
        u_a1 = User.objects.create_user(username='u_a1', password='password123', role='STUDENT')
        self.lead_a1 = Student.objects.create(
            user=u_a1,
            crm_student_id='LEAD-A1',
            first_name='Ananya',
            last_name='Sharma',
            email='ananya@test.com',
            mobile='+919000000001',
            program_type=self.prog_regular,
            course=self.course_reg,
            campaign=self.camp_a,
            sales_section='REGULAR',
            assigned_to=self.sales_rep1,
            lead_status=str(self.stage_new.id),
            is_active=True
        )

        u_a2 = User.objects.create_user(username='u_a2', password='password123', role='STUDENT')
        self.lead_a2 = Student.objects.create(
            user=u_a2,
            crm_student_id='LEAD-A2',
            first_name='Amit',
            last_name='Kumar',
            email='amit@test.com',
            mobile='+919000000002',
            program_type=self.prog_regular,
            course=self.course_reg,
            campaign=self.camp_a,
            sales_section='REGULAR',
            assigned_to=self.sales_rep1,
            lead_status=str(self.stage_converted.id),
            is_active=True
        )

        # Lead for Campaign B (assigned to rep 2)
        u_b1 = User.objects.create_user(username='u_b1', password='password123', role='STUDENT')
        self.lead_b1 = Student.objects.create(
            user=u_b1,
            crm_student_id='LEAD-B1',
            first_name='Bharat',
            last_name='Patel',
            email='bharat@test.com',
            mobile='+919000000003',
            program_type=self.prog_career,
            course=self.course_car,
            campaign=self.camp_b,
            sales_section='CAREER_ACADEMY',
            assigned_to=self.sales_rep2,
            lead_status=str(self.stage_followup.id),
            is_active=True
        )

        # Manual lead with no campaign
        u_man = User.objects.create_user(username='u_man', password='password123', role='STUDENT')
        self.lead_manual = Student.objects.create(
            user=u_man,
            crm_student_id='LEAD-MANUAL',
            first_name='Chetan',
            last_name='Verma',
            email='chetan@test.com',
            mobile='+919000000004',
            program_type=self.prog_regular,
            course=self.course_reg,
            sales_section='REGULAR',
            lead_status=str(self.stage_new.id),
            is_active=True
        )

        # Interactions / Calls
        self.call1 = LeadInteraction.objects.create(
            student=self.lead_a1,
            author=self.sales_rep1,
            interaction_type='CALL',
            call_direction='OUTGOING',
            call_status='CONNECTED',
            call_duration=120,
            date=timezone.now()
        )
        self.call2 = LeadInteraction.objects.create(
            student=self.lead_a1,
            author=self.sales_rep1,
            interaction_type='CALL',
            call_direction='OUTGOING',
            call_status='MISSED',
            call_duration=0,
            date=timezone.now() - timedelta(days=1)
        )
        self.call3 = LeadInteraction.objects.create(
            student=self.lead_a2,
            author=self.sales_rep1,
            interaction_type='CALL',
            call_direction='INCOMING',
            call_status='UNANSWERED',
            call_duration=0,
            date=timezone.now() - timedelta(days=2)
        )
        self.call4 = LeadInteraction.objects.create(
            student=self.lead_b1,
            author=self.sales_rep2,
            interaction_type='CALL',
            call_direction='OUTGOING',
            call_status='REJECTED',
            call_duration=0,
            date=timezone.now() - timedelta(days=3)
        )

    # ================= CRM DASHBOARD & STUDENT FILTERS =================
    def test_crm_dashboard_section_filter_all_does_not_wipe_results(self):
        self.client.force_authenticate(user=self.super_admin)
        res = self.client.get('/api/crm/dashboard-stats/?sales_section=ALL')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertGreater(res.data['total_leads'], 0)

    def test_crm_dashboard_sales_manager_both_can_filter_section(self):
        self.client.force_authenticate(user=self.sales_manager)
        res = self.client.get('/api/crm/dashboard-stats/?sales_section=REGULAR')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Should only count regular leads
        self.assertEqual(res.data['total_leads'], 3) # A1, A2, manual

    def test_crm_dashboard_invalid_campaign_id_handled_gracefully(self):
        self.client.force_authenticate(user=self.super_admin)
        res = self.client.get('/api/crm/dashboard-stats/?campaign_id=invalid')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['total_leads'], 0)

    def test_crm_dashboard_date_presets(self):
        self.client.force_authenticate(user=self.super_admin)
        for preset in ['today', 'yesterday', 'this_week', 'this_month', 'last_7_days', 'last_30_days', 'last_month']:
            res = self.client.get(f'/api/crm/dashboard-stats/?date_preset={preset}')
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertIn('total_leads', res.data)

    def test_student_list_filters_safe_date_and_section(self):
        self.client.force_authenticate(user=self.super_admin)
        # Invalid date should not cause 500 error
        res = self.client.get('/api/students/?start_date=not-a-date&end_date=also-not-a-date')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Section ALL should not filter out leads
        res_all = self.client.get('/api/students/?sales_section=ALL')
        self.assertEqual(res_all.status_code, status.HTTP_200_OK)
        self.assertGreater(len(res_all.data.get('results', [])), 0)

        # Course filter by string name vs integer ID
        res_course_id = self.client.get(f'/api/students/?course={self.course_reg.id}')
        self.assertEqual(res_course_id.status_code, status.HTTP_200_OK)
        res_course_name = self.client.get('/api/students/?course=Bharatanatyam')
        self.assertEqual(res_course_name.status_code, status.HTTP_200_OK)

    # ================= MARKETING & CAMPAIGNS FILTERS =================
    def test_campaign_viewset_status_and_section_filtering(self):
        self.client.force_authenticate(user=self.super_admin)
        res = self.client.get('/api/crm/campaigns/?section=REGULAR')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', res.data)
        self.assertTrue(all(c['section'] in ['REGULAR', 'BOTH'] for c in results))

    def test_marketing_dashboard_campaign_isolation(self):
        self.client.force_authenticate(user=self.super_admin)
        res_a = self.client.get(f'/api/crm/marketing-dashboard/?campaign_id={self.camp_a.id}')
        self.assertEqual(res_a.status_code, status.HTTP_200_OK)
        self.assertEqual(res_a.data['summary']['total_leads'], 2)

        res_b = self.client.get(f'/api/crm/marketing-dashboard/?campaign_id={self.camp_b.id}')
        self.assertEqual(res_b.status_code, status.HTTP_200_OK)
        self.assertEqual(res_b.data['summary']['total_leads'], 1)

    # ================= CALL ANALYTICS FILTERS =================
    def test_call_analytics_missed_status_includes_unanswered(self):
        self.client.force_authenticate(user=self.super_admin)
        res = self.client.get('/api/crm/call-analytics/?status=MISSED')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Should include both call2 (MISSED) and call3 (UNANSWERED)
        self.assertEqual(res.data['total_history'], 2)
        history_statuses = [h['status'] for h in res.data['history']]
        self.assertIn('MISSED', history_statuses)
        self.assertIn('UNANSWERED', history_statuses)

    def test_call_analytics_total_duration_calculated_correctly(self):
        self.client.force_authenticate(user=self.super_admin)
        res = self.client.get('/api/crm/call-analytics/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # call1 duration is 120 sec, others 0
        self.assertEqual(res.data['summary']['total_duration'], 120)

    def test_call_analytics_permissions_enforced(self):
        # Student cannot view call analytics
        self.client.force_authenticate(user=self.student_user)
        res = self.client.get('/api/crm/call-analytics/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Sales rep 1 cannot request employee_id of sales rep 2
        self.client.force_authenticate(user=self.sales_rep1)
        res_unauth = self.client.get(f'/api/crm/call-analytics/?employee_id={self.sales_rep2.id}')
        self.assertEqual(res_unauth.status_code, status.HTTP_403_FORBIDDEN)

    # ================= BDE PERFORMANCE & TEAM REPORTS =================
    def test_bde_report_permissions_and_section_isolation(self):
        # Student cannot view BDE report
        self.client.force_authenticate(user=self.student_user)
        res = self.client.get(f'/api/crm/bde-report/{self.sales_rep1.id}/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Standard sales rep cannot view another rep's report
        self.client.force_authenticate(user=self.sales_rep1)
        res_rep = self.client.get(f'/api/crm/bde-report/{self.sales_rep2.id}/')
        # View overrides target bde to self for standard non-manager sales rep
        self.assertEqual(res_rep.status_code, status.HTTP_200_OK)
        self.assertEqual(res_rep.data['bde']['id'], self.sales_rep1.id)

    def test_bde_report_pending_tasks_scope(self):
        # Create pending task directly assigned to rep1
        Task.objects.create(
            title='Follow up call',
            assigned_to=self.sales_rep1,
            student=self.lead_a1,
            status='PENDING'
        )
        self.client.force_authenticate(user=self.super_admin)
        res = self.client.get(f'/api/crm/bde-report/{self.sales_rep1.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['metrics']['pending_tasks'], 1)

    # ================= ANALYTICS HUB & EXECUTIVE DASHBOARD =================
    def test_analytics_detail_safe_month_year_params(self):
        self.client.force_authenticate(user=self.super_admin)
        # Invalid month/year should not crash
        res = self.client.get('/api/analytics-details/?month=invalid&year=99999')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Valid month/year
        res_valid = self.client.get('/api/analytics-details/?month=10&year=2026')
        self.assertEqual(res_valid.status_code, status.HTTP_200_OK)

    def test_executive_dashboard_mentor_filtering(self):
        self.client.force_authenticate(user=self.super_admin)
        res_all = self.client.get('/api/dashboard-stats/')
        self.assertEqual(res_all.status_code, status.HTTP_200_OK)

        res_mentor = self.client.get(f'/api/dashboard-stats/?mentor_id={self.super_admin.id}')
        self.assertEqual(res_mentor.status_code, status.HTTP_200_OK)
        self.assertIn('batches', res_mentor.data)
