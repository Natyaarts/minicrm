# CRM Services Package

from .deduplication import (
    normalize_lead_phone,
    normalize_lead_email,
    lookup_existing_student,
    record_reengagement_interaction,
    create_duplicate_lead,
)
from .assignment import (
    get_next_assigned_rep,
)

__all__ = [
    'normalize_lead_phone',
    'normalize_lead_email',
    'lookup_existing_student',
    'record_reengagement_interaction',
    'create_duplicate_lead',
    'get_next_assigned_rep',
]
