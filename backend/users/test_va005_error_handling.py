import json
from unittest.mock import patch
from django.test import TestCase, Client, override_settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError, DatabaseError, OperationalError
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.views import APIView
from rest_framework.response import Response
from core.exceptions import custom_exception_handler, sanitize_message, sanitize_error_data

from django.core.cache import cache

User = get_user_model()


class MockErrorThrowingView(APIView):
    """Mock view to test handling of unexpected server-side exceptions."""
    def get(self, request):
        raise ValueError("Unexpected internal calculation failure in line 42 of /var/www/secret_script.py")

    def post(self, request):
        raise IntegrityError("duplicate key value violates unique constraint \"users_user_email_key\"\nDETAIL: Key (email)=(test@example.com) already exists.")

    def put(self, request):
        raise OperationalError("FATAL: connection to server on socket \"/var/run/postgresql/.s.PGSQL.5432\" failed")


class VA005ErrorHandlingSecurityTests(TestCase):
    """
    Automated Security Test Suite for VAPT Finding VA-005: Improper Error Handling.
    Verifies that error responses across all HTTP status codes (400, 401, 403, 404, 405, 500)
    return safe, consistent JSON responses without exposing stack traces, database schema,
    filesystem paths, SQL queries, or internal implementation details.
    """

    def setUp(self):
        cache.clear()
        self.client = Client()
        self.admin_user = User.objects.create_user(
            username='err_admin_user',
            email='err_admin@example.com',
            password='ComplexPassword123!',
            role='SUPER_ADMIN'
        )
        self.admin_token = Token.objects.create(user=self.admin_user)

        self.employee_user = User.objects.create_user(
            username='err_employee_user',
            email='err_employee@example.com',
            password='ComplexPassword123!',
            role='EMPLOYEE'
        )
        self.employee_token = Token.objects.create(user=self.employee_user)

    def _assert_no_sensitive_leakage(self, content_str):
        """Helper to assert that response text does NOT contain sensitive technical details."""
        forbidden_substrings = [
            'Traceback (most recent call last)',
            'File "',
            'line ',
            'django.db',
            'django.core',
            'django.contrib',
            'OperationalError',
            'IntegrityError',
            'DatabaseError',
            'SELECT ',
            'INSERT INTO',
            'UPDATE ',
            'DELETE FROM',
            'C:\\Users',
            '/home/',
            '/var/www',
            'SECRET_KEY',
            'PASSWORD',
        ]
        for forbidden in forbidden_substrings:
            self.assertNotIn(
                forbidden.lower(),
                content_str.lower(),
                f"Response leaked sensitive technical string '{forbidden}': {content_str[:200]}"
            )

    # -------------------------------------------------------------------------
    # 1. Malformed Requests & Invalid JSON
    # -------------------------------------------------------------------------
    def test_01_malformed_json_returns_safe_400(self):
        """Test 1: Malformed JSON payload returns clean 400 without parser stack trace."""
        response = self.client.post(
            '/api/auth/login/',
            data='{"username": "test", "password": ',  # Broken JSON
            content_type='application/json'
        )
        self.assertIn(response.status_code, [status.HTTP_400_BAD_REQUEST, status.HTTP_405_METHOD_NOT_ALLOWED])
        self._assert_no_sensitive_leakage(response.content.decode('utf-8'))
        self.assertTrue(response.headers.get('Content-Type', '').startswith('application/json'))

    # -------------------------------------------------------------------------
    # 2. Serializer & Validation Errors
    # -------------------------------------------------------------------------
    def test_02_serializer_validation_errors_structured_and_safe(self):
        """Test 2: Validation errors preserve field guidance without leaking internals."""
        response = self.client.post(
            '/api/auth/login/',
            data=json.dumps({'username': '', 'password': ''}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        data = response.json()
        self._assert_no_sensitive_leakage(response.content.decode('utf-8'))
        self.assertTrue(isinstance(data, dict))

    # -------------------------------------------------------------------------
    # 3. Unauthenticated Requests (401)
    # -------------------------------------------------------------------------
    def test_03_unauthenticated_request_returns_safe_401(self):
        """Test 3: Unauthenticated request to protected endpoint returns safe 401."""
        endpoints = [
            '/api/auth/me/',
            '/api/students/',
            '/api/crm/campaigns/',
            '/api/finance/expenses/',
            '/api/hrms/employees/',
            '/api/payroll/salary-structures/',
        ]
        for endpoint in endpoints:
            response = self.client.get(endpoint)
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED, f"Failed at {endpoint}")
            data = response.json()
            self._assert_no_sensitive_leakage(response.content.decode('utf-8'))
            self.assertTrue('detail' in data or 'error' in data)

    # -------------------------------------------------------------------------
    # 4. Unauthorized Requests (403)
    # -------------------------------------------------------------------------
    def test_04_unauthorized_request_returns_safe_403(self):
        """Test 4: User lacking role permissions receives clean 403 without data leakage."""
        # Regular employee accessing finance settings
        response = self.client.get(
            '/api/finance/analytics/',
            HTTP_AUTHORIZATION=f'Token {self.employee_token.key}'
        )
        self.assertIn(response.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])
        self._assert_no_sensitive_leakage(response.content.decode('utf-8'))

    # -------------------------------------------------------------------------
    # 5. Nonexistent Resources (404)
    # -------------------------------------------------------------------------
    def test_05_nonexistent_route_returns_safe_json_404(self):
        """Test 5: 404 on API routes returns safe JSON error, not standard Django debug HTML."""
        response = self.client.get('/api/nonexistent-safe-test-route-12345/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self._assert_no_sensitive_leakage(response.content.decode('utf-8'))

    # -------------------------------------------------------------------------
    # 6. Unsupported HTTP Methods (405)
    # -------------------------------------------------------------------------
    def test_06_unsupported_http_method_returns_safe_405(self):
        """Test 6: Unsupported method returns clean 405 Method Not Allowed."""
        response = self.client.put(
            '/api/auth/login/',
            data=json.dumps({}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self._assert_no_sensitive_leakage(response.content.decode('utf-8'))

    # -------------------------------------------------------------------------
    # 7. Unhandled Server Exceptions (500)
    # -------------------------------------------------------------------------
    def test_07_unexpected_server_exception_returns_generic_500(self):
        """Test 7: Unhandled Python exception is converted to generic 500 JSON without traceback."""
        class MockRequest:
            path = '/api/mock/error/'
            method = 'GET'
            user = self.admin_user

        class MockView:
            pass

        exc = ValueError("Fatal internal zero division error in /home/app/core/calculations.py at line 102")
        context = {'request': MockRequest(), 'view': MockView()}

        response = custom_exception_handler(exc, context)
        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertEqual(response.data.get('error'), 'An internal server error occurred. Please try again later.')
        self._assert_no_sensitive_leakage(json.dumps(response.data))

    # -------------------------------------------------------------------------
    # 8. Database / ORM Integrity & Operational Errors
    # -------------------------------------------------------------------------
    def test_08_database_integrity_error_handled_safely(self):
        """Test 8: Database IntegrityError / SQL constraint error returns safe message without SQL syntax."""
        class MockRequest:
            path = '/api/mock/db-error/'
            method = 'POST'
            user = self.admin_user

        exc = IntegrityError("duplicate key value violates unique constraint \"crm_campaign_name_unique\"\nDETAIL: Key (name)=(Campaign1) already exists.")
        context = {'request': MockRequest(), 'view': None}

        response = custom_exception_handler(exc, context)
        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn("crm_campaign_name_unique", json.dumps(response.data))
        self.assertNotIn("duplicate key value", json.dumps(response.data))
        self._assert_no_sensitive_leakage(json.dumps(response.data))

    def test_09_database_operational_error_handled_safely(self):
        """Test 9: Database OperationalError (e.g. connection fail) returns clean message."""
        class MockRequest:
            path = '/api/mock/db-down/'
            method = 'GET'
            user = self.admin_user

        exc = OperationalError("could not connect to server: Connection refused\n\tIs the server running on host \"127.0.0.1\" and accepting\n\tTCP/IP connections on port 5432?")
        context = {'request': MockRequest(), 'view': None}

        response = custom_exception_handler(exc, context)
        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn("5432", json.dumps(response.data))
        self.assertNotIn("127.0.0.1", json.dumps(response.data))
        self._assert_no_sensitive_leakage(json.dumps(response.data))

    # -------------------------------------------------------------------------
    # 9. Sanitizer Utilities Verification
    # -------------------------------------------------------------------------
    def test_10_sanitizer_cleans_windows_and_unix_paths(self):
        """Test 10: Sanitizer removes file paths and module names from error messages."""
        raw_msg_win = "Error reading file at C:\\Users\\Administrator\\Desktop\\secrets.txt"
        sanitized_win = sanitize_message(raw_msg_win)
        self.assertNotIn("C:\\Users", sanitized_win)
        self.assertNotIn("secrets.txt", sanitized_win)

        raw_msg_unix = "Failed in /var/www/backend/core/views.py line 20"
        sanitized_unix = sanitize_message(raw_msg_unix)
        self.assertNotIn("/var/www", sanitized_unix)

    def test_11_sanitizer_cleans_nested_error_dictionaries(self):
        """Test 11: Recursive sanitizer cleans deeply nested error structures."""
        nested_errors = {
            'personal_info': {
                'id_document': ['File invalid: /home/ubuntu/app/storage/bad_file.pdf'],
                'details': [{'sub_field': 'django.db.models.fields.CharError'}]
            }
        }
        cleaned = sanitize_error_data(nested_errors)
        cleaned_str = json.dumps(cleaned)
        self.assertNotIn("/home/ubuntu", cleaned_str)
        self.assertNotIn("django.db", cleaned_str)

    # -------------------------------------------------------------------------
    # 10. Verification with DEBUG=False
    # -------------------------------------------------------------------------
    @override_settings(DEBUG=False)
    def test_12_debug_false_behavior_enforced(self):
        """Test 12: Ensure DEBUG=False does not produce technical debug pages on errors."""
        response = self.client.get('/api/nonexistent-debug-test-endpoint/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self._assert_no_sensitive_leakage(response.content.decode('utf-8'))
