"""Tests for GET /api/students/my_followups/ (mentor follow-ups from the latest StudentFeedback)."""
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from core import followups
from core.models import Program, Student, StudentFeedback

User = get_user_model()
URL = '/api/students/my_followups/'


class MyFollowupsTests(TestCase):
    def setUp(self):
        cache.clear()  # DRF throttle counters live in the LocMem cache
        self.today = followups.ist_today()
        self.mentor = User.objects.create_user(username='m1', password='x', role='MENTOR')
        self.other_mentor = User.objects.create_user(username='m2', password='x', role='HEAD - MENTOR')
        self.program = Program.objects.create(name='Dance Academy', slug='dance')
        self.api = APIClient()
        self.api.force_authenticate(self.mentor)
        self._n = 0

    def student(self, first='Asha', last='K'):
        self._n += 1
        user = User.objects.create_user(username=f'stu{self._n}', password='x', role='STUDENT')
        return Student.objects.create(user=user, crm_student_id=f'FU-{self._n}', first_name=first, last_name=last,
                                      mobile=f'+91980000{self._n:04d}', program_type=self.program)

    def feedback(self, student, mentor, followup_in_days, given_days_ago=1, note='Spoke to parent', status='CALL_DONE'):
        return StudentFeedback.objects.create(
            student=student, mentor=mentor, status=status, feedback=note,
            feedback_date=self.today - timedelta(days=given_days_ago),
            next_followup_date=None if followup_in_days is None else self.today + timedelta(days=followup_in_days),
        )

    def get(self, **params):
        res = self.api.get(URL, params)
        self.assertEqual(res.status_code, 200, res.content)
        return res.json()

    def test_returns_my_latest_followup_with_fields(self):
        s = self.student('Asha', 'K')
        fb = self.feedback(s, self.mentor, 2, note='Asked to call after exam')
        data = self.get()
        self.assertEqual(data['count'], 1)
        row = data['results'][0]
        self.assertEqual(row['student_id'], s.id)
        self.assertEqual(row['student_name'], 'Asha K')
        self.assertEqual(row['phone'], s.mobile)
        self.assertEqual(row['next_followup_date'], str(self.today + timedelta(days=2)))
        self.assertFalse(row['is_overdue'])
        self.assertEqual(row['last_feedback_status'], 'CALL_DONE')
        self.assertEqual(row['last_feedback_status_display'], 'Call Done')
        self.assertEqual(row['last_feedback_notes'], 'Asked to call after exam')
        self.assertEqual(row['last_feedback_date'], str(fb.feedback_date))
        self.assertIsNotNone(row['last_feedback_at'])

    def test_only_latest_feedback_counts(self):
        s = self.student()
        self.feedback(s, self.mentor, 3, given_days_ago=5)
        self.feedback(s, self.other_mentor, 1, given_days_ago=1)  # newer, by someone else
        self.assertEqual(self.get()['count'], 0)
        other = APIClient()
        other.force_authenticate(self.other_mentor)
        self.assertEqual(other.get(URL).json()['count'], 1)

    def test_newer_feedback_without_followup_clears_it(self):
        s = self.student()
        self.feedback(s, self.mentor, 3, given_days_ago=5)
        self.feedback(s, self.mentor, None, given_days_ago=0)
        self.assertEqual(self.get()['count'], 0)

    def test_same_day_tie_uses_highest_id(self):
        s = self.student()
        self.feedback(s, self.mentor, 1, given_days_ago=0)
        self.feedback(s, self.mentor, 4, given_days_ago=0)  # created later the same day
        self.assertEqual(self.get()['results'][0]['next_followup_date'], str(self.today + timedelta(days=4)))

    def test_window_overdue_first_and_sorted(self):
        names = {}
        for offset, name in ((-3, 'Over'), (0, 'Today'), (7, 'Edge'), (8, 'Outside'), (2, 'Soon')):
            names[name] = self.student(name, 'X')
            self.feedback(names[name], self.mentor, offset)
        data = self.get()
        self.assertEqual([r['student_name'] for r in data['results']], ['Over X', 'Today X', 'Soon X', 'Edge X'])
        self.assertEqual([r['is_overdue'] for r in data['results']], [True, False, False, False])

    def test_days_param_and_cap(self):
        s = self.student()
        self.feedback(s, self.mentor, 20)
        self.assertEqual(self.get()['count'], 0)
        self.assertEqual(self.get(days=25)['count'], 1)
        self.assertEqual(self.get(days=999)['days'], 30)
        self.assertEqual(self.get(days='abc')['days'], 7)

    def test_long_note_is_shortened(self):
        s = self.student()
        self.feedback(s, self.mentor, 1, note='x' * 500)
        note = self.get()['results'][0]['last_feedback_notes']
        self.assertEqual(len(note), followups.MENTOR_FOLLOWUP_NOTE_CHARS)
        self.assertTrue(note.endswith('…'))

    def test_non_mentor_gets_empty_list(self):
        sales = User.objects.create_user(username='s1', password='x', role='SALES')
        s = self.student()
        self.feedback(s, sales, 1)  # even with a feedback row of their own
        api = APIClient()
        api.force_authenticate(sales)
        res = api.get(URL)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['count'], 0)

    def test_role_matching_is_normalised(self):
        odd = User.objects.create_user(username='m3', password='x', role=' academic mentor ')
        s = self.student()
        self.feedback(s, odd, 1)
        api = APIClient()
        api.force_authenticate(odd)
        self.assertEqual(api.get(URL).json()['count'], 1)

    def test_requires_auth(self):
        self.assertEqual(APIClient().get(URL).status_code, 401)

    def test_today_is_india_date(self):
        # 20:00 UTC on the 19th is already the 20th in India
        from datetime import datetime, timezone as dt_tz
        with mock.patch('django.utils.timezone.now', return_value=datetime(2026, 11, 19, 20, 0, tzinfo=dt_tz.utc)):
            self.assertEqual(str(followups.ist_today()), '2026-11-20')

    def test_query_count_does_not_grow_with_rows(self):
        for i in range(5):
            self.feedback(self.student(f'S{i}', 'Y'), self.mentor, i)
        self.get()  # warm up auth/session queries
        with self.assertNumQueries(2):  # students+subqueries, then feedback in_bulk
            list(followups.followups_for_mentor(self.mentor))
            StudentFeedback.objects.in_bulk([1, 2, 3])


class AssignedMentorFollowupsTests(MyFollowupsTests):
    """The batch's primary mentor also sees follow-ups that someone else (e.g. an admin) logged last."""

    def setUp(self):
        super().setUp()
        from core.models import Batch, Course, SubProgram
        sub = SubProgram.objects.create(program=self.program, name='Kathak')
        course = Course.objects.create(sub_program=sub, name='Beginner')
        self.batch = Batch.objects.create(name='B1', course=course, start_date='2026-01-01', primary_mentor=self.mentor)
        self.admin = User.objects.create_user(username='adm', password='x', role='ADMIN', first_name='Ann', last_name='Admin')
        self.admin_api = APIClient()
        self.admin_api.force_authenticate(self.admin)

    def batch_student(self, first='Asha'):
        s = self.student(first, 'K')
        s.batch = self.batch
        s.save()
        return s

    def test_admin_feedback_keeps_it_on_assigned_mentor_list(self):
        s = self.batch_student()
        self.feedback(s, self.mentor, 3, given_days_ago=5)
        self.feedback(s, self.admin, 1, given_days_ago=0, note='Admin spoke to parent')  # latest
        mine = self.get()['results']
        self.assertEqual([r['student_id'] for r in mine], [s.id])
        self.assertEqual(mine[0]['next_followup_date'], str(self.today + timedelta(days=1)))  # admin's date wins
        self.assertEqual(mine[0]['last_feedback_by'], 'Ann Admin')
        self.assertFalse(mine[0]['last_feedback_by_me'])
        admins = self.admin_api.get(URL).json()['results']
        self.assertEqual([r['student_id'] for r in admins], [s.id])  # the author still sees it
        self.assertTrue(admins[0]['last_feedback_by_me'])

    def test_author_who_is_also_assigned_mentor_gets_one_row(self):
        s = self.batch_student()
        self.feedback(s, self.mentor, 1)
        data = self.get()
        self.assertEqual(data['count'], 1)
        self.assertTrue(data['results'][0]['last_feedback_by_me'])

    def test_latest_feedback_without_followup_clears_it_for_both(self):
        s = self.batch_student()
        self.feedback(s, self.mentor, 2, given_days_ago=3)
        self.feedback(s, self.admin, None, given_days_ago=0)
        self.assertEqual(self.get()['count'], 0)
        self.assertEqual(self.admin_api.get(URL).json()['count'], 0)

    def test_previous_author_who_is_not_assigned_loses_it(self):
        s = self.batch_student()
        self.feedback(s, self.other_mentor, 2, given_days_ago=3)  # not this batch's mentor
        self.feedback(s, self.admin, 1, given_days_ago=0)
        other = APIClient()
        other.force_authenticate(self.other_mentor)
        self.assertEqual(other.get(URL).json()['count'], 0)
        self.assertEqual(self.get()['count'], 1)  # assigned mentor

    def test_secondary_mentor_not_included(self):
        s = self.batch_student()
        self.batch.secondary_mentors.add(self.other_mentor)
        self.feedback(s, self.admin, 1)
        other = APIClient()
        other.force_authenticate(self.other_mentor)
        self.assertEqual(other.get(URL).json()['count'], 0)
