"""Tests for Mentor Call Analytics: GET /api/mentor-call-analytics/ and /api/mentor-call-analytics/calls/."""
import csv
import datetime
import io
from unittest import mock

from django.apps import apps
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from core.call_analytics import ALL_SCOPE_ROLES, HEAD_MENTOR_ROLES
from core.followups import ist_today
from core.models import Program, SubProgram, Course, Batch, Student, StudentFeedback
from core.views_call_analytics import CSV_HEADERS, PENDING_CSV_HEADERS

User = get_user_model()
URL = '/api/mentor-call-analytics/'
CALLS_URL = '/api/mentor-call-analytics/calls/'
UTC = datetime.timezone.utc


class NoThrottleClient(APIClient):
    def generic(self, *args, **kwargs):
        cache.clear()
        return super().generic(*args, **kwargs)


class MentorCallAnalyticsTests(TestCase):
    def setUp(self):
        cache.clear()
        self.today = ist_today()
        mk = lambda name, role, **kw: User.objects.create_user(username=name, password='x', role=role, **kw)

        # Callers / viewers
        self.superuser = mk('su', 'SALES', is_superuser=True, is_staff=True)
        self.super_admin = mk('sa', 'SUPER_ADMIN')
        self.admin = mk('ad', 'ADMIN')
        self.manager = mk('mg', 'MANAGER')
        self.head = mk('hd', 'HEAD - MENTOR', first_name='Hari', last_name='Head')
        self.mentor_a = mk('ma', 'MENTOR', first_name='Asha', reports_to=self.head)
        self.mentor_b = mk('mb', 'MENTOR', first_name='Bala')
        self.teacher = mk('te', 'TEACHER')
        self.academic = mk('ac', 'ACADEMIC')
        self.coordinator = mk('co', 'ACADEMIC_COORDINATOR')
        self.sales = mk('sl', 'SALES')
        doomed = mk('gone', 'MENTOR')

        program = Program.objects.create(name='MCA Program')
        sub = SubProgram.objects.create(program=program, name='MCA Sub')
        course = Course.objects.create(sub_program=sub, name='MCA Course')
        self.batch_a = Batch.objects.create(name='MCA A', course=course, start_date='2026-01-01',
                                            primary_mentor=self.mentor_a)
        self.batch_b = Batch.objects.create(name='MCA B', course=course, start_date='2026-01-01',
                                            primary_mentor=self.mentor_b)

        def student(key, batch):
            u = User.objects.create_user(username=f'stu_{key}', password='x', role='STUDENT')
            return Student.objects.create(user=u, crm_student_id=f'MCA-{key}', first_name=f'Stu{key}',
                                          mobile='+919800000000', program_type=program,
                                          lead_status='CONVERTED', is_active=True, batch=batch)

        self.s1, self.s2 = student('1', self.batch_a), student('2', self.batch_b)

        def fb(mcid, mentor, stu, call_status, dur=0, **kw):
            return StudentFeedback.objects.create(
                student=stu, mentor=mentor, status=kw.pop('status', 'CALL_DONE'), mobile_call_id=mcid,
                call_status=call_status, call_duration=dur,
                call_direction='OUTGOING' if mcid else None, feedback_date=kw.pop('day', self.today), **kw)

        # 19:00 UTC the previous day = 00:30 IST today -> hour 0
        ist_midnight_call = datetime.datetime.combine(self.today - datetime.timedelta(days=1),
                                                      datetime.time(19, 0), tzinfo=UTC)
        fb('A1', self.mentor_a, self.s1, 'CONNECTED', 100, start_time=ist_midnight_call)
        fb('A2', self.mentor_a, self.s1, 'MISSED', 0, status='NO_ANSWER')
        fb('A3', self.mentor_a, self.s1, 'UNANSWERED', 0, status='NO_ANSWER')
        fb('A4', self.mentor_a, self.s1, None, 0, feedback='=HYPERLINK("http://evil")')   # Call Done, no outcome
        fb(None, self.mentor_a, self.s1, None, 0, status='MESSAGE_SENT')                  # manual entry
        fb('H1', self.head, self.s1, 'CONNECTED', 50, recording_url='https://cdn.example.com/rec.m4a')
        fb('B1', self.mentor_b, self.s2, 'CONNECTED', 200)
        fb('D1', doomed, self.s2, 'CONNECTED', 30)
        fb('OLD', self.mentor_a, self.s1, 'CONNECTED', 999, day=self.today - datetime.timedelta(days=60))
        doomed.delete()   # mentor -> NULL (SET_NULL)

    def client_for(self, user):
        c = NoThrottleClient()
        c.force_authenticate(user)
        return c

    def get(self, user, url=URL, **params):
        return self.client_for(user).get(url, params)

    # ── Scope matrix ────────────────────────────────────────────────────────────────────────────────
    def test_role_sets_match_spec(self):
        self.assertEqual(ALL_SCOPE_ROLES, {'SUPER_ADMIN', 'ADMIN', 'MANAGER'})
        self.assertEqual(HEAD_MENTOR_ROLES, {'HEAD - MENTOR'})

    def test_all_scope_roles_see_every_call(self):
        for user in (self.superuser, self.super_admin, self.admin, self.manager):
            with self.subTest(user=user.username):
                res = self.get(user)
                self.assertEqual(res.status_code, 200, res.data)
                self.assertEqual(res.data['scope']['type'], 'all')
                self.assertEqual(res.data['kpis']['total_calls'], 7)

    def test_role_normalisation(self):
        odd = User.objects.create_user(username='odd', password='x', role=' head - mentor ')
        self.assertEqual(self.get(odd).status_code, 200)
        lower_admin = User.objects.create_user(username='la', password='x', role='admin')
        self.assertEqual(self.get(lower_admin).data['scope']['type'], 'all')

    def test_head_mentor_sees_self_and_subordinates(self):
        res = self.get(self.head)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['scope']['type'], 'team')
        self.assertEqual(set(res.data['scope']['mentor_ids']), {self.head.pk, self.mentor_a.pk})
        k = res.data['kpis']
        self.assertEqual(k['total_calls'], 5)          # A1-A4 + H1
        self.assertEqual(k['connected'], 2)
        self.assertEqual(k['talk_time_sec'], 150)
        self.assertEqual({o['id'] for o in res.data['mentor_options']}, {self.head.pk, self.mentor_a.pk})

    def test_everyone_else_gets_403(self):
        for user in (self.mentor_a, self.mentor_b, self.teacher, self.academic, self.coordinator, self.sales):
            with self.subTest(role=user.role):
                self.assertEqual(self.get(user).status_code, 403)
                self.assertEqual(self.get(user, CALLS_URL).status_code, 403)
                self.assertEqual(self.get(user, CALLS_URL, export='csv').status_code, 403)

    def test_anonymous_rejected(self):
        self.assertIn(NoThrottleClient().get(URL).status_code, (401, 403))

    def test_mentor_id_outside_scope_is_403(self):
        self.assertEqual(self.get(self.head, mentor_id=self.mentor_b.pk).status_code, 403)
        self.assertEqual(self.get(self.head, CALLS_URL, mentor_id=self.mentor_b.pk).status_code, 403)
        res = self.get(self.head, mentor_id=self.mentor_a.pk)
        self.assertEqual(res.data['kpis']['total_calls'], 4)
        self.assertEqual(self.get(self.admin, mentor_id=self.mentor_b.pk).data['kpis']['total_calls'], 1)

    def test_subordinate_lookup_failure_falls_back_to_own_calls(self):
        with mock.patch.object(User, 'get_all_subordinates', side_effect=RuntimeError('cycle')):
            res = self.get(self.head)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['scope']['mentor_ids'], [self.head.pk])
        self.assertEqual(res.data['kpis']['total_calls'], 1)

    # ── Metrics ─────────────────────────────────────────────────────────────────────────────────────
    def test_kpis_and_connect_rate(self):
        k = self.get(self.admin).data['kpis']
        self.assertEqual(k['total_calls'], 7)               # manual row and 60-day-old row excluded
        self.assertEqual(k['connected'], 4)
        self.assertEqual(k['missed'], 2)                    # MISSED + UNANSWERED
        self.assertEqual(k['unknown_outcome'], 1)
        self.assertEqual(k['connect_rate'], 66.7)           # 4 / (7 - 1)
        self.assertEqual(k['talk_time_sec'], 380)
        self.assertEqual(k['avg_duration_sec'], 95)
        self.assertEqual(k['longest_call_sec'], 200)
        self.assertEqual(k['with_recording'], 1)
        self.assertEqual(k['unique_students'], 2)
        self.assertIsNone(k['rejected'])
        self.assertIsNone(k['busy'])
        self.assertIsNone(k['failed'])
        self.assertIsNone(k['manual_entries'])

    def test_include_manual_counts_manual_rows(self):
        self.assertEqual(self.get(self.admin, include_manual='true').data['kpis']['manual_entries'], 1)

    def test_connect_rate_null_when_only_unknown(self):
        res = self.get(self.admin, call_status='UNKNOWN')
        self.assertEqual(res.data['kpis']['total_calls'], 1)
        self.assertIsNone(res.data['kpis']['connect_rate'])

    def test_status_filters(self):
        self.assertEqual(self.get(self.admin, call_status='MISSED').data['kpis']['total_calls'], 2)
        self.assertEqual(self.get(self.admin, call_status='connected').data['kpis']['total_calls'], 4)
        breakdown = {r['call_status']: r['count'] for r in self.get(self.admin).data['status_breakdown']}
        self.assertEqual(breakdown, {'CONNECTED': 4, 'MISSED': 1, 'UNANSWERED': 1, None: 1})

    def test_batch_and_date_filters(self):
        self.assertEqual(self.get(self.admin, batch_id=self.batch_b.pk).data['kpis']['total_calls'], 2)
        old_day = (self.today - datetime.timedelta(days=60)).isoformat()
        res = self.get(self.admin, start_date=old_day, end_date=old_day)
        self.assertEqual(res.data['kpis']['total_calls'], 1)
        self.assertEqual(len(res.data['trend']), 1)

    def test_invalid_params_are_400(self):
        self.assertEqual(self.get(self.admin, start_date='nope').status_code, 400)
        self.assertEqual(self.get(self.admin, start_date='2026-02-10', end_date='2026-02-01').status_code, 400)
        self.assertEqual(self.get(self.admin, batch_id='x').status_code, 400)
        self.assertEqual(self.get(self.admin, mentor_id='x').status_code, 400)

    def test_default_range_and_trend(self):
        data = self.get(self.admin).data
        self.assertEqual(data['range']['end'], self.today.isoformat())
        self.assertEqual(data['range']['start'], (self.today - datetime.timedelta(days=29)).isoformat())
        self.assertEqual(len(data['trend']), 30)
        self.assertEqual(data['trend'][-1], {'date': self.today.isoformat(), 'calls': 7, 'connected': 4,
                                             'talk_time_sec': 380, 'wa_connected': 0})

    def test_hourly_uses_ist(self):
        data = self.get(self.admin).data
        self.assertEqual(len(data['hourly']), 24)
        self.assertEqual(data['hourly'][0], {'hour': 0, 'calls': 1, 'connected': 1})
        self.assertEqual(data['hourly'][19]['calls'], 0)
        self.assertEqual(data['hourly_coverage'], {'with_start_time': 1, 'total': 7})

    def test_leaderboard_deleted_user_and_role_badge(self):
        board = self.get(self.admin).data['leaderboard']
        by_name = {r['name']: r for r in board}
        self.assertIn('Deleted user', by_name)
        self.assertIsNone(by_name['Deleted user']['mentor_id'])
        self.assertEqual(by_name['Hari Head']['role'], 'HEAD - MENTOR')
        asha = by_name['Asha']
        self.assertEqual((asha['calls'], asha['connected'], asha['unknown_outcome'], asha['connect_rate']),
                         (4, 1, 1, 33.3))
        self.assertEqual(board[0]['name'], 'Bala')          # most talk time first

    def test_query_count_is_bounded(self):
        c = self.client_for(self.admin)
        # phone kpis, pending count, WhatsApp/connected totals, status, leaderboard, trend, hourly, mentor options
        with self.assertNumQueries(8):
            c.get(URL)

    # ── Call list / CSV ─────────────────────────────────────────────────────────────────────────────
    def test_call_list_paginated_with_recording_url(self):
        res = self.get(self.admin, CALLS_URL, page_size=2)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['count'], 7)
        self.assertEqual(len(res.data['results']), 2)
        rows = self.get(self.admin, CALLS_URL, page_size=50).data['results']
        rec = [r for r in rows if r['recording_url']]
        self.assertEqual(len(rec), 1)
        self.assertTrue(rec[0]['recording_url'].startswith('https://'))
        self.assertIn('Deleted user', {r['mentor_name'] for r in rows})

    def test_csv_exports_all_filtered_rows(self):
        res = self.get(self.admin, CALLS_URL, export='csv', page_size=2)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res['Content-Type'].startswith('text/csv'))
        self.assertIn('attachment;', res['Content-Disposition'])
        body = b''.join(res.streaming_content).decode('utf-8').lstrip('﻿')
        rows = list(csv.reader(io.StringIO(body)))
        self.assertEqual(rows[0], CSV_HEADERS)
        self.assertEqual(len(rows) - 1, 7)                  # all rows, not one page
        feedback_col = CSV_HEADERS.index('Feedback')
        self.assertIn("'=HYPERLINK(\"http://evil\")", [r[feedback_col] for r in rows[1:]])
        self.assertIn('+919800000000', [r[CSV_HEADERS.index('Student phone')] for r in rows[1:]])

    def test_csv_respects_head_scope(self):
        res = self.get(self.head, CALLS_URL, export='csv')
        body = b''.join(res.streaming_content).decode('utf-8').lstrip('﻿')
        self.assertEqual(len(list(csv.reader(io.StringIO(body)))) - 1, 5)

    # ── Sales call analytics unaffected ─────────────────────────────────────────────────────────────
    def test_sales_call_analytics_unchanged(self):
        # Model looked up by app label so this test module doesn't import crm code.
        LeadInteraction = apps.get_model('crm', 'LeadInteraction')
        LeadInteraction.objects.create(student=self.s1, author=self.sales, interaction_type='CALL',
                                       call_direction='OUTGOING', call_status='CONNECTED', call_duration=60,
                                       mobile_call_id='LI-1')
        LeadInteraction.objects.create(student=self.s2, author=self.sales, interaction_type='CALL',
                                       call_direction='INCOMING', call_status='MISSED', mobile_call_id='LI-2')
        res = self.get(self.admin, '/api/crm/call-analytics/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(set(res.data), {'history', 'total_history', 'summary', 'quick_stats', 'employee_summary'})
        s = res.data['summary']
        # Mentor StudentFeedback calls are not counted by sales
        self.assertEqual((s['total_calls'], s['total_duration'], s['incoming_calls'], s['outgoing_calls'],
                          s['missed_calls']), (2, 60, 1, 1, 1))
        self.assertEqual(res.data['quick_stats']['connected'], 1)
        # Mentors still can't open sales analytics
        self.assertEqual(self.get(self.mentor_a, '/api/crm/call-analytics/').status_code, 403)


class MentorWhatsAppAnalyticsTests(TestCase):
    """WhatsApp stats on top of the phone fixture above. Phone numbers must equal the phone-only fixture's."""
    # Reuse the phone fixture and helpers without re-running the phone test methods.
    client_for = MentorCallAnalyticsTests.client_for
    get = MentorCallAnalyticsTests.get

    PHONE_KPIS = {'total_calls': 7, 'connected': 4, 'missed': 2, 'unknown_outcome': 1, 'connect_rate': 66.7,
                  'talk_time_sec': 380, 'avg_duration_sec': 95, 'longest_call_sec': 200, 'with_recording': 1,
                  'unique_students': 2}

    def setUp(self):
        MentorCallAnalyticsTests.setUp(self)
        su = User.objects.create_user(username='stu_3', password='x', role='STUDENT')
        self.s3 = Student.objects.create(user=su, crm_student_id='MCA-3', first_name='Stu3', mobile='+447700900123',
                                         program_type=self.s1.program_type, lead_status='CONVERTED',
                                         is_active=True, batch=self.batch_a)

        def wa(mentor, stu, status, direction=None, dur=0, day=None):
            return StudentFeedback.objects.create(
                student=stu, mentor=mentor, feedback_type='WHATSAPP', status=status, call_direction=direction,
                call_duration=dur, feedback_date=day or self.today)

        wa(self.mentor_a, self.s1, 'MESSAGE_SENT')
        for _ in range(3):                                          # the same student marked connected 3 times
            wa(self.mentor_a, self.s1, 'CALL_DONE')
        wa(self.mentor_a, self.s1, 'NO_ANSWER')
        wa(self.mentor_b, self.s2, 'NOT_REACHABLE')
        wa(self.mentor_b, self.s2, 'CALL_DONE', 'OUTGOING', 120)   # WhatsApp call, connected
        wa(self.mentor_b, self.s2, 'NO_ANSWER', 'OUTGOING', 0)     # WhatsApp call, not connected
        wa(self.head, self.s3, 'CALL_DONE')                        # s3: reached on WhatsApp only
        wa(self.mentor_a, self.s1, 'CALL_DONE', day=self.today - datetime.timedelta(days=60))   # out of range

    def phone_kpis(self, data):
        return {key: data['kpis'][key] for key in self.PHONE_KPIS}

    def test_phone_kpis_unchanged_with_whatsapp_rows(self):
        for channel in (None, 'all', 'phone'):
            with self.subTest(channel=channel):
                params = {'channel': channel} if channel else {}
                data = self.get(self.admin, **params).data
                self.assertEqual(self.phone_kpis(data), self.PHONE_KPIS)
                self.assertEqual({r['call_status']: r['count'] for r in data['status_breakdown']},
                                 {'CONNECTED': 4, 'MISSED': 1, 'UNANSWERED': 1, None: 1})
                self.assertEqual(data['hourly_coverage'], {'with_start_time': 1, 'total': 7})

    def test_whatsapp_rows_are_not_manual(self):
        self.assertEqual(self.get(self.admin, include_manual='true').data['kpis']['manual_entries'], 1)

    def test_whatsapp_totals_chat_vs_call(self):
        self.assertEqual(self.get(self.admin).data['kpis']['whatsapp'], {
            'wa_messages': 1, 'wa_connected': 5, 'wa_no_reply': 1, 'wa_not_on_whatsapp': 1,
            'wa_calls': 2, 'wa_calls_connected': 1, 'wa_talk_time_sec': 120, 'wa_students_connected': 3,
        })

    def test_students_connected_total_counts_each_student_once(self):
        k = self.get(self.admin).data['kpis']
        self.assertEqual(k['phone_students_connected'], 2)              # s1, s2
        self.assertEqual(k['whatsapp']['wa_students_connected'], 3)     # s1, s2, s3
        self.assertEqual(k['students_connected_total'], 3)              # union, not 2 + 3

    def test_repeat_marks_count_once_per_student(self):
        w = self.get(self.admin, mentor_id=self.mentor_a.pk).data['kpis']['whatsapp']
        self.assertEqual((w['wa_connected'], w['wa_students_connected']), (3, 1))

    def test_leaderboard_columns(self):
        board = {r['name']: r for r in self.get(self.admin).data['leaderboard']}
        keys = ('phone_connected', 'phone_students_connected', 'wa_connected', 'wa_students_connected', 'wa_calls',
                'wa_talk_time_sec', 'students_connected_total')

        def pick(r):
            return tuple(r[key] for key in keys)

        self.assertEqual(pick(board['Asha']), (1, 1, 3, 1, 0, 0, 1))
        self.assertEqual(pick(board['Bala']), (1, 1, 1, 1, 2, 120, 1))
        self.assertEqual(pick(board['Hari Head']), (1, 1, 1, 1, 0, 0, 2))
        # Phone leaderboard numbers are unchanged by WhatsApp rows
        asha = board['Asha']
        self.assertEqual((asha['calls'], asha['connected'], asha['unknown_outcome'], asha['connect_rate']),
                         (4, 1, 1, 33.3))

    def test_trend_has_whatsapp_series(self):
        self.assertEqual(self.get(self.admin).data['trend'][-1],
                         {'date': self.today.isoformat(), 'calls': 7, 'connected': 4, 'talk_time_sec': 380,
                          'wa_connected': 5})

    def test_channel_filter(self):
        phone = self.get(self.admin, channel='phone').data
        self.assertEqual(phone['channel'], 'phone')
        self.assertIsNone(phone['kpis']['whatsapp'])
        self.assertEqual(phone['kpis']['students_connected_total'], 2)
        self.assertNotIn('wa_connected', phone['trend'][-1])
        self.assertIsNone(phone['leaderboard'][0]['wa_connected'])

        wa = self.get(self.admin, channel='whatsapp').data
        self.assertIsNone(wa['kpis']['total_calls'])
        self.assertIsNone(wa['kpis']['phone_students_connected'])
        self.assertEqual(wa['kpis']['whatsapp']['wa_connected'], 5)
        self.assertEqual(wa['kpis']['students_connected_total'], 3)
        self.assertEqual(wa['status_breakdown'], [])
        self.assertIsNone(wa['trend'][-1]['calls'])
        self.assertEqual(wa['trend'][-1]['wa_connected'], 5)
        self.assertIsNone({r['name']: r for r in wa['leaderboard']}['Bala']['calls'])

        self.assertEqual(self.get(self.admin, channel='fax').status_code, 400)

    def test_call_list_and_csv_channel(self):
        counts = {ch: self.get(self.admin, CALLS_URL, channel=ch, page_size=100).data['count']
                  for ch in ('all', 'phone', 'whatsapp')}
        self.assertEqual(counts, {'all': 16, 'phone': 7, 'whatsapp': 9})
        rows = self.get(self.admin, CALLS_URL, channel='whatsapp', page_size=100).data['results']
        self.assertEqual({r['channel'] for r in rows}, {'WHATSAPP'})
        self.assertIn('WhatsApp call', {r['whatsapp_label'] for r in rows})

        res = self.get(self.admin, CALLS_URL, export='csv')
        body = b''.join(res.streaming_content).decode('utf-8').lstrip('﻿')
        data = list(csv.reader(io.StringIO(body)))
        ch = CSV_HEADERS.index('Channel')
        self.assertEqual(sum(1 for r in data[1:] if r[ch] == 'WhatsApp'), 9)
        self.assertEqual(sum(1 for r in data[1:] if r[ch] == 'Phone'), 7)
        self.assertTrue(all(r[CSV_HEADERS.index('Call status')] == '' for r in data[1:] if r[ch] == 'WhatsApp'))

    def test_head_mentor_sees_only_team_whatsapp(self):
        data = self.get(self.head).data
        w = data['kpis']['whatsapp']
        # head + mentor_a only: mentor_b's WhatsApp rows (not on WhatsApp, the two calls) are invisible
        self.assertEqual((w['wa_connected'], w['wa_students_connected'], w['wa_not_on_whatsapp'], w['wa_calls']),
                         (4, 2, 0, 0))
        self.assertEqual(data['kpis']['students_connected_total'], 2)   # s1 (phone + WhatsApp), s3 (WhatsApp)
        self.assertEqual(self.get(self.head, CALLS_URL, channel='whatsapp', page_size=100).data['count'], 6)
        self.assertEqual(self.get(self.head, mentor_id=self.mentor_b.pk, channel='whatsapp').status_code, 403)

    def test_others_still_403(self):
        for user in (self.mentor_a, self.teacher, self.academic, self.sales):
            with self.subTest(role=user.role):
                self.assertEqual(self.get(user, channel='whatsapp').status_code, 403)


PENDING_URL = '/api/mentor-call-analytics/pending-students/'


class MentorConnectedAndPendingTests(TestCase):
    """Connected modal (outcome=connected on the call list) and Pending students, on the phone + WhatsApp fixture."""
    client_for = MentorCallAnalyticsTests.client_for
    get = MentorCallAnalyticsTests.get

    def setUp(self):
        MentorWhatsAppAnalyticsTests.setUp(self)
        program = self.s1.program_type

        def student(key, batch, **kw):
            u = User.objects.create_user(username=f'stu_p{key}', password='x', role='STUDENT')
            data = dict(user=u, crm_student_id=f'MCA-P{key}', first_name=f'Pend{key}', mobile='+919811111111',
                        program_type=program, lead_status='CONVERTED', is_active=True, batch=batch)
            data.update(kw)
            return Student.objects.create(**data)

        # Pending: only attempts that did not connect (phone missed + WhatsApp no reply) in range
        self.s4 = student('4', self.batch_a)
        StudentFeedback.objects.create(student=self.s4, mentor=self.mentor_a, status='NO_ANSWER', mobile_call_id='P4',
                                       call_status='MISSED', feedback_date=self.today)
        StudentFeedback.objects.create(student=self.s4, mentor=self.mentor_a, status='NO_ANSWER',
                                       feedback_type='WHATSAPP', feedback_date=self.today)
        # Pending: never contacted
        self.s5 = student('5', self.batch_b)
        # Pending: connected only before the range, follow-up overdue -> listed first
        self.s10 = student('10', self.batch_a)
        StudentFeedback.objects.create(student=self.s10, mentor=self.mentor_a, status='CALL_DONE', mobile_call_id='P10',
                                       call_status='CONNECTED', call_duration=30,
                                       feedback_date=self.today - datetime.timedelta(days=60),
                                       next_followup_date=self.today - datetime.timedelta(days=5))
        # Not counted (inactive / on break / discontinued / no batch / duplicate)
        student('6', self.batch_a, academic_status='DISCONTINUED')
        student('7', self.batch_a, is_active=False)
        student('8', self.batch_a, academic_status='ON_BREAK')
        student('9', None)
        student('11', self.batch_a, lead_status='DUPLICATE')

    # ── Connected modal ────────────────────────────────────────────────────────────────────────────
    def test_connected_list_matches_cards(self):
        for user in (self.admin, self.head):
            with self.subTest(user=user.username):
                k = self.get(user).data['kpis']
                count = lambda ch: self.get(user, CALLS_URL, outcome='connected', channel=ch).data['count']   # noqa: E731
                self.assertEqual(count('phone'), k['connected'])
                self.assertEqual(count('whatsapp'), k['whatsapp']['wa_connected'])
                self.assertEqual(count('all'), k['connected'] + k['whatsapp']['wa_connected'])

    def test_connected_list_rows_and_csv(self):
        rows = self.get(self.admin, CALLS_URL, outcome='connected', channel='all', page_size=100).data['results']
        self.assertEqual(len(rows), 9)   # 4 phone CONNECTED + 5 WhatsApp CALL_DONE
        self.assertTrue(all(r['call_status'] == 'CONNECTED' for r in rows if r['channel'] == 'PHONE'))
        self.assertTrue(all(r['status'] == 'CALL_DONE' for r in rows if r['channel'] == 'WHATSAPP'))

        page2 = self.get(self.admin, CALLS_URL, outcome='connected', page_size=4, page=2).data
        self.assertEqual((page2['count'], len(page2['results'])), (9, 4))

        res = self.get(self.admin, CALLS_URL, outcome='connected', channel='whatsapp', export='csv')
        body = b''.join(res.streaming_content).decode('utf-8').lstrip('﻿')
        self.assertEqual(len(list(csv.reader(io.StringIO(body)))) - 1, 5)

        self.assertEqual(self.get(self.admin, CALLS_URL, outcome='weird').status_code, 400)
        self.assertEqual(self.get(self.mentor_a, CALLS_URL, outcome='connected').status_code, 403)

    # ── Pending students ───────────────────────────────────────────────────────────────────────────
    def test_pending_definition_and_ordering(self):
        data = self.get(self.admin, PENDING_URL, page_size=100).data
        names = [r['student_name'] for r in data['results']]
        # s1/s2 (phone + WhatsApp) and s3 (WhatsApp only) are connected in range -> not pending.
        # Inactive / on-break / discontinued / no-batch / duplicate students are excluded.
        self.assertEqual(names, ['Pend10', 'Pend4', 'Pend5'])   # overdue first, then never connected
        by = {r['student_name']: r for r in data['results']}
        self.assertEqual(by['Pend4']['attempts_in_range'], 2)
        self.assertEqual(by['Pend4']['last_contact_date'], self.today.isoformat())
        self.assertIsNone(by['Pend4']['last_connected_date'])
        self.assertEqual(by['Pend5']['attempts_in_range'], 0)
        self.assertIsNone(by['Pend5']['last_contact_date'])
        self.assertTrue(by['Pend10']['is_overdue'])
        self.assertEqual(by['Pend10']['last_connected_date'], (self.today - datetime.timedelta(days=60)).isoformat())
        self.assertEqual(by['Pend10']['mentor_name'], 'Asha')
        self.assertEqual(by['Pend10']['batch_name'], 'MCA A')

    def test_connected_by_either_channel_is_not_pending(self):
        # Wider range that includes s10's old connected call: s10 is no longer pending
        start = (self.today - datetime.timedelta(days=90)).isoformat()
        names = {r['student_name'] for r in self.get(self.admin, PENDING_URL, start_date=start, page_size=100).data['results']}
        self.assertEqual(names, {'Pend4', 'Pend5'})
        # A WhatsApp "connected" mark today takes s4 off the list
        StudentFeedback.objects.create(student=self.s4, mentor=self.mentor_a, status='CALL_DONE',
                                       feedback_type='WHATSAPP', feedback_date=self.today)
        names = {r['student_name'] for r in self.get(self.admin, PENDING_URL, page_size=100).data['results']}
        self.assertEqual(names, {'Pend10', 'Pend5'})

    def test_card_count_matches_modal_total(self):
        cases = [(self.admin, {}), (self.head, {}), (self.admin, {'batch_id': self.batch_b.pk}),
                 (self.admin, {'mentor_id': self.mentor_a.pk})]
        for user, extra in cases:
            with self.subTest(user=user.username, **extra):
                card = self.get(user, **extra).data['kpis']['pending_count']
                self.assertEqual(card, self.get(user, PENDING_URL, **extra).data['count'])

    def test_pending_scope(self):
        names = {r['student_name'] for r in self.get(self.head, PENDING_URL, page_size=100).data['results']}
        self.assertEqual(names, {'Pend10', 'Pend4'})   # batch_a (mentor_a, the head's subordinate); not mentor_b's s5
        self.assertEqual(self.get(self.head, PENDING_URL, mentor_id=self.mentor_b.pk).status_code, 403)
        for user in (self.mentor_a, self.teacher, self.academic, self.sales):
            with self.subTest(role=user.role):
                self.assertEqual(self.get(user, PENDING_URL).status_code, 403)

    def test_pending_pagination_and_csv(self):
        p1 = self.get(self.admin, PENDING_URL, page_size=2).data
        p2 = self.get(self.admin, PENDING_URL, page_size=2, page=2).data
        self.assertEqual((p1['count'], len(p1['results']), len(p2['results'])), (3, 2, 1))
        self.assertEqual([r['student_name'] for r in p1['results'] + p2['results']], ['Pend10', 'Pend4', 'Pend5'])

        res = self.get(self.admin, PENDING_URL, export='csv')
        body = b''.join(res.streaming_content).decode('utf-8').lstrip('﻿')
        rows = list(csv.reader(io.StringIO(body)))
        self.assertEqual(rows[0], PENDING_CSV_HEADERS)
        self.assertEqual(len(rows) - 1, 3)
