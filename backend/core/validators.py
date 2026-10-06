import os
import io
import zipfile
from PIL import Image
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _
from django.utils.deconstruct import deconstructible

# Maximum allowed file sizes
MAX_DOCUMENT_SIZE = 25 * 1024 * 1024       # 25 MB
MAX_IMAGE_SIZE = 10 * 1024 * 1024          # 10 MB
MAX_AUDIO_SIZE = 50 * 1024 * 1024          # 50 MB
MAX_SPREADSHEET_SIZE = 20 * 1024 * 1024    # 20 MB

# Document allowlists (Resumes, ID Proofs, Contracts, Tax Proofs, Student Docs)
DOCUMENT_ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx']
DOCUMENT_ALLOWED_MIMETYPES = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/pjpeg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream',
]

# Image allowlists (Raster only - STRICTLY NO SVG)
IMAGE_ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
IMAGE_ALLOWED_MIMETYPES = [
    'image/jpeg',
    'image/pjpeg',
    'image/png',
    'image/webp',
    'application/octet-stream',
]

# Receipt allowlists
RECEIPT_ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp']
RECEIPT_ALLOWED_MIMETYPES = [
    'application/pdf',
    'image/jpeg',
    'image/pjpeg',
    'image/png',
    'image/webp',
    'application/octet-stream',
]

# Audio allowlists
AUDIO_ALLOWED_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.ogg', '.webm', '.aac', '.amr', '.mp4']
AUDIO_ALLOWED_MIMETYPES = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/m4a',
    'audio/x-m4a',
    'audio/mp4',
    'audio/ogg',
    'audio/webm',
    'audio/aac',
    'audio/amr',
    'video/mp4',
    'application/octet-stream',
]

# Spreadsheet allowlists
SPREADSHEET_ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls']
SPREADSHEET_ALLOWED_MIMETYPES = [
    'text/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
]

# Batch Resource allowlists
BATCH_RESOURCE_ALLOWED_EXTENSIONS = [
    '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
    '.txt', '.csv', '.zip', '.png', '.jpg', '.jpeg', '.webp',
    '.mp4', '.mp3', '.m4a', '.wav'
]

# Explicitly prohibited dangerous extensions
PROHIBITED_EXTENSIONS = {
    '.svg', '.svgz', '.html', '.htm', '.xhtml', '.shtml',
    '.js', '.mjs', '.vbs', '.jsp', '.asp', '.aspx', '.php', '.phtml',
    '.exe', '.bat', '.cmd', '.sh', '.bash', '.bin', '.dll', '.com', '.scr',
    '.jar', '.py', '.pl', '.cgi', '.msi', '.hta'
}

# Dangerous substrings / patterns to scan for in text/header
DANGEROUS_CONTENT_PATTERNS = [
    b'<svg',
    b'xmlns="http://www.w3.org/2000/svg"',
    b"xmlns='http://www.w3.org/2000/svg'",
    b'<!doctype svg',
    b'<script',
    b'javascript:',
    b'onload=',
    b'onerror=',
    b'onclick=',
    b'onmouseover=',
    b'onfocus=',
    b'onblur=',
    b'<!doctype html',
    b'<html',
    b'<?php',
]


def check_for_dangerous_content(file):
    """
    Checks the beginning (up to 64KB) of the uploaded file for malicious markup,
    script tags, SVG signatures, or event handlers.
    """
    try:
        file.seek(0)
        chunk = file.read(65536)
    finally:
        file.seek(0)

    if not chunk:
        return

    chunk_lower = chunk.lower()
    for pattern in DANGEROUS_CONTENT_PATTERNS:
        if pattern in chunk_lower:
            if b'<svg' in pattern or b'http://www.w3.org/2000/svg' in pattern or b'<!doctype svg' in pattern:
                raise ValidationError(
                    _("SVG files and embedded SVG vectors are not permitted. Please upload a supported document (PDF, PNG, JPG, or DOC).")
                )
            if b'<script' in pattern or b'javascript:' in pattern or b'onload=' in pattern or b'onerror=' in pattern:
                raise ValidationError(
                    _("File contains potentially unsafe script content or active code.")
                )
            raise ValidationError(
                _("File contains prohibited content or active markup.")
            )


def validate_file_security(
    file,
    allowed_extensions,
    allowed_mimetypes=None,
    max_size_bytes=MAX_DOCUMENT_SIZE,
    file_type_name="document"
):
    """
    Core security validation function:
    1. Validates file presence and size.
    2. Validates filename extension against strict allowlist and prohibits SVG.
    3. Validates MIME type if available.
    4. Scans file content for dangerous active markup / scripts / SVG vectors.
    5. Validates magic bytes / format integrity for images, PDFs, ZIP/Office docs, and audio.
    """
    if not file:
        raise ValidationError(_("No file was provided."))

    # 1. Size Validation
    file_size = getattr(file, 'size', None)
    if file_size is None:
        try:
            file.seek(0, os.SEEK_END)
            file_size = file.tell()
            file.seek(0)
        except Exception:
            file_size = 0

    if file_size == 0:
        raise ValidationError(_("Uploaded file is empty."))

    if file_size > max_size_bytes:
        max_mb = max_size_bytes / (1024 * 1024)
        raise ValidationError(_(f"File size exceeds the maximum allowed limit of {max_mb:.0f} MB."))

    # 2. Filename & Extension Validation
    filename = getattr(file, 'name', '') or ''
    ext = os.path.splitext(filename)[1].lower()

    if not ext:
        raise ValidationError(_("File must have a valid file extension."))

    if ext in PROHIBITED_EXTENSIONS:
        if ext in ['.svg', '.svgz']:
            raise ValidationError(
                _("SVG files (.svg) are strictly prohibited due to security policies. Please upload a PDF, PNG, JPG, or DOC file.")
            )
        raise ValidationError(_(f"File type '{ext}' is prohibited for security reasons."))

    norm_allowed_exts = [e.lower() for e in allowed_extensions]
    if ext not in norm_allowed_exts:
        allowed_str = ", ".join(norm_allowed_exts)
        raise ValidationError(
            _(f"Unsupported file format '{ext}'. Allowed formats for {file_type_name} are: {allowed_str}")
        )

    # 3. MIME Type Validation
    content_type = getattr(file, 'content_type', '') or ''
    if content_type:
        content_type_lower = content_type.lower().split(';')[0].strip()
        if content_type_lower == 'image/svg+xml':
            raise ValidationError(
                _("SVG files (image/svg+xml) are not allowed. Please upload a PDF, PNG, JPG, or DOC file.")
            )
        if allowed_mimetypes:
            norm_allowed_mimes = [m.lower() for m in allowed_mimetypes]
            if content_type_lower not in norm_allowed_mimes:
                # If content_type is a generic stream, we rely heavily on deep magic byte inspection below
                if content_type_lower not in ['application/octet-stream', 'binary/octet-stream']:
                    pass  # Keep going to content inspection

    # 4. Prohibited Pattern & Dangerous Content Scanning
    check_for_dangerous_content(file)

    # 5. Magic Bytes & Format Verification
    try:
        file.seek(0)
        head = file.read(4096)
    finally:
        file.seek(0)

    # Format specific deep inspection
    if ext == '.pdf':
        # PDF files must contain %PDF- in header
        if b'%PDF-' not in head[:1024]:
            raise ValidationError(_("Invalid PDF file content. File does not contain a valid PDF header."))

    elif ext in ['.png', '.jpg', '.jpeg', '.webp']:
        # Raster image verification
        if ext == '.png' and not head.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValidationError(_("Invalid PNG file content. File does not match PNG signature."))
        if ext in ['.jpg', '.jpeg'] and not head.startswith(b'\xff\xd8\xff'):
            raise ValidationError(_("Invalid JPEG file content. File does not match JPEG signature."))
        if ext == '.webp' and (not head.startswith(b'RIFF') or head[8:12] != b'WEBP'):
            raise ValidationError(_("Invalid WEBP file content. File does not match WEBP signature."))

        # Pillow image integrity verification
        try:
            file.seek(0)
            with Image.open(file) as img:
                img_format = (img.format or '').upper()
                expected_format_map = {
                    '.png': 'PNG',
                    '.jpg': 'JPEG',
                    '.jpeg': 'JPEG',
                    '.webp': 'WEBP',
                }
                expected = expected_format_map.get(ext)
                if expected and img_format != expected:
                    raise ValidationError(_(f"File content ({img_format}) does not match extension '{ext}'."))
                img.verify()
        except ValidationError:
            raise
        except Exception:
            raise ValidationError(_("Corrupted or invalid image file."))
        finally:
            file.seek(0)

    elif ext in ['.docx', '.xlsx', '.pptx', '.zip']:
        # Office XML / ZIP verification
        if not (head.startswith(b'PK\x03\x04') or head.startswith(b'PK\x05\x06') or head.startswith(b'PK\x07\x08')):
            raise ValidationError(_(f"Invalid {ext.upper()} file content. Missing ZIP container header."))
        try:
            file.seek(0)
            with zipfile.ZipFile(file, 'r') as zf:
                # Test zip integrity
                bad_file = zf.testzip()
                if bad_file:
                    raise ValidationError(_(f"Corrupted archive member: {bad_file}"))
                # Check for prohibited files inside archive
                for member in zf.namelist():
                    m_ext = os.path.splitext(member)[1].lower()
                    if m_ext in PROHIBITED_EXTENSIONS:
                        raise ValidationError(_(f"Archive contains prohibited file type: {m_ext}"))
        except ValidationError:
            raise
        except Exception:
            raise ValidationError(_(f"Invalid {ext.upper()} archive file: file structure is corrupted or unreadable."))
        finally:
            file.seek(0)

    elif ext in ['.doc', '.xls', '.ppt']:
        # OLE2 Compound Document verification
        if not head.startswith(b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'):
            raise ValidationError(_(f"Invalid legacy {ext.upper()} document header."))

    elif ext in ['.mp3', '.wav', '.m4a', '.ogg', '.webm', '.aac', '.amr', '.mp4']:
        # Audio / Media verification
        is_valid_audio = False
        if ext == '.mp3' and (head.startswith(b'ID3') or head.startswith(b'\xff\xfb') or head.startswith(b'\xff\xf3') or head.startswith(b'\xff\xf2')):
            is_valid_audio = True
        elif ext == '.wav' and head.startswith(b'RIFF') and head[8:12] == b'WAVE':
            is_valid_audio = True
        elif ext in ['.m4a', '.mp4'] and (head[4:8] == b'ftyp' or head[:4] == b'ftyp'):
            is_valid_audio = True
        elif ext == '.ogg' and head.startswith(b'OggS'):
            is_valid_audio = True
        elif ext == '.webm' and head.startswith(b'\x1a\x45\xdf\xa3'):
            is_valid_audio = True
        elif ext in ['.aac', '.amr']:
            is_valid_audio = True  # AAC / AMR container formats

        if not is_valid_audio and ext in ['.mp3', '.wav', '.m4a', '.ogg', '.webm']:
            raise ValidationError(_(f"Invalid audio file content for format '{ext}'."))

    file.seek(0)
    return file


# Model-level and Serializer-level callable validators

@deconstructible
class FileSecurityValidator:
    def __init__(self, allowed_extensions=None, allowed_mimetypes=None, max_size_bytes=None, file_type_name="document"):
        self.allowed_extensions = allowed_extensions or DOCUMENT_ALLOWED_EXTENSIONS
        self.allowed_mimetypes = allowed_mimetypes
        self.max_size_bytes = max_size_bytes or MAX_DOCUMENT_SIZE
        self.file_type_name = file_type_name

    def __call__(self, file):
        return validate_file_security(
            file,
            allowed_extensions=self.allowed_extensions,
            allowed_mimetypes=self.allowed_mimetypes,
            max_size_bytes=self.max_size_bytes,
            file_type_name=self.file_type_name
        )

    def __eq__(self, other):
        return (
            isinstance(other, FileSecurityValidator) and
            self.allowed_extensions == other.allowed_extensions and
            self.allowed_mimetypes == other.allowed_mimetypes and
            self.max_size_bytes == other.max_size_bytes and
            self.file_type_name == other.file_type_name
        )


def validate_employee_document_file(file):
    """Validates Employee Lifecycle documents (PDF, PNG, JPG, JPEG, DOC, DOCX). Strictly prohibits SVG."""
    return validate_file_security(
        file,
        allowed_extensions=DOCUMENT_ALLOWED_EXTENSIONS,
        allowed_mimetypes=DOCUMENT_ALLOWED_MIMETYPES,
        max_size_bytes=MAX_DOCUMENT_SIZE,
        file_type_name="employee document"
    )


def validate_student_document_file(file):
    """Validates Student documents (PDF, PNG, JPG, JPEG, DOC, DOCX). Strictly prohibits SVG."""
    return validate_file_security(
        file,
        allowed_extensions=DOCUMENT_ALLOWED_EXTENSIONS,
        allowed_mimetypes=DOCUMENT_ALLOWED_MIMETYPES,
        max_size_bytes=MAX_DOCUMENT_SIZE,
        file_type_name="student document"
    )


def validate_profile_photo_file(file):
    """Validates Profile photos / Banners / Clock-in photos (JPG, JPEG, PNG, WEBP). Strictly prohibits SVG."""
    return validate_file_security(
        file,
        allowed_extensions=IMAGE_ALLOWED_EXTENSIONS,
        allowed_mimetypes=IMAGE_ALLOWED_MIMETYPES,
        max_size_bytes=MAX_IMAGE_SIZE,
        file_type_name="image"
    )


def validate_receipt_file(file):
    """Validates Expense and Transaction receipts (PDF, PNG, JPG, JPEG, WEBP). Strictly prohibits SVG."""
    return validate_file_security(
        file,
        allowed_extensions=RECEIPT_ALLOWED_EXTENSIONS,
        allowed_mimetypes=RECEIPT_ALLOWED_MIMETYPES,
        max_size_bytes=MAX_DOCUMENT_SIZE,
        file_type_name="receipt"
    )


def validate_batch_resource_file(file):
    """Validates Batch / Course learning resources. Strictly prohibits SVG, HTML, and scripts."""
    return validate_file_security(
        file,
        allowed_extensions=BATCH_RESOURCE_ALLOWED_EXTENSIONS,
        max_size_bytes=MAX_DOCUMENT_SIZE,
        file_type_name="course resource"
    )


def validate_tax_proof_file(file):
    """Validates Payroll Tax Declaration proofs (PDF, PNG, JPG, JPEG, DOC, DOCX). Strictly prohibits SVG."""
    return validate_file_security(
        file,
        allowed_extensions=DOCUMENT_ALLOWED_EXTENSIONS,
        allowed_mimetypes=DOCUMENT_ALLOWED_MIMETYPES,
        max_size_bytes=MAX_DOCUMENT_SIZE,
        file_type_name="tax declaration proof"
    )


def validate_audio_recording_file(file):
    """Validates Call audio recordings (MP3, WAV, M4A, OGG, WEBM, AAC, AMR, MP4)."""
    return validate_file_security(
        file,
        allowed_extensions=AUDIO_ALLOWED_EXTENSIONS,
        allowed_mimetypes=AUDIO_ALLOWED_MIMETYPES,
        max_size_bytes=MAX_AUDIO_SIZE,
        file_type_name="audio recording"
    )


def validate_spreadsheet_file(file):
    """Validates Bulk Upload Spreadsheets (CSV, XLSX, XLS)."""
    return validate_file_security(
        file,
        allowed_extensions=SPREADSHEET_ALLOWED_EXTENSIONS,
        allowed_mimetypes=SPREADSHEET_ALLOWED_MIMETYPES,
        max_size_bytes=MAX_SPREADSHEET_SIZE,
        file_type_name="spreadsheet"
    )
