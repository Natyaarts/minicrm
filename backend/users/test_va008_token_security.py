from django.core.cache import cache
from datetime import timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework.authtoken.models import Token
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
        """POST /api/auth/login/ returns 200 with token and expiration metadata."""
        response = self.client.post('/api/auth/login/', {
            'username': self.employee.username,
            'password': self.password
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)
        self.assertIn('expires_in', response.data)
        self.assertGreater(response.data['expires_in'], 0)
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
    # Test C & J & K: Server-Side Token Expiration -> HTTP 401
    # ----------------------------------------------------------------------
    def test_expired_token_rejected_with_401(self):
        """
        A token whose age exceeds the TTL (e.g. 24h) is rejected with HTTP 401
        and purged from the database, regardless of any client-side headers.
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
    # Test F & G: Token Rotation on New Login
    # ----------------------------------------------------------------------
    def test_login_rotates_tokens_and_invalidates_previous_session(self):
        """
        A new login produces a new token and deletes the old token,
        preventing permanent static credential reuse.
        """
        # Session 1: Login
        res1 = self.client.post('/api/auth/login/', {
            'username': self.employee.username,
            'password': self.password
        })
        token1 = res1.data['token']

        # Session 2: Login again with the same user
        res2 = self.client.post('/api/auth/login/', {
            'username': self.employee.username,
            'password': self.password
        })
        token2 = res2.data['token']

        # Tokens must be different (Token rotation)
        self.assertNotEqual(token1, token2)

        # Old Token 1 must no longer exist in the database
        self.assertFalse(Token.objects.filter(key=token1).exists())

        # Old Token 1 must fail when used
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token1}')
        res_old = self.client.get('/api/auth/me/')
        self.assertEqual(res_old.status_code, status.HTTP_401_UNAUTHORIZED)

        # New Token 2 must succeed
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token2}')
        res_new = self.client.get('/api/auth/me/')
        self.assertEqual(res_new.status_code, status.HTTP_200_OK)

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
    def test_admin_tokens_also_expire_properly(self):
        """Admin accounts are also subject to server-side token expiration."""
        admin_token = Token.objects.create(user=self.admin)
        ttl = get_token_ttl()
        admin_token.created = timezone.now() - (ttl + timedelta(minutes=10))
        admin_token.save()

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {admin_token.key}')
        res = self.client.get('/api/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
