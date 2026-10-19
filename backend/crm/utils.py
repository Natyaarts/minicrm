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


def extract_audio_duration(file_obj) -> int:
    """
    Extracts the duration of an audio file in integer seconds.
    Supports M4A/MP4/3GP/AAC, MP3 (ID3v2 TLEN, Xing/Info), WAV, and other audio formats.
    Works with Django FieldFile, UploadedFile, file paths, or file-like objects.
    """
    import struct
    import io
    import wave

    if not file_obj:
        return 0
    try:
        data = None
        if hasattr(file_obj, 'open') and not hasattr(file_obj, 'read'):
            try:
                file_obj.open('rb')
            except Exception:
                pass

        if hasattr(file_obj, 'read'):
            pos = file_obj.tell() if hasattr(file_obj, 'tell') else 0
            data = file_obj.read(1048576)
            if hasattr(file_obj, 'seek'):
                file_obj.seek(pos)
        elif isinstance(file_obj, str):
            with open(file_obj, 'rb') as f:
                data = f.read(1048576)
        elif isinstance(file_obj, bytes):
            data = file_obj

        if not data or len(data) < 12:
            return 0

        # 1. WAV
        if data[:4] == b'RIFF' and data[8:12] == b'WAVE':
            try:
                with wave.open(io.BytesIO(data), 'rb') as w:
                    frames = w.getnframes()
                    rate = w.getframerate()
                    if rate > 0:
                        return int(round(frames / float(rate)))
            except Exception:
                pass

        # 2. MP4 / M4A / 3GP / AAC
        idx = data.find(b'mvhd')
        if idx != -1 and idx + 24 <= len(data):
            try:
                version = data[idx + 4]
                if version == 0 and idx + 24 <= len(data):
                    timescale, duration = struct.unpack('>II', data[idx + 16 : idx + 24])
                    if timescale > 0:
                        return int(round(duration / float(timescale)))
                elif version == 1 and idx + 36 <= len(data):
                    timescale = struct.unpack('>I', data[idx + 24 : idx + 28])[0]
                    duration = struct.unpack('>Q', data[idx + 28 : idx + 36])[0]
                    if timescale > 0:
                        return int(round(duration / float(timescale)))
            except Exception:
                pass

        # 3. MP3 ID3v2 TLEN frame (Length in ms)
        tlen_idx = data.find(b'TLEN')
        if tlen_idx != -1 and tlen_idx + 14 <= len(data):
            try:
                size = struct.unpack('>I', data[tlen_idx + 4 : tlen_idx + 8])[0]
                frame_data = data[tlen_idx + 10 : tlen_idx + 10 + min(size, 30)]
                digits = ''.join(chr(b) for b in frame_data if chr(b).isdigit())
                if digits:
                    ms = int(digits)
                    if ms > 0:
                        return int(round(ms / 1000.0))
            except Exception:
                pass

        # 4. MP3 Xing / Info header
        xing_idx = data.find(b'Xing')
        if xing_idx == -1:
            xing_idx = data.find(b'Info')
        if xing_idx != -1 and xing_idx + 16 <= len(data):
            try:
                flags = struct.unpack('>I', data[xing_idx + 4 : xing_idx + 8])[0]
                if flags & 0x0001:
                    frames = struct.unpack('>I', data[xing_idx + 8 : xing_idx + 12])[0]
                    sec = int(round(frames * 1152 / 44100.0))
                    if sec > 0:
                        return sec
            except Exception:
                pass

    except Exception:
        pass
    return 0


def compute_audio_hash(file_obj) -> str:
    """
    Computes a SHA-256 hash of the audio content for deduplication.
    Works with Django FieldFile, UploadedFile, file paths, or file-like objects.
    Returns empty string if file is empty or missing.
    """
    import hashlib
    if not file_obj:
        return ""
    try:
        if hasattr(file_obj, 'size') and file_obj.size == 0:
            return ""

        h = hashlib.sha256()
        total_bytes = 0
        if hasattr(file_obj, 'open') and not hasattr(file_obj, 'read'):
            try:
                file_obj.open('rb')
            except Exception:
                pass

        if hasattr(file_obj, 'read'):
            pos = file_obj.tell() if hasattr(file_obj, 'tell') else 0
            if hasattr(file_obj, 'seek'):
                file_obj.seek(0)
            while True:
                chunk = file_obj.read(65536)
                if not chunk:
                    break
                total_bytes += len(chunk)
                h.update(chunk)
            if hasattr(file_obj, 'seek'):
                file_obj.seek(pos)
        elif isinstance(file_obj, str):
            with open(file_obj, 'rb') as f:
                while True:
                    chunk = f.read(65536)
                    if not chunk:
                        break
                    total_bytes += len(chunk)
                    h.update(chunk)
        elif isinstance(file_obj, bytes):
            total_bytes = len(file_obj)
            h.update(file_obj)

        if total_bytes == 0:
            return ""

        digest = h.hexdigest()
        if digest == 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855':
            return ""
        return digest
    except Exception:
        return ""

def check_is_sales_manager(user) -> bool:
    """
    Checks if a user has Sales Manager / Team Lead / Executive permissions.
    Preserves the existing business rule:
    - User has explicit management/lead role (SALES_HEAD, SALES_MANAGER, MANAGER, SUPER_ADMIN, ADMIN, SALES_LEAD)
    - User has user.is_manager attribute/property set to True
    - User has HRMS profile with subordinates, or designation name containing 'lead', 'manager', 'vp', 'head', or 'director'
    """
    if not user or not user.is_authenticated:
        return False
    if getattr(user, 'role', '') in ['SALES_HEAD', 'SALES_MANAGER', 'MANAGER', 'SUPER_ADMIN', 'ADMIN', 'SALES_LEAD']:
        return True
    if getattr(user, 'is_manager', False):
        return True
    if hasattr(user, 'hrms_profile'):
        profile = user.hrms_profile
        if profile.subordinates.exists():
            return True
        if profile.designation and any(kw in profile.designation.name.lower() for kw in ['lead', 'manager', 'vp', 'head', 'director']):
            return True
    return False




def get_canonical_new_lead_stage():
    """
    Resolves the canonical 'New Lead' pipeline stage dynamically.
    Enforces the single canonical pipeline stage named 'New Lead'.
    Never assumes a hardcoded stage ID.
    Returns the PipelineStage model instance.
    """
    from .models import PipelineStage
    # 1. Exact match on 'New Lead'
    stage = PipelineStage.objects.filter(name__iexact='New Lead').first()
    if stage:
        return stage

    # 2. Match on 'New' and normalize to 'New Lead'
    stage = PipelineStage.objects.filter(name__iexact='New').first()
    if stage:
        stage.name = 'New Lead'
        stage.save(update_fields=['name'])
        return stage

    # 3. Match regex or is_default
    stage = PipelineStage.objects.filter(Q(name__iregex=r'^new( lead)?$') | Q(is_default=True)).order_by('order', 'id').first()
    if stage:
        return stage

    # 4. Fallback to order=1 or first stage
    stage = PipelineStage.objects.order_by('order', 'id').first()
    if stage:
        return stage

    # 5. Create if pipeline stages table is empty
    return PipelineStage.objects.create(name='New Lead', order=1, is_default=True)


def get_canonical_new_lead_stage_id() -> str:
    """Returns the string ID of the canonical 'New Lead' pipeline stage."""
    return str(get_canonical_new_lead_stage().id)


def get_canonical_converted_stage():
    """
    Resolves the canonical 'Converted' pipeline stage dynamically.
    Ensures 'Enrolled' is not maintained as a separate CRM pipeline stage.
    Returns the PipelineStage model instance.
    """
    from .models import PipelineStage
    # 1. Look for 'Converted' stage
    stage = PipelineStage.objects.filter(name__iexact='Converted').first()
    if stage:
        return stage

    # 2. If 'Enrolled' stage exists, rename it to 'Converted' to prevent a separate CRM pipeline stage
    enrolled_stage = PipelineStage.objects.filter(name__iexact='Enrolled').first()
    if enrolled_stage:
        enrolled_stage.name = 'Converted'
        enrolled_stage.save(update_fields=['name'])
        return enrolled_stage

    # 3. Look for any stage containing 'convert'
    stage = PipelineStage.objects.filter(name__icontains='convert').order_by('order', 'id').first()
    if stage:
        return stage

    # 4. Create Converted stage if missing
    order = 4
    last_stage = PipelineStage.objects.order_by('-order').first()
    if last_stage:
        order = last_stage.order + 1
    return PipelineStage.objects.create(name='Converted', order=order)


def get_canonical_converted_stage_id() -> str:
    """Returns the string ID of the canonical 'Converted' pipeline stage."""
    return str(get_canonical_converted_stage().id)


def get_converted_stage_values():
    """All lead_status values that mean converted/enrolled (ids, codes, names)."""
    from .models import PipelineStage
    canonical_id = get_canonical_converted_stage_id()
    values = {'ENROLLED', 'CONVERTED', 'enrolled', 'converted', 'Enrolled', 'Converted', canonical_id}
    for stage in PipelineStage.objects.filter(
        Q(name__icontains='convert') | Q(name__icontains='enroll')
    ):
        values.add(str(stage.id))
        if stage.name:
            values.add(stage.name)
    return list(values)


def get_new_stage_values():
    """All lead_status values that mean the lead is still in the NEW stage."""
    from .models import PipelineStage
    canonical_id = get_canonical_new_lead_stage_id()
    values = {'NEW', 'new', 'New', 'New Lead', 'NEW LEAD', 'new lead', canonical_id}
    for stage in PipelineStage.objects.filter(Q(name__iregex=r'^new( lead)?$') | Q(order=1) | Q(is_default=True)):
        values.add(str(stage.id))
        if stage.name:
            values.add(stage.name)
    return list(values)


def get_dropped_stage_values():
    """All lead_status values that mean dropped/lost (ids, codes, names)."""
    from .models import PipelineStage
    values = {'DROPPED', 'dropped', 'Dropped', 'LOST', 'lost', 'Lost'}
    for stage in PipelineStage.objects.filter(
        Q(name__icontains='drop') | Q(name__icontains='lost')
    ):
        values.add(str(stage.id))
        if stage.name:
            values.add(stage.name)
    return list(values)


def get_whatsapp_connected_stage_values():
    """
    All lead_status values (IDs, names) that represent a confirmed connection via WhatsApp.
    Excludes stages that represent only attempted/sent/initiated messages without confirmed connection.
    """
    from .models import PipelineStage
    values = set()
    for stage in PipelineStage.objects.all():
        name_lower = (stage.name or '').strip().lower()
        if 'whatsapp' in name_lower:
            # Exclude stages that only signify an attempted/sent message without connection
            if any(neg in name_lower for neg in ['attempt', 'sent', 'send', 'initiated', 'pending', 'undelivered', 'unread']):
                continue
            # Include stages indicating connection, discussion, reply, or explicit connection
            if any(pos in name_lower for pos in ['connect', 'replied', 'discussion', 'chat', 'engaged', 'responsive']) or name_lower == 'whatsapp':
                values.add(str(stage.id))
                values.add(stage.name)
    return list(values)



def resolve_stage_filter_values(status_param):
    """
    Given a lead_status filter parameter (e.g. '1', 'NEW', '2', 'FOLLOW_UP', 'CONVERTED', 'DROPPED'),
    returns a list of all equivalent database representations (IDs, enum codes, names).
    """
    if not status_param:
        return []

    status_str = str(status_param).strip()
    status_upper = status_str.upper()

    if status_upper in ['CONVERTED', 'ENROLLED']:
        return get_converted_stage_values()

    if status_upper in ['DROPPED', 'LOST']:
        return get_dropped_stage_values()

    new_stages = get_new_stage_values()
    if status_str in new_stages or status_upper in [s.upper() for s in new_stages]:
        return new_stages

    from .models import PipelineStage
    matching_values = {status_str, status_upper}

    standard_mapping = {
        'NEW': 'New Lead',
        'FOLLOW_UP': 'Follow-up',
        'PAYMENT_PENDING': 'Payment Pending',
        'ENROLLED': 'Converted',
        'CONVERTED': 'Converted',
        'DROPPED': 'Dropped',
    }
    name_to_legacy = {v.lower(): k for k, v in standard_mapping.items()}

    # 1. If it's a numeric PipelineStage ID
    if status_str.isdigit():
        stage = PipelineStage.objects.filter(id=int(status_str)).first()
        if stage:
            matching_values.add(str(stage.id))
            if stage.name:
                matching_values.add(stage.name)
                stage_name_lower = stage.name.strip().lower()
                if stage_name_lower in name_to_legacy:
                    matching_values.add(name_to_legacy[stage_name_lower])
                if any(w in stage_name_lower for w in ['convert', 'enroll']):
                    matching_values.update(get_converted_stage_values())
            return list(matching_values)

    # 2. If it's a legacy code (e.g. 'FOLLOW_UP', 'DROPPED')
    if status_upper in standard_mapping:
        stage_name = standard_mapping[status_upper]
        matching_values.add(stage_name)
        for stage in PipelineStage.objects.filter(name__iexact=stage_name):
            matching_values.add(str(stage.id))
            matching_values.add(stage.name)
        return list(matching_values)

    # 3. If it's a stage name string (e.g. 'Follow-up', 'In Discussion')
    stage = PipelineStage.objects.filter(name__iexact=status_str).first()
    if stage:
        matching_values.add(str(stage.id))
        matching_values.add(stage.name)
        stage_name_lower = stage.name.strip().lower()
        if stage_name_lower in name_to_legacy:
            matching_values.add(name_to_legacy[stage_name_lower])
        return list(matching_values)

    return list(matching_values)