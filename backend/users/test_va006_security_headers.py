from django.test import TestCase, Client, RequestFactory, override_settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.http import HttpResponse
from rest_framework import status
from rest_framework.authtoken.models import Token
from core.middleware import SecurityHeadersMiddleware, DEFAULT_CSP, DEFAULT_PERMISSIONS_POLICY

User = get_user_model()


class VA006SecurityHeadersTests(TestCase):
    """
    Automated Security Test Suite for VAPT Finding VA-006: Missing Security Headers.
    Verifies that all HTTP responses (including login, auth, API, admin, error routes,
    and all functional modules) consistently and immutably enforce all required
    defensive HTTP security headers.
    """

    def setUp(self):
        cache.clear()
        self.client = Client()
        self.factory = RequestFactory()
        self.user = User.objects.create_user(
            username='sec_headers_user',
            email='sec_headers@example.com',
            password='ComplexPassword123!',
            role='SUPER_ADMIN'
        )
        self.token = Token.objects.create(user=self.user)
        self.auth_headers = {'HTTP_AUTHORIZATION': f'Token {self.token.key}'}

        self.employee_user = User.objects.create_user(
            username='sec_employee_user',
            email='sec_emp@example.com',
            password='ComplexPassword123!',
            role='EMPLOYEE'
        )
        self.employee_token = Token.objects.create(user=self.employee_user)

    def _assert_baseline_security_headers(self, response, check_cache=True):
        """Helper to assert baseline security headers on any response."""
        # 1. X-Content-Type-Options
        self.assertEqual(
            response.headers.get('X-Content-Type-Options'),
            'nosniff',
            "Missing or incorrect X-Content-Type-Options header"
        )

        # 2. X-Frame-Options
        self.assertEqual(
            response.headers.get('X-Frame-Options'),
            'DENY',
            "Missing or incorrect X-Frame-Options header"
        )

        # 3. Content-Security-Policy
        csp = response.headers.get('Content-Security-Policy', '')
        self.assertTrue(csp, "Missing Content-Security-Policy header")
        self.assertIn("frame-ancestors 'none'", csp, "CSP must enforce frame-ancestors 'none'")
        self.assertNotIn("frame-ancestors 'self'", csp, "CSP must NOT permit frame-ancestors 'self'")
        self.assertNotIn("frame-ancestors *", csp, "CSP must NOT permit frame-ancestors *")

        # 4. Referrer-Policy
        self.assertEqual(
            response.headers.get('Referrer-Policy'),
            'strict-origin-when-cross-origin',
            "Missing or incorrect Referrer-Policy header"
        )

        # 5. Permissions-Policy
        pp = response.headers.get('Permissions-Policy', '')
        self.assertTrue(pp, "Missing Permissions-Policy header")
        self.assertIn("camera=(self)", pp)
        self.assertIn("geolocation=(self)", pp)
        self.assertIn("microphone=()", pp)

        # 6. Sensitive Cache-Control (if applicable)
        if check_cache:
            cache_control = response.headers.get('Cache-Control', '')
            self.assertIn('no-store', cache_control, f"Cache-Control should contain 'no-store': {cache_control}")
            self.assertIn('no-cache', cache_control, f"Cache-Control should contain 'no-cache': {cache_control}")
            self.assertEqual(response.headers.get('Pragma'), 'no-cache')

        # 7. No X-Powered-By leakage
        self.assertNotIn('X-Powered-By', response.headers)

    def test_01_public_login_endpoint_headers(self):
        """Test 1: Public authentication login endpoint returns all mandatory security headers."""
        res = self.client.post('/api/auth/login/', {
            'username': 'sec_headers_user',
            'password': 'ComplexPassword123!'
        }, content_type='application/json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self._assert_baseline_security_headers(res, check_cache=True)

    def test_02_authenticated_api_me_endpoint_headers(self):
        """Test 2: Authenticated user profile endpoint returns all mandatory security headers and no-store cache."""
        res = self.client.get('/api/auth/me/', **self.auth_headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self._assert_baseline_security_headers(res, check_cache=True)

    def test_03_admin_endpoint_headers(self):
        """Test 3: Django Admin endpoint returns all mandatory security headers."""
        res = self.client.get('/admin/login/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self._assert_baseline_security_headers(res, check_cache=True)

    def test_04_error_responses_contain_all_security_headers(self):
        """Test 4: Error responses (401, 403, 404, 405) maintain complete defensive headers."""
        # 401 Unauthorized
        res_401 = self.client.get('/api/auth/me/')
        self.assertEqual(res_401.status_code, status.HTTP_401_UNAUTHORIZED)
        self._assert_baseline_security_headers(res_401, check_cache=True)

        # 403 Forbidden
        res_403 = self.client.get(
            '/api/auth/management/users/',
            HTTP_AUTHORIZATION=f'Token {self.employee_token.key}'
        )
        self.assertEqual(res_403.status_code, status.HTTP_403_FORBIDDEN)
        self._assert_baseline_security_headers(res_403, check_cache=True)

        # 404 Not Found
        res_404 = self.client.get('/api/nonexistent-route-for-va006-testing/')
        self.assertEqual(res_404.status_code, status.HTTP_404_NOT_FOUND)
        self._assert_baseline_security_headers(res_404, check_cache=True)

        # 405 Method Not Allowed
        res_405 = self.client.put('/api/auth/login/', {})
        self.assertEqual(res_405.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self._assert_baseline_security_headers(res_405, check_cache=True)

    def test_05_hsts_enforced_on_https_requests(self):
        """Test 5: Strict-Transport-Security (HSTS) is emitted on HTTPS / proxy HTTPS requests."""
        # HTTPS request simulation via X-Forwarded-Proto
        res_https = self.client.get(
            '/api/auth/me/',
            HTTP_X_FORWARDED_PROTO='https',
            **self.auth_headers
        )
        self.assertEqual(res_https.status_code, status.HTTP_200_OK)
        hsts = res_https.headers.get('Strict-Transport-Security')
        self.assertIsNotNone(hsts, "HSTS must be present on HTTPS connections")
        self.assertIn('max-age=31536000', hsts)
        self.assertIn('includeSubDomains', hsts)

    def test_06_hsts_not_forced_on_plain_http_dev_environment(self):
        """Test 6: Plain HTTP requests in non-HSTS dev environment do not emit HSTS header."""
        res_http = self.client.get(
            '/api/auth/me/',
            **self.auth_headers
        )
        self.assertEqual(res_http.status_code, status.HTTP_200_OK)
        # In default dev mode without HTTPS or ENABLE_HSTS, HSTS is omitted for HTTP safety
        self.assertNotIn('Strict-Transport-Security', res_http.headers)

    def test_07_attacker_headers_cannot_manipulate_security_headers(self):
        """Test 7: Attacker-controlled headers (Origin, Referer, Host) cannot tamper with security headers."""
        malicious_headers = [
            {'HTTP_ORIGIN': 'https://evil-attacker.com'},
            {'HTTP_ORIGIN': 'null'},
            {'HTTP_REFERER': 'https://evil-attacker.com/exploit.html'},
            {'HTTP_HOST': 'evil-attacker.com'},
            {'HTTP_USER_AGENT': '<script>alert(1)</script>'},
        ]
        for headers in malicious_headers:
            res = self.client.get('/api/auth/me/', **self.auth_headers, **headers)
            self._assert_baseline_security_headers(res, check_cache=True)
            self.assertEqual(res.headers.get('X-Frame-Options'), 'DENY')
            self.assertEqual(res.headers.get('X-Content-Type-Options'), 'nosniff')
            self.assertEqual(res.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin')
            self.assertIn("frame-ancestors 'none'", res.headers.get('Content-Security-Policy', ''))
            self.assertNotIn('evil-attacker.com', res.headers.get('Content-Security-Policy', ''))

    def test_08_representative_endpoints_across_all_modules(self):
        """Test 8: Representative endpoints across CRM, HRMS, Finance, Payroll retain security headers."""
        endpoints = [
            ('/api/students/', 'GET'),                      # CRM / Students
            ('/api/crm/campaigns/', 'GET'),                 # CRM / Campaigns
            ('/api/hrms/departments/', 'GET'),              # HRMS / Departments
            ('/api/hrms/designations/', 'GET'),             # HRMS / Designations
            ('/api/finance/categories/', 'GET'),            # Finance / Categories
            ('/api/payroll/salary-structures/', 'GET'),     # Payroll / Salaries
            ('/api/leaves/types/', 'GET'),                  # Leaves / Types
            ('/api/notifications/', 'GET'),                 # Notifications
            ('/api/forms/fields/', 'GET'),                  # Forms Builder
        ]

        for url, method in endpoints:
            res = self.client.get(url, **self.auth_headers)
            self.assertIn(
                res.status_code,
                [status.HTTP_200_OK, status.HTTP_201_CREATED, status.HTTP_204_NO_CONTENT],
                f"Endpoint {url} failed with status {res.status_code}"
            )
            self._assert_baseline_security_headers(res, check_cache=True)

    def test_09_middleware_custom_csp_override_guarantees_frame_ancestors_none(self):
        """Test 9: Custom view CSP is preserved while strictly enforcing frame-ancestors 'none'."""
        def view_with_custom_csp(request):
            resp = HttpResponse("custom csp view")
            resp['Content-Security-Policy'] = "default-src https://custom.api.com; frame-ancestors 'self';"
            return resp

        middleware = SecurityHeadersMiddleware(view_with_custom_csp)
        req = self.factory.get('/custom-view/')
        resp = middleware(req)

        csp = resp.headers.get('Content-Security-Policy', '')
        self.assertIn("default-src https://custom.api.com", csp)
        self.assertIn("frame-ancestors 'none'", csp)
        self.assertNotIn("frame-ancestors 'self'", csp)

    def test_10_middleware_strips_server_and_x_powered_by_headers(self):
        """Test 10: Server and X-Powered-By headers are stripped if injected by any backend component."""
        def view_with_server_headers(request):
            resp = HttpResponse("server header view")
            resp['X-Powered-By'] = 'Django/Gunicorn/Python3.12'
            resp['Server'] = 'Gunicorn/20.1.0'
            return resp

        middleware = SecurityHeadersMiddleware(view_with_server_headers)
        req = self.factory.get('/server-info-view/')
        resp = middleware(req)

        self.assertNotIn('X-Powered-By', resp.headers)
        self.assertNotIn('Server', resp.headers)

    def test_11_static_and_media_cache_not_destroyed(self):
        """Test 11: Non-API static responses with legitimate public caching retain their cache headers."""
        def static_file_view(request):
            resp = HttpResponse("image binary data", content_type="image/png")
            resp['Cache-Control'] = 'public, max-age=86400'
            return resp

        middleware = SecurityHeadersMiddleware(static_file_view)
        req = self.factory.get('/static/logo.png')
        resp = middleware(req)

        self.assertEqual(resp.headers.get('X-Content-Type-Options'), 'nosniff')
        self.assertEqual(resp.headers.get('X-Frame-Options'), 'DENY')
        self.assertEqual(resp.headers.get('Cache-Control'), 'public, max-age=86400')
