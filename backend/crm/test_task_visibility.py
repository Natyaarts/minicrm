"""/crm/tasks/ visibility: non-sales roles see only their own tasks; sales and admin behaviour unchanged."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import Program, Student
from crm.models import Task

User = get_user_model()
URL = '/api/crm/tasks/'


class TaskVisibilityTests(TestCase):
    def setUp(self):
        cache.clear()  # DRF throttle counters live in the LocMem cache
        self.mentor = User.objects.create_user(username='mentor', password='x', role='MENTOR')
        self.teacher = User.objects.create_user(username='teacher', password='x', role='TEACHER')
        self.sales = User.objects.create_user(username='bde', password='x', role='SALES')
        self.sales2 = User.objects.create_user(username='bde2', password='x', role='SALES')
        self.admin = User.objects.create_user(username='admin', password='x', role='ADMIN')
        program = Program.objects.create(name='Dance Academy', slug='dance')
        lead_user = User.objects.create_user(username='lead', password='x', role='STUDENT')
        self.lead = Student.objects.create(user=lead_user, crm_student_id='TV-1', first_name='Ana', last_name='K',
                                           mobile='+919800000101', program_type=program, assigned_to=self.sales)
        due = timezone.now() + timedelta(days=1)
        self.t_mentor = Task.objects.create(title='mentor own', assigned_to=self.mentor, due_date=due)
        self.t_sales = Task.objects.create(title='bde own', assigned_to=self.sales, student=self.lead, due_date=due)
        self.t_sales2 = Task.objects.create(title='bde2 own', assigned_to=self.sales2, due_date=due)
        self.t_unassigned = Task.objects.create(title='nobody', due_date=due)

    def ids(self, user, **params):
        api = APIClient()
        api.force_authenticate(user)
        res = api.get(URL, {'page_size': 100, **params})
        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()
        rows = data['results'] if isinstance(data, dict) else data
        return sorted(r['id'] for r in rows)

    def test_mentor_without_assigned_to_me_sees_only_own(self):
        self.assertEqual(self.ids(self.mentor), [self.t_mentor.id])

    def test_mentor_with_assigned_to_me_unchanged(self):
        self.assertEqual(self.ids(self.mentor, assigned_to_me='true'), [self.t_mentor.id])

    def test_teacher_with_no_tasks_sees_none(self):
        self.assertEqual(self.ids(self.teacher), [])

    def test_non_sales_sees_tasks_on_leads_they_own(self):
        self.lead.assigned_to = self.teacher
        self.lead.save()
        self.assertEqual(self.ids(self.teacher), [self.t_sales.id])

    def test_mentor_cannot_open_or_edit_others_tasks(self):
        api = APIClient()
        api.force_authenticate(self.mentor)
        self.assertEqual(api.get(f'{URL}{self.t_sales.id}/').status_code, 404)
        self.assertEqual(api.patch(f'{URL}{self.t_sales.id}/', {'status': 'COMPLETED'}, format='json').status_code, 404)
        self.assertEqual(api.patch(f'{URL}{self.t_mentor.id}/', {'status': 'COMPLETED'}, format='json').status_code, 200)

    def test_sales_unchanged(self):
        # A non-manager BDE saw only own tasks before, and still does
        self.assertEqual(self.ids(self.sales), [self.t_sales.id])

    def test_admin_unchanged_sees_everything(self):
        self.assertEqual(self.ids(self.admin), sorted(t.id for t in Task.objects.all()))

    def test_superuser_sees_everything(self):
        su = User.objects.create_user(username='root', password='x', role='EMPLOYEE', is_superuser=True)
        self.assertEqual(len(self.ids(su)), Task.objects.count())

    def test_mentor_who_manages_people_keeps_full_list(self):
        # check_is_sales_manager: anyone with subordinates counts as a manager (same rule sales uses)
        User.objects.create_user(username='junior', password='x', role='MENTOR', reports_to=self.mentor)
        self.assertEqual(len(self.ids(self.mentor)), Task.objects.count())
