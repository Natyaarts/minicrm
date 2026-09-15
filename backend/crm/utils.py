import re
from django.db.models import Q
from core.models import Student
from django.contrib.auth import get_user_model

def normalize_phone_for_matching(raw_val):
    """
    Normalizes a phone number for consistent search and matching:
    - Removes all formatting (spaces, hyphens, brackets, dots).
    - Removes common prefixes ('p:', 'p;', 'tel:').
    - Handles +91, 91, and leading 0.
    Returns a dict with:
      - 'canonical': '+91XXXXXXXXXX' (or '+<country><digits>')
      - 'last10': 'XXXXXXXXXX' (last 10 digits for local lookup)
      - 'raw_digits': all digits extracted
    """
    if not raw_val:
        return {'canonical': '', 'last10': '', 'raw_digits': ''}
    
    val_str = str(raw_val).strip()
    if val_str.lower().startswith(('p:', 'p;')):
        val_str = val_str[2:].strip()
    if val_str.lower().startswith('tel:'):
        val_str = val_str[4:].strip()
        
    digits = ''.join(c for c in val_str if c.isdigit())
    if not digits:
        return {'canonical': '', 'last10': '', 'raw_digits': ''}
        
    # Strip leading zeros
    clean_digits = digits
    if len(clean_digits) == 11 and clean_digits.startswith('0'):
        clean_digits = clean_digits[1:]
    elif len(clean_digits) == 12 and clean_digits.startswith('91'):
        clean_digits = clean_digits[2:]
        
    last10 = clean_digits[-10:] if len(clean_digits) >= 10 else clean_digits
    
    if len(clean_digits) == 10:
        canonical = f"+91{clean_digits}"
    elif len(digits) > 10:
        canonical = f"+{digits}"
    else:
        canonical = f"+91{clean_digits}"
        
    return {
        'canonical': canonical,
        'last10': last10,
        'raw_digits': digits
    }

def match_lead_by_phone(raw_phone):
    """
    Searches the ENTIRE CRM Student/Lead database for a matching student.
    - Decoupled from creation date (searches old leads, new leads, today's leads).
    - Decoupled from assignment status (searches assigned and unassigned leads).
    - Multi-field search (mobile, phone).
    - Prioritizes active leads and non-duplicates.
    Returns: (Student or None, is_matched: bool)
    """
    if not raw_phone:
        return None, False
        
    parsed = normalize_phone_for_matching(raw_phone)
    canonical = parsed['canonical']
    last10 = parsed['last10']
    
    if not last10:
        return None, False
        
    # Query all students matching the canonical or 10-digit suffix
    query = Q(mobile=canonical) | Q(mobile__endswith=last10)
    
    # Check if student model has phone field
    has_phone_field = any(f.name == 'phone' for f in Student._meta.fields)
    if has_phone_field:
        query = query | Q(phone=canonical) | Q(phone__endswith=last10)
        
    matching_students = Student.objects.filter(query)
    
    if not matching_students.exists():
        return None, False
        
    # Prioritize active, non-duplicate students
    active_students = matching_students.filter(is_active=True).exclude(lead_status='DUPLICATE')
    if active_students.exists():
        return active_students.order_by('-id').first(), True
        
    # Fallback to any matching student
    return matching_students.order_by('-id').first(), True

def match_agent_by_phone(raw_phone):
    """
    Attempts to identify the BDE / Sales Representative by their registered phone number.
    Returns: User instance or None
    """
    if not raw_phone:
        return None
    User = get_user_model()
    parsed = normalize_phone_for_matching(raw_phone)
    last10 = parsed['last10']
    if not last10:
        return None
        
    user = User.objects.filter(
        Q(phone_number=parsed['canonical']) | Q(phone_number__endswith=last10)
    ).first()
    return user
