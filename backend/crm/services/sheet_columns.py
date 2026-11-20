"""
Shared Google Sheet column helpers used by both import paths:
  - crm.views_google.GoogleSheetSyncView
  - crm.management.commands.run_google_sync
"""
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


def normalize_sheet_header(header) -> str:
    """Lowercase, '_' -> space, drop '?' and ':', collapse spaces, strip."""
    text = str(header if header is not None else '').lower().replace('_', ' ')
    text = text.replace('?', '').replace(':', '')
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


def get_preferred_contact_time(row, col_idx) -> str:
    """Read the cell as-is (stripped, max 100 chars). Never raises."""
    try:
        if col_idx is None or col_idx < 0 or not row or col_idx >= len(row):
            return ''
        value = row[col_idx]
        if value is None:
            return ''
        return str(value).strip()[:PREFERRED_CONTACT_TIME_MAX_LENGTH]
    except Exception:
        return ''
