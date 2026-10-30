import json
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from core.models import Student, Program
from crm.models import Task, LeadTask, LeadTaskItem, LeadTaskAssignmentHistory, LeadInteraction, Campaign

User = get_user_model()


class LeadTaskManagementTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Users
        self.super_admin = User.objects.create_superuser(
            username='crm_superadmin',
            email='sa@example.com',
            password='password123',
            role='SUPER_ADMIN'
        )

        self.admin_user = User.objects.create_user(
            username='crm_admin_user',
            email='admin@example.com',
            password='password123',
            role='ADMIN'
        )

        self.team_lead = User.objects.create_user(
            username='crm_team_lead',
            email='tl@example.com',
            password='password123',
            role='TEAM_LEAD'
        )

        self.manager = User.objects.create_user(
            username='sales_lead',
            email='lead@example.com',
            password='password123',
            role='SALES_LEAD',
            first_name='Lead',
            last_name='Manager'
        )

        self.bde1 = User.objects.create_user(
            username='bde_alpha',
            email='bde1@example.com',
            password='password123',
            role='SALES',
            first_name='Executive',
            last_name='One',
            reports_to=self.team_lead
        )

        self.bde2 = User.objects.create_user(
            username='bde_beta',
            email='bde2@example.com',
            password='password123',
            role='SALES',
            first_name='Executive',
            last_name='Two'
        )

        self.campaign = Campaign.objects.create(
            name='Test Inbound Campaign',
            budget=25000,
            status='ACTIVE'
        )

        # Program
        self.program = Program.objects.create(name='Dance Certification')

        # Dummy users for students
        self.stu_user1 = User.objects.create_user(username='stu1', email='stu1@example.com', password='pw')
        self.stu_user2 = User.objects.create_user(username='stu2', email='stu2@example.com', password='pw')
        self.stu_user3 = User.objects.create_user(username='stu3', email='stu3@example.com', password='pw')

        # Students (Leads) - with original owner bde1
        self.lead1 = Student.objects.create(
            user=self.stu_user1,
            crm_student_id='NATYA-0001',
            program_type=self.program,
            first_name='Aarav',
            last_name='Sharma',
            mobile='+919876543210',
            email='aarav@example.com',
            lead_status='FOLLOW_UP',
            assigned_to=self.bde1
        )

        self.lead2 = Student.objects.create(
            user=self.stu_user2,
            crm_student_id='NATYA-0002',
            program_type=self.program,
            first_name='Diya',
            last_name='Patel',
            mobile='+919876543211',
            email='diya@example.com',
            lead_status='NEW',
            assigned_to=self.bde1
        )

        self.lead3 = Student.objects.create(
            user=self.stu_user3,
            crm_student_id='NATYA-0003',
            program_type=self.program,
            first_name='Rohan',
            last_name='Verma',
            mobile='+919876543212',
            email='rohan@example.com',
            lead_status='NEW',
            assigned_to=None
        )

    def test_01_create_task_with_multiple_leads(self):
        """Team lead creates task with multiple leads. No duplicate leads created, ownership intact."""
        self.client.force_authenticate(user=self.manager)
        initial_student_count = Student.objects.count()

        payload = {
            'title': 'Call Back Unresponsive Leads',
            'assigned_to': self.bde1.id,
            'lead_ids': [self.lead1.id, self.lead2.id, self.lead3.id]
        }
        res = self.client.post('/api/crm/lead-tasks/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        data = res.data
        self.assertEqual(data['title'], 'Call Back Unresponsive Leads')
        self.assertEqual(data['assigned_to'], self.bde1.id)
        self.assertEqual(data['total_leads'], 3)
        self.assertEqual(data['completed_leads'], 0)
        self.assertEqual(data['status'], 'PENDING')
        self.assertEqual(len(data['items']), 3)

        # Check that no new students were duplicated in database
        self.assertEqual(Student.objects.count(), initial_student_count)

        # Verify original ownership of leads was NOT overwritten
        self.lead1.refresh_from_db()
        self.assertEqual(self.lead1.assigned_to, self.bde1)
        self.lead3.refresh_from_db()
        self.assertIsNone(self.lead3.assigned_to)

        # Verify initial assignment history was logged
        task = LeadTask.objects.get(id=data['id'])
        self.assertEqual(task.assignment_history.count(), 1)
        hist = task.assignment_history.first()
        self.assertIsNone(hist.previous_assignee)
        self.assertEqual(hist.new_assignee, self.bde1)
        self.assertEqual(hist.reassigned_by, self.manager)

    def test_02_bde_access_isolation(self):
        """BDE 1 can only view their tasks; BDE 2 cannot view BDE 1's tasks."""
        # Create task for BDE 1
        task_bde1 = LeadTask.objects.create(
            title='BDE 1 Task',
            assigned_to=self.bde1,
            created_by=self.manager
        )
        LeadTaskItem.objects.create(task=task_bde1, lead=self.lead1)

        # Create task for BDE 2
        task_bde2 = LeadTask.objects.create(
            title='BDE 2 Task',
            assigned_to=self.bde2,
            created_by=self.manager
        )
        LeadTaskItem.objects.create(task=task_bde2, lead=self.lead2)

        # Authenticate as BDE 1
        self.client.force_authenticate(user=self.bde1)
        res = self.client.get('/api/crm/lead-tasks/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        task_ids = [t['id'] for t in res.data['results'] if 'results' in res.data] if isinstance(res.data, dict) and 'results' in res.data else [t['id'] for t in res.data]
        self.assertIn(task_bde1.id, task_ids)
        self.assertNotIn(task_bde2.id, task_ids)

        # Attempting to retrieve BDE 2's task returns 404
        res_detail = self.client.get(f'/api/crm/lead-tasks/{task_bde2.id}/')
        self.assertEqual(res_detail.status_code, status.HTTP_404_NOT_FOUND)

        # Manager can view all
        self.client.force_authenticate(user=self.manager)
        res_mgr = self.client.get('/api/crm/lead-tasks/')
        mgr_task_ids = [t['id'] for t in res_mgr.data['results'] if 'results' in res_mgr.data] if isinstance(res_mgr.data, dict) and 'results' in res_mgr.data else [t['id'] for t in res_mgr.data]
        self.assertIn(task_bde1.id, mgr_task_ids)
        self.assertIn(task_bde2.id, mgr_task_ids)

    def test_03_update_lead_completion_and_progress(self):
        """Updating lead completion updates task progress and status from PENDING to IN_PROGRESS to COMPLETED."""
        task = LeadTask.objects.create(
            title='Follow up batch',
            assigned_to=self.bde1,
            created_by=self.manager
        )
        item1 = LeadTaskItem.objects.create(task=task, lead=self.lead1)
        item2 = LeadTaskItem.objects.create(task=task, lead=self.lead2)

        self.assertEqual(task.status, 'PENDING')
        self.assertEqual(task.progress_percent, 0)

        # BDE completes lead 1
        self.client.force_authenticate(user=self.bde1)
        res = self.client.post(
            f'/api/crm/lead-tasks/{task.id}/update-lead/',
            {'lead_id': self.lead1.id, 'is_completed': True, 'notes': 'Spoke with Aarav, interested in morning batch.'},
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        task.refresh_from_db()
        self.assertEqual(task.status, 'IN_PROGRESS')
        self.assertEqual(task.completed_leads, 1)
        self.assertEqual(task.progress_percent, 50)

        # BDE completes lead 2
        res2 = self.client.post(
            f'/api/crm/lead-tasks/{task.id}/update-lead/',
            {'lead_id': self.lead2.id, 'is_completed': True, 'notes': 'Diya enrolled successfully.'},
            format='json'
        )
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        task.refresh_from_db()
        self.assertEqual(task.status, 'COMPLETED')
        self.assertEqual(task.completed_leads, 2)
        self.assertEqual(task.progress_percent, 100)

    def test_04_safe_task_reassignment(self):
        """Reassigning task to another BDE preserves leads, progress, call notes, and logs history."""
        task = LeadTask.objects.create(
            title='Weekend Calling Campaign',
            assigned_to=self.bde1,
            created_by=self.manager
        )
        item1 = LeadTaskItem.objects.create(task=task, lead=self.lead1, is_completed=True, notes='Call 1 done')
        item2 = LeadTaskItem.objects.create(task=task, lead=self.lead2, is_completed=False)
        task.update_status_from_items()

        # Add a lead interaction (call log) to lead1
        interaction = LeadInteraction.objects.create(
            student=self.lead1,
            author=self.bde1,
            interaction_type='CALL',
            call_status='CONNECTED',
            call_duration=120,
            notes='Discussed course curriculum.'
        )

        # Reassign task from BDE 1 to BDE 2 by Manager
        self.client.force_authenticate(user=self.manager)
        res = self.client.post(
            f'/api/crm/lead-tasks/{task.id}/reassign/',
            {'new_assignee_id': self.bde2.id, 'notes': 'Reassigned due to leave'},
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        task.refresh_from_db()
        self.assertEqual(task.assigned_to, self.bde2)
        # Check task progress is preserved
        self.assertEqual(task.status, 'IN_PROGRESS')
        self.assertEqual(task.completed_leads, 1)
        self.assertEqual(task.total_leads, 2)

        # Check call record and interaction still intact
        self.assertEqual(LeadInteraction.objects.filter(student=self.lead1).count(), 1)
        self.assertEqual(LeadInteraction.objects.first().notes, 'Discussed course curriculum.')

        # Check assignment history
        history = task.assignment_history.all()
        self.assertEqual(history.count(), 1)
        reassign_log = history.first()
        self.assertEqual(reassign_log.previous_assignee, self.bde1)
        self.assertEqual(reassign_log.new_assignee, self.bde2)
        self.assertEqual(reassign_log.reassigned_by, self.manager)
        self.assertIn('Reassigned due to leave', reassign_log.notes)

        # BDE 1 cannot see this task anymore
        self.client.force_authenticate(user=self.bde1)
        res_bde1 = self.client.get(f'/api/crm/lead-tasks/{task.id}/')
        self.assertEqual(res_bde1.status_code, status.HTTP_404_NOT_FOUND)

        # BDE 2 CAN see this task and its completed progress
        self.client.force_authenticate(user=self.bde2)
        res_bde2 = self.client.get(f'/api/crm/lead-tasks/{task.id}/')
        self.assertEqual(res_bde2.status_code, status.HTTP_200_OK)
        self.assertEqual(res_bde2.data['completed_leads'], 1)

    def test_05_reassign_permission_denied_for_bde(self):
        """Standard BDE cannot reassign tasks."""
        task = LeadTask.objects.create(
            title='VIP Leads',
            assigned_to=self.bde1,
            created_by=self.manager
        )
        self.client.force_authenticate(user=self.bde1)
        res = self.client.post(
            f'/api/crm/lead-tasks/{task.id}/reassign/',
            {'new_assignee_id': self.bde2.id},
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_06_existing_reminders_remain_unaffected(self):
        """Existing crm.models.Task (Reminders) remains fully functional and accessible via /api/crm/tasks/ and /api/crm/reminders/."""
        reminder = Task.objects.create(
            title='Reminder: Call Aarav tomorrow 10am',
            student=self.lead1,
            assigned_to=self.bde1,
            task_type='CALL',
            status='PENDING'
        )
        self.client.force_authenticate(user=self.bde1)

        # Retrieve via /api/crm/tasks/
        res = self.client.get(f'/api/crm/tasks/{reminder.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['title'], 'Reminder: Call Aarav tomorrow 10am')

        # Retrieve via /api/crm/reminders/
        res_rem = self.client.get(f'/api/crm/reminders/{reminder.id}/')
        self.assertEqual(res_rem.status_code, status.HTTP_200_OK)
        self.assertEqual(res_rem.data['title'], 'Reminder: Call Aarav tomorrow 10am')

    def test_07_duplicate_submission_prevented(self):
        """Rapid duplicate submissions with same title, assignee, and leads do not create duplicate tasks."""
        self.client.force_authenticate(user=self.manager)
        payload = {
            'title': 'Urgent Follow-up Batch',
            'assigned_to': self.bde1.id,
            'lead_ids': [self.lead1.id, self.lead2.id]
        }
        res1 = self.client.post('/api/crm/lead-tasks/', payload, format='json')
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        task_id = res1.data['id']

        # Duplicate immediate submission returns the same task
        res2 = self.client.post('/api/crm/lead-tasks/', payload, format='json')
        self.assertIn(res2.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        self.assertEqual(res2.data['id'], task_id)
        self.assertEqual(LeadTask.objects.filter(title='Urgent Follow-up Batch').count(), 1)

    def test_08_non_manager_cannot_create_task(self):
        """Standard BDE / non-manager cannot create tasks."""
        self.client.force_authenticate(user=self.bde1)
        payload = {
            'title': 'BDE Unauthorized Task',
            'assigned_to': self.bde1.id,
            'lead_ids': [self.lead1.id]
        }
        res = self.client.post('/api/crm/lead-tasks/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_09_unauthorized_student_cannot_access_tasks(self):
        """Non-sales / student user cannot query lead tasks."""
        self.client.force_authenticate(user=self.stu_user1)
        res = self.client.get('/api/crm/lead-tasks/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        tasks = res.data.get('results', res.data) if isinstance(res.data, dict) else res.data
        self.assertEqual(len(tasks), 0)

    def test_10_super_admin_full_workflow(self):
        """Super Admin can access campaigns, create tasks, and reassign tasks to any executive."""
        self.client.force_authenticate(user=self.super_admin)

        # 1. Access Campaigns
        res_camp = self.client.get('/api/crm/campaigns/')
        self.assertEqual(res_camp.status_code, status.HTTP_200_OK)

        # 2. Create Task with Selected Leads
        payload = {
            'title': 'Super Admin Lead Blast',
            'assigned_to': self.bde1.id,
            'lead_ids': [self.lead1.id, self.lead2.id]
        }
        res_task = self.client.post('/api/crm/lead-tasks/', payload, format='json')
        self.assertEqual(res_task.status_code, status.HTTP_201_CREATED)
        task_id = res_task.data['id']

        # 3. Reassign Task to BDE 2
        res_reassign = self.client.post(
            f'/api/crm/lead-tasks/{task_id}/reassign/',
            {'new_assignee_id': self.bde2.id, 'notes': 'Reassigned by Super Admin'},
            format='json'
        )
        self.assertEqual(res_reassign.status_code, status.HTTP_200_OK)
        self.assertEqual(res_reassign.data['assigned_to'], self.bde2.id)

    def test_11_admin_full_workflow(self):
        """Admin can access campaigns, create tasks, and reassign tasks."""
        self.client.force_authenticate(user=self.admin_user)

        # 1. Access Campaigns
        res_camp = self.client.get('/api/crm/campaigns/')
        self.assertEqual(res_camp.status_code, status.HTTP_200_OK)

        # 2. Create Task
        payload = {
            'title': 'Admin Lead Task',
            'assigned_to': self.bde2.id,
            'lead_ids': [self.lead1.id, self.lead3.id]
        }
        res_task = self.client.post('/api/crm/lead-tasks/', payload, format='json')
        self.assertEqual(res_task.status_code, status.HTTP_201_CREATED)
        task_id = res_task.data['id']

        # 3. Reassign Task to BDE 1
        res_reassign = self.client.post(
            f'/api/crm/lead-tasks/{task_id}/reassign/',
            {'new_assignee_id': self.bde1.id},
            format='json'
        )
        self.assertEqual(res_reassign.status_code, status.HTTP_200_OK)
        self.assertEqual(res_reassign.data['assigned_to'], self.bde1.id)

    def test_12_team_lead_scope_workflow(self):
        """Team Lead can access campaigns and manage tasks within their team hierarchy, but cannot assign outside their team."""
        self.client.force_authenticate(user=self.team_lead)

        # 1. Team Lead can access Campaigns
        res_camp = self.client.get('/api/crm/campaigns/')
        self.assertEqual(res_camp.status_code, status.HTTP_200_OK)

        # 2. Team Lead can create task for their subordinate (bde1)
        payload = {
            'title': 'Team Lead Calling Task',
            'assigned_to': self.bde1.id,
            'lead_ids': [self.lead1.id, self.lead2.id]
        }
        res_task = self.client.post('/api/crm/lead-tasks/', payload, format='json')
        self.assertEqual(res_task.status_code, status.HTTP_201_CREATED)
        task_id = res_task.data['id']

        # 3. Team Lead CANNOT assign task to bde2 (outside team hierarchy)
        payload_outside = {
            'title': 'Unauthorized Cross Team Task',
            'assigned_to': self.bde2.id,
            'lead_ids': [self.lead3.id]
        }
        res_outside = self.client.post('/api/crm/lead-tasks/', payload_outside, format='json')
        self.assertEqual(res_outside.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('within your team', res_outside.data.get('error', ''))

        # 4. Team Lead CANNOT reassign task to bde2 (outside team hierarchy)
        res_reassign_outside = self.client.post(
            f'/api/crm/lead-tasks/{task_id}/reassign/',
            {'new_assignee_id': self.bde2.id},
            format='json'
        )
        self.assertEqual(res_reassign_outside.status_code, status.HTTP_403_FORBIDDEN)

    def test_13_bde_campaigns_access_denied(self):
        """BDE Executives / Sales Reps are denied access to Campaigns API."""
        self.client.force_authenticate(user=self.bde1)
        res = self.client.get('/api/crm/campaigns/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('BDE executives do not have permission', str(res.data))

    def test_14_bde_direct_api_mutations_denied(self):
        """BDE Executives cannot create, reassign, edit, or delete tasks via direct API requests."""
        # Create a task for BDE 1
        task = LeadTask.objects.create(
            title='Admin Created Task',
            assigned_to=self.bde1,
            created_by=self.admin_user
        )
        LeadTaskItem.objects.create(task=task, lead=self.lead1)

        self.client.force_authenticate(user=self.bde1)

        # 1. Create Task Denied
        res_create = self.client.post('/api/crm/lead-tasks/', {'title': 'Hack Task', 'assigned_to': self.bde1.id, 'lead_ids': [self.lead1.id]}, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Reassign Task Denied
        res_reassign = self.client.post(f'/api/crm/lead-tasks/{task.id}/reassign/', {'new_assignee_id': self.bde2.id}, format='json')
        self.assertEqual(res_reassign.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Patch / Update Task Details Denied
        res_patch = self.client.patch(f'/api/crm/lead-tasks/{task.id}/', {'title': 'Modified Title'}, format='json')
        self.assertEqual(res_patch.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Delete Task Denied
        res_delete = self.client.delete(f'/api/crm/lead-tasks/{task.id}/')
        self.assertEqual(res_delete.status_code, status.HTTP_403_FORBIDDEN)

    def test_15_bde_can_manage_assigned_leads_only(self):
        """BDE can view assigned tasks and update lead task completion, but cannot update leads on other tasks."""
        task_bde1 = LeadTask.objects.create(
            title='BDE 1 Assigned Task',
            assigned_to=self.bde1,
            created_by=self.team_lead
        )
        item1 = LeadTaskItem.objects.create(task=task_bde1, lead=self.lead1)

        task_bde2 = LeadTask.objects.create(
            title='BDE 2 Assigned Task',
            assigned_to=self.bde2,
            created_by=self.team_lead
        )
        item2 = LeadTaskItem.objects.create(task=task_bde2, lead=self.lead2)

        # BDE 1 updates item1 on own task -> Success
        self.client.force_authenticate(user=self.bde1)
        res_ok = self.client.post(
            f'/api/crm/lead-tasks/{task_bde1.id}/update-lead/',
            {'lead_id': self.lead1.id, 'is_completed': True, 'notes': 'Followed up via call'},
            format='json'
        )
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)
        item1.refresh_from_db()
        self.assertTrue(item1.is_completed)
        self.assertEqual(item1.completed_by, self.bde1)

        # BDE 1 attempts to update item2 on BDE 2's task -> 404/403 Denied
        res_denied = self.client.post(
            f'/api/crm/lead-tasks/{task_bde2.id}/update-lead/',
            {'lead_id': self.lead2.id, 'is_completed': True},
            format='json'
        )
        self.assertIn(res_denied.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    def test_16_lead_ownership_and_call_records_preserved(self):
        """Creating and reassigning task does NOT modify original lead owner, overwrite call history, or reset lead status."""
        # Initial lead state
        initial_owner = self.lead1.assigned_to
        initial_status = self.lead1.lead_status

        # Create interaction / call record
        interaction = LeadInteraction.objects.create(
            student=self.lead1,
            author=self.bde1,
            interaction_type='CALL',
            call_status='CONNECTED',
            call_duration=180,
            notes='Initial discussion completed.'
        )

        self.client.force_authenticate(user=self.super_admin)

        # Create task assigning lead1 to bde2 (even though lead1 was originally owned by bde1)
        res_create = self.client.post('/api/crm/lead-tasks/', {
            'title': 'Re-engagement Blitz',
            'assigned_to': self.bde2.id,
            'lead_ids': [self.lead1.id]
        }, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        task_id = res_create.data['id']

        # Verify lead ownership is untouched
        self.lead1.refresh_from_db()
        self.assertEqual(self.lead1.assigned_to, initial_owner)
        self.assertEqual(self.lead1.lead_status, initial_status)

        # Verify call record is preserved
        self.assertEqual(LeadInteraction.objects.filter(student=self.lead1).count(), 1)
        self.assertEqual(LeadInteraction.objects.get(id=interaction.id).notes, 'Initial discussion completed.')

        # Reassign task back to bde1
        res_reassign = self.client.post(f'/api/crm/lead-tasks/{task_id}/reassign/', {
            'new_assignee_id': self.bde1.id,
            'notes': 'Reassigned back'
        }, format='json')
        self.assertEqual(res_reassign.status_code, status.HTTP_200_OK)

        # Verify lead ownership and call logs still completely untouched
        self.lead1.refresh_from_db()
        self.assertEqual(self.lead1.assigned_to, initial_owner)
        self.assertEqual(self.lead1.lead_status, initial_status)
        self.assertEqual(LeadInteraction.objects.filter(student=self.lead1).count(), 1)

    def test_17_multi_bde_task_creation_and_equal_distribution(self):
        """Creating task with multiple BDEs distributes leads approximately equally and deterministically."""
        # Create 2 more leads for a total of 5 leads
        u4 = User.objects.create_user(username='stu4', email='stu4@example.com', password='pw')
        u5 = User.objects.create_user(username='stu5', email='stu5@example.com', password='pw')
        lead4 = Student.objects.create(user=u4, crm_student_id='NATYA-0004', program_type=self.program, first_name='Four', mobile='+919876543213', email='four@example.com', lead_status='NEW')
        lead5 = Student.objects.create(user=u5, crm_student_id='NATYA-0005', program_type=self.program, first_name='Five', mobile='+919876543214', email='five@example.com', lead_status='NEW')

        all_lead_ids = [self.lead1.id, self.lead2.id, self.lead3.id, lead4.id, lead5.id]

        self.client.force_authenticate(user=self.manager)
        payload = {
            'title': 'Multi BDE Calling Task',
            'assigned_to_ids': [self.bde1.id, self.bde2.id],
            'lead_ids': all_lead_ids
        }
        res = self.client.post('/api/crm/lead-tasks/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        task_id = res.data['id']

        task = LeadTask.objects.get(id=task_id)
        self.assertEqual(task.total_leads, 5)
        self.assertEqual(task.assigned_bdes.count(), 2)

        # 5 leads across 2 BDEs: BDE 1 gets 3 leads, BDE 2 gets 2 leads
        bde1_items = task.items.filter(assigned_to=self.bde1)
        bde2_items = task.items.filter(assigned_to=self.bde2)
        self.assertEqual(bde1_items.count(), 3)
        self.assertEqual(bde2_items.count(), 2)

        # Every lead assigned exactly once
        assigned_lead_ids = set(task.items.values_list('lead_id', flat=True))
        self.assertEqual(assigned_lead_ids, set(all_lead_ids))

        # Original student ownership remains untouched
        self.lead1.refresh_from_db()
        self.assertEqual(self.lead1.assigned_to, self.bde1)
        self.lead3.refresh_from_db()
        self.assertIsNone(self.lead3.assigned_to)

    def test_18_csv_validation_endpoint(self):
        """CSV validation endpoint correctly matches existing leads, detects unmatched rows and duplicates."""
        from django.core.files.uploadedfile import SimpleUploadedFile

        csv_content = (
            "lead_id,contact,name\n"
            f"{self.lead1.crm_student_id},{self.lead1.mobile},Aarav Sharma\n"
            f"{self.lead2.crm_student_id},{self.lead2.mobile},Diya Patel\n"
            "NATYA-9999,9999999999,Unknown Lead\n"
            f"{self.lead1.crm_student_id},{self.lead1.mobile},Duplicate Aarav\n"
        ).encode('utf-8')

        csv_file = SimpleUploadedFile("leads.csv", csv_content, content_type="text/csv")

        # Manager validates CSV
        self.client.force_authenticate(user=self.manager)
        res = self.client.post('/api/crm/lead-tasks/validate-csv/', {'file': csv_file}, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data

        self.assertEqual(data['total_rows'], 4)
        self.assertEqual(data['matched_count'], 2)
        self.assertEqual(data['unmatched_count'], 1)
        self.assertEqual(data['duplicate_count'], 1)

        matched_ids = [m['lead_id'] for m in data['matched_leads']]
        self.assertIn(self.lead1.id, matched_ids)
        self.assertIn(self.lead2.id, matched_ids)

        self.assertEqual(len(data['unmatched_rows']), 1)
        self.assertEqual(data['unmatched_rows'][0]['row'], 4)
        self.assertIn('NATYA-9999', data['unmatched_rows'][0]['reason'])

        self.assertEqual(len(data['duplicate_rows']), 1)
        self.assertEqual(data['duplicate_rows'][0]['row'], 5)

        # Standard BDE cannot access validate-csv
        csv_file2 = SimpleUploadedFile("leads2.csv", csv_content, content_type="text/csv")
        self.client.force_authenticate(user=self.bde1)
        res_denied = self.client.post('/api/crm/lead-tasks/validate-csv/', {'file': csv_file2}, format='multipart')
        self.assertEqual(res_denied.status_code, status.HTTP_403_FORBIDDEN)

    def test_19_bde_multi_bde_isolation_and_progress(self):
        """BDE only sees leads assigned to them in multi-BDE tasks, and cannot update other executives' leads."""
        task = LeadTask.objects.create(
            title='Multi BDE Workload Isolation Task',
            created_by=self.manager,
            status='PENDING'
        )
        task.assigned_bdes.set([self.bde1, self.bde2])
        item1 = LeadTaskItem.objects.create(task=task, lead=self.lead1, assigned_to=self.bde1)
        item2 = LeadTaskItem.objects.create(task=task, lead=self.lead2, assigned_to=self.bde2)

        # 1. BDE 1 retrieves task details -> only gets item1
        self.client.force_authenticate(user=self.bde1)
        res_bde1 = self.client.get(f'/api/crm/lead-tasks/{task.id}/')
        self.assertEqual(res_bde1.status_code, status.HTTP_200_OK)
        bde1_item_ids = [it['id'] for it in res_bde1.data['items']]
        self.assertIn(item1.id, bde1_item_ids)
        self.assertNotIn(item2.id, bde1_item_ids)

        # 2. BDE 1 attempts to complete lead2 (assigned to BDE 2) -> 403 Forbidden
        res_cross = self.client.post(
            f'/api/crm/lead-tasks/{task.id}/update-lead/',
            {'lead_id': self.lead2.id, 'is_completed': True},
            format='json'
        )
        self.assertEqual(res_cross.status_code, status.HTTP_403_FORBIDDEN)

        # 3. BDE 1 completes lead1 (their own assigned lead) -> 200 OK
        res_own = self.client.post(
            f'/api/crm/lead-tasks/{task.id}/update-lead/',
            {'lead_id': self.lead1.id, 'is_completed': True, 'notes': 'Spoke with lead1'},
            format='json'
        )
        self.assertEqual(res_own.status_code, status.HTTP_200_OK)

        task.refresh_from_db()
        self.assertEqual(task.status, 'IN_PROGRESS')
        self.assertEqual(task.completed_leads, 1)
        self.assertEqual(task.total_leads, 2)
        self.assertEqual(task.progress_percent, 50)

        # 4. Manager retrieves task details -> sees both items and bde_progress
        self.client.force_authenticate(user=self.manager)
        res_mgr = self.client.get(f'/api/crm/lead-tasks/{task.id}/')
        self.assertEqual(res_mgr.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_mgr.data['items']), 2)

        bde_progress = {bp['bde_id']: bp for bp in res_mgr.data['bde_progress']}
        self.assertIn(self.bde1.id, bde_progress)
        self.assertIn(self.bde2.id, bde_progress)
        self.assertEqual(bde_progress[self.bde1.id]['completed_leads'], 1)
        self.assertEqual(bde_progress[self.bde1.id]['progress_percent'], 100)
        self.assertEqual(bde_progress[self.bde2.id]['completed_leads'], 0)
        self.assertEqual(bde_progress[self.bde2.id]['progress_percent'], 0)

    def test_20_individual_lead_reassignment(self):
        """Manager can reassign an individual lead within a task to another BDE with history logging."""
        task = LeadTask.objects.create(
            title='Single Lead Reassign Task',
            created_by=self.manager,
            status='PENDING'
        )
        task.assigned_bdes.set([self.bde1, self.bde2])
        item1 = LeadTaskItem.objects.create(task=task, lead=self.lead1, assigned_to=self.bde1)

        self.client.force_authenticate(user=self.manager)
        res = self.client.post(f'/api/crm/lead-tasks/{task.id}/reassign/', {
            'new_assignee_id': self.bde2.id,
            'lead_id': self.lead1.id,
            'notes': 'Reassigned lead1 to BDE 2'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        item1.refresh_from_db()
        self.assertEqual(item1.assigned_to, self.bde2)

        # Assignment history recorded for item
        history = task.assignment_history.filter(item=item1)
        self.assertEqual(history.count(), 1)
        hist = history.first()
        self.assertEqual(hist.previous_assignee, self.bde1)
        self.assertEqual(hist.new_assignee, self.bde2)
        self.assertEqual(hist.reassigned_by, self.manager)
        self.assertIn('lead1 to BDE 2', hist.notes)
