from django.test import TestCase, Client, override_settings
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.authtoken.models import Token

User = get_user_model()


class VA004CorsSecurityTests(TestCase):
    """
    Automated Security Test Suite for VAPT Finding VA-004: CORS Misconfiguration.
    Verifies that arbitrary origins are NOT reflected, credentials are not shared with untrusted origins,
    preflight requests are properly restricted, and legitimate CRM frontend origins function normally.
    """

    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            username='cors_test_user',
            email='cors_test@example.com',
            password='ComplexPassword123!',
            role='EMPLOYEE'
        )
        self.token = Token.objects.create(user=self.user)

    def test_a_trusted_origin_receives_cors_headers(self):
        """Test A: Trusted frontend origin receives expected Access-Control-Allow-Origin header."""
        response = self.client.get(
            '/api/auth/me/',
            HTTP_ORIGIN='https://natyaarts.org',
            HTTP_AUTHORIZATION=f'Token {self.token.key}'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.headers.get('Access-Control-Allow-Origin'), 'https://natyaarts.org')
        self.assertEqual(response.headers.get('Access-Control-Allow-Credentials'), 'true')

    def test_b_untrusted_origin_does_not_receive_cors_allow_origin(self):
        """Test B: Untrusted origin does NOT receive Access-Control-Allow-Origin header."""
        response = self.client.get(
            '/api/auth/me/',
            HTTP_ORIGIN='https://evil.example',
            HTTP_AUTHORIZATION=f'Token {self.token.key}'
        )
        # Server should NOT grant cross-origin permission to evil.example
        self.assertNotIn('Access-Control-Allow-Origin', response.headers)
        self.assertNotIn('Access-Control-Allow-Credentials', response.headers)

    def test_c_arbitrary_evil_origin_not_reflected(self):
        """Test C: Arbitrary evil origin is not reflected in response headers."""
        response = self.client.get(
            '/api/auth/me/',
            HTTP_ORIGIN='https://evil.example',
            HTTP_AUTHORIZATION=f'Token {self.token.key}'
        )
        allow_origin = response.headers.get('Access-Control-Allow-Origin')
        self.assertNotEqual(allow_origin, 'https://evil.example')
        self.assertIsNone(allow_origin)

    def test_d_arbitrary_attacker_origin_not_reflected(self):
        """Test D: Arbitrary attacker origin is not reflected in response headers."""
        response = self.client.get(
            '/api/auth/me/',
            HTTP_ORIGIN='https://attacker.example',
            HTTP_AUTHORIZATION=f'Token {self.token.key}'
        )
        allow_origin = response.headers.get('Access-Control-Allow-Origin')
        self.assertNotEqual(allow_origin, 'https://attacker.example')
        self.assertIsNone(allow_origin)

    def test_e_credentialed_request_from_trusted_origin_allowed(self):
        """Test E: Credentialed request from trusted origin receives allow-credentials header."""
        response = self.client.get(
            '/api/auth/me/',
            HTTP_ORIGIN='http://localhost:5173',
            HTTP_AUTHORIZATION=f'Token {self.token.key}'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173')
        self.assertEqual(response.headers.get('Access-Control-Allow-Credentials'), 'true')

    def test_f_credentialed_request_from_untrusted_origin_not_allowed(self):
        """Test F: Credentialed request from untrusted origin does NOT receive allow-credentials."""
        response = self.client.get(
            '/api/auth/me/',
            HTTP_ORIGIN='https://unauthorized-site.com',
            HTTP_AUTHORIZATION=f'Token {self.token.key}'
        )
        self.assertIsNone(response.headers.get('Access-Control-Allow-Credentials'))
        self.assertIsNone(response.headers.get('Access-Control-Allow-Origin'))

    def test_g_options_preflight_from_trusted_origin(self):
        """Test G: OPTIONS preflight from trusted origin succeeds with valid CORS headers."""
        response = self.client.options(
            '/api/auth/me/',
            HTTP_ORIGIN='https://natyaarts.org',
            HTTP_ACCESS_CONTROL_REQUEST_METHOD='GET',
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS='authorization,content-type'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.headers.get('Access-Control-Allow-Origin'), 'https://natyaarts.org')
        self.assertEqual(response.headers.get('Access-Control-Allow-Credentials'), 'true')
        self.assertIn('Access-Control-Allow-Methods', response.headers)
        self.assertIn('Access-Control-Allow-Headers', response.headers)

    def test_h_options_preflight_from_untrusted_origin(self):
        """Test H: OPTIONS preflight from untrusted origin does NOT grant CORS permissions."""
        response = self.client.options(
            '/api/auth/me/',
            HTTP_ORIGIN='https://evil.example',
            HTTP_ACCESS_CONTROL_REQUEST_METHOD='POST',
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS='authorization,content-type'
        )
        self.assertNotIn('Access-Control-Allow-Origin', response.headers)
        self.assertNotIn('Access-Control-Allow-Credentials', response.headers)
        self.assertNotIn('Access-Control-Allow-Methods', response.headers)

    def test_i_normal_same_origin_requests_continue_working(self):
        """Test I: Normal requests without Origin header continue working cleanly."""
        response = self.client.get(
            '/api/auth/me/',
            HTTP_AUTHORIZATION=f'Token {self.token.key}'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()['username'], 'cors_test_user')

    def test_j_uat_origin_receives_cors_headers(self):
        """Test J: Existing UAT origin (http://13.232.192.160:5173) is trusted and allowed."""
        response = self.client.get(
            '/api/auth/me/',
            HTTP_ORIGIN='http://13.232.192.160:5173',
            HTTP_AUTHORIZATION=f'Token {self.token.key}'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.headers.get('Access-Control-Allow-Origin'), 'http://13.232.192.160:5173')
        self.assertEqual(response.headers.get('Access-Control-Allow-Credentials'), 'true')

    def test_k_wildcard_not_used_with_credentials(self):
        """Test K: Verify wildcard '*' is never returned when credentials are enabled."""
        for origin in ['https://natyaarts.org', 'http://localhost:5173', 'https://evil.example']:
            response = self.client.get(
                '/api/auth/me/',
                HTTP_ORIGIN=origin,
                HTTP_AUTHORIZATION=f'Token {self.token.key}'
            )
            self.assertNotEqual(response.headers.get('Access-Control-Allow-Origin'), '*')

    def test_l_visually_similar_domain_rejected(self):
        """Test L: Suffix/prefix attacker domains like natyaarts.org.attacker.com are rejected."""
        attacker_origins = [
            'https://natyaarts.org.attacker.com',
            'https://attacker-natyaarts.org',
            'https://fake-natyaarts.org',
            'http://13.232.192.160.attacker.com',
            'https://natyaarts.org:8080',  # Wrong port
        ]
        for origin in attacker_origins:
            response = self.client.get(
                '/api/auth/me/',
                HTTP_ORIGIN=origin,
                HTTP_AUTHORIZATION=f'Token {self.token.key}'
            )
            self.assertNotIn(
                'Access-Control-Allow-Origin',
                response.headers,
                f"Origin {origin} should not be granted Access-Control-Allow-Origin"
            )

    def test_m_multiple_production_and_dev_origins_supported(self):
        """Test M: Verified production, UAT, and local development origins all work."""
        trusted_origins = [
            'https://natyaarts.org',
            'https://www.natyaarts.org',
            'http://natyaarts.org',
            'http://www.natyaarts.org',
            'http://13.232.192.160:5173',
            'http://13.232.192.160',
            'http://localhost:5173',
            'http://127.0.0.1:5173',
            'http://localhost:3000',
            'http://127.0.0.1:3000',
        ]
        for origin in trusted_origins:
            response = self.client.get(
                '/api/auth/me/',
                HTTP_ORIGIN=origin,
                HTTP_AUTHORIZATION=f'Token {self.token.key}'
            )
            self.assertEqual(
                response.headers.get('Access-Control-Allow-Origin'),
                origin,
                f"Trusted origin {origin} failed to receive Access-Control-Allow-Origin"
            )
            self.assertEqual(response.headers.get('Access-Control-Allow-Credentials'), 'true')
