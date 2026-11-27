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
# bulk upload and Google Sheets sync paths. These columns are never treated as the availability column.
FIRST_NAME_HEADER_ALIASES = [
    'first name', 'firstname', 'full name', 'fullname', 'name',
    'student name', 'candidate name', 'lead name', 'applicant name',
    'customer name', 'your name', 'person name',
]

LAST_NAME_HEADER_ALIASES = [
    'last name', 'lastname', 'surname', 'family name', 'second name',
]

MOBILE_HEADER_ALIASES = [
    'mobile', 'phone', 'contact', 'mobile number', 'phone number',
    'contact number', 'whatsapp', 'whatsapp number', 'mobile no',
    'phone no', 'contact no', 'telephone', 'cell', 'cell phone',
    'primary phone', 'alternate phone',
]

EMAIL_HEADER_ALIASES = [
    'email', 'email address', 'mail', 'e mail', 'email id',
    'student email', 'candidate email', 'work email',
]

PLACE_HEADER_ALIASES = [
    'place', 'city', 'location', 'town', 'district',
]

TAG_HEADER_ALIASES = [
    'tag', 'course', 'course name', 'interested course', 'program', 'program name',
]

LEAD_IDENTITY_HEADERS = set(
    FIRST_NAME_HEADER_ALIASES
    + LAST_NAME_HEADER_ALIASES
    + MOBILE_HEADER_ALIASES
    + EMAIL_HEADER_ALIASES
)


def normalize_sheet_header(header) -> str:
    """Lowercase, '_' and '-' -> space, drop '?', ':', '!', '*' and '#', collapse spaces, strip."""
    text = str(header if header is not None else '').lower().replace('_', ' ').replace('-', ' ')
    text = re.sub(r'[?:!*#]', '', text)
    return re.sub(r'\s+', ' ', text).strip()


def resolve_sheet_column_indices(rows, max_header_scan_rows: int = 10):
    """
    Scan the first `max_header_scan_rows` rows of a Google Sheet to locate the header row
    and map column indices for first/full name, last name, mobile(s), email, place, tag,
    and preferred contact time.

    Returns a dict with column indices or None if no valid header row is found.
    """
    if not rows:
        return None

    scan_limit = min(len(rows), max(1, max_header_scan_rows))
    for row_idx in range(scan_limit):
        raw_row = rows[row_idx]
        if not raw_row or not isinstance(raw_row, (list, tuple)):
            continue

        norm_headers = [normalize_sheet_header(h) for h in raw_row]
        if not any(norm_headers):
            continue

        def _find_first(aliases, exclude=()):
            excluded_set = set(exclude)
            for alias in aliases:
                for idx, h in enumerate(norm_headers):
                    if idx not in excluded_set and h == alias:
                        return idx
            return -1

        def _find_all(aliases, exclude=()):
            excluded_set = set(exclude)
            found = []
            for alias in aliases:
                for idx, h in enumerate(norm_headers):
                    if idx not in excluded_set and h == alias and idx not in found:
                        found.append(idx)
            return found

        first_name_idx = _find_first(FIRST_NAME_HEADER_ALIASES)
        if first_name_idx == -1:
            for idx, h in enumerate(norm_headers):
                if any(k in h for k in ('full name', 'first name', 'student name', 'candidate name', 'lead name')):
                    first_name_idx = idx
                    break

        last_name_idx = _find_first(LAST_NAME_HEADER_ALIASES, exclude=(first_name_idx,))

        mobile_indices = _find_all(MOBILE_HEADER_ALIASES, exclude=(first_name_idx, last_name_idx))
        for idx, h in enumerate(norm_headers):
            if idx in (first_name_idx, last_name_idx) or idx in mobile_indices:
                continue
            if any(k in h for k in ('mobile', 'phone', 'whatsapp', 'contact no', 'contact number')):
                mobile_indices.append(idx)

        mobile_idx = mobile_indices[0] if mobile_indices else -1

        email_idx = _find_first(
            EMAIL_HEADER_ALIASES,
            exclude=(first_name_idx, last_name_idx, *mobile_indices),
        )
        if email_idx == -1:
            for idx, h in enumerate(norm_headers):
                if idx in (first_name_idx, last_name_idx, *mobile_indices):
                    continue
                if 'email' in h or 'e mail' in h:
                    email_idx = idx
                    break

        if mobile_idx == -1 and first_name_idx == -1 and email_idx == -1:
            continue

        place_idx = _find_first(
            PLACE_HEADER_ALIASES,
            exclude=(first_name_idx, last_name_idx, *mobile_indices, email_idx),
        )
        tag_idx = _find_first(
            TAG_HEADER_ALIASES,
            exclude=(first_name_idx, last_name_idx, *mobile_indices, email_idx, place_idx),
        )
        contact_time_idx = find_preferred_contact_time_index(
            raw_row,
            exclude_indices=(first_name_idx, last_name_idx, *mobile_indices, email_idx, place_idx, tag_idx),
        )

        return {
            'header_row_idx': row_idx,
            'first_name_idx': first_name_idx,
            'last_name_idx': last_name_idx,
            'mobile_idx': mobile_idx,
            'mobile_indices': mobile_indices,
            'email_idx': email_idx,
            'place_idx': place_idx,
            'tag_idx': tag_idx,
            'contact_time_idx': contact_time_idx,
        }

    return None


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
