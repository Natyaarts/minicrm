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
    """
    import hashlib
    if not file_obj:
        return ""
    try:
        h = hashlib.sha256()
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
                h.update(chunk)
            if hasattr(file_obj, 'seek'):
                file_obj.seek(pos)
        elif isinstance(file_obj, str):
            with open(file_obj, 'rb') as f:
                while True:
                    chunk = f.read(65536)
                    if not chunk:
                        break
                    h.update(chunk)
        elif isinstance(file_obj, bytes):
            h.update(file_obj)
        return h.hexdigest()
    except Exception:
        return ""
