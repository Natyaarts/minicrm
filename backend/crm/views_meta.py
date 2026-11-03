"""
Meta Facebook Lead Ads webhook receiver and Lead Quality Conversions API feedback.
"""
import hashlib
import hmac
import logging
import requests
from django.conf import settings
from django.db import IntegrityError, transaction
from django.http import HttpResponse
from django.utils.crypto import get_random_string
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from core.models import Student, Program
from crm.services import (
    lookup_existing_student,
    record_reengagement_interaction,
    normalize_lead_phone,
    normalize_lead_email,
    create_duplicate_lead,
    get_next_assigned_rep,
)
from .utils import check_is_sales_manager


logger = logging.getLogger(__name__)



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
        verify_token = getattr(settings, "META_WEBHOOK_VERIFY_TOKEN", None)

        if not verify_token:
            logger.error("META_WEBHOOK_VERIFY_TOKEN is not configured.")
            return HttpResponse(
                "Webhook verification is not configured",
                status=500
            )

        if mode == "subscribe" and token == verify_token:
            logger.info("Meta webhook verified successfully.")
            return HttpResponse(challenge, content_type="text/plain")

        logger.warning(f"Meta webhook verification failed. mode={mode}, token=[REDACTED]")
        return HttpResponse("Verification failed", status=403)

    def post(self, request):
        """Receive a new lead from Meta Facebook Lead Ads."""
        try:
            body = request.body
            payload = request.data

            # Validate Meta webhook signature
            app_secret = getattr(settings, "META_APP_SECRET", None)

            if not app_secret:
                logger.error("META_APP_SECRET is not configured.")
                return Response(
                    {"error": "Webhook security is not configured"},
                    status=500
                )

            sig_header = request.META.get("HTTP_X_HUB_SIGNATURE_256", "")

            expected_sig = "sha256=" + hmac.new(
                app_secret.encode(),
                body,
                hashlib.sha256
            ).hexdigest()

            if not hmac.compare_digest(sig_header, expected_sig):
                logger.warning("Invalid Meta webhook signature.")
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

                    # Find matching Campaign using Page ID + Form ID
                    from crm.models import Campaign

                    campaign = None

                    campaigns = Campaign.objects.filter(meta_auto_import=True)

                    if page_id and form_id:
                        campaign = campaigns.filter(
                            meta_page_id=page_id,
                            meta_form_id=form_id,
                        ).first()

                    # Use Ad ID only when the Page/Form combination is unavailable
                    if not campaign and page_id and ad_id:
                        campaign = campaigns.filter(
                            meta_page_id=page_id,
                            meta_ad_id=ad_id,
                        ).first()

                    if not campaign:
                        logger.warning(
                            "No matching active Meta campaign. Page ID: %s, Form ID: %s, Ad ID: %s",
                            page_id,
                            form_id,
                            ad_id,
                        )
                        continue

                    
                
                    # Fetch full lead details from Meta Graph API
                    name = ""
                    phone = ""
                    email = ""

                    if not campaign or not campaign.meta_access_token:
                        logger.error(
                            "Meta campaign or Page Access Token missing. "
                            "Lead ID: %s, Campaign: %s",
                            lead_id,
                            campaign.id if campaign else None,
                        )
                        continue

                    try:
                        version = getattr(settings, "META_API_VERSION", "v26.0")
                        graph_url = f"https://graph.facebook.com/{version}/{lead_id}"

                        params = {
                            "fields": "field_data,created_time,ad_id,form_id",
                            "access_token": campaign.meta_access_token,
                        }

                        graph_resp = requests.get(
                            graph_url,
                            params=params,
                            timeout=15,
                        )
                        graph_resp.raise_for_status()

                        graph_data = graph_resp.json()

                        if "error" in graph_data:
                            raise ValueError(
                                graph_data["error"].get(
                                    "message", "Meta Graph API error"
                                )
                            )

                        first_name_value = ""
                        last_name_value = ""

                        for field in graph_data.get("field_data", []):
                            field_name = (
                                field.get("name", "")
                                .strip()
                                .lower()
                                .replace(" ", "_")
                            )
                            values = field.get("values", [])
                            val = str(values[0]).strip() if values and values[0] else ""

                            if not val:
                                continue

                            if field_name in ("full_name", "name") and not name:
                                name = val
                            elif field_name in ("first_name", "firstname"):
                                first_name_value = val
                            elif field_name in ("last_name", "lastname"):
                                last_name_value = val
                            elif any(
                                key in field_name
                                for key in ("phone", "mobile", "whatsapp")
                            ):
                                phone = val
                            elif "email" in field_name:
                                email = val

                        if not name:
                            name = " ".join(
                                part
                                for part in (first_name_value, last_name_value)
                                if part
                            )

                    except Exception:
                        logger.exception(
                            "Failed to fetch Meta lead details. Lead ID: %s",
                            lead_id,
                        )
                        continue

                    first_name = name.split()[0] if name else "Meta"
                    last_name = (
                        " ".join(name.split()[1:])
                        if len(name.split()) > 1
                        else "Lead"
                    )

                    clean_phone = normalize_lead_phone(phone)
                    clean_em = normalize_lead_email(email)

                    try:
                        from django.contrib.auth import get_user_model
                        User = get_user_model()

                        # Centralized duplicate check
                        dup_student, dup_reason = lookup_existing_student(mobile=clean_phone, email=clean_em)
                        if dup_student:
                            record_reengagement_interaction(
                                student=dup_student,
                                source_name="Meta Lead Ad",
                                campaign_name=campaign.name if campaign else None,
                                event_id=str(lead_id),
                                extra_notes=f"Name: {name}, Phone: {phone}"
                            )
                            logger.info(f"Meta lead {lead_id} matched existing student {dup_student.crm_student_id}. Logged re-engagement note.")

                            new_dup = create_duplicate_lead(
                                existing_student=dup_student,
                                first_name=first_name,
                                last_name=last_name,
                                mobile=clean_phone,
                                email=clean_em,
                                campaign=campaign,
                                sales_section=campaign.section if campaign else "BOTH",
                                meta_lead_id=str(lead_id),
                                duplicate_reason=dup_reason,
                                log_reengagement=False
                            )
                            leads_created += 1
                            logger.info(f"Created duplicate Meta lead: {new_dup.crm_student_id} - {name} ({clean_phone})")
                            continue


                        username = f"meta_{lead_id}"[:150]

                        with transaction.atomic():
                            user = User.objects.create_user(
                                username=username,
                                first_name=first_name,
                                last_name=last_name,
                                email=clean_em or "",
                                password=get_random_string(20),
                                role="STUDENT",
                            )

                            
                            crm_id = Student.generate_next_llad_id()
                            program = None
                            if campaign and campaign.section == 'CAREER_ACADEMY':
                                program = Program.objects.filter(name='Natya Career Academy').first()
                            elif campaign and campaign.section == 'REGULAR':
                                program = Program.objects.filter(name='Natya').first()
                            if not program:
                                program = Program.objects.exclude(name="Wise Import").first() or Program.objects.first()

                            # Auto-assign lead using centralized assignment service
                            assigned_to_user = get_next_assigned_rep(campaign)

                            from .utils import get_canonical_new_lead_stage_id
                            student = Student.objects.create(
                                user=user,
                                crm_student_id=crm_id,
                                program_type=program,
                                first_name=first_name,
                                last_name=last_name,
                                email=clean_em or None,
                                mobile=clean_phone or None,
                                lead_status=get_canonical_new_lead_stage_id(),
                                meta_lead_id=str(lead_id),
                                campaign=campaign,
                                sales_section=campaign.section if campaign else "BOTH",
                                assigned_to=assigned_to_user,
                            )

                            leads_created += 1
                            logger.info(f"Created new Meta lead: {student.crm_student_id} - {name} ({clean_phone})")

                    except IntegrityError:
                        # Another webhook request may have created this Meta lead first.
                        if Student.objects.filter(meta_lead_id=str(lead_id)).exists():
                            logger.info(
                                "Meta lead %s was already processed by another request. Skipping.",
                                lead_id,
                            )
                            continue

                        logger.exception(
                            "Database integrity error while processing Meta lead %s.",
                            lead_id,
                        )

                    except Exception:
                        logger.exception(
                            "Failed to create student from Meta lead %s.",
                            lead_id,
                        )

            return Response({"status": "ok", "leads_created": leads_created})

        except Exception as e:
            logger.error(f"Meta webhook error: {e}")
            return Response({"status": "error", "message": "Failed to process Meta webhook."}, status=500)


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
            if request.user.role == 'SALES' and not check_is_sales_manager(request.user):
                student = Student.objects.get(id=student_id, assigned_to=request.user)
            else:
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
        capi_queued = False

        if quality == "QUALITY":
            capi_queued = bool(
                student.meta_lead_id
                and student._old_quality != "QUALITY"
            )
            capi_message = (
                "Meta QualityLead event queued."
                if capi_queued
                else "Lead marked as Quality. No new Meta event was required."
            )
        elif quality == "FAKE":
            capi_message = "Marked as Fake. No Meta event sent."
        else:
            capi_message = "Lead quality reset."

        return Response({
            "status": "ok",
            "lead_quality": student.lead_quality,
            "capi_sent": capi_sent,
            "capi_queued": capi_queued,
            "message": capi_message,
        })
