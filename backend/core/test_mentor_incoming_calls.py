"""Incoming calls received by mentors: saved as StudentFeedback (call_direction=INCOMING) and reported
by Mentor Call Analytics as their own keys, without changing the outgoing KPIs."""
import csv
import io

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from core.followups import ist_today
from core.models import Program, SubProgram, Course, Batch, Student, StudentFeedback

User = get_user_model()
URL = '/api/mentor-call-analytics/'
CALLS_URL = '/api/mentor-call-analytics/calls/'
PENDING_URL = '/api/mentor-call-analytics/pending-students/'


class NoThrottleClient(APIClient):
    def generic(self, *args, **kwargs):
        cache.clear()
        return super().generic(*args, **kwargs)


class MentorIncomingCallTests(TestCase):
    def setUp(self):
        cache.clear()
        self.today = ist_today()
        self.mentor = User.objects.create_user(username='inc_mentor', password='x', role='MENTOR')
        self.other_mentor = User.objects.create_user(username='inc_other', password='x', role='MENTOR')
        self.admin = User.objects.create_user(username='inc_admin', password='x', role='ADMIN')
        program = Program.objects.create(name='Inc Program')
        sub = SubProgram.objects.create(program=program, name='Inc Sub')
        course = Course.objects.create(sub_program=sub, name='Inc Course')
        batch = Batch.objects.create(name='Inc Batch', course=course, start_date='2026-01-01',
                                     primary_mentor=self.mentor)

        def student(key, mobile):
            u = User.objects.create_user(username=f'inc_stu_{key}', password='x', role='STUDENT')
            return Student.objects.create(user=u, crm_student_id=f'INC-{key}', first_name=f'Inc{key}',
                                          mobile=mobile, program_type=program, batch=batch,
                                          lead_status='CONVERTED', is_active=True)

        self.caller = student('1', '+919876500001')       # calls the mentor
        self.missed_caller = student('2', '+919876500002')  # called, mentor missed it
        self.outgoing = student('3', '+919876500003')     # mentor called out

    def client_for(self, user):
        c = NoThrottleClient()
        c.force_authenticate(user)
        return c

    def add_feedback(self, user, student, **overrides):
        payload = {
            'status': 'CALL_DONE', 'feedback': 'Student asked about the timetable',
            'mobile_call_id': 'mob_inc_1', 'customer_number': student.mobile,
            'call_direction': 'INCOMING', 'call_status': 'CONNECTED', 'call_duration': 120,
            'start_time': '2026-11-20T06:40:00Z', 'end_time': '2026-11-20T06:42:00Z',
        }
        payload.update(overrides)
        payload = {k: v for k, v in payload.items() if v is not None}
        return self.client_for(user).post(f'/api/students/{student.id}/add_feedback/', payload, format='json')

    # ── add_feedback ─────────────────────────────────────────────────────────────────────────────────
    def test_incoming_feedback_saved(self):
        res = self.add_feedback(self.mentor, self.caller, next_followup_date='2026-11-25')
        self.assertEqual(res.status_code, 201, res.data)
        fb = StudentFeedback.objects.get(mobile_call_id='mob_inc_1')
        self.assertEqual((fb.call_direction, fb.call_status, fb.call_duration, fb.status),
                         ('INCOMING', 'CONNECTED', 120, 'CALL_DONE'))
        self.assertEqual(fb.feedback_type, 'CALL')
        self.assertEqual(fb.mentor, self.mentor)
        self.assertEqual(str(fb.next_followup_date), '2026-11-25')

    def test_idempotent_missed_then_connected_updates_same_row(self):
        first = self.add_feedback(self.mentor, self.caller, status='NO_ANSWER', call_status='MISSED',
                                  call_duration=0, feedback='')
        self.assertEqual(first.status_code, 201, first.data)
        second = self.add_feedback(self.mentor, self.caller, feedback='Called back about fees',
                                   next_followup_date='2026-12-01')
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(first.data['id'], second.data['id'])
        self.assertEqual(StudentFeedback.objects.filter(mobile_call_id='mob_inc_1').count(), 1)
        fb = StudentFeedback.objects.get(mobile_call_id='mob_inc_1')
        self.assertEqual((fb.call_status, fb.call_duration, fb.status), ('CONNECTED', 120, 'CALL_DONE'))
        self.assertEqual(fb.feedback, 'Called back about fees')
        self.assertEqual(str(fb.next_followup_date), '2026-12-01')

    def test_incoming_retry_is_idempotent_and_never_downgrades(self):
        self.add_feedback(self.mentor, self.caller)
        again = self.add_feedback(self.mentor, self.caller)
        self.assertEqual(again.status_code, 200)
        downgrade = self.add_feedback(self.mentor, self.caller, status='NO_ANSWER', call_status='MISSED',
                                      call_duration=0)
        self.assertEqual(downgrade.status_code, 200)
        fb = StudentFeedback.objects.get(mobile_call_id='mob_inc_1')
        self.assertEqual((fb.call_status, fb.call_duration, fb.status), ('CONNECTED', 120, 'CALL_DONE'))

    def test_incoming_update_rejects_call_done_on_missed(self):
        self.add_feedback(self.mentor, self.caller, status='NO_ANSWER', call_status='MISSED', call_duration=0)
        res = self.add_feedback(self.mentor, self.caller, status='CALL_DONE', call_status='MISSED', call_duration=0)
        self.assertEqual(res.status_code, 400)

    def test_other_user_cannot_update_incoming_row(self):
        self.add_feedback(self.mentor, self.caller, status='NO_ANSWER', call_status='MISSED', call_duration=0)
        res = self.add_feedback(self.admin, self.caller)     # admin can reach the student, but isn't the author
        self.assertEqual(res.status_code, 200)
        fb = StudentFeedback.objects.get(mobile_call_id='mob_inc_1')
        self.assertEqual((fb.call_status, fb.mentor_id), ('MISSED', self.mentor.id))

    def test_mentor_cannot_add_feedback_for_student_outside_batches(self):
        res = self.add_feedback(self.other_mentor, self.caller)
        self.assertEqual(res.status_code, 404)

    def test_outgoing_retry_unchanged(self):
        first = self.add_feedback(self.mentor, self.outgoing, mobile_call_id='mob_out_1', call_direction='OUTGOING',
                                  status='NO_ANSWER', call_status='MISSED', call_duration=0)
        second = self.add_feedback(self.mentor, self.outgoing, mobile_call_id='mob_out_1', call_direction='OUTGOING')
        self.assertEqual((first.status_code, second.status_code), (201, 200))
        fb = StudentFeedback.objects.get(mobile_call_id='mob_out_1')
        self.assertEqual((fb.call_status, fb.status), ('MISSED', 'NO_ANSWER'))   # plain idempotent: no update

    # ── Analytics ────────────────────────────────────────────────────────────────────────────────────
    def _seed_analytics(self):
        mk = lambda mcid, stu, direction, call_status, dur, status: StudentFeedback.objects.create(  # noqa: E731
            student=stu, mentor=self.mentor, mobile_call_id=mcid, call_direction=direction,
            call_status=call_status, call_duration=dur, status=status, feedback_date=self.today)
        mk('o1', self.outgoing, 'OUTGOING', 'CONNECTED', 60, 'CALL_DONE')
        mk('o2', self.outgoing, None, 'MISSED', 0, 'NO_ANSWER')          # legacy row, no direction = outgoing
        mk('i1', self.caller, 'INCOMING', 'CONNECTED', 120, 'CALL_DONE')
        mk('i2', self.missed_caller, 'INCOMING', 'MISSED', 0, 'NO_ANSWER')

    def test_connect_rate_and_totals_ignore_incoming(self):
        self._seed_analytics()
        k = self.client_for(self.admin).get(URL).data['kpis']
        self.assertEqual((k['total_calls'], k['connected'], k['missed']), (2, 1, 1))
        self.assertEqual(k['connect_rate'], 50.0)
        self.assertEqual(k['talk_time_sec'], 60)
        self.assertEqual(k['unique_students'], 1)
        self.assertEqual((k['incoming_calls'], k['incoming_connected'], k['incoming_missed']), (2, 1, 1))
        self.assertEqual((k['incoming_talk_time_sec'], k['incoming_students_connected']), (120, 1))
        # A student who called in and talked counts as connected
        self.assertEqual(k['students_connected_total'], 2)
        self.assertEqual(k['phone_students_connected'], 2)

    def test_incoming_keys_null_in_whatsapp_view(self):
        self._seed_analytics()
        k = self.client_for(self.admin).get(URL, {'channel': 'whatsapp'}).data['kpis']
        self.assertIsNone(k['incoming_calls'])

    def test_pending_excludes_student_with_connected_incoming(self):
        self._seed_analytics()
        rows = self.client_for(self.admin).get(PENDING_URL, {'page_size': 100}).data['results']
        ids = {r['student_id'] for r in rows}
        self.assertNotIn(self.caller.id, ids)          # connected incoming call
        self.assertNotIn(self.outgoing.id, ids)        # connected outgoing call
        self.assertIn(self.missed_caller.id, ids)      # only a missed incoming call
        missed = next(r for r in rows if r['student_id'] == self.missed_caller.id)
        self.assertEqual(missed['attempts_in_range'], 0)   # the student's missed call isn't a mentor attempt

    def test_leaderboard_has_incoming_columns(self):
        self._seed_analytics()
        row = self.client_for(self.admin).get(URL).data['leaderboard'][0]
        self.assertEqual((row['calls'], row['incoming_calls'], row['incoming_connected']), (2, 2, 1))
        self.assertEqual(row['incoming_talk_time_sec'], 120)

    def test_call_list_and_csv_direction(self):
        self._seed_analytics()
        c = self.client_for(self.admin)
        rows = c.get(CALLS_URL, {'page_size': 100}).data['results']
        self.assertEqual({r['direction'] for r in rows}, {'INCOMING', 'OUTGOING'})
        legacy = next(r for r in rows if r['id'] == StudentFeedback.objects.get(mobile_call_id='o2').id)
        self.assertIsNone(legacy['call_direction'])
        self.assertEqual(legacy['direction'], 'OUTGOING')
        connected = c.get(CALLS_URL, {'outcome': 'connected', 'channel': 'phone'}).data['count']
        self.assertEqual(connected, 2)                 # outgoing + incoming connected calls

        res = c.get(CALLS_URL, {'export': 'csv'})
        self._check_csv_direction(res)

    # ── ?direction= on the call list (Connected modal Outgoing / Incoming tabs) ─────────────────────
    def _seed_direction(self):
        self._seed_analytics()
        mk = lambda mcid, stu, direction, call_status, dur, status: StudentFeedback.objects.create(  # noqa: E731
            student=stu, mentor=self.mentor, mobile_call_id=mcid, call_direction=direction,
            call_status=call_status, call_duration=dur, status=status, feedback_date=self.today)
        mk('o3', self.caller, None, 'CONNECTED', 45, 'CALL_DONE')          # legacy connected = outgoing
        mk('i3', self.outgoing, 'INCOMING', 'CONNECTED', 30, 'CALL_DONE')
        StudentFeedback.objects.create(student=self.caller, mentor=self.mentor, status='CALL_DONE',
                                       feedback_type='WHATSAPP', feedback_date=self.today)

    def test_outgoing_direction_count_equals_connected_card(self):
        self._seed_direction()
        c = self.client_for(self.admin)
        for extra in ({}, {'batch_id': self.caller.batch_id}, {'student_id': self.caller.id}):
            with self.subTest(**extra):
                k = c.get(URL, extra).data['kpis']
                count = lambda d: c.get(CALLS_URL, {'outcome': 'connected', 'channel': 'phone',   # noqa: E731
                                                    'direction': d, **extra}).data['count']
                self.assertEqual(count('outgoing'), k['connected'])
                self.assertEqual(count('incoming'), k['incoming_connected'])
        k = c.get(URL).data['kpis']
        self.assertEqual((k['connected'], k['incoming_connected']), (2, 2))

    def test_direction_absent_keeps_current_response(self):
        self._seed_direction()
        c = self.client_for(self.admin)
        both = c.get(CALLS_URL, {'outcome': 'connected', 'channel': 'phone'}).data['count']
        out = c.get(CALLS_URL, {'outcome': 'connected', 'channel': 'phone', 'direction': 'outgoing'}).data['count']
        inc = c.get(CALLS_URL, {'outcome': 'connected', 'channel': 'phone', 'direction': 'incoming'}).data['count']
        self.assertEqual(both, out + inc)
        self.assertEqual(c.get(CALLS_URL, {'page_size': 100}).data['count'], 7)   # 6 calls + 1 WhatsApp

    def test_direction_rows_and_whatsapp_unaffected(self):
        self._seed_direction()
        c = self.client_for(self.admin)
        rows = c.get(CALLS_URL, {'direction': 'incoming', 'channel': 'phone', 'page_size': 100}).data['results']
        self.assertEqual({r['direction'] for r in rows}, {'INCOMING'})
        rows = c.get(CALLS_URL, {'direction': 'outgoing', 'channel': 'phone', 'page_size': 100}).data['results']
        self.assertEqual({r['direction'] for r in rows}, {'OUTGOING'})
        self.assertEqual(len(rows), 3)                                           # o1, legacy o2, legacy o3
        all_out = c.get(CALLS_URL, {'direction': 'outgoing', 'page_size': 100}).data['results']
        self.assertEqual(sum(r['channel'] == 'WHATSAPP' for r in all_out), 1)    # WhatsApp kept
        csv_res = c.get(CALLS_URL, {'direction': 'incoming', 'channel': 'phone', 'export': 'csv'})
        body = b''.join(csv_res.streaming_content).decode('utf-8-sig')
        self.assertEqual(len(list(csv.reader(io.StringIO(body)))) - 1, 3)        # i1, i2, i3

    def test_invalid_direction_is_400(self):
        self.assertEqual(self.client_for(self.admin).get(CALLS_URL, {'direction': 'sideways'}).status_code, 400)

    def _check_csv_direction(self, res):
        body = b''.join(res.streaming_content).decode('utf-8-sig')
        table = list(csv.reader(io.StringIO(body)))
        col = table[0].index('Direction')
        self.assertEqual(sorted(r[col] for r in table[1:]), ['INCOMING', 'INCOMING', 'OUTGOING', 'OUTGOING'])
