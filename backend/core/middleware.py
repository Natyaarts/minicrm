"""
Security Headers & Clickjacking Protection Middleware (VA-003 & VA-006 Remediation).
Enforces strict X-Frame-Options, Content-Security-Policy (frame-ancestors 'none'),
X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS (for HTTPS),
and sensitive Cache-Control headers across all HTTP responses, including APIs, admin,
and error responses.
"""

import os
import re

DEFAULT_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://connect.facebook.net https://checkout.razorpay.com; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "img-src 'self' data: blob: https://natyaarts.org https://www.natyaarts.org https://razorpay.com https://*.razorpay.com https://*.facebook.com https://*.fbcdn.net https://*.s3.amazonaws.com https://*.amazonaws.com; "
    "font-src 'self' data: https://fonts.gstatic.com; "
    "connect-src 'self' https://natyaarts.org https://www.natyaarts.org http://13.232.192.160:5173 http://13.232.192.160 https://api.razorpay.com https://*.razorpay.com https://connect.facebook.net https://www.facebook.com https://*.s3.amazonaws.com https://*.amazonaws.com ws: wss:; "
    "frame-src 'self' https://checkout.razorpay.com https://api.razorpay.com https://*.razorpay.com; "
    "media-src 'self' blob: data: https://natyaarts.org https://*.s3.amazonaws.com; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "form-action 'self' https://*.razorpay.com; "
    "frame-ancestors 'none';"
)

DEFAULT_PERMISSIONS_POLICY = (
    "camera=(self), geolocation=(self), microphone=(), "
    "payment=(self \"https://checkout.razorpay.com\"), "
    "usb=(), display-capture=(), accelerometer=(), gyroscope=(), magnetometer=()"
)


class SecurityHeadersMiddleware:
    """
    Middleware to attach defensive security headers:
    1. X-Frame-Options: DENY
       (Legacy defense for older browsers)
    2. Content-Security-Policy: ... frame-ancestors 'none';
       (Unambiguously prevents framing of application endpoints/pages by ANY origin, including same-origin)
    3. X-Content-Type-Options: nosniff
       (Prevents MIME-confusion attacks)
    4. Referrer-Policy: strict-origin-when-cross-origin
       (Controls referrer leakage)
    5. Permissions-Policy: camera=(self), geolocation=(self), ...
       (Restricts browser capabilities and APIs)
    6. Strict-Transport-Security: max-age=31536000; includeSubDomains
       (Enforced for HTTPS connections)
    7. Cache-Control: no-store, no-cache, must-revalidate, private
       (Enforced for API, Admin, Auth, and sensitive data endpoints)
    8. Header Sanitation
       (Removes identifying server/framework headers like X-Powered-By)
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        # 1. Enforce Clickjacking Protection: X-Frame-Options
        response['X-Frame-Options'] = 'DENY'

        # 2. Enforce Content-Security-Policy (with unambiguous frame-ancestors 'none')
        existing_csp = response.get('Content-Security-Policy', '')
        if existing_csp:
            if re.search(r'\bframe-ancestors\s+[^;]+', existing_csp):
                clean_csp = re.sub(r'\bframe-ancestors\s+[^;]+', "frame-ancestors 'none'", existing_csp)
                response['Content-Security-Policy'] = clean_csp
            else:
                response['Content-Security-Policy'] = f"{existing_csp.rstrip('; ')}; frame-ancestors 'none';"
        else:
            response['Content-Security-Policy'] = DEFAULT_CSP

        # 3. Enforce MIME Sniffing Protection
        response['X-Content-Type-Options'] = 'nosniff'

        # 4. Enforce Referrer-Policy
        response['Referrer-Policy'] = 'strict-origin-when-cross-origin'

        # 5. Enforce Permissions-Policy
        if 'Permissions-Policy' not in response:
            response['Permissions-Policy'] = DEFAULT_PERMISSIONS_POLICY

        # 6. Enforce Strict-Transport-Security (HSTS) on HTTPS connections
        is_https = request.is_secure() or request.META.get('HTTP_X_FORWARDED_PROTO') == 'https' or os.getenv('ENABLE_HSTS', 'False').lower() in ('true', '1', 't')
        if is_https:
            if 'Strict-Transport-Security' not in response:
                response['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'

        # 7. Enforce Defensive Cache-Control on API, Auth, Admin & Authenticated Responses
        path = getattr(request, 'path_info', getattr(request, 'path', ''))
        is_api_or_auth = path.startswith('/api/') or path.startswith('/admin/') or '/auth/' in path
        is_authenticated = getattr(request, 'user', None) and request.user.is_authenticated

        if is_api_or_auth or is_authenticated:
            existing_cache = response.get('Cache-Control', '')
            if not existing_cache or 'public' in existing_cache or 'no-store' not in existing_cache:
                response['Cache-Control'] = 'no-store, no-cache, must-revalidate, private'
            if 'Pragma' not in response:
                response['Pragma'] = 'no-cache'
            if 'Expires' not in response:
                response['Expires'] = '0'

        # 8. Remove or sanitize server identification and framework headers (VA-007)
        tech_headers = [
            'X-Powered-By',
            'Server',
            'X-AspNet-Version',
            'X-AspNetMvc-Version',
            'X-Runtime',
            'X-Version',
            'X-Generator',
            'X-Backend-Server',
        ]
        for header in tech_headers:
            if header in response:
                del response[header]

        return response
