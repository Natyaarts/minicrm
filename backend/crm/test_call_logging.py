import os
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
