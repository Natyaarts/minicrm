import os
import struct
from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from core.models import Student, Program
from crm.models import LeadInteraction
from crm.utils import normalize_phone_for_matching, match_lead_by_phone

User = get_user_model()

def make_m4a_audio(duration_seconds: int) -> bytes:
    """Generates valid minimal M4A bytes containing mvhd atom with exact duration."""
    header = b'ftypM4A ....'
    mvhd = b'mvhd' + bytes([0, 0, 0, 0]) + bytes([0] * 8) + struct.pack('>II', 1000, duration_seconds * 1000)
    return header + mvhd


class CallLoggingIntegrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='sales_rep_1',
            password='password123',
            role='SALES',
            phone_number='+919876500001'
        )
        self.client.force_authenticate(user=self.user)
        
        self.program = Program.objects.create(name='Test Program')
        
        # User for student
        self.student_user = User.objects.create_user(
            username='student_1',
            password='password123',
            role='STUDENT'
        )
        
        # Existing active lead
        self.lead = Student.objects.create(
            user=self.student_user,
            crm_student_id='NATYA-0001',
            first_name='Ananya',
            last_name='Sharma',
            mobile='+919876543210',
            program_type=self.program,
            is_active=True,
            lead_status='NEW'
        )
        
        # Old lead created 90 days ago
        self.old_student_user = User.objects.create_user(
            username='student_old',
            password='password123',
            role='STUDENT'
        )
        self.old_lead = Student.objects.create(
            user=self.old_student_user,
            crm_student_id='NATYA-0002',
            first_name='Rohan',
            last_name='Verma',
            mobile='+919811122233',
            program_type=self.program,
            is_active=True,
            lead_status='FOLLOW_UP'
        )
        # Update created_at in past
        Student.objects.filter(id=self.old_lead.id).update(created_at=timezone.now() - timedelta(days=90))

    def test_01_incoming_call_for_existing_lead(self):
        """1. Incoming call for existing lead attaches to lead and is_matched=True"""
        response = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'INCOMING',
            'caller_number': '+919876543210',
            'customer_number': '+91 98765 43210',
            'call_status': 'CONNECTED',
            'call_duration': 120,
            'mobile_call_id': 'mob_inc_001'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.data
        self.assertEqual(data['student'], self.lead.id)
        self.assertEqual(data['is_matched'], True)
        self.assertEqual(data['call_direction'], 'INCOMING')
        self.assertEqual(data['call_status'], 'CONNECTED')
        self.assertEqual(data['call_duration'], 120)

    def test_02_incoming_call_for_unknown_number(self):
        """2. Incoming call for unknown number is saved with student=None, is_matched=False"""
        unknown_number = '9899988877'
        response = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'INCOMING',
            'caller_number': unknown_number,
            'customer_number': unknown_number,
            'call_status': 'CONNECTED',
            'call_duration': 45,
            'mobile_call_id': 'mob_inc_unk_001'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.data
        self.assertIsNone(data['student'])
        self.assertEqual(data['is_matched'], False)
        self.assertEqual(data['student_name'], unknown_number)
        self.assertEqual(data['student_phone'], unknown_number)
        self.assertEqual(data['call_direction'], 'INCOMING')
        
        # Verify in DB
        call_log = LeadInteraction.objects.get(mobile_call_id='mob_inc_unk_001')
        self.assertIsNone(call_log.student)
        self.assertEqual(call_log.customer_number, unknown_number)
        self.assertFalse(call_log.is_matched)

    def test_03_outgoing_call_for_existing_lead(self):
        """3. Outgoing call for existing lead attaches to lead"""
        response = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'receiver_number': '09876543210',
            'customer_number': '09876543210',
            'call_status': 'CONNECTED',
            'call_duration': 180,
            'mobile_call_id': 'mob_out_001'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.data
        self.assertEqual(data['student'], self.lead.id)
        self.assertEqual(data['is_matched'], True)
        self.assertEqual(data['call_direction'], 'OUTGOING')

    def test_04_outgoing_call_for_unknown_number(self):
        """4. Outgoing call for unknown number is stored without discarding"""
        unknown_number = '+919123456780'
        response = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'receiver_number': unknown_number,
            'customer_number': unknown_number,
            'call_status': 'CONNECTED',
            'call_duration': 65,
            'mobile_call_id': 'mob_out_unk_001'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.data
        self.assertIsNone(data['student'])
        self.assertEqual(data['is_matched'], False)
        self.assertEqual(data['call_duration'], 65)

    def test_05_old_lead_receiving_call(self):
        """5. Old lead (created months ago) receives a call and matches properly without date filtering"""
        response = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'INCOMING',
            'caller_number': '9811122233',
            'call_status': 'CONNECTED',
            'call_duration': 90,
            'mobile_call_id': 'mob_old_lead_001'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.data
        self.assertEqual(data['student'], self.old_lead.id)
        self.assertEqual(data['is_matched'], True)

    def test_06_call_not_belonging_to_today_leads(self):
        """6. Calls for leads created in previous weeks/months are all logged and matched"""
        # Call with 10-digit suffix matching old lead
        response = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'customer_number': '+91-98111-22233',
            'call_duration': 50,
            'mobile_call_id': 'mob_not_today_001'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['student'], self.old_lead.id)
        self.assertTrue(response.data['is_matched'])

    def test_07_incoming_recording_file_and_url(self):
        """7. Incoming recording is stored both via audio file upload and provider recording_url"""
        audio_content = b'RIFF....WAVEfmt ....data....'
        audio_file = SimpleUploadedFile("incoming_call.m4a", audio_content, content_type="audio/m4a")
        
        response = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'INCOMING',
            'caller_number': '+919876543210',
            'call_duration': 110,
            'audio_recording': audio_file,
            'mobile_call_id': 'mob_rec_inc_file'
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNotNone(response.data.get('audio_recording'))
        self.assertIsNotNone(response.data.get('recording_file_or_url'))
        
        # Test provider URL via webhook
        resp_webhook = self.client.post('/api/crm/telephony/webhook/', {
            'Direction': 'INBOUND',
            'From': '+919876543210',
            'To': '+919876500001',
            'CallDuration': '115',
            'CallStatus': 'completed',
            'RecordingUrl': 'https://telephony.provider.com/rec/incoming123.mp3',
            'CallSid': 'call_inc_sid_123'
        })
        self.assertEqual(resp_webhook.status_code, status.HTTP_201_CREATED)
        log = LeadInteraction.objects.get(provider_call_id='call_inc_sid_123')
        self.assertEqual(log.recording_url, 'https://telephony.provider.com/rec/incoming123.mp3')
        self.assertEqual(log.call_direction, 'INCOMING')
        self.assertEqual(log.student, self.lead)

    def test_08_outgoing_recording_file_and_url(self):
        """8. Outgoing recording is stored and accessible"""
        audio_content = b'RIFF....WAVEfmt ....data....'
        audio_file = SimpleUploadedFile("outgoing_call.mp3", audio_content, content_type="audio/mpeg")
        
        response = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'receiver_number': '9899911122',
            'call_duration': 80,
            'audio_recording': audio_file,
            'mobile_call_id': 'mob_rec_out_file'
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNotNone(response.data.get('audio_recording'))

    def test_09_missed_incoming_call(self):
        """9. Missed incoming call is saved with call_status='MISSED' and duration=0"""
        response = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'INCOMING',
            'caller_number': '9777766666',
            'call_status': 'MISSED',
            'call_duration': 0,
            'mobile_call_id': 'mob_missed_001'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['call_status'], 'MISSED')
        self.assertEqual(response.data['call_duration'], 0)
        self.assertEqual(response.data['call_direction'], 'INCOMING')

    def test_10_duplicate_webhook_retry_idempotency(self):
        """10. Duplicate mobile_call_id or provider_call_id updates record without creating duplicate logs"""
        initial_resp = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'customer_number': '+919876543210',
            'call_status': 'CONNECTED',
            'call_duration': 40,
            'mobile_call_id': 'mob_retry_test_123'
        })
        self.assertEqual(initial_resp.status_code, status.HTTP_201_CREATED)
        initial_id = initial_resp.data['id']
        
        # Second call with same mobile_call_id (e.g. offline sync retry with updated duration/recording)
        retry_resp = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'customer_number': '+919876543210',
            'call_status': 'CONNECTED',
            'call_duration': 65,
            'mobile_call_id': 'mob_retry_test_123'
        })
        self.assertEqual(retry_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(retry_resp.data['id'], initial_id)
        self.assertEqual(retry_resp.data['call_duration'], 65)
        
        # Verify count in DB is exactly 1
        count = LeadInteraction.objects.filter(mobile_call_id='mob_retry_test_123').count()
        self.assertEqual(count, 1)

    def test_11_phone_number_normalization(self):
        """11. Phone number normalization handles +91, 91, 0-prefix, spaces, hyphens, tel:"""
        test_cases = [
            ('+91 98765 43210', '+919876543210', '9876543210'),
            ('09876543210', '+919876543210', '9876543210'),
            ('919876543210', '+919876543210', '9876543210'),
            ('98765-43210', '+919876543210', '9876543210'),
            ('tel:+919876543210', '+919876543210', '9876543210'),
            ('p:9876543210', '+919876543210', '9876543210'),
        ]
        for raw, expected_canonical, expected_last10 in test_cases:
            norm = normalize_phone_for_matching(raw)
            self.assertEqual(norm['canonical'], expected_canonical, f"Failed canonical for {raw}")
            self.assertEqual(norm['last10'], expected_last10, f"Failed last10 for {raw}")
            
            # Verify matching
            matched_student, is_matched = match_lead_by_phone(raw)
            self.assertTrue(is_matched, f"Failed match for {raw}")
            self.assertEqual(matched_student.id, self.lead.id)

    def test_12_call_is_stored_even_when_crm_matching_fails(self):
        """12. Call is stored even when CRM matching fails, no recording exists, and student is null"""
        response = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'INCOMING',
            'caller_number': '8888888888',
            'customer_number': '8888888888',
            'call_status': 'CONNECTED',
            'call_duration': 30,
            'notes': 'Call from unknown number with no CRM lead',
            'mobile_call_id': 'mob_no_match_no_rec'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data['student'])
        self.assertFalse(response.data['is_matched'])
        self.assertEqual(response.data['customer_number'], '8888888888')
        self.assertIsNone(response.data['audio_recording'])
        
        # Verify in DB
        interaction = LeadInteraction.objects.get(mobile_call_id='mob_no_match_no_rec')
        self.assertIsNone(interaction.student)
        self.assertFalse(interaction.is_matched)
        self.assertEqual(interaction.call_duration, 30)

    def test_13_call_duration_consistency_and_report_calculation(self):
        """13. Authoritative call duration is preserved and computed consistently across interactions and BDE reports"""
        # 51-second incoming call
        response = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'INCOMING',
            'caller_number': '+919876543210',
            'customer_number': '+919876543210',
            'call_status': 'CONNECTED',
            'call_duration': 51,
            'notes': 'Incoming Call - Duration: 00:51\nNotes: Discussed admissions',
            'mobile_call_id': 'mob_dur_51s'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['call_duration'], 51)
        self.assertEqual(response.data['formatted_call_duration'], '51s')

        # Check BDE report calculation
        bde_report_resp = self.client.get(f'/api/crm/bde-report/{self.user.id}/')
        self.assertEqual(bde_report_resp.status_code, status.HTTP_200_OK)
        report_data = bde_report_resp.data
        self.assertGreaterEqual(report_data['metrics']['total_call_duration'], 51)
        
        # Verify specific timeline entry has duration 51
        timeline_entry = next((item for item in report_data['timeline'] if item['id'] == response.data['id']), None)
        self.assertIsNotNone(timeline_entry)
        self.assertEqual(timeline_entry['call_duration'], 51)

    def test_14_subsecond_connected_call_and_missed_call_handling(self):
        """14. Sub-second connected call is saved as CONNECTED with duration=0, while missed call is MISSED"""
        # Sub-second connected call (answered and immediately hung up)
        resp_subsecond = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'INCOMING',
            'caller_number': '+919876543210',
            'customer_number': '+919876543210',
            'call_status': 'CONNECTED',
            'call_duration': 0,
            'notes': 'Incoming Call from +919876543210 (CONNECTED, 00:00)',
            'mobile_call_id': 'mob_subsecond_001'
        })
        self.assertEqual(resp_subsecond.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp_subsecond.data['call_status'], 'CONNECTED')
        self.assertEqual(resp_subsecond.data['call_duration'], 0)

        # True missed call
        resp_missed = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'INCOMING',
            'caller_number': '+919876543210',
            'customer_number': '+919876543210',
            'call_status': 'MISSED',
            'call_duration': 0,
            'notes': 'Missed incoming call from +919876543210',
            'mobile_call_id': 'mob_true_missed_001'
        })
        self.assertEqual(resp_missed.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp_missed.data['call_status'], 'MISSED')
        self.assertEqual(resp_missed.data['call_duration'], 0)

    def test_15_incoming_recording_identity_and_cross_attachment_prevention(self):
        """15. Two incoming calls close together retain separate recording identities and independent call durations"""
        audio_file_1 = SimpleUploadedFile("incoming_record_9876543210_1726550000.m4a", b"audio_content_1", content_type="audio/m4a")
        resp_call_1 = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'INCOMING',
            'caller_number': '+919876543210',
            'customer_number': '+919876543210',
            'call_status': 'CONNECTED',
            'call_duration': 64,
            'mobile_call_id': 'mob_inc_ananya_64s',
            'audio_recording': audio_file_1
        }, format='multipart')
        self.assertEqual(resp_call_1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp_call_1.data['call_duration'], 64)
        self.assertEqual(resp_call_1.data['formatted_call_duration'], '1m 4s')
        self.assertTrue('incoming_record_9876543210' in resp_call_1.data['audio_recording'])

        # Second call to a different lead 30 seconds later
        audio_file_2 = SimpleUploadedFile("incoming_record_9811122233_1726550030.m4a", b"audio_content_2", content_type="audio/m4a")
        resp_call_2 = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'INCOMING',
            'caller_number': '+919811122233',
            'customer_number': '+919811122233',
            'call_status': 'CONNECTED',
            'call_duration': 5,
            'mobile_call_id': 'mob_inc_rohan_5s',
            'audio_recording': audio_file_2
        }, format='multipart')
        self.assertEqual(resp_call_2.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp_call_2.data['call_duration'], 5)
        self.assertEqual(resp_call_2.data['formatted_call_duration'], '5s')
        self.assertTrue('incoming_record_9811122233' in resp_call_2.data['audio_recording'])

        # Confirm neither call altered the other
        call_1_db = LeadInteraction.objects.get(mobile_call_id='mob_inc_ananya_64s')
        call_2_db = LeadInteraction.objects.get(mobile_call_id='mob_inc_rohan_5s')
        self.assertEqual(call_1_db.call_duration, 64)
        self.assertEqual(call_2_db.call_duration, 5)
        self.assertNotEqual(call_1_db.audio_recording.name, call_2_db.audio_recording.name)

    def test_16_audio_patch_updates_duration_when_recording_provided(self):
        """16. Attaching or patching an audio recording updates call_duration to match recording duration"""
        initial_resp = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'INCOMING',
            'caller_number': '+919876543210',
            'customer_number': '+919876543210',
            'call_status': 'CONNECTED',
            'call_duration': 0,
            'mobile_call_id': 'mob_sync_test_initial_0s'
        })
        self.assertEqual(initial_resp.status_code, status.HTTP_201_CREATED)
        interaction_id = initial_resp.data['id']
        self.assertEqual(initial_resp.data['call_duration'], 0)
        self.assertIsNone(initial_resp.data['audio_recording'])

        # SyncManager attaches audio later via PATCH with 7:45 (465s) recording
        sync_audio = SimpleUploadedFile("sync_record_7m45s.m4a", make_m4a_audio(465), content_type="audio/m4a")
        patch_resp = self.client.patch(f'/api/crm/interactions/{interaction_id}/', {
            'audio_recording': sync_audio
        }, format='multipart')
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(patch_resp.data['audio_recording'])
        self.assertEqual(patch_resp.data['call_duration'], 465)
        self.assertEqual(patch_resp.data['formatted_call_duration'], '7m 45s')

    def test_17_outgoing_recording_behaviour_remains_intact(self):
        """17. Outgoing call logging and recording attachment functions as expected"""
        outgoing_audio = SimpleUploadedFile("outgoing_record_9876543210_120s.m4a", make_m4a_audio(120), content_type="audio/m4a")
        resp_out = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'receiver_number': '+919876543210',
            'customer_number': '+919876543210',
            'call_status': 'CONNECTED',
            'call_duration': 0,
            'mobile_call_id': 'mob_outgoing_120s',
            'audio_recording': outgoing_audio
        }, format='multipart')
        self.assertEqual(resp_out.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp_out.data['call_direction'], 'OUTGOING')
        self.assertEqual(resp_out.data['call_duration'], 120)
        self.assertEqual(resp_out.data['formatted_call_duration'], '2m 0s')
        self.assertIsNotNone(resp_out.data['audio_recording'])

    def test_18_connected_call_with_7m45s_recording_duration_matches(self):
        """18. Connected call with a 7:45 recording has call duration set to 7:45 (465s)"""
        audio_7m45s = SimpleUploadedFile("recording_7m45s.m4a", make_m4a_audio(465), content_type="audio/m4a")
        response = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'INCOMING',
            'caller_number': '+919876543210',
            'customer_number': '+919876543210',
            'call_status': 'CONNECTED',
            'call_duration': 0,
            'audio_recording': audio_7m45s,
            'mobile_call_id': 'mob_call_7m45s'
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['call_duration'], 465)
        self.assertEqual(response.data['formatted_call_duration'], '7m 45s')
        self.assertIsNotNone(response.data['audio_recording'])

        # Verify DB
        db_interaction = LeadInteraction.objects.get(mobile_call_id='mob_call_7m45s')
        self.assertEqual(db_interaction.call_duration, 465)
        self.assertTrue(bool(db_interaction.audio_recording))

    def test_19_connected_call_with_0m13s_recording_duration_matches(self):
        """19. Connected call with a 0:13 recording has call duration set to 0:13 (13s)"""
        audio_13s = SimpleUploadedFile("recording_0m13s.m4a", make_m4a_audio(13), content_type="audio/m4a")
        response = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'receiver_number': '+919876543210',
            'customer_number': '+919876543210',
            'call_status': 'CONNECTED',
            'call_duration': 0,
            'audio_recording': audio_13s,
            'mobile_call_id': 'mob_call_13s'
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['call_duration'], 13)
        self.assertEqual(response.data['formatted_call_duration'], '13s')
        self.assertIsNotNone(response.data['audio_recording'])

        # Verify DB
        db_interaction = LeadInteraction.objects.get(mobile_call_id='mob_call_13s')
        self.assertEqual(db_interaction.call_duration, 13)
        self.assertTrue(bool(db_interaction.audio_recording))

    def test_20_missed_call_does_not_attach_recording_and_duration_is_zero(self):
        """20. Missed / unconnected calls do not attach recording and duration remains 0"""
        audio_missed = SimpleUploadedFile("recording_missed.m4a", make_m4a_audio(465), content_type="audio/m4a")
        response = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'INCOMING',
            'caller_number': '+919876543210',
            'customer_number': '+919876543210',
            'call_status': 'MISSED',
            'call_duration': 465,
            'audio_recording': audio_missed,
            'recording_url': 'https://telephony.provider.com/rec/missed.mp3',
            'mobile_call_id': 'mob_missed_with_rec'
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['call_status'], 'MISSED')
        self.assertEqual(response.data['call_duration'], 0)
        self.assertEqual(response.data['formatted_call_duration'], '0s')
        self.assertIsNone(response.data.get('audio_recording'))
        self.assertIsNone(response.data.get('recording_file_or_url'))

        # Verify DB
        db_interaction = LeadInteraction.objects.get(mobile_call_id='mob_missed_with_rec')
        self.assertEqual(db_interaction.call_duration, 0)
        self.assertFalse(bool(db_interaction.audio_recording))
        self.assertIsNone(db_interaction.recording_url)

    def test_21_connected_call_without_recording_keeps_existing_duration(self):
        """21. Connected call without recording keeps existing call duration logic"""
        response = self.client.post('/api/crm/interactions/', {
            'interaction_type': 'CALL',
            'call_direction': 'OUTGOING',
            'receiver_number': '+919876543210',
            'customer_number': '+919876543210',
            'call_status': 'CONNECTED',
            'call_duration': 185,
            'mobile_call_id': 'mob_no_rec_185s'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['call_duration'], 185)
        self.assertEqual(response.data['formatted_call_duration'], '3m 5s')
        self.assertIsNone(response.data.get('audio_recording'))
