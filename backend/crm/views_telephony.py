from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from django.db import transaction
from .models import LeadInteraction
from .serializers import LeadInteractionSerializer
from .utils import match_lead_by_phone, match_agent_by_phone, normalize_phone_for_matching
import logging

logger = logging.getLogger(__name__)

class TelephonyWebhookView(APIView):
    """
    General / Provider Webhook Endpoint for Telephony Integrations (Exotel, Tata Tele, Twilio, MCube, etc.).
    Guarantees that EVERY incoming and outgoing call is saved, with optional recording and lead matching.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        payload = request.data
        if not payload and request.query_params:
            payload = request.query_params.dict()

        logger.info(f"[TelephonyWebhook] Incoming payload: {payload}")

        # Extract identifiers
        provider_call_id = payload.get('CallSid') or payload.get('call_id') or payload.get('id') or payload.get('provider_call_id') or payload.get('ConversationId') or payload.get('call_uuid')
        provider_event_id = payload.get('event_id') or payload.get('event_uuid') or payload.get('CallEventId')
        mobile_call_id = payload.get('mobile_call_id')

        # Idempotency check: if call already logged, update missing details (e.g. recording or duration)
        existing = None
        if provider_call_id:
            existing = LeadInteraction.objects.filter(provider_call_id=provider_call_id).first()
        elif mobile_call_id:
            existing = LeadInteraction.objects.filter(mobile_call_id=mobile_call_id).first()

        # Extract phone numbers
        caller_number = payload.get('From') or payload.get('caller') or payload.get('caller_number') or payload.get('src') or ''
        receiver_number = payload.get('To') or payload.get('receiver') or payload.get('receiver_number') or payload.get('destination') or payload.get('dest') or payload.get('agent_number') or ''
        customer_number = payload.get('customer_number') or payload.get('customer_phone') or payload.get('client_phone') or ''

        # Extract direction
        raw_direction = (payload.get('Direction') or payload.get('direction') or payload.get('call_type') or payload.get('type') or 'OUTGOING').upper()
        if 'IN' in raw_direction:
            call_direction = 'INCOMING'
        else:
            call_direction = 'OUTGOING'

        # Infer customer number if not explicitly specified
        if not customer_number:
            if call_direction == 'INCOMING':
                customer_number = caller_number or receiver_number
            else:
                customer_number = receiver_number or caller_number

        # Extract status
        raw_status = (payload.get('DialCallStatus') or payload.get('CallStatus') or payload.get('status') or payload.get('call_status') or 'CONNECTED').upper()
        if any(s in raw_status for s in ['COMPLETE', 'ANSWER', 'CONNECTED', 'SUCCESS']):
            call_status = 'CONNECTED'
        elif any(s in raw_status for s in ['NO-ANSWER', 'NOANSWER', 'UNANSWERED', 'NOT_ANSWERED']):
            call_status = 'UNANSWERED'
        elif any(s in raw_status for s in ['MISSED']):
            call_status = 'MISSED'
        elif any(s in raw_status for s in ['REJECT', 'CANCEL', 'DECLINED']):
            call_status = 'REJECTED'
        elif any(s in raw_status for s in ['BUSY']):
            call_status = 'BUSY'
        elif any(s in raw_status for s in ['FAIL']):
            call_status = 'FAILED'
        else:
            call_status = raw_status if raw_status in ['CONNECTED', 'MISSED', 'REJECTED', 'UNANSWERED', 'BUSY', 'FAILED'] else 'CONNECTED'

        # Extract duration
        raw_duration = payload.get('DialCallDuration') or payload.get('CallDuration') or payload.get('duration') or payload.get('call_duration') or payload.get('billsec') or 0
        try:
            duration_sec = int(raw_duration)
        except (ValueError, TypeError):
            duration_sec = 0

        # If call duration is > 0, ensure status is CONNECTED
        if duration_sec > 0 and call_status in ['MISSED', 'UNANSWERED']:
            call_status = 'CONNECTED'

        # Extract recording
        recording_url = payload.get('RecordingUrl') or payload.get('recording_url') or payload.get('audio_url') or payload.get('record_url') or ''
        telephony_provider = payload.get('provider') or payload.get('telephony_provider') or 'TELEPHONY_WEBHOOK'

        is_unconnected = call_status in ['MISSED', 'REJECTED', 'UNANSWERED', 'FAILED']
        if is_unconnected:
            duration_sec = 0
            recording_url = ''

        # If existing interaction found, update it (idempotency)
        if existing:
            if call_status:
                existing.call_status = call_status
            if is_unconnected:
                existing.call_duration = 0
                existing.recording_url = None
                if existing.audio_recording:
                    try:
                        existing.audio_recording.delete(save=False)
                    except Exception:
                        pass
                    existing.audio_recording = None
            else:
                if recording_url and not existing.recording_url:
                    existing.recording_url = recording_url
                if duration_sec > 0 and existing.call_duration == 0:
                    existing.call_duration = duration_sec
            existing.save()
            return Response({"status": "updated", "id": existing.id}, status=status.HTTP_200_OK)

        # Step 1: Match CRM Student/Lead (SECONDARY enrichment)
        student, is_matched = match_lead_by_phone(customer_number)

        # Match Agent / Author by phone if possible
        author = None
        agent_number = receiver_number if call_direction == 'INCOMING' else caller_number
        if agent_number:
            author = match_agent_by_phone(agent_number)

        # Step 2: Save the call FIRST
        interaction = LeadInteraction.objects.create(
            student=student,
            author=author,
            interaction_type='CALL',
            mobile_call_id=mobile_call_id,
            customer_number=customer_number,
            caller_number=caller_number,
            receiver_number=receiver_number,
            call_direction=call_direction,
            call_status=call_status,
            call_duration=duration_sec,
            recording_url=recording_url,
            provider_call_id=provider_call_id,
            provider_event_id=provider_event_id,
            telephony_provider=telephony_provider,
            is_matched=is_matched,
            notes=f"Telephony Call Log ({call_direction}): {call_status} - Duration: {duration_sec}s"
        )

        return Response({
            "status": "created",
            "id": interaction.id,
            "is_matched": is_matched,
            "student_id": student.id if student else None
        }, status=status.HTTP_201_CREATED)
