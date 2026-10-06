"""
Centralized Rate Limiting & Throttling Classes (VA-010 Remediation).
Defines targeted throttle policies for authentication, credential modification,
public forms, expensive analytics, and bulk data processing.
"""

from rest_framework.throttling import AnonRateThrottle, UserRateThrottle, SimpleRateThrottle


def get_client_ip(request):
    """
    Safely extract client IP from request headers, respecting reverse proxy headers.
    """
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        # The first IP in the X-Forwarded-For chain is the client IP
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '127.0.0.1')


class SecureAnonRateThrottle(AnonRateThrottle):
    """
    Anonymous rate throttle using safe client IP resolution.
    """
    def get_ident(self, request):
        return get_client_ip(request)


class LoginRateThrottle(SecureAnonRateThrottle):
    """
    Strict rate throttle on authentication/login to prevent brute-force attacks.
    Rate: 5 requests per minute per IP.
    """
    scope = 'auth_login'


class PasswordChangeRateThrottle(UserRateThrottle):
    """
    Rate throttle on password changes to prevent credential abuse.
    Rate: 5 requests per minute per user.
    """
    scope = 'auth_password_change'


class PublicFormSubmissionRateThrottle(SecureAnonRateThrottle):
    """
    Rate throttle on public student applications & lead lookups to prevent spam.
    Rate: 20 requests per minute per IP.
    """
    scope = 'public_form'


class AnalyticsRateThrottle(UserRateThrottle):
    """
    Rate throttle on expensive analytics and aggregation queries.
    Rate: 60 requests per minute per user.
    """
    scope = 'analytics'


class BulkImportRateThrottle(UserRateThrottle):
    """
    Rate throttle on spreadsheet parsing and bulk operations.
    Rate: 10 requests per minute per user.
    """
    scope = 'bulk_upload'
