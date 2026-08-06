"""
Meta Facebook Lead Ads webhook receiver and Lead Quality Conversions API feedback.
"""
import json
import hashlib
import hmac
import logging
import requests
import time
from django.conf import settings
from django.http import HttpResponse
from django.utils.crypto import get_random_string
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from core.models import Student, Program


logger = logging.getLogger(__name__)


def _hash_data(value: str):
    if not value:
        return None
    return hashlib.sha256(value.strip().lower().encode()).hexdigest()


def _send_meta_conversions_event(campaign, student, event_name: str):
    pixel_id = campaign.meta_pixel_id
    access_token = campaign.meta_access_token

    if not pixel_id or not access_token:
        logger.warning(f"Campaign {campaign.id} has no Meta pixel/token configured. Skipping CAPI event.")
        return False

    url = f"https://graph.facebook.com/v20.0/{pixel_id}/events"

    user_data = {}
    if student.mobile:
        user_data["ph"] = [_hash_data(student.mobile.replace("+", "").replace(" ", "").replace("-", ""))]
    if student.email:
        user_data["em"] = [_hash_data(student.email)]
    if student.first_name:
        user_data["fn"] = [_hash_data(student.first_name)]
    if student.last_name:
        user_data["ln"] = [_hash_data(student.last_name)]

    custom_data = {}
    if student.meta_lead_id:
        custom_data["lead_id"] = student.meta_lead_id

    event_data = {
        "data": [
            {
                "event_name": event_name,
                "event_time": int(time.time()),
                "action_source": "crm",
                "user_data": user_data,
                "custom_data": custom_data,
            }
        ],
        "access_token": access_token,
    }

    try:
        resp = requests.post(url, json=event_data, timeout=10)
        resp.raise_for_status()
        logger.info(f"Meta CAPI event '{event_name}' sent for student {student.id}. Response: {resp.json()}")
        return True
    except Exception as e:
        logger.error(f"Failed to send Meta CAPI event for student {student.id}: {e}")
        return False


class MetaLeadWebhookView(APIView):
    """
    Handles Meta Facebook Lead Ads webhook.
    GET  -> Verification challenge from Meta (required for webhook setup)
    POST -> New lead notification from Meta
    Setup URL in Meta App Dashboard: https://natyaarts.org/crm/meta/webhook/
    Verify Token: META_WEBHOOK_VERIFY_TOKEN in Django settings
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        """Meta webhook verification handshake."""
        mode = request.query_params.get("hub.mode")
        token = request.query_params.get("hub.verify_token")
        challenge = request.query_params.get("hub.challenge")
        verify_token = getattr(settings, "META_WEBHOOK_VERIFY_TOKEN", "natyaarts_meta_webhook_2024")

        if mode == "subscribe" and token == verify_token:
            logger.info("Meta webhook verified successfully.")
            return HttpResponse(challenge, content_type="text/plain")

        logger.warning(f"Meta webhook verification failed. mode={mode}, token={token}")
        return HttpResponse("Verification failed", status=403)

    def post(self, request):
        """Receive a new lead from Meta Facebook Lead Ads."""
        try:
            body = request.body
            payload = request.data

            # Validate signature if app secret is configured
            app_secret = getattr(settings, "META_APP_SECRET", None)
            if app_secret:
                sig_header = request.META.get("HTTP_X_HUB_SIGNATURE_256", "")
                expected_sig = "sha256=" + hmac.new(
                    app_secret.encode(), body, hashlib.sha256
                ).hexdigest()
                if not hmac.compare_digest(sig_header, expected_sig):
                    return Response({"error": "Invalid signature"}, status=403)

            object_type = payload.get("object")
            if object_type not in ("page", "instagram"):
                return Response({"status": "ignored"})

            entries = payload.get("entry", [])
            leads_created = 0

            for entry in entries:
                for change in entry.get("changes", []):
                    if change.get("field") != "leadgen":
                        continue

                    value = change.get("value", {})
                    lead_id = value.get("leadgen_id")
                    form_id = str(value.get("form_id", ""))
                    page_id = str(value.get("page_id", ""))
                    ad_id = str(value.get("ad_id", ""))

                    if not lead_id:
                        continue

                    # Skip duplicate leads
                    if Student.objects.filter(meta_lead_id=str(lead_id)).exists():
                        logger.info(f"Duplicate Meta lead_id {lead_id}, skipping.")
                        continue

                    # Find matching Campaign
                    from crm.models import Campaign
                    campaign = None
                    if form_id:
                        campaign = Campaign.objects.filter(meta_form_id=form_id, meta_auto_import=True).first()
                    if not campaign and page_id:
                        campaign = Campaign.objects.filter(meta_page_id=page_id, meta_auto_import=True).first()
                    if not campaign and ad_id:
                        campaign = Campaign.objects.filter(meta_ad_id=ad_id, meta_auto_import=True).first()

                    # Fetch full lead details from Meta Graph API
                    name = ""
                    phone = ""
                    email = ""

                    if campaign and campaign.meta_access_token:
                        try:
                            graph_url = f"https://graph.facebook.com/v20.0/{lead_id}"
                            params = {
                                "fields": "field_data,created_time,ad_id,form_id",
                                "access_token": campaign.meta_access_token,
                            }
                            graph_resp = requests.get(graph_url, params=params, timeout=10)
                            graph_data = graph_resp.json()
                            for field in graph_data.get("field_data", []):
                                field_name = field.get("name", "").lower()
                                values = field.get("values", [])
                                val = values[0] if values else ""
                                if "name" in field_name and not name:
                                    name = val
                                elif any(k in field_name for k in ("phone", "mobile", "whatsapp")):
                                    phone = val
                                elif "email" in field_name:
                                    email = val
                        except Exception as e:
                            logger.error(f"Failed to fetch lead details from Meta Graph API: {e}")

                    first_name = name.split()[0] if name else "Meta"
                    last_name = " ".join(name.split()[1:]) if len(name.split()) > 1 else "Lead"

                    try:
                        from django.contrib.auth import get_user_model
                        from django.db import transaction
                        import datetime
                        User = get_user_model()

                        username = f"meta_{lead_id}"[:150]

                        with transaction.atomic():
                            # Duplicate check
                            is_duplicate = False
                            duplicate_reason = ""
                            if phone and Student.objects.filter(mobile=phone).exists():
                                is_duplicate = True
                                dup = Student.objects.filter(mobile=phone).first()
                                duplicate_reason = f"Duplicate mobile: {phone} (Original CRM ID: {dup.crm_student_id})"
                            elif email and Student.objects.filter(email=email).exists():
                                is_duplicate = True
                                dup = Student.objects.filter(email=email).first()
                                duplicate_reason = f"Duplicate email: {email} (Original CRM ID: {dup.crm_student_id})"

                            user = User.objects.create_user(
                                username=username,
                                first_name=first_name,
                                last_name=last_name,
                                email=email or "",
                                password=get_random_string(20),
                                role="STUDENT",
                            )

                            today = datetime.date.today()
                            count = Student.objects.filter(user__date_joined__date=today).count() + 1
                            crm_id = f"LLAD-{today.strftime('%d%m%y')}{count:03d}"
                            program = Program.objects.first()

                            # Auto-assign lead to active sales rep using round-robin logic on the campaign's auto_assign_to list
                            assigned_to_user = None
                            if not is_duplicate and campaign and campaign.auto_assign_to.exists():
                                try:
                                    # Get list of selected sales reps sorted by ID
                                    reps = list(campaign.auto_assign_to.filter(is_active=True).order_by('id'))
                                    if reps:
                                        # Find the last assigned student for this campaign who has an assigned sales rep
                                        last_assigned_student = Student.objects.filter(
                                            campaign=campaign, 
                                            assigned_to__isnull=False
                                        ).order_by('-id').first()
                                        
                                        next_index = 0
                                        if last_assigned_student and last_assigned_student.assigned_to in reps:
                                            last_index = reps.index(last_assigned_student.assigned_to)
                                            next_index = (last_index + 1) % len(reps)
                                        
                                        assigned_to_user = reps[next_index]
                                except Exception as assign_err:
                                    logger.error(f"Error calculating round-robin assignment: {assign_err}")

                            student = Student.objects.create(
                                user=user,
                                crm_student_id=crm_id,
                                program_type=program,
                                first_name=first_name,
                                last_name=last_name,
                                email=email or None,
                                mobile=phone or None,
                                lead_status="DUPLICATE" if is_duplicate else "NEW",
                                meta_lead_id=str(lead_id),
                                campaign=campaign,
                                sales_section=campaign.section if campaign else "BOTH",
                                assigned_to=assigned_to_user,
                            )

                            if is_duplicate and duplicate_reason:
                                from crm.models import LeadInteraction
                                LeadInteraction.objects.create(
                                    student=student,
                                    notes=f"SYSTEM NOTICE (Meta Ad Webhook): This lead is registered as DUPLICATE. {duplicate_reason}",
                                    interaction_type='NOTE'
                                )

                            leads_created += 1
                            logger.info(f"Created new Meta lead: {student.crm_student_id} - {name} ({phone})")

                    except Exception as e:
                        logger.error(f"Failed to create student from Meta lead {lead_id}: {e}")

            return Response({"status": "ok", "leads_created": leads_created})

        except Exception as e:
            logger.error(f"Meta webhook error: {e}")
            return Response({"status": "error", "message": str(e)}, status=500)


class LeadQualityFeedbackView(APIView):
    """
    PATCH /crm/leads/{student_id}/quality/
    Sales rep marks a lead as QUALITY or FAKE.
    QUALITY -> sends Lead event to Meta Conversions API.
    FAKE    -> no event sent.
    """
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, student_id):
        try:
            student = Student.objects.get(id=student_id)
        except Student.DoesNotExist:
            return Response({"error": "Lead not found"}, status=404)

        quality = request.data.get("lead_quality")
        if quality not in ("QUALITY", "FAKE", "UNKNOWN"):
            return Response(
                {"error": "lead_quality must be QUALITY, FAKE, or UNKNOWN"},
                status=400
            )

        student.lead_quality = quality
        student.save(update_fields=["lead_quality"])

        capi_sent = False
        capi_message = ""

        if quality == "QUALITY" and student.campaign:
            campaign = student.campaign
            if campaign.meta_pixel_id and campaign.meta_access_token:
                capi_sent = _send_meta_conversions_event(campaign, student, "Lead")
                capi_message = "Meta Conversions API Lead event sent." if capi_sent else "Meta CAPI call failed - check server logs."
            else:
                capi_message = "No Meta Pixel/Token configured for this campaign. CAPI event not sent."
        elif quality == "FAKE":
            capi_message = "Marked as Fake. No Meta event sent."
        else:
            capi_message = "Lead quality reset."

        return Response({
            "status": "ok",
            "lead_quality": student.lead_quality,
            "capi_sent": capi_sent,
            "message": capi_message,
        })
