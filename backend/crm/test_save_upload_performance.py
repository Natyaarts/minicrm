import os
import struct
from unittest.mock import patch
from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from core.models import Student, Program
from crm.models import LeadInteraction
from crm import utils as crm_utils

User = get_user_model()

def make_m4a_audio(duration_seconds: int) -> bytes:
    """Generates valid minimal M4A bytes containing mvhd atom with exact duration."""
    header = b'ftypM4A ....'
    mvhd = b'mvhd' + bytes([0, 0, 0, 0]) + bytes([0] * 8) + struct.pack('>II', 1000, duration_seconds * 1000)
    return header + mvhd


class SaveAndUploadPerformanceTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='bde_sales_1',
            password='password123',
            role='SALES',
            phone_number='+919876500001'
        )
        self.client.force_authenticate(user=self.user)

        self.program = Program.objects.create(name='Dance Program')
        self.student_user = User.objects.create_user(
            username='student_test_1',
            password='password123',
            role='STUDENT'
        )
        self.lead = Student.objects.create(
            user=self.student_user,
            crm_student_id='NATYA-TEST-001',
            first_name='Kavya',
            last_name='Nair',
            mobile='+919876543210',
            program_type=self.program,
            is_active=True,
            lead_status='NEW'
        )

    def test_01_metadata_creation_without_audio(self):
        """1. Metadata creation without audio creates interaction promptly (<200ms) with correct status."""
        response = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'receiver_number': '+919876543210',
            'customer_number': '+919876543210',
            'call_status': 'CONNECTED',
            'call_duration': 95,
            'mobile_call_id': 'mob_perf_meta_001',
            'student': self.lead.id,
            'notes': 'Spoke with Kavya regarding Kathak enrollment.'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.data
        self.assertIsNotNone(data.get('id'))
        self.assertEqual(data['mobile_call_id'], 'mob_perf_meta_001')
        self.assertEqual(data['call_status'], 'CONNECTED')
        self.assertEqual(data['call_duration'], 95)
        self.assertEqual(data['student'], self.lead.id)
        self.assertIsNone(data.get('audio_recording'))

        # Verify DB
        db_rec = LeadInteraction.objects.get(mobile_call_id='mob_perf_meta_001')
        self.assertEqual(db_rec.call_status, 'CONNECTED')
        self.assertEqual(db_rec.call_duration, 95)
        self.assertFalse(bool(db_rec.audio_recording))
        self.assertIsNone(db_rec.audio_file_hash)

    def test_02_successful_background_recording_attachment(self):
        """2. Background PATCH attaches audio recording to existing interaction without recreating call log."""
        # Step 1: Save metadata
        resp_meta = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'receiver_number': '+919876543210',
            'customer_number': '+919876543210',
            'call_status': 'CONNECTED',
            'call_duration': 60,
            'mobile_call_id': 'mob_perf_patch_002',
            'student': self.lead.id,
            'notes': 'Outbound call metadata saved first.'
        })
        self.assertEqual(resp_meta.status_code, status.HTTP_201_CREATED)
        interaction_id = resp_meta.data['id']

        # Step 2: Background upload via PATCH
        audio_file = SimpleUploadedFile("rec_60s.m4a", make_m4a_audio(60), content_type="audio/m4a")
        resp_patch = self.client.patch(f'/api/crm/interactions/{interaction_id}/', {
            'audio_recording': audio_file
        }, format='multipart')
        self.assertEqual(resp_patch.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(resp_patch.data.get('audio_recording'))

        # Verify DB
        db_rec = LeadInteraction.objects.get(id=interaction_id)
        self.assertTrue(bool(db_rec.audio_recording))
        self.assertIsNotNone(db_rec.audio_file_hash)
        self.assertEqual(db_rec.call_duration, 60)
        # Total interactions remains 1
        self.assertEqual(LeadInteraction.objects.filter(mobile_call_id='mob_perf_patch_002').count(), 1)

    def test_03_duplicate_audio_rejection(self):
        """3. Duplicate audio binary uploaded for different call is rejected without corrupting either call."""
        audio_binary = make_m4a_audio(75)

        # Call A
        audio_a = SimpleUploadedFile("rec_call_a.m4a", audio_binary, content_type="audio/m4a")
        resp_a = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'receiver_number': '+919876543210',
            'customer_number': '+919876543210',
            'call_status': 'CONNECTED',
            'call_duration': 75,
            'mobile_call_id': 'mob_dup_call_a',
            'audio_recording': audio_a
        }, format='multipart')
        self.assertEqual(resp_a.status_code, status.HTTP_201_CREATED)
        self.assertIsNotNone(resp_a.data.get('audio_recording'))
        call_a_id = resp_a.data['id']

        # Call B (different customer/call ID tries to upload same binary payload)
        audio_b = SimpleUploadedFile("rec_call_b.m4a", audio_binary, content_type="audio/m4a")
        resp_b = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'receiver_number': '+919811122233',
            'customer_number': '+919811122233',
            'call_status': 'CONNECTED',
            'call_duration': 30,
            'mobile_call_id': 'mob_dup_call_b',
            'audio_recording': audio_b
        }, format='multipart')
        self.assertEqual(resp_b.status_code, status.HTTP_201_CREATED)
        # Audio must be rejected from Call B
        self.assertIsNone(resp_b.data.get('audio_recording'))
        self.assertEqual(resp_b.data['call_duration'], 30)

        # Verify DB
        rec_a = LeadInteraction.objects.get(id=call_a_id)
        rec_b = LeadInteraction.objects.get(id=resp_b.data['id'])
        self.assertTrue(bool(rec_a.audio_recording))
        self.assertFalse(bool(rec_b.audio_recording))
        self.assertIsNone(rec_b.audio_file_hash)

    def test_04_hash_calculation_not_repeated_unnecessarily(self):
        """4. Hash calculation is performed exactly once during upload, and not repeated on note/field updates."""
        audio_file = SimpleUploadedFile("rec_hash_test.m4a", make_m4a_audio(50), content_type="audio/m4a")

        original_compute = crm_utils.compute_audio_hash
        call_count = {'count': 0}

        def counting_compute(file_obj):
            call_count['count'] += 1
            return original_compute(file_obj)

        with patch('crm.utils.compute_audio_hash', side_effect=counting_compute):
            # 1. Create with audio: compute_audio_hash must run exactly ONCE
            resp = self.client.post('/api/crm/interactions/', {
                'interaction_type': 'CALL',
                'call_direction': 'OUTGOING',
                'receiver_number': '+919876543210',
                'customer_number': '+919876543210',
                'call_status': 'CONNECTED',
                'call_duration': 50,
                'mobile_call_id': 'mob_hash_once_001',
                'audio_recording': audio_file
            }, format='multipart')
            self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
            interaction_id = resp.data['id']
            self.assertEqual(call_count['count'], 1)

            # 2. Update notes via PATCH: compute_audio_hash must NOT run again
            patch_resp = self.client.patch(f'/api/crm/interactions/{interaction_id}/', {
                'notes': 'Updated follow-up notes without changing audio.'
            })
            self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)
            self.assertEqual(call_count['count'], 1) # Still 1! Not re-hashed!

    def test_05_retry_after_upload_failure(self):
        """5. Retrying a background recording upload via PATCH updates existing record without duplicates."""
        # Initial metadata save
        resp_meta = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'receiver_number': '+919876543210',
            'customer_number': '+919876543210',
            'call_status': 'CONNECTED',
            'call_duration': 40,
            'mobile_call_id': 'mob_retry_001'
        })
        self.assertEqual(resp_meta.status_code, status.HTTP_201_CREATED)
        interaction_id = resp_meta.data['id']

        # Retry attempt: upload recording
        audio_file = SimpleUploadedFile("rec_retry.m4a", make_m4a_audio(40), content_type="audio/m4a")
        resp_patch = self.client.patch(f'/api/crm/interactions/{interaction_id}/', {
            'audio_recording': audio_file
        }, format='multipart')
        self.assertEqual(resp_patch.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(resp_patch.data.get('audio_recording'))

        # Total interactions count must still be exactly 1
        self.assertEqual(LeadInteraction.objects.filter(mobile_call_id='mob_retry_001').count(), 1)

    def test_06_offline_queue_persistence_and_idempotency(self):
        """6. Replaying an offline queue call with same mobile_call_id performs idempotent update."""
        payload = {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'receiver_number': '+919876543210',
            'customer_number': '+919876543210',
            'call_status': 'CONNECTED',
            'call_duration': 80,
            'mobile_call_id': 'mob_offline_sync_001',
            'notes': 'Offline queued call first attempt'
        }
        res1 = self.client.post('/api/crm/interactions/', payload)
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        first_id = res1.data['id']

        # Second attempt (replay due to network retry)
        payload['notes'] = 'Offline queued call second attempt'
        res2 = self.client.post('/api/crm/interactions/', payload)
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data['id'], first_id)
        self.assertEqual(LeadInteraction.objects.filter(mobile_call_id='mob_offline_sync_001').count(), 1)

    def test_07_two_consecutive_calls_separate_recordings(self):
        """7. Two consecutive calls with separate recordings maintain distinct interactions and audio files."""
        # Call 1
        audio_1 = SimpleUploadedFile("rec_call_1.m4a", make_m4a_audio(35), content_type="audio/m4a")
        res1 = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'receiver_number': '+919876543210',
            'customer_number': '+919876543210',
            'call_status': 'CONNECTED',
            'call_duration': 35,
            'mobile_call_id': 'mob_consecutive_001',
            'audio_recording': audio_1
        }, format='multipart')
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        # Call 2
        audio_2 = SimpleUploadedFile("rec_call_2.m4a", make_m4a_audio(55), content_type="audio/m4a")
        res2 = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'receiver_number': '+919811122233',
            'customer_number': '+919811122233',
            'call_status': 'CONNECTED',
            'call_duration': 55,
            'mobile_call_id': 'mob_consecutive_002',
            'audio_recording': audio_2
        }, format='multipart')
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)

        # Assert independence
        self.assertNotEqual(res1.data['id'], res2.data['id'])
        db_1 = LeadInteraction.objects.get(id=res1.data['id'])
        db_2 = LeadInteraction.objects.get(id=res2.data['id'])
        self.assertTrue(bool(db_1.audio_recording))
        self.assertTrue(bool(db_2.audio_recording))
        self.assertNotEqual(db_1.audio_file_hash, db_2.audio_file_hash)
        self.assertEqual(db_1.call_duration, 35)
        self.assertEqual(db_2.call_duration, 55)

    def test_08_inbound_and_outbound_call_flows(self):
        """8. Both inbound and outbound calls properly save metadata and attach background recordings."""
        # Outbound flow
        out_audio = SimpleUploadedFile("rec_out.m4a", make_m4a_audio(42), content_type="audio/m4a")
        out_res = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'receiver_number': '+919876543210',
            'customer_number': '+919876543210',
            'call_status': 'CONNECTED',
            'call_duration': 42,
            'mobile_call_id': 'mob_flow_out_001'
        })
        self.assertEqual(out_res.status_code, status.HTTP_201_CREATED)
        patch_out = self.client.patch(f"/api/crm/interactions/{out_res.data['id']}/", {
            'audio_recording': out_audio
        }, format='multipart')
        self.assertEqual(patch_out.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_out.data['call_direction'], 'OUTGOING')

        # Inbound flow
        inc_audio = SimpleUploadedFile("rec_inc.m4a", make_m4a_audio(63), content_type="audio/m4a")
        inc_res = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'INCOMING',
            'caller_number': '+919876543210',
            'customer_number': '+919876543210',
            'call_status': 'CONNECTED',
            'call_duration': 63,
            'mobile_call_id': 'mob_flow_inc_001'
        })
        self.assertEqual(inc_res.status_code, status.HTTP_201_CREATED)
        patch_inc = self.client.patch(f"/api/crm/interactions/{inc_res.data['id']}/", {
            'audio_recording': inc_audio
        }, format='multipart')
        self.assertEqual(patch_inc.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_inc.data['call_direction'], 'INCOMING')

    def test_09_existing_auth_and_session_behavior(self):
        """9. Unauthenticated requests are rejected with 401; authenticated reps can create calls."""
        anon_client = APIClient()
        unauth_resp = anon_client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'customer_number': '+919876543210',
            'call_duration': 30
        })
        self.assertEqual(unauth_resp.status_code, status.HTTP_401_UNAUTHORIZED)

        # Authenticated rep succeeds
        auth_resp = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'customer_number': '+919876543210',
            'call_duration': 30,
            'mobile_call_id': 'mob_auth_test_001'
        })
        self.assertEqual(auth_resp.status_code, status.HTTP_201_CREATED)

    def test_10_metadata_only_update_preserves_existing_audio_and_duration(self):
        """10. Updating notes or pipeline status preserves existing audio file, hash, and duration without re-hashing."""
        audio_file = SimpleUploadedFile("rec_preserve.m4a", make_m4a_audio(85), content_type="audio/m4a")
        resp = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'customer_number': '+919876543210',
            'call_status': 'CONNECTED',
            'call_duration': 85,
            'mobile_call_id': 'mob_preserve_audio_001',
            'audio_recording': audio_file
        }, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        interaction_id = resp.data['id']
        orig_audio = resp.data['audio_recording']
        orig_hash = LeadInteraction.objects.get(id=interaction_id).audio_file_hash
        self.assertIsNotNone(orig_audio)
        self.assertIsNotNone(orig_hash)

        # Metadata-only patch update
        patch_res = self.client.patch(f"/api/crm/interactions/{interaction_id}/", {
            'notes': 'Added new follow-up note after call review.',
            'pipeline_status': 'FOLLOW_UP'
        })
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data['audio_recording'], orig_audio)
        self.assertEqual(patch_res.data['call_duration'], 85)
        self.assertEqual(patch_res.data['notes'], 'Added new follow-up note after call review.')

        # Verify DB integrity
        db_rec = LeadInteraction.objects.get(id=interaction_id)
        self.assertEqual(db_rec.audio_file_hash, orig_hash)
        self.assertEqual(db_rec.call_duration, 85)
        self.assertTrue(bool(db_rec.audio_recording))

    def test_11_corrupted_or_zero_byte_audio_rejected(self):
        """11. A 0-byte or corrupted audio upload is safely rejected and does not corrupt interaction."""
        empty_file = SimpleUploadedFile("empty.m4a", b"", content_type="audio/m4a")
        resp = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'customer_number': '+919876543210',
            'call_status': 'CONNECTED',
            'call_duration': 40,
            'mobile_call_id': 'mob_empty_audio_001',
            'audio_recording': empty_file
        }, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(resp.data.get('audio_recording'))
        db_rec = LeadInteraction.objects.get(id=resp.data['id'])
        self.assertFalse(bool(db_rec.audio_recording))
        self.assertIsNone(db_rec.audio_file_hash)
        self.assertEqual(db_rec.call_duration, 40)

    def test_12_consecutive_recordings_strict_association(self):
        """12. Consecutive calls under rapid succession bind recordings strictly to their own interaction ID."""
        audio_a = SimpleUploadedFile("rec_fast_a.m4a", make_m4a_audio(25), content_type="audio/m4a")
        audio_b = SimpleUploadedFile("rec_fast_b.m4a", make_m4a_audio(45), content_type="audio/m4a")

        # Call A created
        res_a = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'customer_number': '+919876543210',
            'call_status': 'CONNECTED',
            'call_duration': 25,
            'mobile_call_id': 'mob_rapid_a'
        })
        id_a = res_a.data['id']

        # Call B created immediately after
        res_b = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'customer_number': '+919811122233',
            'call_status': 'CONNECTED',
            'call_duration': 45,
            'mobile_call_id': 'mob_rapid_b'
        })
        id_b = res_b.data['id']

        # Background attachments
        patch_b = self.client.patch(f"/api/crm/interactions/{id_b}/", {'audio_recording': audio_b}, format='multipart')
        patch_a = self.client.patch(f"/api/crm/interactions/{id_a}/", {'audio_recording': audio_a}, format='multipart')

        self.assertEqual(patch_a.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_b.status_code, status.HTTP_200_OK)

        rec_a = LeadInteraction.objects.get(id=id_a)
        rec_b = LeadInteraction.objects.get(id=id_b)
        self.assertEqual(rec_a.call_duration, 25)
        self.assertEqual(rec_b.call_duration, 45)
        self.assertNotEqual(rec_a.audio_file_hash, rec_b.audio_file_hash)
        self.assertEqual(rec_a.mobile_call_id, 'mob_rapid_a')
        self.assertEqual(rec_b.mobile_call_id, 'mob_rapid_b')

    def test_13_failed_update_preserves_valid_recording(self):
        """13. A failed request or server error does not delete or corrupt an existing valid audio recording."""
        audio = SimpleUploadedFile("rec_keep.m4a", make_m4a_audio(60), content_type="audio/m4a")
        res = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'customer_number': '+919876543210',
            'call_status': 'CONNECTED',
            'call_duration': 60,
            'mobile_call_id': 'mob_preserve_valid'
        })
        interaction_id = res.data['id']

        # Attach valid audio
        patch_res = self.client.patch(f"/api/crm/interactions/{interaction_id}/", {'audio_recording': audio}, format='multipart')
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)

        original_rec = LeadInteraction.objects.get(id=interaction_id)
        original_hash = original_rec.audio_file_hash
        self.assertTrue(bool(original_rec.audio_recording))

        # Attempt an invalid update (e.g. invalid date parse or unauthenticated)
        unauth_client = APIClient()
        fail_res = unauth_client.patch(f"/api/crm/interactions/{interaction_id}/", {'notes': 'Hacker notes'})
        self.assertEqual(fail_res.status_code, status.HTTP_401_UNAUTHORIZED)

        # Confirm the audio recording and hash are completely intact
        after_rec = LeadInteraction.objects.get(id=interaction_id)
        self.assertEqual(after_rec.audio_file_hash, original_hash)
        self.assertTrue(bool(after_rec.audio_recording))
        self.assertEqual(after_rec.call_duration, 60)

    def test_14_updating_with_empty_audio_does_not_leave_misleading_hash(self):
        """14. Uploading a zero-byte or corrupt file never populates an audio_file_hash."""
        empty_audio = SimpleUploadedFile("zero.m4a", b"", content_type="audio/m4a")
        res = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'customer_number': '+919876543210',
            'call_status': 'CONNECTED',
            'call_duration': 30,
            'mobile_call_id': 'mob_zero_hash_test',
            'audio_recording': empty_audio
        }, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        interaction = LeadInteraction.objects.get(id=res.data['id'])
        self.assertIsNone(interaction.audio_file_hash)
        self.assertFalse(bool(interaction.audio_recording))


