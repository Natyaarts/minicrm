"""
Shared lead-import column helpers for "When are you available to speak?".

Used by every lead import path so they match and clean identically:
  - crm.views_google.GoogleSheetSyncView
  - crm.management.commands.run_google_sync
  - crm.views.CampaignViewSet.bulk_upload / bulk_upload_batch
  - core.bulk_views.BulkUploadView
"""
import math
import re

PREFERRED_CONTACT_TIME_MAX_LENGTH = 100

PREFERRED_CONTACT_TIME_HEADERS = [
    'when are you available to speak',
    'when are you available to talk',
    'when are you available',
    'best time to call',
    'best time to contact',
    'preferred time',
    'preferred contact time',
    'available time',
    'availability',
]

# Normalised name / last name / mobile / email header aliases used by the
# bulk upload paths. These columns are never treated as the availability column.
LEAD_IDENTITY_HEADERS = {
    'full name', 'fullname', 'student name', 'name', 'first name', 'firstname',
    'last name', 'lastname', 'surname',
    'email', 'email address', 'mail',
    'contact', 'mobile', 'phone', 'phone number', 'mobile number',
    'contact number', 'whatsapp',
}


def normalize_sheet_header(header) -> str:
    """Lowercase, '_' -> space, drop '?', ':' and '!', collapse spaces, strip."""
    text = str(header if header is not None else '').lower().replace('_', ' ')
    text = re.sub(r'[?:!]', '', text)
    return re.sub(r'\s+', ' ', text).strip()


def find_preferred_contact_time_index(raw_headers, exclude_indices=()) -> int:
    """
    Return the column index for "When are you available to speak?" or -1.

    Exact match against the known header list first; otherwise the first header
    containing "available"/"availability" that is not already mapped
    (exclude_indices = name / last name / mobile / email columns).
    """
    normalized = [normalize_sheet_header(h) for h in (raw_headers or [])]
    excluded = {i for i in exclude_indices if i is not None and i >= 0}

    for name in PREFERRED_CONTACT_TIME_HEADERS:
        for idx, header in enumerate(normalized):
            if header == name and idx not in excluded:
                return idx

    for idx, header in enumerate(normalized):
        if idx in excluded:
            continue
        if 'available' in header or 'availability' in header:
            return idx

    return -1


def find_preferred_contact_time_key(keys):
    """
    For dict-shaped rows (bulk uploads): return the matching column key, or None.
    Columns whose header is a name / mobile / email alias are skipped.
    """
    keys = list(keys or [])
    exclude = [i for i, k in enumerate(keys) if normalize_sheet_header(k) in LEAD_IDENTITY_HEADERS]
    idx = find_preferred_contact_time_index(keys, exclude_indices=exclude)
    return keys[idx] if idx >= 0 else None


def clean_preferred_contact_time(value) -> str:
    """
    Turn Meta's code form into the readable label; leave labels unchanged.

      "evening_(4:00_pm_–_8:00_pm)"  -> "Evening (4:00 PM – 8:00 PM)"
      "any_time"                     -> "Any time"
      "Morning (9:00 AM – 12:00 PM)" -> unchanged
      "<test lead: dummy data ...>"  -> kept as-is
      blank / None / NaN             -> ""

    Max 100 characters. Never raises.
    """
    try:
        if value is None:
            return ''
        if isinstance(value, float) and math.isnan(value):
            return ''
        text = str(value).strip()
        if not text:
            return ''
        if text.lower().startswith('<test lead'):
            return text[:PREFERRED_CONTACT_TIME_MAX_LENGTH]
        text = re.sub(r'\s+', ' ', text.replace('_', ' ')).strip()
        # Upper-case am/pm only when it follows a time digit ("4:00 pm" -> "4:00 PM")
        text = re.sub(r'(\d)(\s*)(am|pm)\b', lambda m: m.group(1) + m.group(2) + m.group(3).upper(),
                      text, flags=re.IGNORECASE)
        text = text[:1].upper() + text[1:]
        return text[:PREFERRED_CONTACT_TIME_MAX_LENGTH]
    except Exception:
        return ''


def get_preferred_contact_time(row, col_idx) -> str:
    """Read a list-shaped row's cell and clean it. Missing/short row -> "". Never raises."""
    try:
        if col_idx is None or col_idx < 0 or not row or col_idx >= len(row):
            return ''
        return clean_preferred_contact_time(row[col_idx])
    except Exception:
        return ''


def get_preferred_contact_time_from_dict(row_dict, key) -> str:
    """Read a dict-shaped row's value by key and clean it. Never raises."""
    try:
        if key is None or not row_dict:
            return ''
        return clean_preferred_contact_time(row_dict.get(key))
    except Exception:
        return ''
