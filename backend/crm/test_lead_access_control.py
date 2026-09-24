import json
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from core.models import Student, Program, SubProgram, Course
from crm.models import PipelineStage, LeadInteraction, Task, Campaign
from users.models import RolePermission
from hrms.models import Department, Designation, EmployeeProfile

User = get_user_model()


class SalesLeadAccessControlSecurityTests(TestCase):
    """
    Security Test Suite for CRM Lead Visibility and Access Control.
    
    Validates strict tenant/scope isolation between Sales Employees:
    - Employee A must only see A's assigned leads across all query paths.
    - Employee B must only see B's assigned leads across all query paths.
    - URL parameter tampering, search, stage filters, pagination, and direct ID lookups
      must NEVER leak another employee's leads.
    - Admin/SuperAdmin retains full organization-wide visibility.
    """

    def setUp(self):
        self.client_a = APIClient()
        self.client_b = APIClient()
        self.client_admin = APIClient()

        # Create Sales Employee A
        self.employee_a = User.objects.create_user(
            username='sales_a',
            email='sales_a@example.com',
            password='password123',
            role='SALES'
        )

        # Create Sales Employee B
        self.employee_b = User.objects.create_user(
            username='sales_b',
            email='sales_b@example.com',
            password='password123',
            role='SALES'
        )

        # Create Admin
        self.admin = User.objects.create_user(
            username='admin_user',
            email='admin@example.com',
            password='password123',
            role='ADMIN',
            is_staff=True
        )

        # Ensure RolePermissions exist for SALES module
        for mod in ['SALES', 'CRM_DASHBOARD', 'CRM_CAMPAIGNS', 'CRM_PIPELINE', 'CRM_LEADS_TABLE', 'CRM_TASKS', 'CRM_REPORTS', 'CRM_CALL_ANALYTICS']:
            RolePermission.objects.get_or_create(role='SALES', module=mod, defaults={'can_view': True, 'can_add': True, 'can_edit': True, 'can_delete': True})
            RolePermission.objects.get_or_create(role='ADMIN', module=mod, defaults={'can_view': True, 'can_add': True, 'can_edit': True, 'can_delete': True})

        self.client_a.force_authenticate(user=self.employee_a)
        self.client_b.force_authenticate(user=self.employee_b)
        self.client_admin.force_authenticate(user=self.admin)

        # Base program
        self.program = Program.objects.create(name='Dance Academy', slug='dance')
        self.sub_program = SubProgram.objects.create(name='Kathak', program=self.program)
        self.course = Course.objects.create(name='Beginner Kathak', sub_program=self.sub_program, fee_amount=5000)

        # Pipeline stages
        self.stage_new = PipelineStage.objects.create(name='New Lead', order=1)
        self.stage_followup = PipelineStage.objects.create(name='Follow-up', order=2)
        self.stage_enrolled = PipelineStage.objects.create(name='Enrolled', order=3)

        # Create Student user accounts
        self.u_lead_a = User.objects.create_user(username='student_lead_a', email='leada@example.com', role='STUDENT')
        self.u_lead_b = User.objects.create_user(username='student_lead_b', email='leadb@example.com', role='STUDENT')

        # Lead A assigned to Employee A
        self.lead_a = Student.objects.create(
            user=self.u_lead_a,
            crm_student_id='NATYA-1001',
            first_name='Ananya',
            last_name='Sharma',
            mobile='+919876543210',
            email='ananya@example.com',
            program_type=self.program,
            assigned_to=self.employee_a,
            lead_status=str(self.stage_new.id)
        )

        # Lead B assigned to Employee B
        self.lead_b = Student.objects.create(
            user=self.u_lead_b,
            crm_student_id='NATYA-1002',
            first_name='Bhavna',
            last_name='Patel',
            mobile='+919123456789',
            email='bhavna@example.com',
            program_type=self.program,
            assigned_to=self.employee_b,
            lead_status=str(self.stage_followup.id)
        )

    # 1. Employee A sees A's assigned lead
    def test_01_employee_a_sees_assigned_lead(self):
        res = self.client_a.get('/api/students/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', res.data)
        lead_ids = [item['id'] for item in results]
        self.assertIn(self.lead_a.id, lead_ids)

    # 2. Employee A does NOT see B's assigned lead
    def test_02_employee_a_does_not_see_b_lead(self):
        res = self.client_a.get('/api/students/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', res.data)
        lead_ids = [item['id'] for item in results]
        self.assertNotIn(self.lead_b.id, lead_ids)

    # 3. Employee B sees B's assigned lead
    def test_03_employee_b_sees_assigned_lead(self):
        res = self.client_b.get('/api/students/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', res.data)
        lead_ids = [item['id'] for item in results]
        self.assertIn(self.lead_b.id, lead_ids)

    # 4. Employee B does NOT see A's assigned lead
    def test_04_employee_b_does_not_see_a_lead(self):
        res = self.client_b.get('/api/students/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', res.data)
        lead_ids = [item['id'] for item in results]
        self.assertNotIn(self.lead_a.id, lead_ids)

    # 5. Employee A cannot retrieve B's lead by direct ID (404)
    def test_05_employee_a_direct_lookup_b_lead_returns_404(self):
        # GET direct lead detail
        res = self.client_a.get(f'/api/students/{self.lead_b.id}/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # PATCH direct lead detail
        res_patch = self.client_a.patch(f'/api/students/{self.lead_b.id}/', {'notes': 'Tampering attempt'})
        self.assertEqual(res_patch.status_code, status.HTTP_404_NOT_FOUND)

    # 6. Employee A cannot bypass the restriction using search
    def test_06_employee_a_cannot_search_for_b_lead(self):
        # Search by B's name, phone, email, and CRM ID
        for query in ['Bhavna', 'Patel', '9123456789', 'bhavna@example.com', 'NATYA-1002']:
            res = self.client_a.get(f'/api/students/?search={query}')
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            results = res.data.get('results', res.data)
            self.assertEqual(len(results), 0, f"Leaked lead on search query '{query}'")

    # 7. Employee A cannot bypass restriction using pipeline/stage filters or assigned_to tampering
    def test_07_employee_a_cannot_bypass_via_stage_or_param_tampering(self):
        # B is in stage_followup. A is in stage_new.
        res = self.client_a.get(f'/api/students/?lead_status={self.stage_followup.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', res.data)
        self.assertEqual(len(results), 0)

        # Tampering with assigned_to param
        res_tamper = self.client_a.get(f'/api/students/?assigned_to={self.employee_b.id}')
        self.assertEqual(res_tamper.status_code, status.HTTP_200_OK)
        results_tamper = res_tamper.data.get('results', res_tamper.data)
        self.assertEqual(len(results_tamper), 0)

        # Tampering with unassigned param
        res_unassigned = self.client_a.get('/api/students/?assigned_to=unassigned')
        self.assertEqual(res_unassigned.status_code, status.HTTP_200_OK)
        results_unassigned = res_unassigned.data.get('results', res_unassigned.data)
        self.assertEqual(len(results_unassigned), 0)

    # 8. Employee A cannot bypass restriction using pagination
    def test_08_employee_a_pagination_isolation(self):
        # Request multiple pages
        for page in [1, 2, 3]:
            res = self.client_a.get(f'/api/students/?page={page}&page_size=10')
            if res.status_code == status.HTTP_200_OK:
                results = res.data.get('results', [])
                for item in results:
                    self.assertEqual(item['assigned_to'], self.employee_a.id)

    # 9. A newly created lead assigned to A appears for A
    def test_09_newly_created_lead_assigned_to_a_appears_for_a(self):
        res = self.client_a.post('/api/students/', {
            'first_name': 'NewLead',
            'last_name': 'Alpha',
            'mobile': '+919988776655',
            'email': 'newalpha@example.com',
            'program_type': self.program.id,
            'lead_status': str(self.stage_new.id)
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        new_id = res.data['id']
        
        # Verify it appears for A
        res_list = self.client_a.get('/api/students/')
        results = res_list.data.get('results', res_list.data)
        self.assertIn(new_id, [item['id'] for item in results])

    # 10. That newly created lead does NOT appear for B
    def test_10_newly_created_lead_assigned_to_a_does_not_appear_for_b(self):
        res = self.client_a.post('/api/students/', {
            'first_name': 'SecretLead',
            'last_name': 'Alpha',
            'mobile': '+919988776644',
            'email': 'secretalpha@example.com',
            'program_type': self.program.id,
            'lead_status': str(self.stage_new.id)
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        new_id = res.data['id']

        # Verify it does NOT appear for B
        res_list_b = self.client_b.get('/api/students/')
        results_b = res_list_b.data.get('results', res_list_b.data)
        self.assertNotIn(new_id, [item['id'] for item in results_b])

        # Verify B cannot get it by direct ID
        res_detail_b = self.client_b.get(f'/api/students/{new_id}/')
        self.assertEqual(res_detail_b.status_code, status.HTTP_404_NOT_FOUND)

    # 11. My Pipeline for A contains only A's leads
    def test_11_my_pipeline_for_a_contains_only_a_leads(self):
        # In mobile/web, pipeline passes pipeline_only=true or stage filters
        # Move lead_a to follow-up stage
        self.lead_a.lead_status = str(self.stage_followup.id)
        self.lead_a.save()

        res = self.client_a.get('/api/students/?pipeline_only=true')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', res.data)
        lead_ids = [item['id'] for item in results]
        self.assertIn(self.lead_a.id, lead_ids)
        self.assertNotIn(self.lead_b.id, lead_ids)

    # 12. My Pipeline for B contains only B's leads
    def test_12_my_pipeline_for_b_contains_only_b_leads(self):
        res = self.client_b.get('/api/students/?pipeline_only=true')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', res.data)
        lead_ids = [item['id'] for item in results]
        self.assertIn(self.lead_b.id, lead_ids)
        self.assertNotIn(self.lead_a.id, lead_ids)

    # 13. Admin/authorized user still sees both A and B leads
    def test_13_admin_sees_both_a_and_b_leads(self):
        res = self.client_admin.get('/api/students/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', res.data)
        lead_ids = [item['id'] for item in results]
        self.assertIn(self.lead_a.id, lead_ids)
        self.assertIn(self.lead_b.id, lead_ids)

        # Admin can filter by assigned_to
        res_filter_a = self.client_admin.get(f'/api/students/?assigned_to={self.employee_a.id}')
        results_filter_a = [item['id'] for item in res_filter_a.data.get('results', res_filter_a.data)]
        self.assertIn(self.lead_a.id, results_filter_a)
        self.assertNotIn(self.lead_b.id, results_filter_a)

    # 14. Existing lead assignment/update functionality still works
    def test_14_admin_can_reassign_leads(self):
        # Admin reassigns Lead A to Employee B
        res = self.client_admin.patch(f'/api/students/{self.lead_a.id}/', {
            'assigned_to': self.employee_b.id
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        
        # Now Employee B sees Lead A
        res_b = self.client_b.get('/api/students/')
        results_b = [item['id'] for item in res_b.data.get('results', res_b.data)]
        self.assertIn(self.lead_a.id, results_b)

        # Employee A no longer sees Lead A
        res_a = self.client_a.get('/api/students/')
        results_a = [item['id'] for item in res_a.data.get('results', res_a.data)]
        self.assertNotIn(self.lead_a.id, results_a)

    # 15. Existing non-sales/admin behavior remains unchanged (Dashboard stats, Tasks, Interactions)
    def test_15_crm_endpoints_scope_isolation(self):
        # CRM Dashboard Stats isolation
        res_dash_a = self.client_a.get('/api/crm/dashboard-stats/')
        self.assertEqual(res_dash_a.status_code, status.HTTP_200_OK)
        self.assertEqual(res_dash_a.data['total_leads'], 1)
        self.assertEqual(res_dash_a.data['leaderboard'][0]['id'], self.employee_a.id)

        res_dash_b = self.client_b.get('/api/crm/dashboard-stats/')
        self.assertEqual(res_dash_b.status_code, status.HTTP_200_OK)
        self.assertEqual(res_dash_b.data['total_leads'], 1)
        self.assertEqual(res_dash_b.data['leaderboard'][0]['id'], self.employee_b.id)

        # Admin dashboard stats sees all leads
        res_dash_admin = self.client_admin.get('/api/crm/dashboard-stats/')
        self.assertEqual(res_dash_admin.status_code, status.HTTP_200_OK)
        self.assertEqual(res_dash_admin.data['total_leads'], 2)

        # Tasks isolation
        task_a = Task.objects.create(student=self.lead_a, assigned_to=self.employee_a, title='Follow up with Ananya')
        task_b = Task.objects.create(student=self.lead_b, assigned_to=self.employee_b, title='Follow up with Bhavna')

        res_tasks_a = self.client_a.get('/api/crm/tasks/')
        task_ids_a = [t['id'] for t in res_tasks_a.data.get('results', res_tasks_a.data)]
        self.assertIn(task_a.id, task_ids_a)
        self.assertNotIn(task_b.id, task_ids_a)

        # Interactions isolation
        inter_a = LeadInteraction.objects.create(student=self.lead_a, author=self.employee_a, interaction_type='NOTE', notes='Note A')
        inter_b = LeadInteraction.objects.create(student=self.lead_b, author=self.employee_b, interaction_type='NOTE', notes='Note B')

        res_inter_a = self.client_a.get('/api/crm/interactions/')
        inter_ids_a = [i['id'] for i in res_inter_a.data.get('results', res_inter_a.data)]
        self.assertIn(inter_a.id, inter_ids_a)
        self.assertNotIn(inter_b.id, inter_ids_a)

    # 16. Sales user with "lead" in HRMS designation retains team lead permissions
    def test_16_sales_team_lead_designation_sees_section_leads_and_stats(self):
        sales_dept, _ = Department.objects.get_or_create(name='Sales Department')
        lead_desig, _ = Designation.objects.get_or_create(
            name='Sales Team Lead',
            department=sales_dept,
            defaults={'permission_role': 'SALES'}
        )
        lead_user = User.objects.create_user(
            username='sales_lead_user',
            email='lead_user@example.com',
            password='password123',
            role='SALES'
        )
        lead_profile = getattr(lead_user, 'hrms_profile', None)
        if not lead_profile:
            lead_profile = EmployeeProfile(user=lead_user)
        lead_profile.department = sales_dept
        lead_profile.designation = lead_desig
        lead_profile.employee_id = 'EMP-LEAD-01'
        lead_profile.date_of_joining = '2024-01-01'
        lead_profile.save()

        client_lead = APIClient()
        client_lead.force_authenticate(user=lead_user)

        # Sales Lead sees all leads in section (both lead A and lead B)
        res = client_lead.get('/api/students/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', res.data)
        lead_ids = [item['id'] for item in results]
        self.assertIn(self.lead_a.id, lead_ids)
        self.assertIn(self.lead_b.id, lead_ids)

        # Sales Lead can see total leads = 2 in dashboard stats
        res_stats = client_lead.get('/api/crm/dashboard-stats/')
        self.assertEqual(res_stats.status_code, status.HTTP_200_OK)
        self.assertEqual(res_stats.data['total_leads'], 2)

    # 17. Sales user with HRMS subordinates retains team lead permissions
    def test_17_sales_user_with_subordinates_sees_section_leads(self):
        dept, _ = Department.objects.get_or_create(name='Direct Sales')
        rep_desig, _ = Designation.objects.get_or_create(
            name='Sales Executive',
            department=dept,
            defaults={'permission_role': 'SALES'}
        )
        manager_desig, _ = Designation.objects.get_or_create(
            name='Sales Supervisor',
            department=dept,
            defaults={'permission_role': 'SALES'}
        )
        manager_user = User.objects.create_user(
            username='manager_user',
            email='manager@example.com',
            password='password123',
            role='SALES'
        )
        mgr_profile = getattr(manager_user, 'hrms_profile', None)
        if not mgr_profile:
            mgr_profile = EmployeeProfile(user=manager_user)
        mgr_profile.department = dept
        mgr_profile.designation = manager_desig
        mgr_profile.employee_id = 'EMP-MGR-01'
        mgr_profile.date_of_joining = '2024-01-01'
        mgr_profile.save()

        # Subordinate profile pointing to mgr_profile
        emp_a_profile = getattr(self.employee_a, 'hrms_profile', None)
        if not emp_a_profile:
            emp_a_profile = EmployeeProfile(user=self.employee_a)
        emp_a_profile.department = dept
        emp_a_profile.designation = rep_desig
        emp_a_profile.reporting_to = mgr_profile
        emp_a_profile.employee_id = 'EMP-REP-01'
        emp_a_profile.date_of_joining = '2024-01-01'
        emp_a_profile.save()

        client_mgr = APIClient()
        client_mgr.force_authenticate(user=manager_user)

        res = client_mgr.get('/api/students/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', res.data)
        lead_ids = [item['id'] for item in results]
        self.assertIn(self.lead_a.id, lead_ids)
        self.assertIn(self.lead_b.id, lead_ids)

    # 18. Sales user with is_manager=True sees section leads
    def test_18_user_with_is_manager_attribute_sees_section_leads(self):
        lead_mgr_user = User.objects.create_user(
            username='flag_lead_user',
            email='flaglead@example.com',
            password='password123',
            role='SALES'
        )
        # Dynamic property or attribute check
        lead_mgr_user.is_manager = True

        client_flag_lead = APIClient()
        client_flag_lead.force_authenticate(user=lead_mgr_user)

        res = client_flag_lead.get('/api/students/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', res.data)
        lead_ids = [item['id'] for item in results]
        self.assertIn(self.lead_a.id, lead_ids)
        self.assertIn(self.lead_b.id, lead_ids)

