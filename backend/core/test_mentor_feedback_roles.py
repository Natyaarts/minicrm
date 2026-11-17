"""add_feedback through the real HTTP path for every mentor-ish role.

Regression for the mobile "HTTP 500" on Save Feedback: get_queryset's mentor branch called
User.get_all_subordinates() (no own_only on add_feedback), which recursed forever on a
reports_to cycle -> RecursionError -> 500, while the own_only student list kept working.
"""
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Program, SubProgram, Course, Batch, Student, StudentFeedback
from core.test_feedback_recording import M4A_BYTES, TEMP_MEDIA
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

User = get_user_model()

PAYLOAD = {
    "status": "CALL_DONE", "feedback": "", "customer_number": "+919999999999",
    "call_direction": "OUTGOING", "call_status": "CONNECTED", "call_duration": 22,
    "start_time": "2026-11-17T08:30:00.000Z", "end_time": "2026-11-17T08:30:30.000Z",
}


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class MentorFeedbackRoleTests(TestCase):
    def setUp(self):
        cache.clear()  # throttle counters
        self.head = User.objects.create_user(username='head', password='x', role='HEAD - MENTOR')
        self.mentor = User.objects.create_user(username='mentor', password='x', role='MENTOR', reports_to=self.head)
        self.teacher = User.objects.create_user(username='teacher', password='x', role='TEACHER')
        self.coordinator = User.objects.create_user(username='coord', password='x', role='ACADEMIC_COORDINATOR')
        self.admin = User.objects.create_user(username='adm', password='x', role='ADMIN')
        program = Program.objects.create(name='Roles Program')
        sub = SubProgram.objects.create(program=program, name='Roles Sub')
        course = Course.objects.create(sub_program=sub, name='Roles Course')
        batch = Batch.objects.create(name='Roles Batch', course=course, start_date='2026-01-01',
                                     primary_mentor=self.mentor, teacher=self.teacher)
        student_user = User.objects.create_user(username='stu_roles', password='x', role='STUDENT')
        self.student = Student.objects.create(
            user=student_user, crm_student_id='ROLES-1', first_name='Role', mobile='+919999999999',
            program_type=program, batch=batch, lead_status='CONVERTED', is_active=True)

    def _post(self, user, mcid, own_only=False):
        client = APIClient()
        client.force_authenticate(user)
        url = f'/api/students/{self.student.id}/add_feedback/' + ('?own_only=true' if own_only else '')
        return client.post(url, {**PAYLOAD, 'mobile_call_id': mcid}, format='json')

    # 1. MENTOR with and without own_only
    def test_mentor_payload_with_and_without_own_only(self):
        res = self._post(self.mentor, 'TEST-1')
        self.assertEqual(res.status_code, 201, res.data)
        res = self._post(self.mentor, 'TEST-1-own', own_only=True)
        self.assertEqual(res.status_code, 201, res.data)
        fb = StudentFeedback.objects.get(mobile_call_id='TEST-1')
        self.assertEqual((fb.status, fb.call_status, fb.call_duration), ('CALL_DONE', 'CONNECTED', 22))

    # 2. Other roles: 201, or a clean 404 when the student isn't in their scope, never 500
    def test_other_roles_never_500(self):
        expected = {
            'TEACHER': (self.teacher, 201),          # batch teacher
            'HEAD - MENTOR': (self.head, 201),       # via subordinate mentor's batch
            'ACADEMIC_COORDINATOR': (self.coordinator, 404),  # not linked to this batch
            'ADMIN': (self.admin, 201),
        }
        for i, (role, (user, code)) in enumerate(expected.items()):
            for own_only in (False, True):
                res = self._post(user, f'ROLE-{i}-{own_only}', own_only=own_only)
                self.assertNotEqual(res.status_code, 500, (role, own_only, res.data))
                if not own_only:
                    self.assertEqual(res.status_code, code, (role, res.data))

    # 3a. get_all_subordinates raising -> still 201, error logged
    def test_get_all_subordinates_raising_is_logged_not_500(self):
        with mock.patch.object(User, 'get_all_subordinates', side_effect=RuntimeError('bad hierarchy')):
            with self.assertLogs('core.views', level='ERROR') as logs:
                res = self._post(self.mentor, 'RAISE-1')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(any('get_all_subordinates failed' in line for line in logs.output))

    # 3b. Real data: reports_to cycle (head <-> mentor) and self-reporting user
    def test_reports_to_cycle_does_not_500(self):
        self.head.reports_to = self.mentor
        self.head.save()
        self.assertEqual({u.pk for u in self.mentor.get_all_subordinates()}, {self.head.pk})
        self.assertEqual(self._post(self.mentor, 'CYCLE-1').status_code, 201)

        self.teacher.reports_to = self.teacher
        self.teacher.save()
        self.assertEqual(self.teacher.get_all_subordinates(), [])
        self.assertEqual(self._post(self.teacher, 'SELF-1').status_code, 201)

    def test_get_all_subordinates_unchanged_for_acyclic_tree(self):
        sub2 = User.objects.create_user(username='sub2', password='x', role='MENTOR', reports_to=self.mentor)
        self.assertEqual({u.pk for u in self.head.get_all_subordinates()}, {self.mentor.pk, sub2.pk})
        self.assertEqual(self.mentor.get_all_subordinates(), [sub2])
        self.assertEqual(sub2.get_all_subordinates(), [])

    # 4. Idempotent on mobile_call_id
    def test_same_mobile_call_id_twice(self):
        first = self._post(self.mentor, 'IDEM-1', own_only=True)
        second = self._post(self.mentor, 'IDEM-1', own_only=True)
        self.assertEqual((first.status_code, second.status_code), (201, 200))
        self.assertEqual(first.data['id'], second.data['id'])
        self.assertEqual(StudentFeedback.objects.filter(mobile_call_id='IDEM-1').count(), 1)

    # 5. Recording upload exactly as the app sends it (own_only, audio/mp4)
    def test_recording_upload_with_own_only(self):
        self.assertEqual(self._post(self.mentor, 'REC-1', own_only=True).status_code, 201)
        client = APIClient()
        client.force_authenticate(self.mentor)
        f = SimpleUploadedFile('recording_1.m4a', M4A_BYTES, content_type='audio/mp4')
        res = client.post(f'/api/students/{self.student.id}/feedback-recording/?own_only=true',
                          {'mobile_call_id': 'REC-1', 'audio_recording': f}, format='multipart')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(res.data['recording_url'].startswith('http'))

    # 6. Feedback history for a mentor, with and without own_only
    def test_feedbacks_get_for_mentor(self):
        self._post(self.mentor, 'HIST-1', own_only=True)
        client = APIClient()
        client.force_authenticate(self.mentor)
        for suffix in ('', '?own_only=true'):
            res = client.get(f'/api/students/{self.student.id}/feedbacks/{suffix}')
            self.assertEqual(res.status_code, 200, res.data)
            self.assertEqual(res.data[0]['mobile_call_id'], 'HIST-1')
