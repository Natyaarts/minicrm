from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal

from core.models import Student, Program, Transaction
from crm.models import PipelineStage, LeadInteraction, Campaign, Task
from hrms.models import EmployeeProfile
from payroll.models import Payslip, SalaryStructure

User = get_user_model()


class DashboardDataAccuracyTests(TestCase):
    """
    Test suite for CRM Dashboard Data Accuracy:
    Verifies metric reconciliation, scope isolation, dropped lead exclusion,
    fresh/pending task calculation, campaign revenue isolation, and unpaginated payroll aggregates.
    """

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username='admin_accuracy',
            password='password123',
            email='admin_accuracy@example.com',
            role='SUPER_ADMIN'
        )
        self.client.force_authenticate(user=self.admin)

        self.program = Program.objects.create(name='Classical Arts')

        # Pipeline stages
        self.stage_new = PipelineStage.objects.create(name='New Lead', order=1, is_default=True)
        self.stage_followup = PipelineStage.objects.create(name='Follow-up', order=2)
        self.stage_converted = PipelineStage.objects.create(name='Converted', order=3)
        self.stage_dropped = PipelineStage.objects.create(name='Dropped', order=4)

        # Sales Rep
        self.sales_rep = User.objects.create_user(
            username='rep_john',
            password='password123',
            email='john@example.com',
            role='SALES'
        )

        # Campaigns
        self.campaign1 = Campaign.objects.create(name='Google Search Ads', budget=15000)
        self.campaign2 = Campaign.objects.create(name='Meta Instagram Ads', budget=20000)

    def test_crm_dashboard_includes_manual_leads_when_campaign_only_omitted(self):
        """
        Verify that overall CRM dashboard includes both manual and campaign leads
        when campaign_only is omitted.
        """
        # Manual lead (campaign is None)
        u_manual = User.objects.create_user(username='lead_manual', password='password123', role='STUDENT')
        Student.objects.create(
            user=u_manual,
            crm_student_id='LEAD-MANUAL-1',
            first_name='Manual',
            last_name='Walkin',
            mobile='+919800001001',
            program_type=self.program,
            lead_status=str(self.stage_new.id),
            campaign=None
        )

        # Campaign lead
        u_camp = User.objects.create_user(username='lead_camp', password='password123', role='STUDENT')
        Student.objects.create(
            user=u_camp,
            crm_student_id='LEAD-CAMP-1',
            first_name='Ad',
            last_name='Lead',
            mobile='+919800001002',
            program_type=self.program,
            lead_status=str(self.stage_new.id),
            campaign=self.campaign1
        )

        # Overall dashboard (no campaign_only param)
        res = self.client.get('/api/crm/dashboard-stats/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['total_leads'], 2, "Dashboard should include both manual and campaign leads")

        # Explicit campaign_only=true
        res_camp_only = self.client.get('/api/crm/dashboard-stats/?campaign_only=true')
        self.assertEqual(res_camp_only.data['total_leads'], 1, "Only campaign lead should be included when campaign_only=true")

    def test_crm_dashboard_filters_by_campaign_id(self):
        """
        Verify that filtering by campaign_id correctly isolates leads and revenue to that campaign.
        """
        u1 = User.objects.create_user(username='lead_c1', password='password123', role='STUDENT')
        s1 = Student.objects.create(
            user=u1,
            crm_student_id='LEAD-C1',
            first_name='Camp1',
            last_name='Lead',
            mobile='+919800002001',
            program_type=self.program,
            lead_status=str(self.stage_new.id),
            campaign=self.campaign1
        )
        Transaction.objects.create(student=s1, amount=10000.0, transaction_id='TX-C1')

        u2 = User.objects.create_user(username='lead_c2', password='password123', role='STUDENT')
        s2 = Student.objects.create(
            user=u2,
            crm_student_id='LEAD-C2',
            first_name='Camp2',
            last_name='Lead',
            mobile='+919800002002',
            program_type=self.program,
            lead_status=str(self.stage_new.id),
            campaign=self.campaign2
        )
        Transaction.objects.create(student=s2, amount=20000.0, transaction_id='TX-C2')

        # Filter by campaign 1
        res = self.client.get(f'/api/crm/dashboard-stats/?campaign_id={self.campaign1.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['total_leads'], 1)
        self.assertEqual(res.data['revenue'], 10000.0, "Revenue must isolate to Campaign 1 transactions")

        # Overall revenue
        res_all = self.client.get('/api/crm/dashboard-stats/')
        self.assertEqual(res_all.data['total_leads'], 2)
        self.assertEqual(res_all.data['revenue'], 30000.0, "Overall revenue should sum all eligible transactions")

    def test_dropped_leads_excluded_from_open_pipeline_and_reported_accurately(self):
        """
        Verify that DROPPED leads are excluded from active pipeline (assigned, unassigned, fresh, pending)
        and reported in dropped_leads.
        """
        # Active open lead
        u_open = User.objects.create_user(username='lead_open', password='password123', role='STUDENT')
        Student.objects.create(
            user=u_open,
            crm_student_id='LEAD-OPEN',
            first_name='Active',
            last_name='Lead',
            mobile='+919800003001',
            program_type=self.program,
            lead_status=str(self.stage_new.id),
            assigned_to=self.sales_rep
        )

        # Dropped lead
        u_drop = User.objects.create_user(username='lead_drop', password='password123', role='STUDENT')
        Student.objects.create(
            user=u_drop,
            crm_student_id='LEAD-DROP',
            first_name='Lost',
            last_name='Lead',
            mobile='+919800003002',
            program_type=self.program,
            lead_status=str(self.stage_dropped.id),
            assigned_to=self.sales_rep
        )

        # Converted lead
        u_conv = User.objects.create_user(username='lead_conv', password='password123', role='STUDENT')
        Student.objects.create(
            user=u_conv,
            crm_student_id='LEAD-CONV',
            first_name='Converted',
            last_name='Student',
            mobile='+919800003003',
            program_type=self.program,
            lead_status=str(self.stage_converted.id),
            assigned_to=self.sales_rep
        )

        res = self.client.get('/api/crm/dashboard-stats/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['total_leads'], 3)
        self.assertEqual(res.data['converted_leads'], 1)
        self.assertEqual(res.data['dropped_leads'], 1)
        # Active open pipeline should only contain the 1 active lead:
        self.assertEqual(res.data['assigned_leads'], 1, "Dropped and converted leads must not count as assigned leads")
        self.assertEqual(res.data['unassigned_leads'], 0)

    def test_fresh_and_contacted_leads_calculation(self):
        """
        Verify fresh (0 interactions) vs contacted (>=1 interactions) leads.
        """
        # Fresh lead: no interactions
        u_fresh = User.objects.create_user(username='lead_fresh', password='password123', role='STUDENT')
        Student.objects.create(
            user=u_fresh,
            crm_student_id='LEAD-FRESH',
            first_name='Fresh',
            last_name='Inquiry',
            mobile='+919800004001',
            program_type=self.program,
            lead_status=str(self.stage_new.id)
        )

        # Contacted lead: has interaction
        u_contacted = User.objects.create_user(username='lead_contacted', password='password123', role='STUDENT')
        s_contacted = Student.objects.create(
            user=u_contacted,
            crm_student_id='LEAD-CONTACTED',
            first_name='Contacted',
            last_name='Inquiry',
            mobile='+919800004002',
            program_type=self.program,
            lead_status=str(self.stage_followup.id)
        )
        LeadInteraction.objects.create(
            student=s_contacted,
            author=self.sales_rep,
            interaction_type='CALL',
            call_status='CONNECTED',
            call_duration=120
        )

        res = self.client.get('/api/crm/dashboard-stats/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['fresh_leads'], 1, "Should count 1 fresh uncontacted lead")
        self.assertEqual(res.data['contacted_leads'], 1, "Should count 1 contacted lead")

    def test_pending_leads_metric_removed_from_dashboard_stats(self):
        """
        Verify that pending_leads metric has been removed from /api/crm/dashboard-stats/
        while tasks module and task status tracking continue to function normally.
        """
        u1 = User.objects.create_user(username='lead_task_multi', password='password123', role='STUDENT')
        s1 = Student.objects.create(
            user=u1,
            crm_student_id='LEAD-TASK-1',
            first_name='MultiTask',
            last_name='Lead',
            mobile='+919800005001',
            program_type=self.program,
            lead_status=str(self.stage_new.id)
        )
        # Create 2 PENDING tasks for Lead 1
        Task.objects.create(student=s1, title='Call back morning', status='PENDING', due_date=timezone.now())
        Task.objects.create(student=s1, title='Call back evening', status='PENDING', due_date=timezone.now() + timedelta(hours=4))

        # Lead with COMPLETED task
        u2 = User.objects.create_user(username='lead_task_done', password='password123', role='STUDENT')
        s2 = Student.objects.create(
            user=u2,
            crm_student_id='LEAD-TASK-2',
            first_name='Completed',
            last_name='TaskLead',
            mobile='+919800005002',
            program_type=self.program,
            lead_status=str(self.stage_new.id)
        )
        Task.objects.create(student=s2, title='Done call', status='COMPLETED', due_date=timezone.now())

        # Lead with CANCELLED task
        u3 = User.objects.create_user(username='lead_task_cancelled', password='password123', role='STUDENT')
        s3 = Student.objects.create(
            user=u3,
            crm_student_id='LEAD-TASK-3',
            first_name='Cancelled',
            last_name='TaskLead',
            mobile='+919800005003',
            program_type=self.program,
            lead_status=str(self.stage_new.id)
        )
        Task.objects.create(student=s3, title='Cancelled task', status='CANCELLED', due_date=timezone.now())

        res = self.client.get('/api/crm/dashboard-stats/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # pending_leads metric must be removed from dashboard-stats
        self.assertNotIn('pending_leads', res.data, "Pending leads metric must not be present in dashboard stats")

    def test_payroll_summary_unpaginated_aggregates(self):
        """
        Verify that /api/payroll/payslips/summary/ returns unpaginated organization totals.
        """
        emp_u = User.objects.create_user(username='emp_payroll', password='password123', role='TEACHER')
        emp_profile = emp_u.hrms_profile
        SalaryStructure.objects.create(employee=emp_profile, base_salary=Decimal('50000.00'))

        # Create 1 PAID and 2 PENDING payslips
        Payslip.objects.create(
            employee=emp_profile,
            month=1,
            year=2026,
            basic_pay=Decimal('50000.00'),
            total_allowances=Decimal('0.00'),
            total_deductions=Decimal('2000.00'),
            net_salary=Decimal('48000.00'),
            status='PAID'
        )
        Payslip.objects.create(
            employee=emp_profile,
            month=2,
            year=2026,
            basic_pay=Decimal('50000.00'),
            total_allowances=Decimal('0.00'),
            total_deductions=Decimal('2000.00'),
            net_salary=Decimal('48000.00'),
            status='PENDING'
        )
        Payslip.objects.create(
            employee=emp_profile,
            month=3,
            year=2026,
            basic_pay=Decimal('50000.00'),
            total_allowances=Decimal('0.00'),
            total_deductions=Decimal('2000.00'),
            net_salary=Decimal('48000.00'),
            status='PENDING'
        )

        res = self.client.get('/api/payroll/payslips/summary/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['total_disbursed'], 48000.0)
        self.assertEqual(res.data['pending_slips'], 2)
        self.assertEqual(res.data['total_slips'], 3)
        self.assertEqual(res.data['paid_count'], 1)
        self.assertEqual(res.data['avg_salary'], 48000.0)

    def test_core_dashboard_stats_leads_excludes_converted_and_duplicates(self):
        """
        Verify that /api/dashboard-stats/ 'leads' metric excludes converted and duplicate leads.
        """
        # Open lead without campaign
        u_open = User.objects.create_user(username='dash_lead_open', password='password123', role='STUDENT')
        Student.objects.create(user=u_open, crm_student_id='L-DASH-1', program_type=self.program, lead_status=str(self.stage_new.id))

        # Open lead with campaign
        u_camp = User.objects.create_user(username='dash_lead_camp', password='password123', role='STUDENT')
        Student.objects.create(user=u_camp, crm_student_id='L-DASH-4', program_type=self.program, lead_status=str(self.stage_new.id), campaign=self.campaign1)

        # Converted lead
        u_conv = User.objects.create_user(username='dash_lead_conv', password='password123', role='STUDENT')
        Student.objects.create(user=u_conv, crm_student_id='L-DASH-2', program_type=self.program, lead_status=str(self.stage_converted.id))

        # Duplicate lead
        u_dup = User.objects.create_user(username='dash_lead_dup', password='password123', role='STUDENT')
        Student.objects.create(user=u_dup, crm_student_id='L-DASH-3', program_type=self.program, lead_status='DUPLICATE')

        res = self.client.get('/api/dashboard-stats/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['leads'], 2, "Executive dashboard should count all open non-duplicate leads by default (with and without campaign)")

        # When campaign_only=true is passed, leads without campaign must be excluded
        res_camp = self.client.get('/api/dashboard-stats/?campaign_only=true')
        self.assertEqual(res_camp.status_code, status.HTTP_200_OK)
        self.assertEqual(res_camp.data['leads'], 1, "Executive dashboard with campaign_only=true should only count leads with a campaign")

    def test_stat_leads_modal_query_reconciliation(self):
        """
        Verify that StudentViewSet supports fresh=true, has_pending_tasks=true, hide_dropped=true
        so the drill-down modal reconciles with the dashboard card counts.
        """
        # Lead with pending task
        u1 = User.objects.create_user(username='modal_lead_task', password='password123', role='STUDENT')
        s1 = Student.objects.create(user=u1, crm_student_id='M-L1', program_type=self.program, lead_status=str(self.stage_new.id))
        Task.objects.create(student=s1, title='Pending Task', status='PENDING', due_date=timezone.now())

        # Fresh lead without tasks or interactions
        u2 = User.objects.create_user(username='modal_lead_fresh', password='password123', role='STUDENT')
        Student.objects.create(user=u2, crm_student_id='M-L2', program_type=self.program, lead_status=str(self.stage_new.id))

        # Dropped lead
        u3 = User.objects.create_user(username='modal_lead_dropped', password='password123', role='STUDENT')
        Student.objects.create(user=u3, crm_student_id='M-L3', program_type=self.program, lead_status=str(self.stage_dropped.id))

        # 1. Fresh drill-down:
        res_fresh = self.client.get('/api/students/?fresh=true&hide_converted=true&hide_dropped=true')
        self.assertEqual(res_fresh.status_code, status.HTTP_200_OK)
        self.assertEqual(res_fresh.data['count'], 2)  # both s1 and s2 have 0 interactions

        # 2. Pending task drill-down:
        res_pending = self.client.get('/api/students/?has_pending_tasks=true&hide_converted=true&hide_dropped=true')
        self.assertEqual(res_pending.status_code, status.HTTP_200_OK)
        self.assertEqual(res_pending.data['count'], 1)
        self.assertEqual(res_pending.data['results'][0]['crm_student_id'], 'M-L1')

        # 3. Dropped drill-down:
        res_dropped = self.client.get('/api/students/?lead_status=DROPPED')
        self.assertEqual(res_dropped.status_code, status.HTTP_200_OK)
        self.assertEqual(res_dropped.data['count'], 1)
        self.assertEqual(res_dropped.data['results'][0]['crm_student_id'], 'M-L3')

    def test_monthly_revenue_and_profit_accuracy_recurring_and_onetime_fees(self):
        """
        Verify financial accuracy of this_month_collected and Net Profit:
        1. Recurring course fees paid this month in MonthlyPayment are counted.
        2. Unpaid recurring fees generate due amount.
        3. One-time fees paid in previous months DO NOT pollute this_month_collected.
        4. One-time fees paid in the current month in Transaction ARE counted.
        5. Expenses are bounded strictly to the current month.
        6. Net Profit equals current-month collected minus current-month expenses.
        """
        from finance.models import Expense, ExpenseCategory
        from core.models import Course, SubProgram, MonthlyPayment

        now = timezone.now()
        today_date = now.date()
        first_day_curr_month = today_date.replace(day=1)
        prev_month_date = (first_day_curr_month - timedelta(days=15)).replace(day=1)

        subprog = SubProgram.objects.create(program=self.program, name='Traditional')
        recurring_course = Course.objects.create(sub_program=subprog, name='Monthly Kathak', fee_amount=Decimal('4000.00'))
        onetime_course = Course.objects.create(sub_program=subprog, name='Diploma Kathak', fee_amount=Decimal('0.00'))

        # 1. Recurring student who paid this month
        u_rec_paid = User.objects.create_user(username='fin_rec_paid', password='password123', role='STUDENT')
        s_rec_paid = Student.objects.create(
            user=u_rec_paid,
            crm_student_id='FIN-REC-1',
            program_type=self.program,
            course=recurring_course,
            lead_status=str(self.stage_converted.id),
            total_fee=Decimal('4000.00'),
            paid_fee=Decimal('4000.00')
        )
        MonthlyPayment.objects.create(
            student=s_rec_paid,
            month=first_day_curr_month,
            amount=Decimal('4000.00'),
            paid_date=today_date
        )

        # 2. Recurring student who has NOT paid this month
        u_rec_unpaid = User.objects.create_user(username='fin_rec_unpaid', password='password123', role='STUDENT')
        s_rec_unpaid = Student.objects.create(
            user=u_rec_unpaid,
            crm_student_id='FIN-REC-2',
            program_type=self.program,
            course=recurring_course,
            lead_status=str(self.stage_converted.id),
            total_fee=Decimal('4000.00'),
            paid_fee=Decimal('0.00')
        )

        # 3. One-time student who paid 60,000 in a PREVIOUS month (must NOT pollute this month)
        u_ot_prev = User.objects.create_user(username='fin_ot_prev', password='password123', role='STUDENT')
        s_ot_prev = Student.objects.create(
            user=u_ot_prev,
            crm_student_id='FIN-OT-1',
            program_type=self.program,
            course=onetime_course,
            lead_status=str(self.stage_converted.id),
            total_fee=Decimal('60000.00'),
            paid_fee=Decimal('60000.00')
        )
        t_prev = Transaction.objects.create(
            student=s_ot_prev,
            transaction_id='TX-PREV-60K',
            amount=Decimal('60000.00')
        )
        # Shift transaction date back 45 days into a previous month
        Transaction.objects.filter(id=t_prev.id).update(date=now - timedelta(days=45))

        # 4. One-time student who paid 15,000 in the CURRENT month
        u_ot_curr = User.objects.create_user(username='fin_ot_curr', password='password123', role='STUDENT')
        s_ot_curr = Student.objects.create(
            user=u_ot_curr,
            crm_student_id='FIN-OT-2',
            program_type=self.program,
            course=onetime_course,
            lead_status=str(self.stage_converted.id),
            total_fee=Decimal('30000.00'),
            paid_fee=Decimal('15000.00')
        )
        Transaction.objects.create(
            student=s_ot_curr,
            transaction_id='TX-CURR-15K',
            amount=Decimal('15000.00')
        )

        # 5. Expenses: 5000 in current month, 8000 in previous month
        cat = ExpenseCategory.objects.create(name='Operations')
        Expense.objects.create(
            title='Studio Rent Current Month',
            category=cat,
            amount=Decimal('5000.00'),
            date=first_day_curr_month
        )
        Expense.objects.create(
            title='Studio Rent Previous Month',
            category=cat,
            amount=Decimal('8000.00'),
            date=prev_month_date
        )

        res = self.client.get('/api/dashboard-stats/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Expected:
        # this_month_collected = 4000 (recurring paid) + 15000 (one-time paid this month) = 19000.00
        # s_ot_prev's 60,000 MUST NOT be included!
        self.assertEqual(res.data['this_month_collected'], 19000.0, "Only current month payments must be collected")
        self.assertEqual(res.data['expenses'], 5000.0, "Only current month expenses must be included")

        # Calculated Net Profit in executive dashboard formula:
        net_profit = res.data['this_month_collected'] - res.data['expenses']
        self.assertEqual(net_profit, 14000.0, "Net profit must accurately equal 19000 - 5000 = 14000")

    def test_empty_financial_dataset(self):
        """
        Verify that /api/dashboard-stats/ handles empty dataset gracefully without errors.
        """
        res = self.client.get('/api/dashboard-stats/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['this_month_collected'], 0.0)
        self.assertEqual(res.data['this_month_expected'], 0.0)
        self.assertEqual(res.data['this_month_due'], 0.0)
        self.assertEqual(res.data['expenses'], 0.0)
        self.assertEqual(res.data['revenue'], 0.0)

    def test_campaign_report_uses_canonical_stages(self):
        """
        Verify that CampaignViewSet.report accurately uses canonical converted and dropped stages.
        """
        # Create leads for campaign1
        u_conv = User.objects.create_user(username='camp_conv', password='password123', role='STUDENT')
        Student.objects.create(
            user=u_conv,
            crm_student_id='LEAD-CAMP-CONV',
            first_name='Camp',
            last_name='Converted',
            mobile='+919876543210',
            program_type=self.program,
            lead_status=str(self.stage_converted.id),
            campaign=self.campaign1
        )

        u_drop = User.objects.create_user(username='camp_drop', password='password123', role='STUDENT')
        Student.objects.create(
            user=u_drop,
            crm_student_id='LEAD-CAMP-DROP',
            first_name='Camp',
            last_name='Dropped',
            mobile='+919876543211',
            program_type=self.program,
            lead_status=str(self.stage_dropped.id),
            campaign=self.campaign1
        )

        u_act = User.objects.create_user(username='camp_act', password='password123', role='STUDENT')
        Student.objects.create(
            user=u_act,
            crm_student_id='LEAD-CAMP-ACT',
            first_name='Camp',
            last_name='Active',
            mobile='+919876543212',
            program_type=self.program,
            lead_status=str(self.stage_new.id),
            campaign=self.campaign1
        )

        res = self.client.get(f'/api/crm/campaigns/{self.campaign1.id}/report/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['total_leads'], 3)
        self.assertEqual(res.data['converted_leads'], 1)
        self.assertEqual(res.data['lost_leads'], 1)
        self.assertEqual(res.data['active_leads'], 1)

    def test_marketing_dashboard_uses_canonical_stages(self):
        """
        Verify that MarketingDashboardView aggregates total_converted using canonical stages.
        """
        u_conv = User.objects.create_user(username='mktg_conv', password='password123', role='STUDENT')
        Student.objects.create(
            user=u_conv,
            crm_student_id='LEAD-MKTG-CONV',
            first_name='Mktg',
            last_name='Converted',
            mobile='+919876543220',
            program_type=self.program,
            lead_status=str(self.stage_converted.id),
            campaign=self.campaign2,
            assigned_to=self.sales_rep
        )

        u_act = User.objects.create_user(username='mktg_act', password='password123', role='STUDENT')
        Student.objects.create(
            user=u_act,
            crm_student_id='LEAD-MKTG-ACT',
            first_name='Mktg',
            last_name='Active',
            mobile='+919876543221',
            program_type=self.program,
            lead_status=str(self.stage_new.id),
            campaign=self.campaign2,
            assigned_to=self.sales_rep
        )

        res = self.client.get('/api/crm/marketing-dashboard/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(res.data['summary']['total_leads'], 2)
        self.assertGreaterEqual(res.data['summary']['total_converted'], 1)


