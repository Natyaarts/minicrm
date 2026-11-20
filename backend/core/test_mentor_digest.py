"""Tests for the mentor morning "Student follow-ups" push (core/mentor_digest.py via send_task_reminders)."""
from datetime import datetime, timedelta, timezone as dt_tz
from io import StringIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from core.mentor_digest import digest_body
from core.models import Program, Student, StudentFeedback
from notifications.models import DeviceToken, MentorFollowupDigest, Notification

User = get_user_model()
PUSH_POST = 'notifications.push.requests.post'
TOKEN = 'ExponentPushToken[mentormentormentor0001]'

# 2026-11-20 09:05 IST == 03:35 UTC; 08:55 IST == 03:25 UTC
AT_0905_IST = datetime(2026, 11, 20, 3, 35, tzinfo=dt_tz.utc)
AT_0855_IST = datetime(2026, 11, 20, 3, 25, tzinfo=dt_tz.utc)
TODAY = AT_0905_IST.date()  # 2026-11-20 in both UTC and IST at these times


def fake_expo(*args, **kwargs):
    response = mock.Mock()
    response.raise_for_status.return_value = None
    response.json.return_value = {'data': [{'status': 'ok', 'id': str(i)} for i in range(len(kwargs['json']))]}
    return response


def sent(post):
    return [m for call in post.call_args_list for m in call.kwargs['json']]


class MentorDigestTests(TestCase):
    def setUp(self):
        self.mentor = User.objects.create_user(username='m1', password='x', role='MENTOR')
        DeviceToken.objects.create(user=self.mentor, token=TOKEN)
        self.program = Program.objects.create(name='Dance Academy', slug='dance')
        self._n = 0

    def follow(self, first, days_from_today, mentor=None):
        self._n += 1
        u = User.objects.create_user(username=f's{self._n}', password='x', role='STUDENT')
        s = Student.objects.create(user=u, crm_student_id=f'MD-{self._n}', first_name=first, last_name='Z',
                                   mobile=f'+9198{self._n:08d}', program_type=self.program)
        StudentFeedback.objects.create(student=s, mentor=mentor or self.mentor, status='CALL_DONE',
                                       feedback_date=TODAY - timedelta(days=10),
                                       next_followup_date=TODAY + timedelta(days=days_from_today))
        return s

    def run_at(self, when, *args):
        out = StringIO()
        with mock.patch('django.utils.timezone.now', return_value=when), \
                mock.patch(PUSH_POST, side_effect=fake_expo) as post:
            call_command('send_task_reminders', *args, stdout=out)
        return sent(post), out.getvalue()

    def test_sends_once_at_or_after_9_ist(self):
        self.follow('Asha', 0)
        self.follow('Rahul', 0)
        self.follow('Meera', -2)  # overdue
        self.follow('Later', 3)   # not in the digest
        msgs, _ = self.run_at(AT_0905_IST)
        self.assertEqual(len(msgs), 1)
        m = msgs[0]
        self.assertEqual(m['to'], TOKEN)
        self.assertEqual(m['title'], 'Student follow-ups')
        self.assertEqual(m['body'], 'You have 2 student follow-ups today and 1 overdue: Meera, Asha, +1')
        self.assertEqual(m['channelId'], 'followups')
        self.assertEqual(m['data'], {'type': 'MENTOR_FOLLOWUPS', 'date': str(TODAY), 'count': 3})
        self.assertEqual(MentorFollowupDigest.objects.get(user=self.mentor).count, 3)
        self.assertTrue(Notification.objects.filter(user=self.mentor, title='Student follow-ups', target_url='/mentor').exists())

        again, _ = self.run_at(AT_0905_IST + timedelta(minutes=1))
        self.assertEqual(again, [])  # run twice -> sent once
        self.assertEqual(Notification.objects.filter(user=self.mentor, title='Student follow-ups').count(), 1)

    def test_nothing_before_9_ist(self):
        self.follow('Asha', 0)
        msgs, _ = self.run_at(AT_0855_IST)
        self.assertEqual(msgs, [])
        self.assertFalse(MentorFollowupDigest.objects.exists())

    def test_late_server_still_sends_that_day(self):
        self.follow('Asha', 0)
        msgs, _ = self.run_at(AT_0905_IST + timedelta(hours=6))
        self.assertEqual(len(msgs), 1)

    def test_dry_run_changes_nothing(self):
        self.follow('Asha', 0)
        msgs, out = self.run_at(AT_0905_IST, '--dry-run')
        self.assertEqual(msgs, [])
        self.assertIn("[dry-run] mentor=m1 date=2026-11-20 today=1 overdue=0 devices=1", out)
        self.assertIn('mentor digest: 1 mentor(s) would be notified', out)
        self.assertFalse(MentorFollowupDigest.objects.exists())
        self.assertFalse(Notification.objects.filter(title='Student follow-ups').exists())

    def test_only_future_followups_sends_nothing(self):
        self.follow('Later', 1)
        self.assertEqual(self.run_at(AT_0905_IST)[0], [])

    def test_newer_feedback_by_other_mentor_moves_it(self):
        other = User.objects.create_user(username='m2', password='x', role='MENTOR')
        s = self.follow('Asha', 0)
        StudentFeedback.objects.create(student=s, mentor=other, status='CALL_DONE', feedback_date=TODAY,
                                       next_followup_date=TODAY)
        self.run_at(AT_0905_IST)
        self.assertEqual(list(MentorFollowupDigest.objects.values_list('user__username', flat=True)), ['m2'])

    def test_non_mentor_role_not_notified(self):
        sales = User.objects.create_user(username='s9', password='x', role='SALES')
        self.follow('Asha', 0, mentor=sales)
        self.assertEqual(self.run_at(AT_0905_IST)[0], [])

    def test_no_device_still_records_and_creates_notification(self):
        DeviceToken.objects.all().delete()
        self.follow('Asha', 0)
        msgs, _ = self.run_at(AT_0905_IST)
        self.assertEqual(msgs, [])
        self.assertTrue(MentorFollowupDigest.objects.filter(user=self.mentor).exists())
        self.assertTrue(Notification.objects.filter(user=self.mentor, title='Student follow-ups').exists())

    def test_skip_flag(self):
        self.follow('Asha', 0)
        self.assertEqual(self.run_at(AT_0905_IST, '--skip-mentor-digest')[0], [])

    def test_digest_error_does_not_break_task_reminders(self):
        with mock.patch('core.mentor_digest.send_mentor_followup_digests', side_effect=RuntimeError('boom')):
            msgs, _ = self.run_at(AT_0905_IST)
        self.assertEqual(msgs, [])  # command finished normally

    def test_body_wording(self):
        self.assertEqual(digest_body(1, 0, ['Asha']), 'You have 1 student follow-up today: Asha')
        self.assertEqual(digest_body(3, 0, ['A', 'B', 'C']), 'You have 3 student follow-ups today: A, B, +1')
        self.assertEqual(digest_body(0, 1, ['A']), 'You have 1 overdue student follow-up: A')
        self.assertEqual(digest_body(0, 2, ['A', 'B']), 'You have 2 overdue student follow-ups: A, B')


class AssignedMentorDigestTests(MentorDigestTests):
    def setUp(self):
        super().setUp()
        from core.models import Batch, Course, SubProgram
        sub = SubProgram.objects.create(program=self.program, name='Kathak')
        course = Course.objects.create(sub_program=sub, name='Beginner')
        self.batch = Batch.objects.create(name='B1', course=course, start_date='2026-01-01', primary_mentor=self.mentor)
        self.admin = User.objects.create_user(username='adm', password='x', role='ADMIN')
        self.admin_token = 'ExponentPushToken[adminadminadminadmin01]'
        DeviceToken.objects.create(user=self.admin, token=self.admin_token)

    def in_batch(self, student):
        student.batch = self.batch
        student.save()
        return student

    def test_admin_feedback_notifies_author_and_assigned_mentor(self):
        s = self.in_batch(self.follow('Asha', -5))  # mentor's older follow-up
        StudentFeedback.objects.create(student=s, mentor=self.admin, status='CALL_DONE', feedback_date=TODAY,
                                       next_followup_date=TODAY)  # admin's, latest
        msgs, _ = self.run_at(AT_0905_IST)
        by_token = {m['to']: m for m in msgs}
        self.assertEqual(set(by_token), {TOKEN, self.admin_token})
        self.assertEqual(by_token[TOKEN]['body'], 'You have 1 student follow-up today: Asha')
        self.assertEqual(by_token[self.admin_token]['body'], 'You have 1 student follow-up today: Asha')
        self.assertEqual(MentorFollowupDigest.objects.count(), 2)

    def test_author_who_is_assigned_mentor_counted_once(self):
        self.in_batch(self.follow('Asha', 0))
        self.in_batch(self.follow('Ravi', 0))
        msgs, _ = self.run_at(AT_0905_IST)
        self.assertEqual(len(msgs), 1)  # one push, not one per role
        self.assertEqual(msgs[0]['data']['count'], 2)
        self.assertEqual(msgs[0]['body'], 'You have 2 student follow-ups today: Asha, Ravi')

    def test_second_run_sends_nothing_to_either(self):
        s = self.in_batch(self.follow('Asha', 0))
        StudentFeedback.objects.create(student=s, mentor=self.admin, status='CALL_DONE', feedback_date=TODAY,
                                       next_followup_date=TODAY)
        self.run_at(AT_0905_IST)
        self.assertEqual(self.run_at(AT_0905_IST + timedelta(minutes=5))[0], [])
