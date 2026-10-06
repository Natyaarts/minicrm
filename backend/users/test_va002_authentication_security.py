from datetime import timedelta
from django.test import TestCase, Client, RequestFactory
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.conf import settings
from rest_framework import status
from rest_framework.authtoken.models import Token
from users.serializers import UserSerializer

User = get_user_model()


class VA002AuthenticationSecurityTests(TestCase):
    """
    Automated Security Test Suite for VAPT Finding VA-002:
    Credentials / Sensitive Authentication Data Exposed in Plain Text.
    Verifies secure credential handling, hashing, absence in responses/logs,
    token rotation/invalidation, and query parameter protection.
    """

    def setUp(self):
        self.client = Client()
        self.factory = RequestFactory()
        self.plain_password = 'ComplexSecurePassword123!'
        self.user = User.objects.create_user(
            username='auth_sec_user',
            email='auth_sec@example.com',
            password=self.plain_password,
            role='SUPER_ADMIN'
        )
        self.token = Token.objects.create(user=self.user)
        self.auth_headers = {'HTTP_AUTHORIZATION': f'Token {self.token.key}'}

    def test_01_login_response_does_not_contain_password(self):
        """Test 1: Successful login response returns token and user data without exposing password."""
        res = self.client.post('/api/auth/login/', {
            'username': 'auth_sec_user',
            'password': self.plain_password
        }, content_type='application/json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertIn('token', data)
        self.assertIn('user', data)
        # Verify password is not in user dict or root response
        self.assertNotIn('password', data)
        self.assertNotIn('password', data['user'])
        self.assertNotIn(self.plain_password, str(data))

    def test_02_password_never_stored_in_plaintext_in_database(self):
        """Test 2: Passwords in database are strictly salted and hashed (never plaintext)."""
        db_user = User.objects.get(username='auth_sec_user')
        self.assertNotEqual(db_user.password, self.plain_password)
        self.assertTrue(
            db_user.password.startswith('pbkdf2_sha256$') or db_user.password.startswith('argon2'),
            "Password must be hashed with a cryptographic algorithm"
        )
        self.assertTrue(db_user.check_password(self.plain_password))

    def test_03_invalid_login_returns_generic_error_without_user_enumeration(self):
        """Test 3: Failed login returns generic message for both wrong password and nonexistent user."""
        # Nonexistent username
        res_nonexistent = self.client.post('/api/auth/login/', {
            'username': 'nonexistent_user_xyz',
            'password': 'SomePassword123!'
        }, content_type='application/json')
        self.assertEqual(res_nonexistent.status_code, status.HTTP_400_BAD_REQUEST)

        # Existing user with wrong password
        res_wrong_pw = self.client.post('/api/auth/login/', {
            'username': 'auth_sec_user',
            'password': 'WrongPassword123!'
        }, content_type='application/json')
        self.assertEqual(res_wrong_pw.status_code, status.HTTP_400_BAD_REQUEST)

        # Responses must be identical generic error
        self.assertEqual(res_nonexistent.json(), res_wrong_pw.json())
        self.assertEqual(res_nonexistent.json().get('error'), 'Invalid Credentials')

    def test_04_credentials_prohibited_in_url_query_parameters(self):
        """Test 4: Attempting to supply credentials via URL query parameters is rejected."""
        res_query_login = self.client.post(
            f'/api/auth/login/?username=auth_sec_user&password={self.plain_password}',
            data={},
            content_type='application/json'
        )
        self.assertEqual(res_query_login.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Credentials must not be passed in URL query parameters', res_query_login.json().get('error', ''))

    def test_05_password_change_rotates_token_and_does_not_echo_passwords(self):
        """Test 5: PasswordChangeView requires current password, hashes new password, and rotates token."""
        new_pw = 'NewSuperPassword456!'
        res_change = self.client.post('/api/auth/change-password/', {
            'old_password': self.plain_password,
            'new_password': new_pw
        }, content_type='application/json', **self.auth_headers)

        self.assertEqual(res_change.status_code, status.HTTP_200_OK)
        data = res_change.json()
        self.assertIn('token', data)
        self.assertNotEqual(data['token'], self.token.key, "Token must be rotated on password change")
        self.assertNotIn('password', data)
        self.assertNotIn(self.plain_password, str(data))
        self.assertNotIn(new_pw, str(data))

        # Verify old token is invalidated
        res_old_token = self.client.get('/api/auth/me/', **self.auth_headers)
        self.assertEqual(res_old_token.status_code, status.HTTP_401_UNAUTHORIZED)

        # Verify new password works
        res_login_new = self.client.post('/api/auth/login/', {
            'username': 'auth_sec_user',
            'password': new_pw
        }, content_type='application/json')
        self.assertEqual(res_login_new.status_code, status.HTTP_200_OK)

    def test_06_password_change_rejects_query_parameters(self):
        """Test 6: Password change endpoint rejects passwords in query parameters."""
        res = self.client.post(
            '/api/auth/change-password/?old_password=old&new_password=new',
            data={},
            content_type='application/json',
            **self.auth_headers
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_07_logout_deletes_token_server_side(self):
        """Test 7: LogoutView immediately revokes the active token from the database."""
        res_logout = self.client.post('/api/auth/logout/', **self.auth_headers)
        self.assertEqual(res_logout.status_code, status.HTTP_200_OK)

        # Verify token is deleted in DB
        self.assertFalse(Token.objects.filter(key=self.token.key).exists())

        # Verify subsequent API calls fail with 401
        res_after = self.client.get('/api/auth/me/', **self.auth_headers)
        self.assertEqual(res_after.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_08_expired_token_is_rejected(self):
        """Test 8: ExpiringTokenAuthentication rejects tokens older than configured TTL."""
        expired_user = User.objects.create_user(
            username='expired_token_user',
            email='expired@example.com',
            password='TestPassword123!',
            role='EMPLOYEE'
        )
        expired_token = Token.objects.create(user=expired_user)
        # Backdate token creation timestamp past expiration threshold (e.g. 25 hours ago)
        Token.objects.filter(key=expired_token.key).update(
            created=timezone.now() - timedelta(hours=25)
        )

        res = self.client.get(
            '/api/auth/me/',
            HTTP_AUTHORIZATION=f'Token {expired_token.key}'
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('expired', res.json().get('error', '').lower())

    def test_09_user_serializer_never_outputs_password(self):
        """Test 9: UserSerializer marks password as write_only and excludes it from serialization."""
        serializer = UserSerializer(self.user)
        self.assertNotIn('password', serializer.data)

    def test_10_user_management_api_does_not_disclose_passwords(self):
        """Test 10: GET /api/auth/management/users/ lists users without disclosing password field or hashes."""
        res = self.client.get('/api/auth/management/users/', **self.auth_headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.json()
        user_list = results if isinstance(results, list) else results.get('results', [])
        for u in user_list:
            self.assertNotIn('password', u)

    def test_11_cookie_security_configuration(self):
        """Test 11: Session and CSRF cookie security attributes are properly configured."""
        self.assertTrue(settings.SESSION_COOKIE_HTTPONLY, "SESSION_COOKIE_HTTPONLY must be True")
        self.assertEqual(settings.SESSION_COOKIE_SAMESITE, 'Lax')
        self.assertEqual(settings.CSRF_COOKIE_SAMESITE, 'Lax')
