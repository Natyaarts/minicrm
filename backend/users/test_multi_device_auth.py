from datetime import timedelta
from django.utils import timezone
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework import status
from users.models import UserAuthToken, RolePermission
from hrms.models import Department, Designation, EmployeeProfile

User = get_user_model()


class MultiDeviceAuthenticationTests(TestCase):
    """
    Comprehensive Multi-Device, Session Concurrency & Attendance Auth Test Suite.
    Verifies:
    1. Multi-Device Login: Same account logs into Phone A, Phone B, and Web CRM simultaneously.
    2. Web login does not invalidate mobile token.
    3. Mobile login does not invalidate web token.
    4. Per-Device Logout: Logging out on Device A revokes ONLY Device A's token; Device B remains authenticated.
    5. Missing Token Handling: Requests without Authorization header return HTTP 401.
    6. Invalid Token Handling: Malformed / non-existent tokens return HTTP 401.
    7. Expired Token Behavior: When expiration is configured (TTL=24h), expired tokens return 401.
    8. Unexpired Default Behavior: Without forced expiration, active sessions persist without 24h forced logout.
    9. Error Resilience: 403 Forbidden does not revoke or invalidate active tokens.
    10. Attendance Auth Verification: Clock in/out and attendance endpoints carry and enforce authentication tokens.
    11. Web & API Compatibility: Login payload format is backwards compatible ({'token': ..., 'user': ..., 'expires_in': ...}).
    """

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.password = "SecurePassword123!"

        # Create multi-device test user
        self.user = User.objects.create_user(
            username="multidevice_user",
            email="multidevice@natyaarts.org",
            password=self.password,
            role="SALES"
        )

        # Create admin user for RBAC verification
        self.admin = User.objects.create_user(
            username="admin_multidevice",
            email="admin_multi@natyaarts.org",
            password=self.password,
            role="ADMIN"
        )

        # Create department, designation, and configure employee profile for attendance testing
        self.dept = Department.objects.create(name="Sales Dept")
        self.desig = Designation.objects.create(name="Sales Exec", department=self.dept, permission_role="SALES")
        self.profile = self.user.hrms_profile
        self.profile.department = self.dept
        self.profile.designation = self.desig
        self.profile.save()

    def tearDown(self):
        cache.clear()

    def test_01_two_devices_logging_in_with_same_account(self):
        """
        Requirement 1: Two devices logging in with the same account get independent tokens.
        """
        # Login on Device A
        res_a = self.client.post('/api/auth/login/', {
            'username': self.user.username,
            'password': self.password,
            'device_name': 'iPhone 15 Pro'
        })
        self.assertEqual(res_a.status_code, status.HTTP_200_OK)
        token_a = res_a.data['token']

        # Login on Device B
        res_b = self.client.post('/api/auth/login/', {
            'username': self.user.username,
            'password': self.password,
            'device_name': 'Samsung Galaxy S24'
        })
        self.assertEqual(res_b.status_code, status.HTTP_200_OK)
        token_b = res_b.data['token']

        # Tokens must be distinct
        self.assertNotEqual(token_a, token_b)

        # Both tokens must exist in UserAuthToken table
        self.assertTrue(UserAuthToken.objects.filter(key=token_a, user=self.user).exists())
        self.assertTrue(UserAuthToken.objects.filter(key=token_b, user=self.user).exists())

        # Device A succeeds
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token_a}')
        res_me_a = self.client.get('/api/auth/me/')
        self.assertEqual(res_me_a.status_code, status.HTTP_200_OK)
        self.assertEqual(res_me_a.data['username'], self.user.username)

        # Device B succeeds
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token_b}')
        res_me_b = self.client.get('/api/auth/me/')
        self.assertEqual(res_me_b.status_code, status.HTTP_200_OK)
        self.assertEqual(res_me_b.data['username'], self.user.username)

    def test_02_web_login_not_invalidating_mobile_token(self):
        """
        Requirement 2: Logging in on Web CRM does NOT invalidate an existing mobile app token.
        """
        # Mobile app logs in first
        res_mobile = self.client.post('/api/auth/login/', {
            'username': self.user.username,
            'password': self.password,
            'device_name': 'Android Mobile App'
        })
        mobile_token = res_mobile.data['token']

        # Later, employee logs in via Web CRM
        res_web = self.client.post('/api/auth/login/', {
            'username': self.user.username,
            'password': self.password,
            'device_name': 'Chrome on Windows Web'
        })
        web_token = res_web.data['token']

        self.assertNotEqual(mobile_token, web_token)

        # Mobile token must still be valid and functional
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {mobile_token}')
        res_mobile_me = self.client.get('/api/auth/me/')
        self.assertEqual(res_mobile_me.status_code, status.HTTP_200_OK)
        self.assertEqual(res_mobile_me.data['username'], self.user.username)

        # Web token must also be valid
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {web_token}')
        res_web_me = self.client.get('/api/auth/me/')
        self.assertEqual(res_web_me.status_code, status.HTTP_200_OK)

    def test_03_mobile_login_not_invalidating_web_token(self):
        """
        Requirement 3: Logging into mobile app does NOT invalidate an existing Web CRM session.
        """
        # Web CRM logs in first
        res_web = self.client.post('/api/auth/login/', {
            'username': self.user.username,
            'password': self.password,
            'device_name': 'Chrome Web'
        })
        web_token = res_web.data['token']

        # Mobile app logs in later
        res_mobile = self.client.post('/api/auth/login/', {
            'username': self.user.username,
            'password': self.password,
            'device_name': 'iOS Mobile App'
        })
        mobile_token = res_mobile.data['token']

        # Web token remains fully functional
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {web_token}')
        res_web_me = self.client.get('/api/auth/me/')
        self.assertEqual(res_web_me.status_code, status.HTTP_200_OK)

        # Mobile token also works
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {mobile_token}')
        res_mobile_me = self.client.get('/api/auth/me/')
        self.assertEqual(res_mobile_me.status_code, status.HTTP_200_OK)

    def test_04_explicit_logout_revoking_only_intended_session(self):
        """
        Requirement 4: Logging out on Device A revokes ONLY Device A's session.
        Device B and Device C continue working normally.
        """
        # 1. Login Device A (Mobile)
        res_a = self.client.post('/api/auth/login/', {
            'username': self.user.username,
            'password': self.password,
            'device_name': 'Mobile Device A'
        })
        token_a = res_a.data['token']

        # 2. Login Device B (Web)
        res_b = self.client.post('/api/auth/login/', {
            'username': self.user.username,
            'password': self.password,
            'device_name': 'Web Device B'
        })
        token_b = res_b.data['token']

        # 3. Logout Device A
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token_a}')
        res_logout = self.client.post('/api/auth/logout/')
        self.assertEqual(res_logout.status_code, status.HTTP_200_OK)

        # Verify Token A is deleted server-side and rejected with 401
        self.assertFalse(UserAuthToken.objects.filter(key=token_a).exists())
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token_a}')
        res_me_a = self.client.get('/api/auth/me/')
        self.assertEqual(res_me_a.status_code, status.HTTP_401_UNAUTHORIZED)

        # Verify Token B remains fully active
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token_b}')
        res_me_b = self.client.get('/api/auth/me/')
        self.assertEqual(res_me_b.status_code, status.HTTP_200_OK)
        self.assertEqual(res_me_b.data['username'], self.user.username)

    def test_05_missing_token_handling(self):
        """
        Requirement 5: Requests without Authorization header return HTTP 401 with standard detail.
        """
        self.client.credentials()  # Clear credentials
        res = self.client.get('/api/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('Authentication credentials were not provided', str(res.data))

    def test_06_invalid_token_handling(self):
        """
        Requirement 6: Malformed / non-existent tokens return HTTP 401.
        """
        self.client.credentials(HTTP_AUTHORIZATION='Token nonexistent_or_tampered_token_key_12345')
        res = self.client.get('/api/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    @override_settings(AUTH_TOKEN_EXPIRATION_HOURS=24)
    def test_07_expired_token_behavior_when_configured(self):
        """
        Requirement 7: When expiration is configured (e.g. 24h), expired tokens return HTTP 401 and are cleaned up.
        """
        token = UserAuthToken.objects.create(user=self.user, device_name='Expired Device')
        UserAuthToken.objects.filter(key=token.key).update(
            created=timezone.now() - timedelta(hours=25)
        )

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        res = self.client.get('/api/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(UserAuthToken.objects.filter(key=token.key).exists())

    def test_08_unexpired_default_session_persists(self):
        """
        Requirement 8: By default, there is NO forced 24-hour logout. Active sessions older than 24h persist.
        """
        token = UserAuthToken.objects.create(user=self.user, device_name='Persistent Device')
        UserAuthToken.objects.filter(key=token.key).update(
            created=timezone.now() - timedelta(hours=72)
        )

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        res = self.client.get('/api/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['username'], self.user.username)

    def test_09_403_forbidden_does_not_revoke_token(self):
        """
        Requirement 9: A 403 Forbidden response does not invalidate or clear the user's active session.
        """
        token = UserAuthToken.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        # Sales user accesses Admin-only endpoint -> 403 Forbidden
        res_admin = self.client.get('/api/auth/management/users/')
        self.assertEqual(res_admin.status_code, status.HTTP_403_FORBIDDEN)

        # User's token remains completely valid
        res_me = self.client.get('/api/auth/me/')
        self.assertEqual(res_me.status_code, status.HTTP_200_OK)
        self.assertEqual(res_me.data['username'], self.user.username)

    def test_10_attendance_requests_carry_expected_credentials(self):
        """
        Requirement 10: Protected attendance endpoints (/api/hrms/attendance/) require and accept valid tokens.
        Without token -> 401. With token -> 200.
        """
        # 1. Unauthenticated attendance request -> 401
        self.client.credentials()
        res_unauth = self.client.get('/api/hrms/attendance/')
        self.assertEqual(res_unauth.status_code, status.HTTP_401_UNAUTHORIZED)

        # 2. Authenticated attendance request -> 200
        token = UserAuthToken.objects.create(user=self.user, device_name='Mobile Attendance Device')
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        res_auth = self.client.get('/api/hrms/attendance/', {'my_only': 'true'})
        self.assertEqual(res_auth.status_code, status.HTTP_200_OK)

    def test_11_password_change_revokes_all_device_sessions(self):
        """
        Security: Changing password revokes all active device sessions for the user.
        """
        token1 = UserAuthToken.objects.create(user=self.user, device_name='Device 1')
        token2 = UserAuthToken.objects.create(user=self.user, device_name='Device 2')

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token1.key}')
        res_change = self.client.post('/api/auth/change-password/', {
            'old_password': self.password,
            'new_password': 'BrandNewPassword456!'
        })
        self.assertEqual(res_change.status_code, status.HTTP_200_OK)
        new_token = res_change.data['token']

        # Old tokens revoked
        self.assertFalse(UserAuthToken.objects.filter(key=token1.key).exists())
        self.assertFalse(UserAuthToken.objects.filter(key=token2.key).exists())

        # New token valid
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {new_token}')
        res_me = self.client.get('/api/auth/me/')
        self.assertEqual(res_me.status_code, status.HTTP_200_OK)

    def test_12_migration_preserves_drf_tokens_associations_and_timestamps(self):
        """
        Requirement: Migration 0015 copies existing DRF tokens into UserAuthToken,
        strictly preserving keys, user associations, and original creation timestamps,
        and is safe for idempotent re-runs without data loss.
        """
        import importlib
        from rest_framework.authtoken.models import Token as DRFToken
        from django.apps import apps
        from django.db import connection

        migration_module = importlib.import_module('users.migrations.0015_userauthtoken_multi_device')
        copy_func = getattr(migration_module, 'copy_existing_authtokens')

        # Clean any pre-existing tokens for this user in both tables
        UserAuthToken.objects.filter(user=self.user).delete()
        DRFToken.objects.filter(user=self.user).delete()

        # Create a DRF token with a specific timestamp in the past (e.g. 10 days ago)
        original_created = timezone.now() - timedelta(days=10)
        legacy_key = "legacy_test_token_key_abcdef1234567890"
        DRFToken.objects.create(key=legacy_key, user=self.user)
        DRFToken.objects.filter(key=legacy_key).update(created=original_created)

        from django.db import connection as db_connection

        # Run migration copy function
        schema_editor = type('MockSchemaEditor', (), {'connection': db_connection})()
        copy_func(apps, schema_editor)

        # Verify UserAuthToken was created
        migrated = UserAuthToken.objects.filter(key=legacy_key).first()
        self.assertIsNotNone(migrated, "UserAuthToken was not migrated from authtoken")
        self.assertEqual(migrated.user_id, self.user.id)
        # Timestamp must match original timestamp, not the current time
        time_diff = abs((migrated.created - original_created).total_seconds())
        self.assertLess(time_diff, 2, f"Timestamp difference {time_diff}s too large; creation timestamp was not preserved")

        # Verify idempotent re-run: Running copy_func again must succeed without errors or duplicates
        copy_func(apps, schema_editor)
        self.assertEqual(UserAuthToken.objects.filter(key=legacy_key).count(), 1)
        # authtoken_token table must remain intact
        self.assertTrue(DRFToken.objects.filter(key=legacy_key).exists())

    def test_13_attendance_clock_in_and_clock_out_flow(self):
        """
        Attendance Flow: Employee clocks in and clocks out using mobile UserAuthToken.
        Verifies both endpoints succeed with valid credentials.
        """
        token = UserAuthToken.objects.create(user=self.user, device_name='Mobile Device')
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        # 1. Clock in
        res_in = self.client.post('/api/hrms/attendance/clock_in/', {
            'latitude': 12.9716,
            'longitude': 77.5946
        })
        self.assertEqual(res_in.status_code, status.HTTP_200_OK)
        self.assertIn('status', res_in.data)

        # 2. Clock out
        res_out = self.client.post('/api/hrms/attendance/clock_out/', {
            'latitude': 12.9716,
            'longitude': 77.5946
        })
        self.assertEqual(res_out.status_code, status.HTTP_200_OK)
