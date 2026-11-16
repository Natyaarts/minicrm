# CRM Services Package

from .deduplication import (
    acquire_lead_creation_lock,
    normalize_lead_phone,
    normalize_lead_email,
    lookup_existing_student,
    record_reengagement_interaction,
    create_duplicate_lead,
)
from .assignment import (
    get_next_assigned_rep,
    is_bde_eligible_for_section,
    filter_eligible_bdes_for_section,
)

__all__ = [
    'acquire_lead_creation_lock',
    'normalize_lead_phone',
    'normalize_lead_email',
    'lookup_existing_student',
    'record_reengagement_interaction',
    'create_duplicate_lead',
    'get_next_assigned_rep',
    'is_bde_eligible_for_section',
    'filter_eligible_bdes_for_section',
]
