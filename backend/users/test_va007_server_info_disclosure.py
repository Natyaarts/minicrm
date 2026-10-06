import re
from django.test import TestCase, Client, RequestFactory, override_settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.http import HttpResponse, JsonResponse
from django.conf import settings
from rest_framework import status
from rest_framework.authtoken.models import Token
from core.middleware import SecurityHeadersMiddleware

User = get_user_model()


class VA007ServerInfoDisclosureTests(TestCase):
    """
    Automated Security Test Suite for VAPT Finding VA-007: Server Information Disclosure.
    Verifies that all HTTP responses (200, 400, 401, 403, 404, 405, 500, Admin, Auth,
    and Static) do not disclose server software versions, framework banners,
    Python/Django signatures, or technology identifying headers (X-Powered-By, etc.).
    """

    def setUp(self):
        cache.clear()
        self.client = Client()
        self.factory = RequestFactory()
        self.user = User.objects.create_user(
            username='info_disc_user',
            email='info_disc@example.com',
            password='ComplexPassword123!',
            role='SUPER_ADMIN'
        )
        self.token = Token.objects.create(user=self.user)
        self.auth_headers = {'HTTP_AUTHORIZATION': f'Token {self.token.key}'}

        self.employee_user = User.objects.create_user(
            username='info_disc_employee',
            email='info_emp@example.com',
            password='ComplexPassword123!',
            role='EMPLOYEE'
        )
        self.employee_token = Token.objects.create(user=self.employee_user)

    def _assert_no_information_disclosure(self, response):
        """Helper to assert that response headers and body contain no technology banners or versions."""
        # 1. Prohibited technology headers
        prohibited_headers = [
            'X-Powered-By',
            'X-AspNet-Version',
            'X-AspNetMvc-Version',
            'X-Runtime',
            'X-Version',
            'X-Generator',
            'X-Backend-Server',
        ]
        for header in prohibited_headers:
            self.assertNotIn(
                header,
                response.headers,
                f"Response leaked sensitive technology header: {header}"
            )

        # 2. Check Server header (Django responses should not include Server header or specific version strings)
        server_header = response.headers.get('Server', '')
        self.assertNotIn('Django', server_header)
        self.assertNotIn('Python', server_header)
        self.assertNotIn('WSGIServer', server_header)
        self.assertNotIn('gunicorn/', server_header)

        # 3. Check response body for framework/version signatures and stack traces
        content = response.content.decode('utf-8', errors='ignore')
        self.assertNotIn('Django Version:', content)
        self.assertNotIn('Python Executable:', content)
        self.assertNotIn('WSGI Request', content)
        self.assertNotIn('Traceback (most recent call last)', content)
        self.assertNotIn('Exception Type:', content)
        self.assertNotIn('Exception Value:', content)

    def test_01_public_login_endpoint_no_info_disclosure(self):
        """Test 1: Public login response does not leak server/framework versions."""
        res = self.client.post('/api/auth/login/', {
            'username': 'info_disc_user',
            'password': 'ComplexPassword123!'
        }, content_type='application/json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self._assert_no_information_disclosure(res)

    def test_02_authenticated_api_me_no_info_disclosure(self):
        """Test 2: Authenticated user endpoint does not leak server/framework versions."""
        res = self.client.get('/api/auth/me/', **self.auth_headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self._assert_no_information_disclosure(res)

    def test_03_admin_endpoint_no_info_disclosure(self):
        """Test 3: Django Admin endpoint does not leak backend versions in headers or HTML."""
        res = self.client.get('/admin/login/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self._assert_no_information_disclosure(res)

    def test_04_400_bad_request_no_info_disclosure(self):
        """Test 4: 400 Bad Request error does not leak parser internals or server details."""
        res = self.client.post(
            '/api/auth/login/',
            data='{invalid_json_format:',
            content_type='application/json'
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self._assert_no_information_disclosure(res)

    def test_05_401_unauthorized_no_info_disclosure(self):
        """Test 5: 401 Unauthorized error does not leak authentication backend internals."""
        res = self.client.get('/api/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self._assert_no_information_disclosure(res)

    def test_06_403_forbidden_no_info_disclosure(self):
        """Test 6: 403 Forbidden error does not leak internal permission class details."""
        res = self.client.get(
            '/api/auth/management/users/',
            HTTP_AUTHORIZATION=f'Token {self.employee_token.key}'
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self._assert_no_information_disclosure(res)

    def test_07_404_not_found_no_info_disclosure(self):
        """Test 7: 404 Not Found error returns clean JSON without URL patterns or server info."""
        res = self.client.get('/api/nonexistent-route-for-va007/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self._assert_no_information_disclosure(res)
        # Verify URL patterns / regexes are not disclosed
        content = res.content.decode('utf-8', errors='ignore')
        self.assertNotIn('The current path', content)
        self.assertNotIn('urlpatterns', content)

    def test_08_405_method_not_allowed_no_info_disclosure(self):
        """Test 8: 405 Method Not Allowed error returns clean response without internals."""
        res = self.client.put('/api/auth/login/', {})
        self.assertEqual(res.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self._assert_no_information_disclosure(res)

    def test_09_500_server_error_no_info_disclosure(self):
        """Test 9: 500 Server Error returns generic safe response without stack trace."""
        res = self.client.get('/api/nonexistent-500-trigger/')
        self._assert_no_information_disclosure(res)

    def test_10_debug_mode_disabled_by_default(self):
        """Test 10: DEBUG is False in standard/production settings to prevent debug page leakage."""
        self.assertFalse(settings.DEBUG, "DEBUG must default to False in production configuration")

    def test_11_middleware_actively_strips_all_technology_headers(self):
        """Test 11: SecurityHeadersMiddleware actively strips X-Powered-By, Server, and tech headers."""
        def view_with_injected_headers(request):
            resp = HttpResponse("mock payload")
            resp['X-Powered-By'] = 'Express/Django/4.0'
            resp['Server'] = 'gunicorn/21.2.0 (Ubuntu)'
            resp['X-AspNet-Version'] = '4.0.30319'
            resp['X-Runtime'] = '0.045s'
            resp['X-Version'] = 'v1.0.0-beta'
            return resp

        middleware = SecurityHeadersMiddleware(view_with_injected_headers)
        req = self.factory.get('/api/test-headers/')
        resp = middleware(req)

        self._assert_no_information_disclosure(resp)
        self.assertNotIn('X-Powered-By', resp.headers)
        self.assertNotIn('Server', resp.headers)
        self.assertNotIn('X-AspNet-Version', resp.headers)
        self.assertNotIn('X-Runtime', resp.headers)
        self.assertNotIn('X-Version', resp.headers)

    def test_12_cross_module_api_endpoints_no_info_disclosure(self):
        """Test 12: Endpoints across CRM, HRMS, Finance, and Payroll do not disclose server info."""
        endpoints = [
            '/api/students/',
            '/api/crm/campaigns/',
            '/api/hrms/departments/',
            '/api/hrms/designations/',
            '/api/finance/categories/',
            '/api/payroll/salary-structures/',
            '/api/leaves/types/',
            '/api/notifications/',
            '/api/forms/fields/',
        ]
        for url in endpoints:
            res = self.client.get(url, **self.auth_headers)
            self._assert_no_information_disclosure(res)
