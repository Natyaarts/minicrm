import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from core.models import Program, SubProgram, Course, Batch, Student, StudentFeedback

User = get_user_model()

# Minimal MP4/M4A header: 4-byte box size + 'ftyp' + brand, followed by padding
M4A_BYTES = b'\x00\x00\x00\x20ftypM4A \x00\x00\x02\x00M4A isomiso2' + b'\x00' * 2048

TEMP_MEDIA = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class FeedbackRecordingTests(TestCase):
    """Mirrors the mobile mentor flow: add_feedback, then feedback-recording (multipart)."""

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA, ignore_errors=True)

    def setUp(self):
        cache.clear()  # throttle counters are stored in the cache
        self.mentor = User.objects.create_user(username='mentor_rec', password='x', role='MENTOR')
        program = Program.objects.create(name='Rec Program')
        sub = SubProgram.objects.create(program=program, name='Rec Sub')
        course = Course.objects.create(sub_program=sub, name='Rec Course')
        batch = Batch.objects.create(name='Rec Batch', course=course, start_date='2026-01-01',
                                     primary_mentor=self.mentor)
        student_user = User.objects.create_user(username='student_rec', password='x', role='STUDENT')
        self.student = Student.objects.create(
            user=student_user, crm_student_id='REC-001', first_name='Rec', last_name='Student',
            mobile='+919876543210', program_type=program, batch=batch,
            lead_status='CONVERTED', is_active=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.mentor)

    def _add_feedback(self, mcid, connected=True):
        payload = {
            'status': 'CALL_DONE' if connected else 'NO_ANSWER',
            'feedback': 'test',
            'mobile_call_id': mcid,
            'customer_number': '+919876543210',
            'call_direction': 'OUTGOING',
            'call_status': 'CONNECTED' if connected else 'MISSED',
            'call_duration': 42 if connected else 0,
        }
        return self.client.post(f'/api/students/{self.student.id}/add_feedback/', payload, format='json')

    def _upload(self, mcid, name='recording_1.m4a', content_type='audio/m4a', data=M4A_BYTES):
        f = SimpleUploadedFile(name, data, content_type=content_type)
        return self.client.post(
            f'/api/students/{self.student.id}/feedback-recording/',
            {'mobile_call_id': mcid, 'audio_recording': f},
            format='multipart',
        )

    def test_connected_feedback_with_m4a_upload_saves(self):
        res = self._add_feedback('mob_1_OUT_543210_abc')
        self.assertEqual(res.status_code, 201, res.data)

        res = self._upload('mob_1_OUT_543210_abc')
        self.assertEqual(res.status_code, 200, res.data)
        fb = StudentFeedback.objects.get(mobile_call_id='mob_1_OUT_543210_abc')
        self.assertTrue(fb.audio_recording)
        self.assertTrue(fb.audio_recording.name.endswith('.m4a'))
        self.assertTrue(res.data['audio_recording'])

        # Shows in the student history sheet and the Recent Calls tab
        history = self.client.get(f'/api/students/{self.student.id}/feedbacks/')
        self.assertTrue(history.data[0]['audio_recording'])
        recent = self.client.get('/api/students/recent_feedbacks/')
        rows = recent.data.get('results', recent.data) if isinstance(recent.data, dict) else recent.data
        self.assertTrue(any(r.get('recording_url') for r in rows))

    def test_unconnected_call_is_rejected(self):
        res = self._add_feedback('mob_2_OUT_543210_def', connected=False)
        self.assertEqual(res.status_code, 201, res.data)

        res = self._upload('mob_2_OUT_543210_def')
        self.assertEqual(res.status_code, 400)
        fb = StudentFeedback.objects.get(mobile_call_id='mob_2_OUT_543210_def')
        self.assertFalse(fb.audio_recording)

    def test_wrong_mobile_call_id_returns_404(self):
        self._add_feedback('mob_3_OUT_543210_ghi')
        res = self._upload('mob_does_not_exist')
        self.assertEqual(res.status_code, 404)
