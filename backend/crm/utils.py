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
    active_students = matching_students.filter(is_active=True).exclude(lead_status__iexact='DUPLICATE')
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


def resolve_date_preset(date_preset, start_date=None, end_date=None):
    """
    Standard resolver for CRM date presets.
    Given date_preset (e.g. 'today', 'yesterday', 'this_week', 'this_month', 'last_7_days', 'last_30_days', 'last_month')
    and optional start_date/end_date strings, returns a tuple (start_date_str, end_date_str).
    """
    from datetime import timedelta
    from django.utils import timezone

    if not date_preset and (start_date or end_date):
        return (start_date or None, end_date or None)

    today = timezone.now().date()
    if date_preset == 'today':
        return (str(today), str(today))
    elif date_preset == 'yesterday':
        yesterday = today - timedelta(days=1)
        return (str(yesterday), str(yesterday))
    elif date_preset == 'this_week':
        week_start = today - timedelta(days=today.weekday())
        return (str(week_start), str(today))
    elif date_preset == 'this_month':
        month_start = today.replace(day=1)
        return (str(month_start), str(today))
    elif date_preset == 'last_7_days':
        start = today - timedelta(days=6)
        return (str(start), str(today))
    elif date_preset == 'last_30_days':
        start = today - timedelta(days=29)
        return (str(start), str(today))
    elif date_preset == 'last_month':
        first_of_this_month = today.replace(day=1)
        last_day_last_month = first_of_this_month - timedelta(days=1)
        first_day_last_month = last_day_last_month.replace(day=1)
        return (str(first_day_last_month), str(last_day_last_month))

    return (start_date or None, end_date or None)


def get_new_stage_values():
    """All lead_status values that mean the lead is still in the NEW stage."""
    from .models import PipelineStage
    canonical_id = get_canonical_new_lead_stage_id()
    values = {'NEW', 'new', 'New', 'New Lead', 'NEW LEAD', 'new lead', canonical_id}
    for stage in PipelineStage.objects.filter(Q(name__iregex=r'^new( lead)?$') | Q(order=1) | Q(is_default=True)):
        name_lower = (stage.name or '').strip().lower()
        if any(neg in name_lower for neg in ['uncontacted', 'contacted', 'follow', 'convert', 'enroll', 'drop', 'lost', 'duplicate']):
            continue
        values.add(str(stage.id))
        if stage.name:
            values.add(stage.name)

    excluded_codes = {
        'UNCONTACTED', 'uncontacted', 'Uncontacted',
        'CONTACTED', 'contacted', 'Contacted',
        'FOLLOW_UP', 'follow_up', 'Follow-up', 'Follow-Up', 'follow-up',
        'PAYMENT_PENDING', 'payment_pending', 'Payment Pending',
        'CONVERTED', 'converted', 'Converted',
        'ENROLLED', 'enrolled', 'Enrolled',
        'DROPPED', 'dropped', 'Dropped',
        'LOST', 'lost', 'Lost',
        'DUPLICATE', 'duplicate', 'Duplicate'
    }
    values.difference_update(excluded_codes)
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



class ResolvedStatus:
    """Represents the normalized outcome of resolving a lead_status value."""
    def __init__(self, raw_status, stage_id=None, stage_name=None, is_resolved=False, is_duplicate=False):
        self.raw_status = str(raw_status) if raw_status is not None else ""
        self.stage_id = str(stage_id) if stage_id is not None else None
        self.stage_name = stage_name or (f"Unresolved ({self.raw_status})" if self.raw_status else "Unresolved")
        self.is_resolved = bool(is_resolved)
        self.is_duplicate = bool(is_duplicate)

    def to_dict(self):
        return {
            "raw_status": self.raw_status,
            "stage_id": self.stage_id,
            "stage_name": self.stage_name,
            "is_resolved": self.is_resolved,
            "is_duplicate": self.is_duplicate,
        }

    def __repr__(self):
        return f"<ResolvedStatus raw={self.raw_status!r} id={self.stage_id!r} name={self.stage_name!r} resolved={self.is_resolved}>"


class LeadStatusResolver:
    """
    Centralized, robust status-resolution utility.
    Resolves:
    - Numeric stage IDs matching an actual PipelineStage.id in the current database.
    - Case-insensitive PipelineStage names matching an existing stage.
    - Supported legacy enum codes (NEW, FOLLOW_UP, PAYMENT_PENDING, CONVERTED, ENROLLED, DROPPED, LOST, DUPLICATE).
    - Preserves raw status for unrecognized or orphaned values without guessing or silent reclassification.
    - Handles duplicate and ambiguous stage names safely.
    """
    def __init__(self, stages=None):
        if stages is not None:
            self.stages = list(stages)
        else:
            from .models import PipelineStage
            self.stages = list(PipelineStage.objects.all().order_by('order', 'id'))

        self.stages_by_id = {str(s.id): s for s in self.stages}

        # Track duplicate names to prevent ambiguous name resolution
        self.stages_by_name = {}
        self.ambiguous_names = set()
        for s in self.stages:
            if s.name:
                key = s.name.strip().lower()
                if key in self.stages_by_name:
                    self.ambiguous_names.add(key)
                else:
                    self.stages_by_name[key] = s

        self.canonical_new = self._resolve_canonical_new()
        self.canonical_converted = self._resolve_canonical_converted()
        self.canonical_dropped = self._resolve_canonical_dropped()

    def _resolve_canonical_new(self):
        import re
        exact_matches = [s for s in self.stages if (s.name or '').strip().lower() == 'new lead']
        if len(exact_matches) == 1:
            return exact_matches[0]
        elif len(exact_matches) > 1:
            return None

        default_stages = [s for s in self.stages if getattr(s, 'is_default', False)]
        if len(default_stages) == 1:
            return default_stages[0]
        elif len(default_stages) > 1:
            return None

        pattern_matches = [s for s in self.stages if re.match(r'^new( lead)?$', (s.name or '').strip(), re.I)]
        if len(pattern_matches) == 1:
            return pattern_matches[0]
        elif len(pattern_matches) > 1:
            return None

        if len(self.stages) == 1:
            return self.stages[0]
        return None

    def _resolve_canonical_converted(self):
        exact_conv = [s for s in self.stages if (s.name or '').strip().lower() in ['converted', 'enrolled']]
        if len(exact_conv) == 1:
            return exact_conv[0]
        elif len(exact_conv) > 1:
            return None

        broader = [s for s in self.stages if any(w in (s.name or '').lower() for w in ['convert', 'enroll'])]
        if len(broader) == 1:
            return broader[0]
        return None

    def _resolve_canonical_dropped(self):
        exact_drop = [s for s in self.stages if (s.name or '').strip().lower() in ['dropped', 'lost']]
        if len(exact_drop) == 1:
            return exact_drop[0]
        elif len(exact_drop) > 1:
            return None

        broader = [s for s in self.stages if any(w in (s.name or '').lower() for w in ['drop', 'lost'])]
        if len(broader) == 1:
            return broader[0]
        return None

    def resolve(self, raw_status) -> ResolvedStatus:
        if raw_status is None:
            return ResolvedStatus(raw_status=None, stage_id=None, stage_name="Unresolved (None)", is_resolved=False)

        raw_str = str(raw_status).strip()
        raw_upper = raw_str.upper()

        if not raw_str:
            return ResolvedStatus(raw_status="", stage_id=None, stage_name="Unresolved (Empty)", is_resolved=False)

        # 1. DUPLICATE pseudo-status
        if raw_upper == 'DUPLICATE':
            return ResolvedStatus(raw_status=raw_str, stage_id=None, stage_name="Duplicate Lead", is_resolved=True, is_duplicate=True)

        # 2. Exact Numeric ID Match against current database
        if raw_str.isdigit():
            if raw_str in self.stages_by_id:
                stage = self.stages_by_id[raw_str]
                return ResolvedStatus(raw_status=raw_str, stage_id=str(stage.id), stage_name=stage.name, is_resolved=True)
            else:
                # Numeric ID not present in current database: DO NOT GUESS ID 1 or 2!
                # Preserve raw value explicitly as unresolved
                return ResolvedStatus(raw_status=raw_str, stage_id=None, stage_name=f"Unresolved ({raw_str})", is_resolved=False)

        # 3. Direct Case-Insensitive Stage Name Match
        name_key = raw_str.lower()
        if name_key in self.ambiguous_names:
            return ResolvedStatus(raw_status=raw_str, stage_id=None, stage_name=f"Ambiguous ({raw_str})", is_resolved=False)
        if name_key in self.stages_by_name:
            stage = self.stages_by_name[name_key]
            return ResolvedStatus(raw_status=raw_str, stage_id=str(stage.id), stage_name=stage.name, is_resolved=True)

        # 4. Known Legacy Enum Codes
        if raw_upper in ['NEW', 'DEFAULT']:
            if self.canonical_new:
                return ResolvedStatus(raw_status=raw_str, stage_id=str(self.canonical_new.id), stage_name=self.canonical_new.name, is_resolved=True)
            return ResolvedStatus(raw_status=raw_str, stage_id=None, stage_name="Unresolved (NEW)", is_resolved=False)

        if raw_upper in ['FOLLOW_UP', 'FOLLOWUP', 'FOLLOW-UP']:
            exact_follow = [s for s in self.stages if (s.name or '').strip().lower() in ['follow-up', 'follow up', 'followup']]
            if len(exact_follow) == 1:
                s = exact_follow[0]
                return ResolvedStatus(raw_status=raw_str, stage_id=str(s.id), stage_name=s.name, is_resolved=True)
            elif len(exact_follow) > 1:
                return ResolvedStatus(raw_status=raw_str, stage_id=None, stage_name="Ambiguous (Follow-up)", is_resolved=False)

            broader = [s for s in self.stages if 'follow' in (s.name or '').lower()]
            if len(broader) == 1:
                s = broader[0]
                return ResolvedStatus(raw_status=raw_str, stage_id=str(s.id), stage_name=s.name, is_resolved=True)
            elif len(broader) > 1:
                return ResolvedStatus(raw_status=raw_str, stage_id=None, stage_name="Ambiguous (Follow-up)", is_resolved=False)

            return ResolvedStatus(raw_status=raw_str, stage_id=None, stage_name="Unresolved (Follow-up)", is_resolved=False)

        if raw_upper in ['PAYMENT_PENDING', 'PAYMENT-PENDING']:
            exact_pay = [s for s in self.stages if (s.name or '').strip().lower() in ['payment pending', 'payment-pending']]
            if len(exact_pay) == 1:
                s = exact_pay[0]
                return ResolvedStatus(raw_status=raw_str, stage_id=str(s.id), stage_name=s.name, is_resolved=True)
            elif len(exact_pay) > 1:
                return ResolvedStatus(raw_status=raw_str, stage_id=None, stage_name="Ambiguous (Payment Pending)", is_resolved=False)

            broader = [s for s in self.stages if 'payment' in (s.name or '').lower()]
            if len(broader) == 1:
                s = broader[0]
                return ResolvedStatus(raw_status=raw_str, stage_id=str(s.id), stage_name=s.name, is_resolved=True)
            elif len(broader) > 1:
                return ResolvedStatus(raw_status=raw_str, stage_id=None, stage_name="Ambiguous (Payment Pending)", is_resolved=False)

            return ResolvedStatus(raw_status=raw_str, stage_id=None, stage_name="Unresolved (Payment Pending)", is_resolved=False)

        if raw_upper in ['CONVERTED', 'ENROLLED']:
            if self.canonical_converted:
                return ResolvedStatus(raw_status=raw_str, stage_id=str(self.canonical_converted.id), stage_name=self.canonical_converted.name, is_resolved=True)
            return ResolvedStatus(raw_status=raw_str, stage_id=None, stage_name="Unresolved (Converted)", is_resolved=False)

        if raw_upper in ['DROPPED', 'LOST']:
            if self.canonical_dropped:
                return ResolvedStatus(raw_status=raw_str, stage_id=str(self.canonical_dropped.id), stage_name=self.canonical_dropped.name, is_resolved=True)
            return ResolvedStatus(raw_status=raw_str, stage_id=None, stage_name="Unresolved (Dropped)", is_resolved=False)

        # 5. Unrecognized string
        return ResolvedStatus(raw_status=raw_str, stage_id=None, stage_name=f"Unresolved ({raw_str})", is_resolved=False)


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

    resolver = LeadStatusResolver()
    resolved = resolver.resolve(status_str)

    matching_values = {status_str, status_upper}
    if resolved.is_resolved:
        if resolved.stage_id:
            matching_values.add(resolved.stage_id)
        if resolved.stage_name:
            matching_values.add(resolved.stage_name)
        standard_mapping = {
            'NEW': 'New Lead',
            'FOLLOW_UP': 'Follow-up',
            'PAYMENT_PENDING': 'Payment Pending',
            'ENROLLED': 'Converted',
            'CONVERTED': 'Converted',
            'DROPPED': 'Dropped',
        }
        name_to_legacy = {v.lower(): k for k, v in standard_mapping.items()}
        stage_name_lower = (resolved.stage_name or '').strip().lower()
        if stage_name_lower in name_to_legacy:
            matching_values.add(name_to_legacy[stage_name_lower])
        if any(w in stage_name_lower for w in ['convert', 'enroll']):
            matching_values.update(get_converted_stage_values())

    return list(matching_values)