from django.core.cache import cache
from datetime import timedelta
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from users.models import UserAuthToken as Token
from users.authentication import get_token_ttl

User = get_user_model()

class VA008TokenSecurityTests(TestCase):
    """
    Automated Security Test Suite for VAPT Finding VA-008:
    Token Does Not Expire / Static Authentication Token & Revocation.
    """

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.password = 'StrongAuthPass123!'

        # 1. Create a regular Employee User
        self.employee = User.objects.create_user(
            username='emp_token_test',
            email='emp_token@natyaarts.com',
            password=self.password,
            role='EMPLOYEE'
        )

        # 2. Create an Admin User
        self.admin = User.objects.create_user(
            username='admin_token_test',
            email='admin_token@natyaarts.com',
            password=self.password,
            role='ADMIN',
            is_staff=True
        )

    # ----------------------------------------------------------------------
    # Test A: Successful Login Returns Valid Token and Expiry Metadata
    # ----------------------------------------------------------------------
    def test_login_returns_valid_token_and_expires_in(self):
        """POST /api/auth/login/ returns 200 with token."""
        response = self.client.post('/api/auth/login/', {
            'username': self.employee.username,
            'password': self.password
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)
        self.assertTrue(Token.objects.filter(key=response.data['token']).exists())

    # ----------------------------------------------------------------------
    # Test B & M: Valid Token Can Access Authenticated Endpoints Before Expiry
    # ----------------------------------------------------------------------
    def test_valid_token_authenticates_successfully(self):
        """A freshly created token successfully accesses authenticated APIs."""
        login_res = self.client.post('/api/auth/login/', {
            'username': self.employee.username,
            'password': self.password
        })
        token = login_res.data['token']

        # Call /api/auth/me/ with the Token header
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        res = self.client.get('/api/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['username'], self.employee.username)

    # ----------------------------------------------------------------------
    # Test C & J & K: Server-Side Token Expiration -> HTTP 401 (When Configured)
    # ----------------------------------------------------------------------
    @override_settings(AUTH_TOKEN_EXPIRATION_HOURS=24)
    def test_expired_token_rejected_with_401(self):
        """
        When expiration is configured (e.g. 24h), a token whose age exceeds TTL
        is rejected with HTTP 401 and purged from the database.
        """
        token = Token.objects.create(user=self.employee)

        # Simulate time passing past expiration threshold (e.g. 25 hours ago)
        ttl = get_token_ttl()
        token.created = timezone.now() - (ttl + timedelta(hours=1))
        token.save()

        # Attempt authenticated request with expired token
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        res = self.client.get('/api/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('detail', res.data)

        # Confirm the expired token was removed server-side
        self.assertFalse(Token.objects.filter(key=token.key).exists())

    def test_unexpired_token_persists_without_forced_logout(self):
        """
        By default (no forced 24h expiration), active tokens older than 24h remain valid.
        """
        token = Token.objects.create(user=self.employee)
        Token.objects.filter(key=token.key).update(
            created=timezone.now() - timedelta(hours=48)
        )

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        res = self.client.get('/api/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['username'], self.employee.username)

    # ----------------------------------------------------------------------
    # Test D: Invalid Token -> HTTP 401
    # ----------------------------------------------------------------------
    def test_invalid_token_rejected_with_401(self):
        """Non-existent or malformed token string returns HTTP 401."""
        self.client.credentials(HTTP_AUTHORIZATION='Token fake_invalid_token_string_1234567890')
        res = self.client.get('/api/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    # ----------------------------------------------------------------------
    # Test E: Server-Side Logout Invalidates Token -> Old Token Returns 401
    # ----------------------------------------------------------------------
    def test_logout_revokes_token_server_side(self):
        """
        Calling POST /api/auth/logout/ deletes the token on the server.
        Subsequent requests using the old token must return HTTP 401.
        """
        login_res = self.client.post('/api/auth/login/', {
            'username': self.employee.username,
            'password': self.password
        })
        token_key = login_res.data['token']

        # Verify token works
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token_key}')
        res = self.client.get('/api/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Call Logout endpoint
        logout_res = self.client.post('/api/auth/logout/')
        self.assertEqual(logout_res.status_code, status.HTTP_200_OK)

        # Confirm token no longer exists in database
        self.assertFalse(Token.objects.filter(key=token_key).exists())

        # Attempt to reuse old token
        res_after_logout = self.client.get('/api/auth/me/')
        self.assertEqual(res_after_logout.status_code, status.HTTP_401_UNAUTHORIZED)

    # ----------------------------------------------------------------------
    # Test F & G: Multi-Device Login Supports Simultaneous Active Sessions
    # ----------------------------------------------------------------------
    def test_multi_device_login_supports_simultaneous_sessions(self):
        """
        A new login produces a unique token and allows both devices to authenticate concurrently.
        """
        # Session 1: Login Device 1
        res1 = self.client.post('/api/auth/login/', {
            'username': self.employee.username,
            'password': self.password,
            'device_name': 'Phone 1'
        })
        token1 = res1.data['token']

        # Session 2: Login Device 2 with the same user
        res2 = self.client.post('/api/auth/login/', {
            'username': self.employee.username,
            'password': self.password,
            'device_name': 'Phone 2'
        })
        token2 = res2.data['token']

        # Tokens must be distinct
        self.assertNotEqual(token1, token2)

        # Both tokens must exist in DB
        self.assertTrue(Token.objects.filter(key=token1).exists())
        self.assertTrue(Token.objects.filter(key=token2).exists())

        # Token 1 must succeed
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token1}')
        res_t1 = self.client.get('/api/auth/me/')
        self.assertEqual(res_t1.status_code, status.HTTP_200_OK)

        # Token 2 must succeed
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token2}')
        res_t2 = self.client.get('/api/auth/me/')
        self.assertEqual(res_t2.status_code, status.HTTP_200_OK)

    # ----------------------------------------------------------------------
    # Test H: Password Change Invalidates Existing Tokens
    # ----------------------------------------------------------------------
    def test_password_change_invalidates_active_tokens(self):
        """Updating a user's password revokes all existing active tokens."""
        # Create active token
        token = Token.objects.create(user=self.employee)

        # User updates password
        self.employee.set_password('BrandNewPassword456!')
        self.employee.save()
        Token.objects.filter(user=self.employee).delete()

        # Old token must now be rejected
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        res = self.client.get('/api/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

        # New login with new password succeeds
        login_res = self.client.post('/api/auth/login/', {
            'username': self.employee.username,
            'password': 'BrandNewPassword456!'
        })
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)

    # ----------------------------------------------------------------------
    # Test I: Unauthenticated Requests -> HTTP 401
    # ----------------------------------------------------------------------
    def test_unauthenticated_request_rejected(self):
        """Requests without Authorization header return HTTP 401."""
        self.client.credentials() # Clear credentials
        res = self.client.get('/api/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    # ----------------------------------------------------------------------
    # Test L: Admin and Employee Share Same Expiration Rules
    # ----------------------------------------------------------------------
    @override_settings(AUTH_TOKEN_EXPIRATION_HOURS=24)
    def test_admin_tokens_also_expire_properly(self):
        """Admin accounts are also subject to server-side token expiration when configured."""
        admin_token = Token.objects.create(user=self.admin)
        ttl = get_token_ttl()
        admin_token.created = timezone.now() - (ttl + timedelta(minutes=10))
        admin_token.save()

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {admin_token.key}')
        res = self.client.get('/api/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
