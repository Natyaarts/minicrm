import os
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock

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
    """Mirrors the mobile mentor flow (dialpad.tsx handleMentorFeedbackSubmit):
    add_feedback (JSON) then feedback-recording (multipart, key audio_recording)."""

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

    def _payload(self, mcid, **overrides):
        # Exact shape the app sends for a connected 24s call
        payload = {
            'status': 'CALL_DONE',
            'feedback': 'Test test',
            'mobile_call_id': mcid,
            'customer_number': '+919876543210',
            'call_direction': 'OUTGOING',
            'call_status': 'CONNECTED',
            'call_duration': 24,
            'start_time': '2026-11-17T06:40:12.345Z',
            'end_time': '2026-11-17T06:40:36.789Z',
            'next_followup_date': '2026-11-20',
        }
        payload.update(overrides)
        return payload

    def _add_feedback(self, payload):
        return self.client.post(f'/api/students/{self.student.id}/add_feedback/', payload, format='json')

    def _upload(self, mcid, name='recording_1.m4a', content_type='audio/m4a', data=M4A_BYTES):
        f = SimpleUploadedFile(name, data, content_type=content_type)
        return self.client.post(
            f'/api/students/{self.student.id}/feedback-recording/',
            {'mobile_call_id': mcid, 'audio_recording': f},
            format='multipart',
        )

    # ── add_feedback ─────────────────────────────────────────────────────────
    def test_connected_call_payload_creates_feedback(self):
        # Exact payload from the failing report: empty notes, 22s, no follow-up date
        payload = self._payload('mob_1763359000000_OUT_543210_ab12cd', feedback='', call_duration=22,
                                end_time='2026-11-17T06:40:34.100Z')
        payload.pop('next_followup_date')
        res = self._add_feedback(payload)
        self.assertEqual(res.status_code, 201, res.data)
        fb = StudentFeedback.objects.get(mobile_call_id='mob_1763359000000_OUT_543210_ab12cd')
        self.assertEqual(fb.status, 'CALL_DONE')
        self.assertEqual(fb.call_status, 'CONNECTED')
        self.assertEqual(fb.call_duration, 22)
        self.assertIsNotNone(fb.start_time)
        self.assertIsNone(res.data['recording_url'])
        self.assertIsNone(res.data['audio_recording'])

    def test_same_mobile_call_id_twice_is_idempotent(self):
        first = self._add_feedback(self._payload('mob_dup'))
        second = self._add_feedback(self._payload('mob_dup'))
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data['id'], second.data['id'])
        self.assertEqual(StudentFeedback.objects.filter(mobile_call_id='mob_dup').count(), 1)

    def test_double_tap_race_returns_existing_row(self):
        """The idempotency lookup misses (the other request hadn't committed yet), then the insert
        hits the unique constraint because the other request's row now exists."""
        winner = StudentFeedback.objects.create(
            student=self.student, mentor=self.mentor, status='CALL_DONE', mobile_call_id='mob_race',
            call_status='CONNECTED', call_duration=24)
        real_filter = StudentFeedback.objects.filter
        calls = {'n': 0}

        def filter_missing_first_lookup(*args, **kwargs):
            calls['n'] += 1
            if calls['n'] == 1 and kwargs.get('mobile_call_id') == 'mob_race':
                return StudentFeedback.objects.none()
            return real_filter(*args, **kwargs)

        with mock.patch.object(StudentFeedback.objects, 'filter', side_effect=filter_missing_first_lookup):
            res = self._add_feedback(self._payload('mob_race'))
        self.assertEqual(res.data['id'], winner.id)
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(StudentFeedback.objects.filter(mobile_call_id='mob_race').count(), 1)
        self.assertEqual(res.data['id'], StudentFeedback.objects.get(mobile_call_id='mob_race').id)

    def test_unconnected_call_with_call_done_is_rejected(self):
        res = self._add_feedback(self._payload('mob_missed', call_status='MISSED', call_duration=0))
        self.assertEqual(res.status_code, 400)
        self.assertFalse(StudentFeedback.objects.filter(mobile_call_id='mob_missed').exists())

    def test_bad_datetime_returns_400_not_500(self):
        for bad in ({'start_time': 'not-a-date'}, {'end_time': '2026-13-45T99:99:99Z'},
                    {'next_followup_date': '20/11/2026'}):
            res = self._add_feedback(self._payload('mob_bad', **bad))
            self.assertEqual(res.status_code, 400, (bad, res.data))
        self.assertFalse(StudentFeedback.objects.filter(mobile_call_id='mob_bad').exists())

    # ── feedback-recording ───────────────────────────────────────────────────
    def test_recording_upload_returns_absolute_url_for_both_mime_types(self):
        for i, content_type in enumerate(('audio/mp4', 'audio/m4a')):
            mcid = f'mob_rec_{i}'
            self.assertEqual(self._add_feedback(self._payload(mcid)).status_code, 201)
            res = self._upload(mcid, name=f'recording_{i}.m4a', content_type=content_type)
            self.assertEqual(res.status_code, 200, (content_type, res.data))
            self.assertTrue(res.data['recording_url'].startswith('http://testserver/'), res.data)
            self.assertEqual(res.data['audio_recording'], res.data['recording_url'])
            self.assertTrue(StudentFeedback.objects.get(mobile_call_id=mcid).audio_recording.name.endswith('.m4a'))

    def test_recording_url_in_feedbacks_and_recent_feedbacks(self):
        self._add_feedback(self._payload('mob_list'))
        self.assertEqual(self._upload('mob_list').status_code, 200)

        history = self.client.get(f'/api/students/{self.student.id}/feedbacks/')
        self.assertEqual(history.status_code, 200)
        self.assertTrue(history.data[0]['recording_url'].startswith('http://testserver/'))

        recent = self.client.get('/api/students/recent_feedbacks/')
        self.assertEqual(recent.status_code, 200)
        rows = recent.data.get('results', recent.data) if isinstance(recent.data, dict) else recent.data
        row = next(r for r in rows if r['id'] == history.data[0]['id'])
        self.assertTrue(row['recording_url'].startswith('http://testserver/'))

    def test_recording_upload_on_missed_row_is_rejected(self):
        res = self._add_feedback(self._payload('mob_missed_rec', status='NO_ANSWER', call_status='MISSED',
                                               call_duration=0))
        self.assertEqual(res.status_code, 201, res.data)
        res = self._upload('mob_missed_rec')
        self.assertEqual(res.status_code, 400)
        self.assertFalse(StudentFeedback.objects.get(mobile_call_id='mob_missed_rec').audio_recording)

    def test_wrong_mobile_call_id_returns_404(self):
        self._add_feedback(self._payload('mob_real'))
        self.assertEqual(self._upload('mob_does_not_exist').status_code, 404)


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class FeedbackRecordingSilenceTests(TestCase):
    """feedback-recording rejects digitally silent files (ffmpeg volumedetect), skipping the check
    when ffmpeg isn't available or can't measure the file."""

    # Same fixtures/helpers as FeedbackRecordingTests without re-running its tests
    setUp = FeedbackRecordingTests.setUp
    _payload = FeedbackRecordingTests._payload
    _add_feedback = FeedbackRecordingTests._add_feedback
    _upload = FeedbackRecordingTests._upload

    def _ffmpeg_reports(self, stderr):
        completed = mock.Mock(returncode=0, stderr=stderr)
        return (mock.patch('core.audio_checks.shutil.which', return_value='/usr/bin/ffmpeg'),
                mock.patch('core.audio_checks.subprocess.run', return_value=completed))

    def _upload_with(self, mcid, stderr):
        self.assertEqual(self._add_feedback(self._payload(mcid)).status_code, 201)
        which_patch, run_patch = self._ffmpeg_reports(stderr)
        with which_patch, run_patch as run:
            res = self._upload(mcid)
        return res, run

    def test_silent_recording_rejected(self):
        res, run = self._upload_with('mob_silent', '[Parsed_volumedetect_0] mean_volume: -91.0 dB\n'
                                                   '[Parsed_volumedetect_0] max_volume: -91.0 dB\n')
        self.assertEqual(res.status_code, 400)
        self.assertIn('silent', res.data['error'].lower())
        self.assertIn('volumedetect', run.call_args.args[0])
        self.assertFalse(StudentFeedback.objects.get(mobile_call_id='mob_silent').audio_recording)

    def test_minus_inf_is_silent(self):
        res, _ = self._upload_with('mob_inf', '[Parsed_volumedetect_0] max_volume: -inf dB\n')
        self.assertEqual(res.status_code, 400)

    def test_audible_recording_saved(self):
        res, _ = self._upload_with('mob_loud', '[Parsed_volumedetect_0] max_volume: -12.4 dB\n')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(StudentFeedback.objects.get(mobile_call_id='mob_loud').audio_recording)

    def test_unmeasurable_or_no_ffmpeg_is_allowed(self):
        res, _ = self._upload_with('mob_unknown', 'Invalid data found when processing input\n')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(self._add_feedback(self._payload('mob_noff')).status_code, 201)
        with mock.patch('core.audio_checks.shutil.which', return_value=None):
            self.assertEqual(self._upload('mob_noff').status_code, 200)


@unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg not installed (installed on the server)')
@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class FeedbackRecordingRealAudioTests(TestCase):
    """End-to-end silence check with real m4a files generated by ffmpeg (no mocks)."""

    setUp = FeedbackRecordingTests.setUp
    _payload = FeedbackRecordingTests._payload
    _add_feedback = FeedbackRecordingTests._add_feedback
    _upload = FeedbackRecordingTests._upload

    @staticmethod
    def _make_m4a(lavfi_source):
        fd, path = tempfile.mkstemp(suffix='.m4a')
        os.close(fd)
        try:
            # AAC 44.1 kHz mono 96 kb/s, the same format as the app's fallback recordings
            subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', lavfi_source,
                            '-t', '3', '-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '96k', path],
                           check=True, timeout=60)
            with open(path, 'rb') as fh:
                return fh.read()
        finally:
            os.remove(path)

    def test_generated_silent_m4a_rejected(self):
        data = self._make_m4a('anullsrc=r=44100:cl=mono')
        self.assertEqual(self._add_feedback(self._payload('mob_real_silent')).status_code, 201)
        res = self._upload('mob_real_silent', content_type='audio/mp4', data=data)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['error'], 'Recording is silent')

    def test_generated_tone_m4a_saved(self):
        data = self._make_m4a('sine=frequency=440:sample_rate=44100')
        self.assertEqual(self._add_feedback(self._payload('mob_real_tone')).status_code, 201)
        res = self._upload('mob_real_tone', content_type='audio/mp4', data=data)
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(res.data['recording_url'])
