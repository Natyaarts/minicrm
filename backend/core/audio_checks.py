"""Audio sanity checks for uploaded call recordings."""
import logging
import os
import re
import shutil
import subprocess
import tempfile

logger = logging.getLogger(__name__)

# Digital silence (e.g. a MIC recording muted by Android during a call) measures around -91 dB.
SILENCE_MAX_VOLUME_DB = -80.0
_MAX_VOLUME_RE = re.compile(r'max_volume:\s*(-?(?:\d+(?:\.\d+)?|inf))\s*dB')


def max_volume_db(uploaded_file, seconds=120, timeout=30):
    """Peak level of the first `seconds` of audio in dBFS, via ffmpeg volumedetect.

    Returns None when the level can't be measured (ffmpeg missing, undecodable file, timeout),
    so callers can skip the check instead of rejecting a recording they couldn't inspect.
    """
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        logger.warning("ffmpeg not found; skipping recording silence check")
        return None

    ext = os.path.splitext(getattr(uploaded_file, 'name', '') or '')[1] or '.m4a'
    fd, tmp_path = tempfile.mkstemp(suffix=ext)
    try:
        with os.fdopen(fd, 'wb') as tmp:
            uploaded_file.seek(0)
            for chunk in uploaded_file.chunks():
                tmp.write(chunk)
        uploaded_file.seek(0)

        proc = subprocess.run(
            [ffmpeg, '-hide_banner', '-nostats', '-t', str(seconds), '-i', tmp_path,
             '-af', 'volumedetect', '-vn', '-f', 'null', '-'],
            capture_output=True, text=True, timeout=timeout,
        )
        match = _MAX_VOLUME_RE.search(proc.stderr or '')
        if not match:
            logger.warning("Could not read max_volume from ffmpeg (exit %s)", proc.returncode)
            return None
        value = match.group(1)
        return float('-inf') if value == '-inf' else float(value)
    except (subprocess.TimeoutExpired, OSError) as exc:
        logger.warning("Recording silence check failed: %s", exc)
        return None
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


def is_silent_recording(uploaded_file):
    """True only when the recording was measured and is digital silence."""
    level = max_volume_db(uploaded_file)
    return level is not None and level < SILENCE_MAX_VOLUME_DB
