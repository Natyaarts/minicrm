from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework import status
from rest_framework.authtoken.models import Token

User = get_user_model()


class VA010RateLimitingTests(TestCase):
    """
    Automated Security Test Suite for VAPT Finding VA-010: Missing Rate Limiting.
    Verifies that:
    1. Authentication endpoints (login, password change) enforce strict rate limits against brute force.
    2. 429 Too Many Requests responses return safe, sanitized JSON envelopes.
    3. Retry-After headers are returned.
    4. Rate limits are tracked independently per IP / user (no global DoS lockout).
    5. Security headers (CSP, XFO, XCTO, etc.) remain intact on 429 responses.
    6. Changing usernames or client headers does not bypass rate limiting.
    """

    def setUp(self):
        # Clear cache before each test to ensure predictable rate limit counters
        cache.clear()
        self.client = Client()
        self.user = User.objects.create_user(
            username='rate_limit_user',
            email='rate_limit@example.com',
            password='ComplexPassword123!',
            role='SUPER_ADMIN'
        )
        self.token = Token.objects.create(user=self.user)
        self.auth_headers = {'HTTP_AUTHORIZATION': f'Token {self.token.key}'}

    def tearDown(self):
        cache.clear()

    def test_01_normal_requests_below_limit_succeed(self):
        """Test 1: Requests within normal rate limits succeed without throttling."""
        res = self.client.get('/api/auth/me/', **self.auth_headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_02_login_endpoint_throttles_after_threshold(self):
        """Test 2: Repeated login attempts are throttled with 429 after 5 requests/min."""
        client_ip = '203.0.113.10'
        # Send 5 failed login attempts (allowed threshold: 5/min)
        for i in range(5):
            res = self.client.post(
                '/api/auth/login/',
                {'username': 'rate_limit_user', 'password': 'WrongPassword!'},
                content_type='application/json',
                REMOTE_ADDR=client_ip
            )
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, f"Attempt {i+1} should be 400")

        # 6th attempt must be throttled with 429 Too Many Requests
        res_throttled = self.client.post(
            '/api/auth/login/',
            {'username': 'rate_limit_user', 'password': 'WrongPassword!'},
            content_type='application/json',
            REMOTE_ADDR=client_ip
        )
        self.assertEqual(res_throttled.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        data = res_throttled.json()
        self.assertEqual(data.get('error'), 'Too many requests. Please try again later.')
        self.assertEqual(data.get('status_code'), 429)
        self.assertIn('available_in', data)
        self.assertIsNotNone(res_throttled.headers.get('Retry-After'))

    def test_03_changing_username_does_not_bypass_ip_login_throttle(self):
        """Test 3: Credential stuffing across different usernames from the same IP is blocked."""
        client_ip = '203.0.113.20'
        usernames = ['admin', 'root', 'user1', 'user2', 'user3']
        for u in usernames:
            res = self.client.post(
                '/api/auth/login/',
                {'username': u, 'password': 'GuessedPassword123!'},
                content_type='application/json',
                REMOTE_ADDR=client_ip
            )
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # 6th attempt with another username is blocked by IP throttle
        res_blocked = self.client.post(
            '/api/auth/login/',
            {'username': 'victim_user', 'password': 'GuessedPassword123!'},
            content_type='application/json',
            REMOTE_ADDR=client_ip
        )
        self.assertEqual(res_blocked.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_04_different_ips_have_independent_rate_limit_buckets(self):
        """Test 4: An attacker on IP A being throttled does not block legitimate users on IP B."""
        attacker_ip = '198.51.100.50'
        legit_ip = '198.51.100.99'

        # Exhaust attacker's bucket
        for _ in range(5):
            self.client.post(
                '/api/auth/login/',
                {'username': 'attacker', 'password': 'wrong'},
                content_type='application/json',
                REMOTE_ADDR=attacker_ip
            )

        # Attacker gets 429
        res_attacker = self.client.post(
            '/api/auth/login/',
            {'username': 'attacker', 'password': 'wrong'},
            content_type='application/json',
            REMOTE_ADDR=attacker_ip
        )
        self.assertEqual(res_attacker.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        # Legitimate user from different IP can still login successfully
        res_legit = self.client.post(
            '/api/auth/login/',
            {'username': 'rate_limit_user', 'password': 'ComplexPassword123!'},
            content_type='application/json',
            REMOTE_ADDR=legit_ip
        )
        self.assertEqual(res_legit.status_code, status.HTTP_200_OK)
        self.assertIn('token', res_legit.json())

    def test_05_password_change_endpoint_throttles_abusive_requests(self):
        """Test 5: Password change endpoint throttles rapid requests from the same user."""
        # 5 password change attempts
        for i in range(5):
            res = self.client.post(
                '/api/auth/change-password/',
                {'old_password': 'wrong_old_password', 'new_password': 'NewPassword123!'},
                content_type='application/json',
                **self.auth_headers
            )
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # 6th attempt is throttled
        res_throttled = self.client.post(
            '/api/auth/change-password/',
            {'old_password': 'wrong_old_password', 'new_password': 'NewPassword123!'},
            content_type='application/json',
            **self.auth_headers
        )
        self.assertEqual(res_throttled.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_06_throttled_429_response_retains_security_headers(self):
        """Test 6: 429 Too Many Requests responses retain all defensive security headers."""
        client_ip = '203.0.113.80'
        for _ in range(5):
            self.client.post(
                '/api/auth/login/',
                {'username': 'user', 'password': 'wrong'},
                content_type='application/json',
                REMOTE_ADDR=client_ip
            )

        res_429 = self.client.post(
            '/api/auth/login/',
            {'username': 'user', 'password': 'wrong'},
            content_type='application/json',
            REMOTE_ADDR=client_ip
        )
        self.assertEqual(res_429.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        # Assert security headers
        self.assertEqual(res_429.headers.get('X-Frame-Options'), 'DENY')
        self.assertEqual(res_429.headers.get('X-Content-Type-Options'), 'nosniff')
        self.assertEqual(res_429.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin')
        self.assertIn("frame-ancestors 'none'", res_429.headers.get('Content-Security-Policy', ''))
        self.assertIn("camera=(self)", res_429.headers.get('Permissions-Policy', ''))
        self.assertNotIn('X-Powered-By', res_429.headers)

    def test_07_429_response_does_not_leak_internal_redis_or_cache_details(self):
        """Test 7: 429 response contains clean error payload without cache/system internals."""
        client_ip = '203.0.113.90'
        for _ in range(5):
            self.client.post(
                '/api/auth/login/',
                {'username': 'user', 'password': 'wrong'},
                content_type='application/json',
                REMOTE_ADDR=client_ip
            )

        res = self.client.post(
            '/api/auth/login/',
            {'username': 'user', 'password': 'wrong'},
            content_type='application/json',
            REMOTE_ADDR=client_ip
        )
        content = res.content.decode('utf-8', errors='ignore')
        self.assertNotIn('redis', content.lower())
        self.assertNotIn('cache', content.lower())
        self.assertNotIn('Traceback', content)
        self.assertNotIn('SimpleRateThrottle', content)
