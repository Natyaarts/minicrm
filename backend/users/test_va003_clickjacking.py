from django.test import TestCase, Client, RequestFactory
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.http import HttpResponse
from rest_framework import status
from rest_framework.authtoken.models import Token
from core.middleware import SecurityHeadersMiddleware

User = get_user_model()


class VA003ClickjackingSecurityTests(TestCase):
    """
    Automated Security Test Suite for VAPT Finding VA-003: Clickjacking.
    Verifies that all HTTP responses (including login, auth, API, admin, and error routes)
    unambiguously enforce robust clickjacking defenses via X-Frame-Options: DENY
    and Content-Security-Policy: frame-ancestors 'none'.
    """

    def setUp(self):
        cache.clear()
        self.client = Client()
        self.factory = RequestFactory()
        self.user = User.objects.create_user(
            username='clickjacking_test_user',
            email='clickjacking_test@example.com',
            password='ComplexPassword123!',
            role='EMPLOYEE'
        )
        self.token = Token.objects.create(user=self.user)

    def test_a_login_auth_endpoints_contain_x_frame_options_deny(self):
        """Test A: Auth login & token endpoints contain X-Frame-Options: DENY."""
        # 1. API Login Endpoint
        res_login = self.client.post('/api/auth/login/', {
            'username': 'clickjacking_test_user',
            'password': 'ComplexPassword123!'
        }, content_type='application/json')
        self.assertEqual(res_login.status_code, status.HTTP_200_OK)
        self.assertEqual(res_login.headers.get('X-Frame-Options'), 'DENY')

        # 2. Admin Login Page
        res_admin = self.client.get('/admin/login/')
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)
        self.assertEqual(res_admin.headers.get('X-Frame-Options'), 'DENY')

    def test_b_login_auth_endpoints_contain_csp_frame_ancestors_none(self):
        """Test B: Auth login & admin pages contain CSP frame-ancestors 'none'."""
        res_login = self.client.post('/api/auth/login/', {
            'username': 'clickjacking_test_user',
            'password': 'ComplexPassword123!'
        }, content_type='application/json')
        csp_login = res_login.headers.get('Content-Security-Policy', '')
        self.assertIn("frame-ancestors 'none'", csp_login)
        self.assertNotIn("frame-ancestors 'self'", csp_login)
        self.assertNotIn("frame-ancestors *", csp_login)

        res_admin = self.client.get('/admin/login/')
        csp_admin = res_admin.headers.get('Content-Security-Policy', '')
        self.assertIn("frame-ancestors 'none'", csp_admin)
        self.assertNotIn("frame-ancestors 'self'", csp_admin)
        self.assertNotIn("frame-ancestors *", csp_admin)

    def test_c_responses_do_not_contain_allow_from_wildcard(self):
        """Test C: No response uses the insecure X-Frame-Options: ALLOW-FROM * directive."""
        endpoints = [
            ('/api/auth/login/', 'POST', {'username': 'test', 'password': 'wrong'}),
            ('/api/auth/me/', 'GET', None),
            ('/admin/login/', 'GET', None),
            ('/api/crm/leads/', 'GET', None),
        ]
        for url, method, data in endpoints:
            if method == 'POST':
                res = self.client.post(url, data=data, content_type='application/json')
            else:
                res = self.client.get(url, HTTP_AUTHORIZATION=f'Token {self.token.key}')
            
            xfo = res.headers.get('X-Frame-Options', '')
            self.assertNotIn('ALLOW-FROM', xfo)
            self.assertNotEqual(xfo, 'ALLOW-FROM *')

    def test_d_csp_does_not_contain_frame_ancestors_wildcard_or_self(self):
        """Test D: Content-Security-Policy never uses frame-ancestors * or frame-ancestors 'self'."""
        endpoints = [
            '/api/auth/me/',
            '/admin/login/',
            '/api/crm/leads/',
        ]
        for url in endpoints:
            res = self.client.get(url, HTTP_AUTHORIZATION=f'Token {self.token.key}')
            csp = res.headers.get('Content-Security-Policy', '')
            self.assertNotIn("frame-ancestors *", csp)
            self.assertNotIn("frame-ancestors 'all'", csp)
            self.assertNotIn("frame-ancestors 'self'", csp)

    def test_e_arbitrary_origin_or_referer_cannot_influence_frame_policy(self):
        """Test E: Arbitrary Origin or Referer header cannot bypass or influence frame protection."""
        attacker_headers = [
            {'HTTP_ORIGIN': 'https://evil.example'},
            {'HTTP_ORIGIN': 'https://attacker.example'},
            {'HTTP_REFERER': 'https://evil.example/iframe-attack.html'},
            {'HTTP_ORIGIN': 'https://natyaarts.org.evil.com'},
        ]
        for headers in attacker_headers:
            res = self.client.get(
                '/api/auth/me/',
                HTTP_AUTHORIZATION=f'Token {self.token.key}',
                **headers
            )
            self.assertEqual(res.headers.get('X-Frame-Options'), 'DENY')
            self.assertIn("frame-ancestors 'none'", res.headers.get('Content-Security-Policy', ''))
            self.assertNotIn("frame-ancestors 'self'", res.headers.get('Content-Security-Policy', ''))

    def test_f_normal_same_origin_requests_continue_working(self):
        """Test F: Legitimate API calls and user authentication function without disruption."""
        res = self.client.get(
            '/api/auth/me/',
            HTTP_AUTHORIZATION=f'Token {self.token.key}'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['username'], 'clickjacking_test_user')
        self.assertEqual(res.headers.get('X-Frame-Options'), 'DENY')
        self.assertIn("frame-ancestors 'none'", res.headers.get('Content-Security-Policy', ''))

    def test_g_authenticated_crm_endpoints_retain_clickjacking_headers(self):
        """Test G: Sensitive CRM API endpoints contain required frame defenses."""
        crm_endpoints = [
            '/api/auth/me/',
            '/api/crm/leads/',
            '/api/finance/fees/',
            '/api/notifications/',
        ]
        for endpoint in crm_endpoints:
            res = self.client.get(endpoint, HTTP_AUTHORIZATION=f'Token {self.token.key}')
            self.assertEqual(res.headers.get('X-Frame-Options'), 'DENY', f"Failed on {endpoint}")
            self.assertIn("frame-ancestors 'none'", res.headers.get('Content-Security-Policy', ''), f"Failed on {endpoint}")
            self.assertNotIn("frame-ancestors 'self'", res.headers.get('Content-Security-Policy', ''), f"Failed on {endpoint}")
            self.assertEqual(res.headers.get('X-Content-Type-Options'), 'nosniff')

    def test_h_error_responses_retain_security_headers(self):
        """Test H: Error responses (400, 401, 403, 404, 405) retain defensive security headers."""
        # 401 Unauthorized
        res_401 = self.client.get('/api/auth/me/')
        self.assertEqual(res_401.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res_401.headers.get('X-Frame-Options'), 'DENY')
        self.assertIn("frame-ancestors 'none'", res_401.headers.get('Content-Security-Policy', ''))
        self.assertNotIn("frame-ancestors 'self'", res_401.headers.get('Content-Security-Policy', ''))

        # 404 Not Found
        res_404 = self.client.get('/api/nonexistent-route-for-testing/')
        self.assertEqual(res_404.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(res_404.headers.get('X-Frame-Options'), 'DENY')
        self.assertIn("frame-ancestors 'none'", res_404.headers.get('Content-Security-Policy', ''))
        self.assertNotIn("frame-ancestors 'self'", res_404.headers.get('Content-Security-Policy', ''))

        # 405 Method Not Allowed
        res_405 = self.client.put('/api/auth/login/', {})
        self.assertEqual(res_405.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(res_405.headers.get('X-Frame-Options'), 'DENY')
        self.assertIn("frame-ancestors 'none'", res_405.headers.get('Content-Security-Policy', ''))
        self.assertNotIn("frame-ancestors 'self'", res_405.headers.get('Content-Security-Policy', ''))

    def test_i_middleware_overrides_existing_frame_ancestors_self_to_none(self):
        """Test I: If a view attempts to set frame-ancestors 'self', middleware strictly replaces it with 'none'."""
        def view_with_self_csp(request):
            resp = HttpResponse("mock view with self csp")
            resp['Content-Security-Policy'] = "default-src 'self'; frame-ancestors 'self';"
            return resp

        middleware = SecurityHeadersMiddleware(view_with_self_csp)
        req = self.factory.get('/mock-view/')
        resp = middleware(req)

        csp = resp.headers.get('Content-Security-Policy', '')
        self.assertIn("frame-ancestors 'none'", csp)
        self.assertNotIn("frame-ancestors 'self'", csp)
        self.assertIn("default-src 'self'", csp)

    def test_j_middleware_overrides_existing_frame_ancestors_wildcard_to_none(self):
        """Test J: If a view attempts to set frame-ancestors *, middleware strictly replaces it with 'none'."""
        def view_with_wildcard_csp(request):
            resp = HttpResponse("mock view with wildcard csp")
            resp['Content-Security-Policy'] = "script-src 'self'; frame-ancestors *;"
            return resp

        middleware = SecurityHeadersMiddleware(view_with_wildcard_csp)
        req = self.factory.get('/mock-view/')
        resp = middleware(req)

        csp = resp.headers.get('Content-Security-Policy', '')
        self.assertIn("frame-ancestors 'none'", csp)
        self.assertNotIn("frame-ancestors *", csp)
        self.assertIn("script-src 'self'", csp)

    def test_k_middleware_preserves_existing_directives_and_appends_none(self):
        """Test K: If a view sets other CSP directives without frame-ancestors, directives are preserved and 'none' is appended."""
        def view_with_custom_csp(request):
            resp = HttpResponse("mock view with custom csp")
            resp['Content-Security-Policy'] = "default-src 'none'; sandbox; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self';"
            return resp

        middleware = SecurityHeadersMiddleware(view_with_custom_csp)
        req = self.factory.get('/mock-view/')
        resp = middleware(req)

        csp = resp.headers.get('Content-Security-Policy', '')
        self.assertIn("frame-ancestors 'none'", csp)
        self.assertNotIn("frame-ancestors 'self'", csp)
        self.assertIn("default-src 'none'", csp)
        self.assertIn("sandbox", csp)
        self.assertIn("style-src 'unsafe-inline'", csp)
        self.assertIn("img-src 'self' data:", csp)
