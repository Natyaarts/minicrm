"""
Centralized Rate Limiting & Throttling Classes (VA-010 Remediation).
"""

from rest_framework.throttling import AnonRateThrottle, UserRateThrottle

SAFE_METHODS = ("GET", "HEAD", "OPTIONS")


class SecureAnonRateThrottle(AnonRateThrottle):
    """
    Anonymous throttle. Client IP comes from DRF's get_ident(), which
    honours REST_FRAMEWORK['NUM_PROXIES'] and can't be spoofed via
    a client-supplied X-Forwarded-For header.
    """
    pass


class LoginRateThrottle(SecureAnonRateThrottle):
    """5 requests per minute per IP."""
    scope = 'auth_login'


class PasswordChangeRateThrottle(UserRateThrottle):
    """5 requests per minute per user."""
    scope = 'auth_password_change'


class PublicFormSubmissionRateThrottle(SecureAnonRateThrottle):
    """20 requests per minute per IP."""
    scope = 'public_form'


class AnalyticsRateThrottle(UserRateThrottle):
    """60 requests per minute per user."""
    scope = 'analytics'


class BulkImportRateThrottle(UserRateThrottle):
    """10 requests per minute per user."""
    scope = 'bulk_upload'


class WriteRateThrottle(UserRateThrottle):
    """Sustained limit on POST/PUT/PATCH/DELETE. Rate: 'write' (30/min)."""
    scope = 'write'

    def allow_request(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return super().allow_request(request, view)


class WriteBurstThrottle(WriteRateThrottle):
    """Short-window limit that stops fast floods. Rate: 'write_burst' (5/sec)."""
    scope = 'write_burst'