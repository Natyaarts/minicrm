"""
Centralized BDE Auto-Assignment Service for Natya MiniCRM.

This service provides a concurrency-safe, database-backed True Round-Robin
auto-assignment mechanism for incoming leads across all ingestion channels:
- Campaign Webhook
- Meta Ads Webhook
- Google Sheets Direct Sync / CLI Sync
- CSV / Batch JSON Upload
- Dynamic Webhooks

Concurrency Protection:
Uses Django's `transaction.atomic()` combined with `select_for_update()`
on the Campaign row to prevent race conditions during concurrent webhook deliveries.
"""

import logging
from typing import Optional, Union
from django.db import transaction
from django.contrib.auth import get_user_model

logger = logging.getLogger(__name__)
User = get_user_model()


def is_bde_eligible_for_section(user, campaign_section: Optional[str]) -> bool:
    """
    Checks whether a sales representative (BDE) is eligible for a campaign
    of the given section ('REGULAR', 'CAREER_ACADEMY', or 'BOTH').
    """
    if not user or not getattr(user, 'is_active', False):
        return False
    section = (campaign_section or 'BOTH').strip().upper()
    user_section = (getattr(user, 'sales_section', None) or 'BOTH').strip().upper()
    if section == 'REGULAR':
        return user_section in ('REGULAR', 'BOTH')
    if section == 'CAREER_ACADEMY':
        return user_section in ('CAREER_ACADEMY', 'BOTH')
    return True


def filter_eligible_bdes_for_section(users_iterable, campaign_section: Optional[str]) -> list:
    """
    Filters a collection of User instances to only those whose sales_section
    is compatible with the given campaign_section.
    """
    section = (campaign_section or 'BOTH').strip().upper()
    eligible = []
    for u in users_iterable:
        user_section = (getattr(u, 'sales_section', None) or 'BOTH').strip().upper()
        if section == 'REGULAR' and user_section not in ('REGULAR', 'BOTH'):
            continue
        if section == 'CAREER_ACADEMY' and user_section not in ('CAREER_ACADEMY', 'BOTH'):
            continue
        eligible.append(u)
    return eligible


def get_next_assigned_rep(campaign_or_id: Optional[Union[object, int, str]]) -> Optional[User]:
    """
    Selects and updates the next active Sales Representative (BDE) for a given Campaign
    using a persistent database-backed True Round-Robin algorithm.

    Requirements satisfied:
    1. Active BDEs only (campaign.auto_assign_to where is_active=True).
    2. Section eligibility enforced (REGULAR campaign -> REGULAR/BOTH BDEs; CAREER_ACADEMY -> CAREER_ACADEMY/BOTH BDEs).
    3. Deterministic ordering (.order_by('id')).
    4. True round-robin sequence (BDE1 -> BDE2 -> BDE3 -> BDE1 -> ...).
    5. Concurrency safety via database row lock (select_for_update()).
    6. Persistent state stored directly on Campaign.last_assigned_bde.

    Error Handling Semantics:
    - Returns None if campaign is None, not found, or has no active eligible BDEs configured (expected business logic).
    - If an unexpected database or system exception occurs during locking/execution, it is logged
      and re-raised so that the caller's transaction rolls back cleanly rather than silently
      creating a lead without an assigned BDE.

    Args:
        campaign_or_id: Campaign model instance, Campaign ID (int/str), or None.

    Returns:
        User model instance of the selected BDE, or None if no active eligible BDEs are configured.
    """
    if campaign_or_id is None:
        return None

    # Avoid circular import
    from crm.models import Campaign

    campaign_id = getattr(campaign_or_id, 'id', campaign_or_id)
    if not campaign_id:
        return None

    try:
        with transaction.atomic():
            # Acquire exclusive row lock on Campaign to prevent race conditions during concurrent webhook bursts
            campaign = Campaign.objects.select_for_update().filter(id=campaign_id).first()
            if not campaign:
                return None

            # Retrieve only active and section-eligible sales representatives assigned to this campaign in deterministic order
            reps_qs = campaign.auto_assign_to.filter(is_active=True)
            campaign_section = (getattr(campaign, 'section', None) or 'BOTH').strip().upper()
            if campaign_section == 'REGULAR':
                reps_qs = reps_qs.filter(sales_section__in=['REGULAR', 'BOTH'])
            elif campaign_section == 'CAREER_ACADEMY':
                reps_qs = reps_qs.filter(sales_section__in=['CAREER_ACADEMY', 'BOTH'])

            active_reps = list(reps_qs.order_by('id'))
            if not active_reps:
                return None

            # Determine next BDE in round-robin sequence
            last_assigned = campaign.last_assigned_bde
            if last_assigned and last_assigned in active_reps:
                last_index = active_reps.index(last_assigned)
                next_index = (last_index + 1) % len(active_reps)
            else:
                next_index = 0

            selected_rep = active_reps[next_index]

            # Update and persist the assignment pointer on the Campaign
            campaign.last_assigned_bde = selected_rep
            campaign.save(update_fields=['last_assigned_bde'])

            return selected_rep

    except Exception as exc:
        logger.error(f"Database error in centralized BDE auto-assignment for campaign {campaign_id}: {exc}", exc_info=True)
        raise
