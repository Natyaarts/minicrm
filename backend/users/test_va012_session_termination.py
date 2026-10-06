from datetime import timedelta
from django.utils import timezone
from django.core.cache import cache
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework.authtoken.models import Token

User = get_user_model()


class SessionTerminationSecurityTests(APITestCase):
    """
    Automated Security Verification for VA-012: Improper Session Termination.
    Verifies:
    1. Login creates a valid authenticated session/token.
    2. Authenticated requests succeed with active token.
    3. Logout revokes token and terminates session server-side.
    4. Revoked token immediately fails on subsequent requests with HTTP 401.
    5. Direct API calls with revoked/stale tokens are rejected.
    6. Expired tokens are rejected with HTTP 401.
    7. Password change invalidates previous authentication tokens.
    8. Newly issued tokens after password change/login work properly.
    9. Repeated logout calls are handled safely without 500 errors or leaks.
    10. Invalid/revoked token responses do not expose internal implementation details.
    11. Protected endpoints across modules remain strictly inaccessible after logout.
    12. Token rotation on login ensures only the latest session token is valid.
    13. Django session invalidation flushes session data upon logout.
    """

    def setUp(self):
        cache.clear()
        self.password = "Secur3P@ssw0rd!2026"
        self.user = User.objects.create_user(
            username="session_test_user",
            email="session_user@natyaarts.org",
            password=self.password,
            role="ADMIN"
        )

    def tearDown(self):
        cache.clear()

    def test_01_login_creates_valid_token(self):
        """Test 1: User login creates an active token and returns user details."""
        response = self.client.post('/api/auth/login/', {
            'username': 'session_test_user',
            'password': self.password
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)
        token_key = response.data['token']
        self.assertTrue(Token.objects.filter(key=token_key, user=self.user).exists())

    def test_02_authenticated_request_succeeds_before_logout(self):
        """Test 2: Protected endpoints succeed with a valid active token."""
        token = Token.objects.create(user=self.user)
        response = self.client.get(
            '/api/auth/me/',
            HTTP_AUTHORIZATION=f'Token {token.key}'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['username'], self.user.username)

    def test_03_logout_succeeds_and_deletes_token_server_side(self):
        """Test 3: Calling POST /api/auth/logout/ deletes the token from database."""
        token = Token.objects.create(user=self.user)
        token_key = token.key

        # Ensure token exists in DB before logout
        self.assertTrue(Token.objects.filter(key=token_key).exists())

        response = self.client.post(
            '/api/auth/logout/',
            HTTP_AUTHORIZATION=f'Token {token_key}'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('detail'), 'Successfully logged out.')

        # Ensure token is completely destroyed server-side
        self.assertFalse(Token.objects.filter(key=token_key).exists())

    def test_04_revoked_token_immediately_rejected_with_401(self):
        """Test 4: Attempting to use the token after logout returns HTTP 401."""
        token = Token.objects.create(user=self.user)
        token_key = token.key

        # Logout
        logout_resp = self.client.post(
            '/api/auth/logout/',
            HTTP_AUTHORIZATION=f'Token {token_key}'
        )
        self.assertEqual(logout_resp.status_code, status.HTTP_200_OK)

        # Attempt to access protected endpoint with old token
        reuse_resp = self.client.get(
            '/api/auth/me/',
            HTTP_AUTHORIZATION=f'Token {token_key}'
        )
        self.assertEqual(reuse_resp.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('Invalid or revoked', reuse_resp.data.get('error', ''))

    def test_05_expired_token_rejected_with_401(self):
        """Test 5: Expired tokens (>24h) are rejected with HTTP 401."""
        token = Token.objects.create(user=self.user)
        token_key = token.key

        # Age the token beyond 24 hours
        Token.objects.filter(key=token_key).update(
            created=timezone.now() - timedelta(hours=25)
        )

        response = self.client.get(
            '/api/auth/me/',
            HTTP_AUTHORIZATION=f'Token {token_key}'
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('expired', response.data.get('error', '').lower())

    def test_06_password_change_invalidates_previous_token(self):
        """Test 6: Changing password revokes old active token and issues new one."""
        old_token = Token.objects.create(user=self.user)
        old_token_key = old_token.key
        new_password = "BrandNewP@ssw0rd!2026"

        response = self.client.post(
            '/api/auth/change-password/',
            {
                'old_password': self.password,
                'new_password': new_password
            },
            HTTP_AUTHORIZATION=f'Token {old_token_key}',
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)
        new_token_key = response.data['token']
        self.assertNotEqual(old_token_key, new_token_key)

        # Old token must no longer exist in DB
        self.assertFalse(Token.objects.filter(key=old_token_key).exists())

        # Old token must receive 401
        old_token_res = self.client.get(
            '/api/auth/me/',
            HTTP_AUTHORIZATION=f'Token {old_token_key}'
        )
        self.assertEqual(old_token_res.status_code, status.HTTP_401_UNAUTHORIZED)

        # New token must work
        new_token_res = self.client.get(
            '/api/auth/me/',
            HTTP_AUTHORIZATION=f'Token {new_token_key}'
        )
        self.assertEqual(new_token_res.status_code, status.HTTP_200_OK)

    def test_07_token_rotation_on_relogin(self):
        """Test 7: Re-logging in destroys previous token for the user."""
        # 1st Login
        resp1 = self.client.post('/api/auth/login/', {
            'username': 'session_test_user',
            'password': self.password
        }, format='json')
        token1 = resp1.data['token']

        # 2nd Login
        resp2 = self.client.post('/api/auth/login/', {
            'username': 'session_test_user',
            'password': self.password
        }, format='json')
        token2 = resp2.data['token']

        self.assertNotEqual(token1, token2)

        # token1 must be deleted
        self.assertFalse(Token.objects.filter(key=token1).exists())

        # token1 receives 401
        resp_t1 = self.client.get(
            '/api/auth/me/',
            HTTP_AUTHORIZATION=f'Token {token1}'
        )
        self.assertEqual(resp_t1.status_code, status.HTTP_401_UNAUTHORIZED)

        # token2 works
        resp_t2 = self.client.get(
            '/api/auth/me/',
            HTTP_AUTHORIZATION=f'Token {token2}'
        )
        self.assertEqual(resp_t2.status_code, status.HTTP_200_OK)

    def test_08_repeated_logout_handled_safely(self):
        """Test 8: Repeated logout attempt with already revoked token returns 401 safely."""
        token = Token.objects.create(user=self.user)
        token_key = token.key

        # First logout
        resp1 = self.client.post(
            '/api/auth/logout/',
            HTTP_AUTHORIZATION=f'Token {token_key}'
        )
        self.assertEqual(resp1.status_code, status.HTTP_200_OK)

        # Second logout with same revoked token
        resp2 = self.client.post(
            '/api/auth/logout/',
            HTTP_AUTHORIZATION=f'Token {token_key}'
        )
        self.assertEqual(resp2.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(resp2.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR)

    def test_09_logout_response_contains_no_sensitive_leakage(self):
        """Test 9: Logout response contains only clean status confirmation."""
        token = Token.objects.create(user=self.user)
        response = self.client.post(
            '/api/auth/logout/',
            HTTP_AUTHORIZATION=f'Token {token.key}'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertNotIn('token', data)
        self.assertNotIn('password', data)
        self.assertNotIn('hash', str(data).lower())

    def test_10_multiple_modules_protected_post_logout(self):
        """Test 10: Revoked token cannot access CRM, HRMS, Payroll, or Finance endpoints."""
        token = Token.objects.create(user=self.user)
        token_key = token.key

        # Logout
        self.client.post(
            '/api/auth/logout/',
            HTTP_AUTHORIZATION=f'Token {token_key}'
        )

        endpoints = [
            '/api/auth/me/',
            '/api/crm/stages/',
            '/api/crm/tasks/',
            '/api/hrms/employees/',
            '/api/payroll/salary-structures/',
            '/api/finance/expenses/',
        ]

        for ep in endpoints:
            res = self.client.get(ep, HTTP_AUTHORIZATION=f'Token {token_key}')
            self.assertEqual(
                res.status_code,
                status.HTTP_401_UNAUTHORIZED,
                f"Endpoint {ep} allowed access with a revoked token!"
            )

    def test_11_django_session_flushed_on_logout(self):
        """Test 11: Django session data is flushed when logging out."""
        session = self.client.session
        session['custom_data'] = 'secret_session_val'
        session.save()

        token = Token.objects.create(user=self.user)
        response = self.client.post(
            '/api/auth/logout/',
            HTTP_AUTHORIZATION=f'Token {token.key}'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Verify session is empty/flushed
        self.assertNotIn('custom_data', self.client.session)
