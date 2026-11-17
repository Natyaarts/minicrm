"""Mentor call-feedback endpoints for SUPER_ADMIN / ADMIN-type users.

Admin-type users covered: SUPER_ADMIN, ADMIN, is_superuser with role SALES, and role strings stored
as 'super_admin' / ' SUPER_ADMIN '. Mentor scoping is checked to stay unchanged.
"""
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from core.models import Program, SubProgram, Course, Batch, Student, StudentFeedback
from core.test_feedback_recording import M4A_BYTES, TEMP_MEDIA

User = get_user_model()

PAYLOAD = {
    "status": "CALL_DONE", "feedback": "", "customer_number": "+919999999999",
    "call_direction": "OUTGOING", "call_status": "CONNECTED", "call_duration": 22,
    "start_time": "2026-11-17T08:30:00.000Z", "end_time": "2026-11-17T08:30:30.000Z",
}


class NoThrottleClient(APIClient):
    """Throttle counters live in the cache; clear them so a long matrix isn't rate-limited (429)."""

    def generic(self, *args, **kwargs):
        cache.clear()
        return super().generic(*args, **kwargs)


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class SuperAdminFeedbackTests(TestCase):
    def setUp(self):
        cache.clear()
        self.mentor = User.objects.create_user(username='mentor_sa', password='x', role='MENTOR', first_name='Mona')
        self.other_mentor = User.objects.create_user(username='mentor_other', password='x', role='MENTOR')
        program = Program.objects.create(name='SA Program')
        sub = SubProgram.objects.create(program=program, name='SA Sub')
        course = Course.objects.create(sub_program=sub, name='SA Course')
        self.batch = Batch.objects.create(name='SA Batch', course=course, start_date='2026-01-01',
                                          primary_mentor=self.mentor)
        other_batch = Batch.objects.create(name='Other Batch', course=course, start_date='2026-01-01',
                                           primary_mentor=self.other_mentor)

        def student(key, **kw):
            u = User.objects.create_user(username=f'stu_sa_{key}', password='x', role='STUDENT')
            data = dict(user=u, crm_student_id=f'SA-{key}', first_name=f'First{key}', mobile='+919999999999',
                        program_type=program, lead_status='CONVERTED', is_active=True)
            data.update(kw)
            return Student.objects.create(**data)

        self.students = {
            'converted_in_batch': student('cb', batch=self.batch),
            'converted_no_batch': student('cn'),
            'lead_not_converted': student('ln', lead_status='NEW'),
            'duplicate': student('dp', lead_status='DUPLICATE'),
            'inactive': student('in', batch=self.batch, is_active=False),
        }
        self.other_student = student('ob', batch=other_batch)
        # Feedback by OTHER mentors, which admins must see in recent_feedbacks
        self.mentor_fb = StudentFeedback.objects.create(
            student=self.students['converted_in_batch'], mentor=self.mentor, status='CALL_DONE',
            call_status='CONNECTED', call_duration=10, mobile_call_id='MENTOR-FB')
        self.other_fb = StudentFeedback.objects.create(
            student=self.other_student, mentor=self.other_mentor, status='CALL_DONE',
            call_status='CONNECTED', call_duration=12, mobile_call_id='OTHER-FB')

        self.admins = {
            'SUPER_ADMIN': User.objects.create_user(username='sa', password='x', role='SUPER_ADMIN'),
            'ADMIN': User.objects.create_user(username='ad', password='x', role='ADMIN'),
            'is_superuser+SALES': User.objects.create_user(username='su', password='x', role='SALES',
                                                           is_superuser=True, is_staff=True),
            'role super_admin': User.objects.create_user(username='lc', password='x', role='super_admin'),
            "role ' SUPER_ADMIN '": User.objects.create_user(username='ws', password='x', role=' SUPER_ADMIN '),
        }

    def client_for(self, user):
        c = NoThrottleClient()
        c.force_authenticate(user)
        return c

    def add(self, client, student, mcid, own_only=False, **overrides):
        url = f'/api/students/{student.id}/add_feedback/' + ('?own_only=true' if own_only else '')
        return client.post(url, {**PAYLOAD, 'mobile_call_id': mcid, **overrides}, format='json')

    def upload(self, client, student, mcid, content_type='audio/mp4'):
        f = SimpleUploadedFile('rec.m4a', M4A_BYTES, content_type=content_type)
        return client.post(f'/api/students/{student.id}/feedback-recording/',
                           {'mobile_call_id': mcid, 'audio_recording': f}, format='multipart')

    # 1. add_feedback per student type, with and without own_only
    def test_add_feedback_per_student_type(self):
        expected = {
            'converted_in_batch': 201,
            'converted_no_batch': 201,
            'lead_not_converted': 201,  # CURRENT behaviour, documented: admins may add feedback to leads
            'duplicate': 404,
            'inactive': 404,
        }
        for label, admin in self.admins.items():
            c = self.client_for(admin)
            for key, code in expected.items():
                for own_only in (False, True):
                    res = self.add(c, self.students[key], f'{admin.username}-{key}-{own_only}', own_only)
                    self.assertEqual(res.status_code, code, (label, key, own_only, res.data))

    # 2. Idempotent, and the feedback is attributed to the admin
    def test_idempotent_and_attributed_to_admin(self):
        s = self.students['converted_in_batch']
        for label, admin in self.admins.items():
            c = self.client_for(admin)
            first = self.add(c, s, f'IDEM-{admin.username}')
            second = self.add(c, s, f'IDEM-{admin.username}')
            self.assertEqual((first.status_code, second.status_code), (201, 200), label)
            self.assertEqual(first.data['id'], second.data['id'], label)
            rows = StudentFeedback.objects.filter(mobile_call_id=f'IDEM-{admin.username}')
            self.assertEqual(rows.count(), 1, label)
            self.assertEqual(rows.get().mentor_id, admin.id, label)

    # 3. Recording upload (audio/mp4 and audio/m4a) and rejection on a MISSED row
    def test_recording_upload(self):
        s = self.students['converted_in_batch']
        for label, admin in self.admins.items():
            c = self.client_for(admin)
            for content_type in ('audio/mp4', 'audio/m4a'):
                mcid = f'REC-{admin.username}-{content_type}'
                self.assertEqual(self.add(c, s, mcid).status_code, 201)
                res = self.upload(c, s, mcid, content_type)
                self.assertEqual(res.status_code, 200, (label, content_type, res.data))
                self.assertTrue(res.data['recording_url'].startswith('http://testserver/'), res.data)
            missed = f'MISSED-{admin.username}'
            self.assertEqual(self.add(c, s, missed, status='NO_ANSWER', call_status='MISSED',
                                     call_duration=0).status_code, 201)
            self.assertEqual(self.upload(c, s, missed).status_code, 400, label)

    # 4. Student history includes the new row and its recording URL
    def test_feedbacks_includes_new_row_with_url(self):
        s = self.students['converted_in_batch']
        for label, admin in self.admins.items():
            c = self.client_for(admin)
            mcid = f'HIST-{admin.username}'
            self.add(c, s, mcid)
            self.assertEqual(self.upload(c, s, mcid).status_code, 200)
            res = c.get(f'/api/students/{s.id}/feedbacks/')
            self.assertEqual(res.status_code, 200, label)
            row = next(r for r in res.data if r['mobile_call_id'] == mcid)
            self.assertTrue(row['recording_url'].startswith('http://testserver/'), label)

    # 5. recent_feedbacks: admins see every mentor's calls (+ their own); search works
    def test_recent_feedbacks_admin_sees_all(self):
        for label, admin in self.admins.items():
            c = self.client_for(admin)
            own = self.add(c, self.students['converted_no_batch'], f'RECENT-{admin.username}').data['id']
            res = c.get('/api/students/recent_feedbacks/?calls_only=true&page_size=100')
            self.assertEqual(res.status_code, 200, label)
            ids = {r['id'] for r in res.data['results']}
            self.assertTrue({self.mentor_fb.id, self.other_fb.id, own} <= ids, (label, ids))

            res = c.get(f'/api/students/recent_feedbacks/?search={self.other_student.first_name}')
            ids = {r['id'] for r in res.data['results']}
            self.assertEqual(ids, {self.other_fb.id}, label)

    def test_recent_feedbacks_mentor_scoping_unchanged(self):
        res = self.client_for(self.mentor).get('/api/students/recent_feedbacks/?page_size=100')
        ids = {r['id'] for r in res.data['results']}
        self.assertIn(self.mentor_fb.id, ids)
        self.assertNotIn(self.other_fb.id, ids)

    # 6. Mentors screen endpoints never 500
    def test_mentor_screen_endpoints(self):
        for label, admin in self.admins.items():
            c = self.client_for(admin)
            for url in ('/api/students/feedback_summary/', '/api/students/mentor-batches/',
                        '/api/dashboard-stats/?own_only=true', '/api/students/break_metrics/?own_only=true'):
                res = c.get(url)
                self.assertEqual(res.status_code, 200, (label, url, getattr(res, 'data', None)))
            batches = c.get('/api/students/mentor-batches/')
            data = batches.data.get('results', batches.data) if isinstance(batches.data, dict) else batches.data
            self.assertEqual(len(data), 2, label)  # all batches, not only their own

    # 7. "All Students - Across all batches"
    def test_students_list_across_all_batches(self):
        expected = {self.students['converted_in_batch'].id, self.students['converted_no_batch'].id,
                    self.other_student.id}
        for label, admin in self.admins.items():
            res = self.client_for(admin).get('/api/students/?lead_status=CONVERTED&own_only=true&page_size=100')
            self.assertEqual(res.status_code, 200, label)
            self.assertEqual({r['id'] for r in res.data['results']}, expected, label)
