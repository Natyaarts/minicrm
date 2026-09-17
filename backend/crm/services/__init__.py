# CRM Services Package

from .deduplication import (
    normalize_lead_phone,
    normalize_lead_email,
    lookup_existing_student,
    record_reengagement_interaction,
)
from .assignment import (
    get_next_assigned_rep,
)

__all__ = [
    'normalize_lead_phone',
    'normalize_lead_email',
    'lookup_existing_student',
    'record_reengagement_interaction',
    'get_next_assigned_rep',
]
