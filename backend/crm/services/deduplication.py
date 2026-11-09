import logging
import re
from typing import Optional, Tuple
from core.models import Student, normalize_phone_number
from crm.models import LeadInteraction
from django.db import IntegrityError, transaction

logger = logging.getLogger(__name__)

# Standard placeholder values to ignore
INVALID_PLACEHOLDERS = {
    'NA', 'N/A', 'NIL', 'NONE', 'NULL', 'UNDEFINED', 'TEST', 'UNKNOWN', '0', '-'
}

# Fake/Temporary email domains to ignore during deduplication lookup
IGNORE_EMAIL_DOMAINS = (
    '@webhook.temp',
    '@example.com',
    '@test.com',
    '@temp.com',
)


def normalize_lead_phone(raw_phone: Optional[str]) -> str:
    """
    Standardize and clean phone numbers for lead ingestion and duplicate detection.
    Reuses existing core.models.normalize_phone_number() while filtering out
    invalid placeholders, prefixes (p:, p;), and blank strings.
    """
    if not raw_phone:
        return ''
    
    val = str(raw_phone).strip()
    if not val:
        return ''
    
    # Strip common prefixes from CSVs/Forms
    val_lower = val.lower()
    if val_lower.startswith('p:'):
        val = val[2:].strip()
    elif val_lower.startswith('p;'):
        val = val[2:].strip()
    
    # Strip spaces and hyphens
    val_clean = val.replace(' ', '').replace('-', '').replace('(', '').replace(')', '')
    
    # Extract raw digits first
    raw_digits = ''.join(c for c in val_clean if c.isdigit())
    if not raw_digits or len(raw_digits) < 7:
        return ''
    
    # Reject strings of all zeros (e.g. 0000000000) or where only zeroes follow a country code
    if set(raw_digits) == {'0'}:
        return ''
    if raw_digits.startswith('91') and len(raw_digits) > 2 and set(raw_digits[2:]) == {'0'}:
        return ''
    if raw_digits.startswith('0') and set(raw_digits[1:]) == {'0'}:
        return ''
    
    # Check if placeholder
    if val_clean.upper() in INVALID_PLACEHOLDERS:
        return ''
    
    # Run through the standard CRM normalize_phone_number logic
    normalized = normalize_phone_number(val_clean)
    
    # Validate result digits
    digits = ''.join(c for c in normalized if c.isdigit())
    if not digits or len(digits) < 7:
        return ''
        
    return normalized


def normalize_lead_email(raw_email: Optional[str]) -> str:
    """
    Clean and lowercase email for duplicate detection.
    Filters out invalid placeholders, empty strings, and generated temporary domains.
    """
    if not raw_email:
        return ''
        
    val = str(raw_email).strip().lower()
    if not val or val.upper() in INVALID_PLACEHOLDERS:
        return ''
        
    # Check if this is a temporary/mock email
    for domain in IGNORE_EMAIL_DOMAINS:
        if domain in val:
            return ''
            
    # Basic email format check
    if '@' not in val or '.' not in val:
        return ''
        
    return val


def _get_phone_variants(clean_mobile: Optional[str]) -> list:
    if not clean_mobile:
        return []
    variants = [clean_mobile]
    digits = re.sub(r'\D', '', clean_mobile)
    if len(digits) >= 10:
        d10 = digits[-10:]
        for v in (f"+91{d10}", d10, f"91{d10}", f"0{d10}"):
            if v not in variants:
                variants.append(v)
    return variants


def _resolve_root_student(student: Optional[Student]) -> Optional[Student]:
    """
    Follows `duplicate_of` pointers to return the original non-duplicate root Student.
    Never returns a record whose lead_status is 'DUPLICATE'.
    """
    if not student:
        return None

    candidate = student
    visited = set()
    while candidate is not None and candidate.id not in visited:
        visited.add(candidate.id)
        if (getattr(candidate, 'lead_status', '') or '').upper() != 'DUPLICATE':
            return candidate
        candidate = getattr(candidate, 'duplicate_of', None)

    # Fallback if a legacy duplicate record had no duplicate_of pointer set
    clean_mobile = normalize_lead_phone(getattr(student, 'mobile', None))
    clean_email = normalize_lead_email(getattr(student, 'email', None))
    phone_variants = _get_phone_variants(clean_mobile)

    base_qs = Student.objects.exclude(lead_status__iexact='DUPLICATE')
    if phone_variants:
        root = base_qs.filter(mobile__in=phone_variants, is_active=True).order_by('id').first()
        if root:
            return root
    if clean_email:
        root = base_qs.filter(email__iexact=clean_email, is_active=True).order_by('id').first()
        if root:
            return root
    if phone_variants:
        root = base_qs.filter(mobile__in=phone_variants).order_by('-is_active', 'id').first()
        if root:
            return root
    if clean_email:
        root = base_qs.filter(email__iexact=clean_email).order_by('-is_active', 'id').first()
        if root:
            return root

    return None


def lookup_existing_student(mobile: Optional[str] = None, email: Optional[str] = None) -> Tuple[Optional[Student], Optional[str]]:
    """
    Centralized duplicate lookup for any incoming lead.
    
    Checks by normalized mobile number first, then by normalized email.
    Always resolves and returns the original root non-duplicate Student when available.
    
    Active/Inactive Student Priority Rule:
    - Active non-duplicate records (is_active=True) are matched with primary priority (oldest/original first).
    - If only duplicate records match, resolves their root non-duplicate lead.
    - If no active record exists, soft-deleted/inactive records (is_active=False)
      are matched secondarily to prevent duplicate User accounts or orphaned collisions.
      
    Returns:
        (existing_student_instance, match_reason_str) or (None, None)
    """
    clean_mobile = normalize_lead_phone(mobile)
    clean_email = normalize_lead_email(email)
    
    if not clean_mobile and not clean_email:
        return None, None

    phone_variants = _get_phone_variants(clean_mobile)
        
    # 1. Primary check against active non-duplicate records (is_active=True)
    if phone_variants:
        student = (
            Student.objects.filter(mobile__in=phone_variants, is_active=True)
            .exclude(lead_status__iexact='DUPLICATE')
            .order_by('id')
            .first()
        )
        if not student:
            dup_match = Student.objects.filter(mobile__in=phone_variants, is_active=True).order_by('id').first()
            if dup_match:
                student = _resolve_root_student(dup_match) or dup_match
        if student:
            return student, f"Duplicate mobile: {clean_mobile} (Original CRM ID: {student.crm_student_id})"
            
    if clean_email:
        student = (
            Student.objects.filter(email__iexact=clean_email, is_active=True)
            .exclude(lead_status__iexact='DUPLICATE')
            .order_by('id')
            .first()
        )
        if not student:
            dup_match = Student.objects.filter(email__iexact=clean_email, is_active=True).order_by('id').first()
            if dup_match:
                student = _resolve_root_student(dup_match) or dup_match
        if student:
            return student, f"Duplicate email: {clean_email} (Original CRM ID: {student.crm_student_id})"
            
    # 2. Secondary check against inactive / soft-deleted records (is_active=False)
    if phone_variants:
        inactive_student = (
            Student.objects.filter(mobile__in=phone_variants)
            .exclude(lead_status__iexact='DUPLICATE')
            .order_by('-is_active', 'id')
            .first()
        )
        if not inactive_student:
            dup_match = Student.objects.filter(mobile__in=phone_variants).order_by('-is_active', 'id').first()
            if dup_match:
                inactive_student = _resolve_root_student(dup_match) or dup_match
        if inactive_student:
            return inactive_student, f"Duplicate mobile (Inactive Lead): {clean_mobile} (Original CRM ID: {inactive_student.crm_student_id})"
            
    if clean_email:
        inactive_student = (
            Student.objects.filter(email__iexact=clean_email)
            .exclude(lead_status__iexact='DUPLICATE')
            .order_by('-is_active', 'id')
            .first()
        )
        if not inactive_student:
            dup_match = Student.objects.filter(email__iexact=clean_email).order_by('-is_active', 'id').first()
            if dup_match:
                inactive_student = _resolve_root_student(dup_match) or dup_match
        if inactive_student:
            return inactive_student, f"Duplicate email (Inactive Lead): {clean_email} (Original CRM ID: {inactive_student.crm_student_id})"
            
    return None, None


def record_reengagement_interaction(
    student: Student,
    source_name: str,
    campaign_name: Optional[str] = None,
    event_id: Optional[str] = None,
    notes: Optional[str] = None,
    duplicate_reason: Optional[str] = None,
    extra_notes: Optional[str] = None,
    **kwargs
) -> Optional[LeadInteraction]:
    """
    Record a re-engagement interaction.

    Event-based idempotency is enforced by the database unique constraint
    on source_name + source_event_id.
    """
    if not student:
        return None

    source_name = (source_name or "Unknown").strip()
    event_id = str(event_id).strip() if event_id else None

    details = extra_notes or notes or kwargs.get('detail')

    parts = [f"Re-engaged lead from {source_name}."]

    if campaign_name:
        parts.append(f"Campaign: {campaign_name}.")

    if event_id:
        parts.append(f"[Event ID: {event_id}]")

    if duplicate_reason:
        parts.append(duplicate_reason)

    if details:
        parts.append(f"Details: {details}")

    full_note = " ".join(parts).strip()

    # Existing exact-note protection for callers without event IDs.
    if LeadInteraction.objects.filter(
        student=student,
        notes=full_note
    ).exists():
        logger.info(
            "Skipping duplicate interaction for student %s.",
            student.id
        )
        return None

    try:
        with transaction.atomic():
            interaction = LeadInteraction.objects.create(
                student=student,
                author=None,
                interaction_type='NOTE',
                notes=full_note,
                source_name=source_name,
                source_event_id=event_id,
            )

        return interaction

    except IntegrityError:
        # Confirm that the conflict was caused by an already-recorded
        # external event. Re-raise unrelated database integrity errors.
        if event_id and LeadInteraction.objects.filter(
            source_name=source_name,
            source_event_id=event_id,
        ).exists():
            logger.info(
                "Skipping duplicate event %s from %s.",
                event_id,
                source_name
            )
            return None

        raise


def create_duplicate_lead(
    existing_student: Optional[Student] = None,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    mobile: Optional[str] = None,
    email: Optional[str] = None,
    campaign: Optional[object] = None,
    program: Optional[object] = None,
    sales_section: Optional[str] = None,
    source_name: Optional[str] = None,
    event_id: Optional[str] = None,
    duplicate_reason: Optional[str] = None,
    meta_lead_id: Optional[str] = None,
    extra_fields: Optional[dict] = None,
    log_reengagement: bool = False,
) -> Student:
    """
    Creates a new Student/CRM lead record for an incoming duplicate lead.

    Guarantees:
    - lead_status = 'DUPLICATE'
    - assigned_to = None
    - Unique User account created (OneToOne with Student)
    - crm_student_id generated
    - Preserves campaign, sales_section, program, and source metadata
    - Optionally logs re-engagement interaction against the original existing_student
    - Original student remains completely unchanged
    """
    from django.contrib.auth import get_user_model
    from django.db import transaction
    import uuid

    User = get_user_model()

    clean_mobile = normalize_lead_phone(mobile)
    clean_email = normalize_lead_email(email)

    root_student = _resolve_root_student(existing_student)
    target_original = root_student or existing_student

    # 1. Optionally log re-engagement on the original student
    if log_reengagement and target_original and source_name:
        record_reengagement_interaction(
            student=target_original,
            source_name=source_name,
            campaign_name=campaign.name if campaign and hasattr(campaign, 'name') else None,
            event_id=str(event_id) if event_id else None,
            duplicate_reason=duplicate_reason,
        )

    fname = (first_name or (target_original.first_name if target_original else '') or 'Lead').strip()
    lname = (last_name or (target_original.last_name if target_original else '') or '').strip()

    # 2. Generate unique username for the duplicate Student's User
    base_ident = clean_mobile or clean_email or fname
    clean_ident = re.sub(r'[^\w@+\.-]', '_', str(base_ident))
    unique_suffix = uuid.uuid4().hex[:8]
    username = f"dup_{clean_ident}_{unique_suffix}"[:150]

    # 3. Resolve Program
    from core.models import Program
    resolved_program = program
    if not resolved_program:
        if campaign and getattr(campaign, 'section', None) == 'CAREER_ACADEMY':
            resolved_program = Program.objects.filter(name='Natya Career Academy').first()
        elif campaign and getattr(campaign, 'section', None) == 'REGULAR':
            resolved_program = Program.objects.filter(name='Natya').first()
        if not resolved_program and target_original and target_original.program_type:
            resolved_program = target_original.program_type
        if not resolved_program:
            resolved_program = Program.objects.exclude(name="Wise Import").first() or Program.objects.first()

    # 4. Resolve Sales Section
    resolved_section = sales_section
    if not resolved_section:
        if campaign and getattr(campaign, 'section', None):
            resolved_section = campaign.section
        elif target_original and target_original.sales_section:
            resolved_section = target_original.sales_section
        else:
            resolved_section = 'BOTH'

    # 5. Generate unique CRM ID
    with transaction.atomic():
        crm_id = Student.generate_next_crm_id()

        user = User.objects.create_user(
            username=username,
            email=clean_email or (email if email else '') or '',
            first_name=fname,
            last_name=lname,
            role='STUDENT',
        )
        user.set_unusable_password()
        user.save(update_fields=['password'])


        student_kwargs = {
            'user': user,
            'crm_student_id': crm_id,
            'first_name': fname,
            'last_name': lname,
            'email': clean_email or (email if email else None),
            'mobile': clean_mobile or (mobile if mobile else None),
            'program_type': resolved_program,
            'campaign': campaign,
            'duplicate_of': root_student,
            'sales_section': resolved_section,
            'lead_status': 'DUPLICATE',
            'assigned_to': None,
            'is_active': True,
        }

        if meta_lead_id:
            student_kwargs['meta_lead_id'] = meta_lead_id

        if extra_fields:
            for k, v in extra_fields.items():
                if hasattr(Student, k):
                    student_kwargs[k] = v

        duplicate_student = Student.objects.create(**student_kwargs)

    logger.info(f"Created DUPLICATE lead {duplicate_student.crm_student_id} for incoming duplicate (Original CRM ID: {root_student.crm_student_id if root_student else 'N/A'})")
    return duplicate_student
