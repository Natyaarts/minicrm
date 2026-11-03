
import hashlib
import logging
import re
from urllib.parse import urlparse

import requests

from django.conf import settings
from django.utils import timezone
from django.db import transaction

from crm.models import MetaConversionEvent

logger = logging.getLogger(__name__)


def hash_value(value):
    """Normalize and SHA-256 hash customer information for Meta."""
    if not value:
        return None

    normalized = str(value).strip().lower()

    if not normalized:
        return None

    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def queue_meta_event(
    student,
    event_name,
    request=None,
    action_source="other",
    custom_data=None,
    event_time=None,
    idempotency_key=None,
):
    """
    Save a Meta event to the database queue.
    Does not make an HTTP request to Meta.
    """

    campaign = getattr(student, "campaign", None)

    dataset_id = (
        campaign.meta_pixel_id
        if campaign and campaign.meta_pixel_id
        else settings.META_DATASET_ID
    )

    access_token = (
        campaign.meta_access_token
        if campaign and campaign.meta_access_token
        else settings.META_CAPI_ACCESS_TOKEN
    )

    if not dataset_id or not access_token:
        logger.warning(
            "Meta CAPI is not configured for student %s. Event was not queued.",
            student.pk,
        )
        return None

    try:
        user_data = {}

        # Hashed email
        email_hash = hash_value(student.email)
        if email_hash:
            user_data["em"] = [email_hash]

        # Phone: digits only, including country code
        if student.mobile:
            phone = re.sub(r"\D", "", str(student.mobile))
            phone_hash = hash_value(phone)

            if phone_hash:
                user_data["ph"] = [phone_hash]

        # Hashed first and last names
        first_name_hash = hash_value(student.first_name)
        if first_name_hash:
            user_data["fn"] = [first_name_hash]

        last_name_hash = hash_value(student.last_name)
        if last_name_hash:
            user_data["ln"] = [last_name_hash]

        # Stable external CRM identifier
        external_id = hash_value(f"student-{student.pk}")
        if external_id:
            user_data["external_id"] = [external_id]

        # Browser user agent
        if request:
            user_agent = request.META.get("HTTP_USER_AGENT")
            if user_agent:
                user_data["client_user_agent"] = user_agent[:500]

        # Validate the actual website page URL
        source_url = None

        if request:
            candidate_url = (
                request.data.get("event_source_url")
                or request.META.get("HTTP_REFERER")
            )

            if candidate_url:
                parsed = urlparse(str(candidate_url))

                if parsed.scheme in ("http", "https") and parsed.netloc:
                    source_url = str(candidate_url)

        # Website events require a real page URL
        if action_source == "website" and not source_url:
            action_source = "other"

        occurred_at = event_time or timezone.now()

        payload = {
            "event_name": event_name,
            "event_time": int(occurred_at.timestamp()),
            "action_source": action_source,
            "user_data": user_data,
        }

        if source_url and action_source == "website":
            payload["event_source_url"] = source_url

        if custom_data:
            payload["custom_data"] = custom_data

        # Create the event safely and prevent duplicate queue records
        with transaction.atomic():
            defaults = {
                "student": student,
                "campaign": campaign,
                "event_name": event_name,
                "current_stage": str(student.lead_status or ""),
                "event_time": occurred_at,
                "status": "PENDING",
                "payload": {},
            }

            if idempotency_key:
                event, created = MetaConversionEvent.objects.get_or_create(
                    idempotency_key=idempotency_key,
                    defaults=defaults,
                )

                if not created:
                    logger.info(
                        "Duplicate Meta event prevented: %s for student %s",
                        event_name,
                        student.pk,
                    )
                    return event
            else:
                event = MetaConversionEvent.objects.create(**defaults)

            # Keep the same event ID for retries of this queued event
            payload["event_id"] = str(event.pk)

            event.payload = payload
            event.save(update_fields=["payload"])


        logger.info(
            "Meta event queued: %s for student %s",
            event_name,
            student.pk,
        )

        return event

    except Exception:
        logger.exception(
            "Failed to queue Meta event %s for student %s",
            event_name,
            getattr(student, "pk", None),
        )
        return None


def send_meta_event(event):
    """Send one queued event to Meta."""

    campaign = event.campaign

    dataset_id = (
        campaign.meta_pixel_id
        if campaign and campaign.meta_pixel_id
        else settings.META_DATASET_ID
    )

    access_token = (
        campaign.meta_access_token
        if campaign and campaign.meta_access_token
        else settings.META_CAPI_ACCESS_TOKEN
    )

    api_version = settings.META_API_VERSION

    if not dataset_id or not access_token:
        raise ValueError("Meta CAPI credentials are not configured.")

    url = (
        f"https://graph.facebook.com/"
        f"{api_version}/{dataset_id}/events"
    )

    payload = {
        "data": [event.payload],
        "access_token": access_token,
    }

    test_event_code = getattr(settings, "META_TEST_EVENT_CODE", "")

    if test_event_code:
        payload["test_event_code"] = test_event_code

    response = requests.post(
        url,
        json=payload,
        timeout=20,
    )

    try:
        response_data = response.json()
    except ValueError:
        response_data = {"response": response.text[:2000]}

    if not response.ok or response_data.get("error"):
        raise requests.HTTPError(
            f"Meta API error ({response.status_code}): {response_data}",
            response=response,
        )

    return response.status_code, response_data
