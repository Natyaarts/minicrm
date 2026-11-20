"""Tests for follow-up due push notifications (send_task_reminders, DeviceToken endpoints, reset signal)."""
import importlib
from datetime import datetime as dt, timedelta, timezone as dt_timezone
from io import StringIO
from unittest import mock

from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import Program, Student
from crm.management.commands import send_task_reminders as cmd
from crm.models import Task
from notifications.models import DeviceToken, Notification

User = get_user_model()

TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]'
TOKEN_A2 = 'ExponentPushToken[a2a2a2a2a2a2a2a2a2a2a2]'
TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]'
TOKEN_LEGACY = 'ExponentPushToken[legacylegacylegacy0000]'

PUSH_POST = 'notifications.push.requests.post'


def followups():
    """Only the rows this feature creates (other signals also create Notifications, e.g. on Student save)."""
    return Notification.objects.filter(notification_type='TASK', title__in=['Follow-up due', 'Task due'])


def expo_ok(messages_count):
    """A fake requests.Response whose tickets are all 'ok'."""
    response = mock.Mock()
    response.raise_for_status.return_value = None
    response.json.return_value = {'data': [{'status': 'ok', 'id': f't{i}'} for i in range(messages_count)]}
    return response


def fake_expo(*args, **kwargs):
    return expo_ok(len(kwargs['json']))


def sent_messages(post_mock):
    """All messages passed to requests.post across calls."""
    out = []
    for call in post_mock.call_args_list:
        out.extend(call.kwargs['json'])
    return out


class ReminderTestBase(TestCase):
    def setUp(self):
        self.now = timezone.now()
        self.rep = User.objects.create_user(username='rep', password='x', role='SALES')
        self.owner = User.objects.create_user(username='owner', password='x', role='SALES')
        lead_user = User.objects.create_user(username='lead1', password='x', role='STUDENT')
        program = Program.objects.create(name='Dance Academy', slug='dance')
        self.lead = Student.objects.create(
            user=lead_user, crm_student_id='REM-1', first_name='Ananya', last_name='Sharma',
            mobile='+919800000001', program_type=program, assigned_to=self.owner,
        )
        DeviceToken.objects.create(user=self.rep, token=TOKEN_A, platform='android')

    def make_task(self, minutes_from_now=-1, assigned_to='rep', **extra):
        """Defaults to an auto follow-up; pass source=None / Task.SOURCE_ASSIGNED for assigned tasks."""
        assignee = self.rep if assigned_to == 'rep' else assigned_to
        extra.setdefault('source', Task.SOURCE_AUTO_FOLLOWUP)
        return Task.objects.create(
            title=extra.pop('title', 'Call back'), student=extra.pop('student', self.lead),
            assigned_to=assignee, status=extra.pop('status', 'PENDING'),
            due_date=self.now + timedelta(minutes=minutes_from_now), **extra,
        )

    def run_cmd(self, *args):
        out = StringIO()
        call_command('send_task_reminders', *args, stdout=out)
        return out.getvalue()


@mock.patch(PUSH_POST, side_effect=fake_expo)
class SendTaskRemindersTests(ReminderTestBase):

    def test_sends_once_and_message_shape(self, post):
        task = self.make_task(-1)
        self.run_cmd()
        msgs = sent_messages(post)
        self.assertEqual(len(msgs), 1)
        m = msgs[0]
        self.assertEqual(m['to'], TOKEN_A)
        self.assertEqual(m['title'], 'Follow-up due')
        self.assertEqual(m['body'], 'Call back – Ananya Sharma')
        self.assertEqual(m['sound'], 'default')
        self.assertEqual(m['channelId'], 'followups')
        self.assertEqual(m['priority'], 'high')
        self.assertEqual(m['data'], {'type': 'TASK_DUE', 'kind': 'followup', 'taskId': task.pk, 'leadId': self.lead.pk})
        task.refresh_from_db()
        self.assertIsNotNone(task.reminder_sent_at)
        n = followups().get(user=self.rep)
        self.assertEqual(n.notification_type, 'TASK')
        self.assertEqual(n.target_url, f'/sales?student={self.lead.pk}')

    def test_second_run_sends_nothing(self, post):
        self.make_task(-1)
        self.run_cmd()
        self.run_cmd()
        self.assertEqual(len(sent_messages(post)), 1)
        self.assertEqual(followups().filter(user=self.rep).count(), 1)

    def test_claim_is_exclusive(self, post):
        task = self.make_task(-1)
        self.assertTrue(cmd.claim_task(task.pk, self.now))
        self.assertFalse(cmd.claim_task(task.pk, self.now))

    def test_task_claimed_by_another_run_is_skipped(self, post):
        task = self.make_task(-1)
        real_due_tasks = cmd.due_tasks

        def due_tasks_then_concurrent_claim(now, grace):
            rows = list(real_due_tasks(now, grace))
            Task.objects.filter(pk=task.pk).update(reminder_sent_at=now)  # another worker won the race
            return rows

        with mock.patch.object(cmd, 'due_tasks', side_effect=due_tasks_then_concurrent_claim):
            self.run_cmd()
        post.assert_not_called()
        self.assertFalse(followups().exists())

    def test_grace_window(self, post):
        inside = self.make_task(-119, title='inside')
        too_old = self.make_task(-121, title='too old')
        future = self.make_task(+5, title='future')
        self.run_cmd()
        bodies = [m['body'] for m in sent_messages(post)]
        self.assertEqual(bodies, ['inside – Ananya Sharma'])
        for t, expect_sent in ((inside, True), (too_old, False), (future, False)):
            t.refresh_from_db()
            self.assertEqual(t.reminder_sent_at is not None, expect_sent, t.title)

    def test_custom_grace_minutes(self, post):
        self.make_task(-200)
        self.run_cmd('--grace-minutes', '240')
        self.assertEqual(len(sent_messages(post)), 1)

    def test_only_pending(self, post):
        self.make_task(-1, status='COMPLETED')
        self.make_task(-1, status='CANCELLED')
        self.run_cmd()
        post.assert_not_called()

    def test_recipient_falls_back_to_lead_owner(self, post):
        DeviceToken.objects.create(user=self.owner, token=TOKEN_B)
        self.make_task(-1, assigned_to=None)
        self.run_cmd()
        self.assertEqual([m['to'] for m in sent_messages(post)], [TOKEN_B])
        self.assertTrue(followups().filter(user=self.owner).exists())

    def test_no_recipient_claims_without_sending(self, post):
        self.lead.assigned_to = None
        self.lead.save()
        task = self.make_task(-1, assigned_to=None)
        self.run_cmd()
        post.assert_not_called()
        task.refresh_from_db()
        self.assertIsNotNone(task.reminder_sent_at)  # not re-examined every minute

    def test_inactive_user_not_notified(self, post):
        self.rep.is_active = False
        self.rep.save()
        self.make_task(-1)
        self.run_cmd()
        post.assert_not_called()
        self.assertFalse(followups().exists())

    def test_all_active_devices_deduplicated(self, post):
        DeviceToken.objects.create(user=self.rep, token=TOKEN_A2)
        DeviceToken.objects.create(user=self.rep, token='ExponentPushToken[offoffoffoffoffoffoff00]', is_active=False)
        self.make_task(-1)
        self.run_cmd()
        self.assertEqual(sorted(m['to'] for m in sent_messages(post)), sorted([TOKEN_A, TOKEN_A2]))

    def test_legacy_token_fallback_only_without_device_rows(self, post):
        DeviceToken.objects.filter(user=self.rep).delete()
        self.rep.expo_push_token = TOKEN_LEGACY
        self.rep.save()
        self.make_task(-1)
        self.run_cmd()
        self.assertEqual([m['to'] for m in sent_messages(post)], [TOKEN_LEGACY])

    def test_legacy_token_ignored_after_logout(self, post):
        # Has a (now inactive) DeviceToken: logged out on the new app; legacy field must not resurrect pushes
        DeviceToken.objects.filter(user=self.rep).update(is_active=False)
        self.rep.expo_push_token = TOKEN_LEGACY
        self.rep.save()
        self.make_task(-1)
        self.run_cmd()
        post.assert_not_called()
        self.assertEqual(followups().filter(user=self.rep).count(), 1)  # in-app row still created

    def test_legacy_error_text_is_not_sent(self, post):
        DeviceToken.objects.filter(user=self.rep).delete()
        self.rep.expo_push_token = 'Error: Default FirebaseApp is not initialized'
        self.rep.save()
        self.make_task(-1)
        self.run_cmd()
        post.assert_not_called()

    def test_dry_run_changes_nothing(self, post):
        task = self.make_task(-1)
        out = self.run_cmd('--dry-run')
        post.assert_not_called()
        self.assertIn(f'task={task.pk}', out)
        self.assertIn('nothing was sent', out)
        task.refresh_from_db()
        self.assertIsNone(task.reminder_sent_at)
        self.assertFalse(followups().exists())

    def test_task_without_lead(self, post):
        self.make_task(-1, student=None, title='Standalone')
        self.run_cmd()
        m = sent_messages(post)[0]
        self.assertEqual(m['body'], 'Standalone')
        self.assertIsNone(m['data']['leadId'])
        self.assertEqual(followups().get().target_url, '/crm/reminders')


class ExpoBatchTests(ReminderTestBase):

    def test_batches_of_100(self):
        from notifications.push import send_expo_batch
        messages = [{'to': f'ExponentPushToken[t{i:05d}]', 'title': 'x'} for i in range(250)]
        with mock.patch(PUSH_POST, side_effect=fake_expo) as post:
            summary = send_expo_batch(messages)
        self.assertEqual([len(c.kwargs['json']) for c in post.call_args_list], [100, 100, 50])
        self.assertEqual(summary['sent'], 250)

    def test_device_not_registered_deactivates_token(self):
        from notifications.push import send_expo_batch
        DeviceToken.objects.create(user=self.rep, token=TOKEN_A2)
        response = mock.Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {'data': [
            {'status': 'ok', 'id': '1'},
            {'status': 'error', 'message': 'gone', 'details': {'error': 'DeviceNotRegistered'}},
        ]}
        with mock.patch(PUSH_POST, return_value=response):
            summary = send_expo_batch([{'to': TOKEN_A}, {'to': TOKEN_A2}])
        self.assertEqual(summary, {'sent': 1, 'errors': 1, 'skipped': 0, 'deactivated': 1})
        self.assertTrue(DeviceToken.objects.get(token=TOKEN_A).is_active)
        self.assertFalse(DeviceToken.objects.get(token=TOKEN_A2).is_active)

    def test_network_failure_does_not_raise(self):
        from notifications.push import send_expo_batch
        with mock.patch(PUSH_POST, side_effect=ConnectionError('down')):
            summary = send_expo_batch([{'to': TOKEN_A}])
        self.assertEqual(summary['errors'], 1)

    def test_invalid_tokens_skipped(self):
        from notifications.push import send_expo_batch
        with mock.patch(PUSH_POST) as post:
            summary = send_expo_batch([{'to': 'not-a-token'}, {'to': None}])
        post.assert_not_called()
        self.assertEqual(summary['skipped'], 2)


class ReminderResetSignalTests(ReminderTestBase):

    def sent_task(self):
        task = self.make_task(-1)
        Task.objects.filter(pk=task.pk).update(reminder_sent_at=self.now)
        task.refresh_from_db()
        return task

    def test_due_date_change_rearms(self):
        task = self.sent_task()
        task.due_date = self.now + timedelta(hours=3)
        task.save()
        task.refresh_from_db()
        self.assertIsNone(task.reminder_sent_at)

    def test_due_date_change_as_iso_string_rearms(self):
        task = self.sent_task()
        task.due_date = (self.now + timedelta(hours=3)).isoformat()
        task.save()
        task.refresh_from_db()
        self.assertIsNone(task.reminder_sent_at)

    def test_other_change_keeps_reminder(self):
        task = self.sent_task()
        task.notes = 'updated'
        task.save()
        task.refresh_from_db()
        self.assertIsNotNone(task.reminder_sent_at)

    def test_same_due_date_keeps_reminder(self):
        task = self.sent_task()
        task.due_date = task.due_date
        task.save()
        task.refresh_from_db()
        self.assertIsNotNone(task.reminder_sent_at)

    def test_update_fields_with_due_date_rearms(self):
        task = self.sent_task()
        task.due_date = self.now + timedelta(hours=3)
        task.save(update_fields=['due_date'])
        task.refresh_from_db()
        self.assertIsNone(task.reminder_sent_at)

    def test_update_fields_without_due_date_keeps(self):
        task = self.sent_task()
        task.status = 'PENDING'
        task.save(update_fields=['status'])
        task.refresh_from_db()
        self.assertIsNotNone(task.reminder_sent_at)

    def test_reschedule_via_api_then_reminds_again(self):
        task = self.sent_task()
        client = APIClient()
        client.force_authenticate(self.rep)
        new_due = self.now - timedelta(seconds=10)  # rescheduled (was now-1min) to "just now"
        res = client.patch(f'/api/crm/tasks/{task.pk}/', {'due_date': new_due.isoformat()}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        # DRF lists editable=False fields as read-only under fields='__all__': clients cannot set it
        res = client.patch(f'/api/crm/tasks/{task.pk}/', {'reminder_sent_at': self.now.isoformat()}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertIsNone(res.json()['reminder_sent_at'])
        task.refresh_from_db()
        self.assertIsNone(task.reminder_sent_at)
        with mock.patch(PUSH_POST, side_effect=fake_expo) as post:
            call_command('send_task_reminders', stdout=StringIO())
        self.assertEqual(len(sent_messages(post)), 1)

    def test_complete_before_due_sends_nothing(self):
        task = self.make_task(+1)
        client = APIClient()
        client.force_authenticate(self.rep)
        res = client.patch(f'/api/crm/tasks/{task.pk}/', {'status': 'COMPLETED'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        Task.objects.filter(pk=task.pk).update(due_date=self.now - timedelta(minutes=1))  # time passes
        with mock.patch(PUSH_POST) as post:
            call_command('send_task_reminders', stdout=StringIO())
        post.assert_not_called()


class BackfillMigrationTests(ReminderTestBase):

    def test_backfill_marks_only_overdue_pending(self):
        migration = importlib.import_module('crm.migrations.0025_task_reminder_sent_at')
        overdue = self.make_task(-60 * 24 * 7)
        just_due = self.make_task(-1)
        future = self.make_task(+60)
        done = self.make_task(-60, status='COMPLETED')
        migration.backfill_overdue_as_reminded(django_apps, None)
        for t, expect in ((overdue, True), (just_due, True), (future, False), (done, False)):
            t.refresh_from_db()
            self.assertEqual(t.reminder_sent_at is not None, expect)


class DeviceTokenEndpointTests(TestCase):
    def setUp(self):
        self.a = User.objects.create_user(username='a', password='x', role='SALES')
        self.b = User.objects.create_user(username='b', password='x', role='SALES')
        self.client_a = APIClient()
        self.client_a.force_authenticate(self.a)
        self.client_b = APIClient()
        self.client_b.force_authenticate(self.b)

    def test_register_and_reregister(self):
        res = self.client_a.post('/api/auth/devices/', {'token': TOKEN_A, 'platform': 'android', 'device_name': 'Pixel'}, format='json')
        self.assertEqual(res.status_code, 201)
        res = self.client_a.post('/api/auth/devices/', {'token': TOKEN_A, 'platform': 'android'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(DeviceToken.objects.count(), 1)

    def test_token_moves_to_new_user(self):
        self.client_a.post('/api/auth/devices/', {'token': TOKEN_A}, format='json')
        self.client_b.post('/api/auth/devices/', {'token': TOKEN_A}, format='json')
        self.assertEqual(DeviceToken.objects.get(token=TOKEN_A).user, self.b)

    def test_rejects_error_text(self):
        res = self.client_a.post('/api/auth/devices/', {'token': 'Error: Project ID not found'}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertFalse(DeviceToken.objects.exists())

    def test_unregister_own_token_only(self):
        DeviceToken.objects.create(user=self.a, token=TOKEN_A)
        res = self.client_b.delete(f'/api/auth/devices/{TOKEN_A}/')
        self.assertEqual(res.status_code, 204)
        self.assertTrue(DeviceToken.objects.get(token=TOKEN_A).is_active)
        res = self.client_a.delete(f'/api/auth/devices/{TOKEN_A}/')
        self.assertEqual(res.status_code, 204)
        self.assertFalse(DeviceToken.objects.get(token=TOKEN_A).is_active)

    def test_requires_auth(self):
        self.assertEqual(APIClient().post('/api/auth/devices/', {'token': TOKEN_A}, format='json').status_code, 401)

    def test_legacy_expo_token_endpoint_unchanged(self):
        res = self.client_a.post('/api/auth/expo-token/', {'token': 'anything'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.a.refresh_from_db()
        self.assertEqual(self.a.expo_push_token, 'anything')


class ReminderBodyTests(ReminderTestBase):

    def test_name_not_repeated_when_title_has_it(self):
        task = self.make_task(-1, title='Follow-up: Ananya Sharma')
        self.assertEqual(cmd.reminder_body(task), 'Follow-up: Ananya Sharma')

    def test_name_match_is_case_insensitive(self):
        task = self.make_task(-1, title='call ANANYA SHARMA again')
        self.assertEqual(cmd.reminder_body(task), 'call ANANYA SHARMA again')

    def test_name_appended_otherwise(self):
        task = self.make_task(-1, title='Send fee details')
        self.assertEqual(cmd.reminder_body(task), 'Send fee details – Ananya Sharma')


class CallFollowupEndToEndTests(ReminderTestBase):
    """POST /crm/interactions/ with next_followup_date (as the app sends it) -> Task -> reminder at that time."""

    def setUp(self):
        super().setUp()
        from django.core.cache import cache
        cache.clear()  # DRF write throttle counters live in the LocMem cache
        self.api = APIClient()
        self.api.force_authenticate(self.rep)

    def post_call(self, followup_iso, call_id='e2e-call-1'):
        # Same shape as dialpad.tsx / GlobalCallListener.tsx (multipart, string values)
        return self.api.post('/api/crm/interactions/', {
            'mobile_call_id': call_id,
            'student': str(self.lead.pk),
            'customer_number': '+919800000001',
            'receiver_number': '+919800000001',
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'call_status': 'CONNECTED',
            'call_duration': '42',
            'notes': 'Interested, call back',
            'next_followup_date': followup_iso,
        }, format='multipart')

    def run_at(self, when):
        with mock.patch.object(cmd.timezone, 'now', return_value=when), \
                mock.patch(PUSH_POST, side_effect=fake_expo) as post:
            call_command('send_task_reminders', stdout=StringIO())
        return sent_messages(post)

    def test_interaction_followup_creates_task_and_reminds_on_time(self):
        due = (self.now + timedelta(minutes=30)).replace(microsecond=0)
        # JS Date.toISOString() format: milliseconds + 'Z'
        res = self.post_call(due.strftime('%Y-%m-%dT%H:%M:%S.000Z'))
        self.assertEqual(res.status_code, 201, res.content)

        task = Task.objects.get(student=self.lead)
        self.assertEqual(task.due_date, due)           # full datetime kept, not date-only
        self.assertEqual(task.assigned_to, self.rep)  # the caller
        self.assertEqual(task.status, 'PENDING')
        self.assertIsNone(task.reminder_sent_at)

        self.assertEqual(self.run_at(due - timedelta(minutes=1)), [])  # not yet due
        msgs = self.run_at(due + timedelta(seconds=30))
        self.assertEqual(len(msgs), 1)
        self.assertEqual(msgs[0]['to'], TOKEN_A)
        self.assertEqual(msgs[0]['body'], 'Follow-up: Ananya Sharma')  # title already has the name
        self.assertEqual(msgs[0]['data'], {'type': 'TASK_DUE', 'kind': 'followup', 'taskId': task.pk, 'leadId': self.lead.pk})
        self.assertEqual(task.source, Task.SOURCE_AUTO_FOLLOWUP)
        self.assertEqual(task.created_by, self.rep)
        self.assertEqual(self.run_at(due + timedelta(seconds=90)), [])  # only once

    def test_ist_offset_is_converted_correctly(self):
        # 16:00 IST == 10:30 UTC
        res = self.post_call('2026-12-01T16:00:00+05:30', call_id='e2e-call-ist')
        self.assertEqual(res.status_code, 201, res.content)
        task = Task.objects.get(student=self.lead)
        self.assertEqual(task.due_date, dt(2026, 12, 1, 10, 30, tzinfo=dt_timezone.utc))


@mock.patch(PUSH_POST, side_effect=fake_expo)
class AssignedTaskReminderTests(ReminderTestBase):
    """Tasks created on the web Reminders page (source ASSIGNED, or null on older rows)."""

    def setUp(self):
        super().setUp()
        self.lead_manager = User.objects.create_user(
            username='tl', password='x', role='TEAM_LEAD', first_name='Priya', last_name='Menon')

    def test_assigned_message_from_creator(self, post):
        task = self.make_task(-1, source=Task.SOURCE_ASSIGNED, title='Send fee details', created_by=self.lead_manager)
        self.run_cmd()
        m = sent_messages(post)[0]
        self.assertEqual(m['title'], 'Task due')
        self.assertEqual(m['body'], 'Send fee details (from Priya Menon)')
        self.assertEqual(m['data'], {'type': 'TASK_DUE', 'kind': 'assigned', 'taskId': task.pk, 'leadId': self.lead.pk})
        n = followups().get(user=self.rep)
        self.assertEqual((n.title, n.message), ('Task due', 'Send fee details (from Priya Menon)'))
        self.assertEqual(n.target_url, f'/sales?student={self.lead.pk}')

    def test_null_source_is_assigned(self, post):
        task = self.make_task(-1, source=None, title='Old reminder')
        self.run_cmd()
        m = sent_messages(post)[0]
        self.assertEqual(m['title'], 'Task due')
        self.assertEqual(m['body'], 'Old reminder')  # no created_by -> no "(from ...)"
        self.assertEqual(m['data']['kind'], 'assigned')
        self.assertEqual(m['data']['taskId'], task.pk)

    def test_self_created_has_no_from(self, post):
        self.make_task(-1, source=Task.SOURCE_ASSIGNED, title='Own reminder', created_by=self.rep)
        self.run_cmd()
        self.assertEqual(sent_messages(post)[0]['body'], 'Own reminder')

    def test_creator_without_name_uses_username(self, post):
        nameless = User.objects.create_user(username='mgr2', password='x', role='SALES_MANAGER')
        self.make_task(-1, source=Task.SOURCE_ASSIGNED, title='Check batch', created_by=nameless)
        self.run_cmd()
        self.assertEqual(sent_messages(post)[0]['body'], 'Check batch (from mgr2)')

    def test_assigned_without_lead(self, post):
        task = self.make_task(-1, source=Task.SOURCE_ASSIGNED, student=None, title='Team meeting',
                              created_by=self.lead_manager)
        self.run_cmd()
        m = sent_messages(post)[0]
        self.assertEqual(m['data'], {'type': 'TASK_DUE', 'kind': 'assigned', 'taskId': task.pk, 'leadId': None})
        self.assertEqual(followups().get().target_url, '/crm/reminders')

    def test_assigned_body_does_not_append_lead_name(self, post):
        self.make_task(-1, source=Task.SOURCE_ASSIGNED, title='Call back')
        self.run_cmd()
        self.assertEqual(sent_messages(post)[0]['body'], 'Call back')

    def test_dry_run_shows_kind(self, post):
        task = self.make_task(-1, source=None)
        out = self.run_cmd('--dry-run')
        self.assertIn(f'task={task.pk} kind=assigned', out)
        post.assert_not_called()


class TaskCreatedByTests(ReminderTestBase):

    def setUp(self):
        super().setUp()
        from django.core.cache import cache
        cache.clear()  # DRF write throttle counters live in the LocMem cache

    def test_web_create_records_creator_and_leaves_source_null(self):
        manager = User.objects.create_user(username='mgr', password='x', role='ADMIN')
        api = APIClient()
        api.force_authenticate(manager)
        res = api.post('/api/crm/tasks/', {
            'title': 'Send brochure', 'assigned_to': self.rep.pk, 'student': self.lead.pk,
            'task_type': 'CALL', 'status': 'PENDING', 'due_date': (self.now + timedelta(hours=1)).isoformat(),
        }, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        task = Task.objects.get(pk=res.json()['id'])
        self.assertEqual(task.created_by, manager)
        self.assertIsNone(task.source)
        self.assertEqual(cmd.task_kind(task), 'assigned')

    def test_created_by_and_source_are_read_only_in_api(self):
        api = APIClient()
        api.force_authenticate(self.rep)
        res = api.post('/api/crm/tasks/', {
            'title': 'Mine', 'assigned_to': self.rep.pk, 'due_date': (self.now + timedelta(hours=1)).isoformat(),
            'source': 'AUTO_FOLLOWUP', 'created_by': self.owner.pk,
        }, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        task = Task.objects.get(pk=res.json()['id'])
        self.assertEqual(task.created_by, self.rep)  # client value ignored
        self.assertIsNone(task.source)


class SourceBackfillMigrationTests(ReminderTestBase):

    def test_backfill_source(self):
        migration = importlib.import_module('crm.migrations.0026_task_source_created_by')
        auto_pending = self.make_task(+60, source=None, title='Follow-up: Ananya Sharma')
        auto_done = self.make_task(-60, source=None, title='Follow-up: Ananya Sharma', status='COMPLETED')
        manual = self.make_task(+60, source=None, title='Send fee details')
        already = self.make_task(+60, source=Task.SOURCE_AUTO_FOLLOWUP, title='Anything')
        migration.backfill_source(django_apps, None)
        expected = {
            auto_pending: 'AUTO_FOLLOWUP',
            auto_done: 'ASSIGNED',     # only PENDING rows get the title heuristic
            manual: 'ASSIGNED',
            already: 'AUTO_FOLLOWUP',  # existing values untouched
        }
        for task, source in expected.items():
            task.refresh_from_db()
            self.assertEqual(task.source, source, task.title)


class ListSuspectTaskTimesTests(ReminderTestBase):

    def run_list(self, *args):
        out = StringIO()
        call_command('list_suspect_task_times', *args, stdout=out)
        return out.getvalue()

    def test_lists_only_pending_future_manual_tasks_and_changes_nothing(self):
        manual = self.make_task(+600, source=None, title='Web reminder')
        assigned = self.make_task(+600, source=Task.SOURCE_ASSIGNED, title='Assigned one')
        self.make_task(+600, title='Follow-up: Ananya Sharma')  # AUTO_FOLLOWUP (mobile, correct)
        self.make_task(+600, source=None, title='Done one', status='COMPLETED')
        self.make_task(-600, source=None, title='Past one')
        before = list(Task.objects.order_by('pk').values())

        out = self.run_list()

        self.assertIn('Web reminder', out)
        self.assertIn('Assigned one', out)
        self.assertNotIn('Follow-up: Ananya', out)
        self.assertNotIn('Done one', out)
        self.assertNotIn('Past one', out)
        self.assertIn('2 task(s). Read-only', out)
        self.assertEqual(list(Task.objects.order_by('pk').values()), before)  # nothing changed
        ist = timezone.localtime(manual.due_date, cmd_ist())
        self.assertIn(ist.strftime('%Y-%m-%d %H:%M IST'), out)
        self.assertIn((ist - timedelta(hours=5, minutes=30)).strftime('%Y-%m-%d %H:%M IST'), out)
        self.assertTrue(assigned.pk)

    def test_include_past_and_before(self):
        self.make_task(-600, source=None, title='Past one')
        self.assertIn('Past one', self.run_list('--include-past'))
        self.assertIn('0 task(s)', self.run_list('--include-past', '--before', '2000-01-01 00:00'))


def cmd_ist():
    from zoneinfo import ZoneInfo
    return ZoneInfo('Asia/Kolkata')
