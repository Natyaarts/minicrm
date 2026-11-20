"""
Batch sender for the Expo Push Service (used by crm send_task_reminders).

Separate from notifications.utils.send_push_notification, which is left unchanged.
Docs: https://docs.expo.dev/push-notifications/sending-notifications/
"""
import logging
import os
import re

import requests

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
EXPO_BATCH_LIMIT = 100  # Expo accepts at most 100 messages per request
REQUEST_TIMEOUT_SECONDS = 15

_EXPO_TOKEN_RE = re.compile(r'^Expo(nent)?PushToken\[[^\]\s]+\]$')


def is_expo_push_token(value):
    """True only for real Expo push tokens (rejects empty values and stored error text)."""
    return isinstance(value, str) and bool(_EXPO_TOKEN_RE.match(value.strip()))


def _headers():
    headers = {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
    }
    # Only needed if "enhanced push security" is enabled for the Expo project
    access_token = os.getenv('EXPO_ACCESS_TOKEN', '').strip()
    if access_token:
        headers['Authorization'] = f'Bearer {access_token}'
    return headers


def _deactivate_tokens(tokens):
    if not tokens:
        return 0
    from .models import DeviceToken
    return DeviceToken.objects.filter(token__in=list(tokens), is_active=True).update(is_active=False)


def send_expo_batch(messages):
    """
    Send Expo push messages, at most 100 per HTTP request.

    Each message is a dict with a single-token string 'to' plus title/body/data/etc.
    Messages whose 'to' is not a valid Expo token are skipped.
    Tickets are checked; tokens answered with 'DeviceNotRegistered' are marked inactive.
    Never raises: network or HTTP failures are logged and counted.

    Returns a summary dict: {'sent': n_ok, 'errors': n_failed, 'skipped': n_invalid,
    'deactivated': n_tokens_deactivated}.
    """
    summary = {'sent': 0, 'errors': 0, 'skipped': 0, 'deactivated': 0}
    valid = []
    for message in messages or []:
        if is_expo_push_token(message.get('to')):
            valid.append(message)
        else:
            summary['skipped'] += 1

    for start in range(0, len(valid), EXPO_BATCH_LIMIT):
        chunk = valid[start:start + EXPO_BATCH_LIMIT]
        try:
            response = requests.post(EXPO_PUSH_URL, json=chunk, headers=_headers(), timeout=REQUEST_TIMEOUT_SECONDS)
            response.raise_for_status()
            tickets = (response.json() or {}).get('data') or []
        except Exception as exc:  # network error, non-2xx, bad JSON
            logger.warning('Expo push request failed for %d message(s): %s', len(chunk), exc)
            summary['errors'] += len(chunk)
            continue

        if isinstance(tickets, dict):  # Expo returns an object (not a list) for a single message
            tickets = [tickets]

        dead_tokens = set()
        for index, message in enumerate(chunk):
            ticket = tickets[index] if index < len(tickets) else None
            if isinstance(ticket, dict) and ticket.get('status') == 'ok':
                summary['sent'] += 1
                continue
            summary['errors'] += 1
            details = (ticket.get('details') or {}) if isinstance(ticket, dict) else {}
            if details.get('error') == 'DeviceNotRegistered':
                dead_tokens.add(message['to'])
            else:
                logger.warning('Expo push ticket error for %s: %s', message.get('to'), ticket)

        summary['deactivated'] += _deactivate_tokens(dead_tokens)

    return summary
