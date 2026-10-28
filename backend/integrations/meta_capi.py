import hashlib
import logging
import re
import time

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


def _hash(value):
    return hashlib.sha256(value.strip().lower().encode()).hexdigest()


def send_crm_event(event_name, *, lead_id=None, email=None, phone=None):
    """event_name = your CRM stage, e.g. 'Lead', 'Qualified', 'Converted'."""
    if not settings.META_DATASET_ID or not settings.META_CAPI_ACCESS_TOKEN:
        return None, None

    user_data = {}
    if lead_id and str(lead_id).isdigit():
        user_data["lead_id"] = int(lead_id)
    if email:
        user_data["em"] = [_hash(email)]
    if phone:
        digits = re.sub(r"\D", "", phone)  # include country code, e.g. 919876543210
        if digits:
            user_data["ph"] = [_hash(digits)]
    if not user_data:
        return None, None  # Meta needs at least one identifier

    payload = {
        "data": [{
            "event_name": event_name,
            "event_time": int(time.time()),
            "action_source": "system_generated",
            "user_data": user_data,
            "custom_data": {"event_source": "crm", "lead_event_source": "MiniCRM"},
        }],
    }
    if settings.META_TEST_EVENT_CODE:
        payload["test_event_code"] = settings.META_TEST_EVENT_CODE

    try:
        resp = requests.post(
            f"https://graph.facebook.com/{settings.META_API_VERSION}/{settings.META_DATASET_ID}/events",
            params={"access_token": settings.META_CAPI_ACCESS_TOKEN},
            json=payload,
            timeout=10,
        )
        if resp.status_code != 200:
            logger.warning("Meta CAPI error %s: %s", resp.status_code, resp.text[:300])
        return resp.status_code, resp.json()
    except Exception:
        logger.exception("Meta CAPI request failed")
        return None, None