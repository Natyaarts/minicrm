import importlib
from datetime import timedelta
from django.utils import timezone
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.apps import apps
from django.db import connection, IntegrityError
from rest_framework.authtoken.models import Token as DRFToken
from users.models import UserAuthToken

User = get_user_model()


class Migration0015SafetyTests(TestCase):
    """
    Focused migration safety tests for users.migrations.0015_userauthtoken_multi_device:
    1. An existing DRF token is copied to UserAuthToken.
    2. The token key and user association are preserved.
    3. The original created timestamp is preserved exactly.
    4. A duplicate key with matching user is handled safely without overwriting.
    5. A duplicate key with a conflicting user raises a clear IntegrityError.
    6. An unexpected missing user causes a visible migration failure (IntegrityError).
    7. The legacy authtoken_token record remains unchanged.
    """

    def setUp(self):
        # Clear token tables for clean isolated test state
        UserAuthToken.objects.all().delete()
        DRFToken.objects.all().delete()

        # Load migration copy function
        self.migration_module = importlib.import_module('users.migrations.0015_userauthtoken_multi_device')
        self.copy_func = getattr(self.migration_module, 'copy_existing_authtokens')
        self.schema_editor = type('MockSchemaEditor', (), {'connection': connection})()

        # Create primary test users
        self.user1 = User.objects.create_user(
            username='migration_user_1',
            email='mig1@natyaarts.org',
            password='TestPassword123!',
            role='SALES'
        )
        self.user2 = User.objects.create_user(
            username='migration_user_2',
            email='mig2@natyaarts.org',
            password='TestPassword123!',
            role='TEACHER'
        )

    def test_01_existing_drf_token_copied_to_userauthtoken(self):
        """
        Requirement 1: An existing DRF token is copied to UserAuthToken.
        """
        key1 = "drf_token_key_11111111111111111111111111111111"
        key2 = "drf_token_key_22222222222222222222222222222222"
        DRFToken.objects.create(key=key1, user=self.user1)
        DRFToken.objects.create(key=key2, user=self.user2)

        self.copy_func(apps, self.schema_editor)

        self.assertEqual(UserAuthToken.objects.count(), 2)
        self.assertTrue(UserAuthToken.objects.filter(key=key1).exists())
        self.assertTrue(UserAuthToken.objects.filter(key=key2).exists())

    def test_02_token_key_and_user_association_preserved(self):
        """
        Requirement 2: The token key and user association are preserved.
        """
        legacy_key = "drf_token_key_assoc_test_333333333333333333333333"
        drf_token = DRFToken.objects.create(key=legacy_key, user=self.user1)

        self.copy_func(apps, self.schema_editor)

        migrated = UserAuthToken.objects.get(key=legacy_key)
        self.assertEqual(migrated.key, drf_token.key)
        self.assertEqual(migrated.user_id, self.user1.id)
        self.assertEqual(migrated.user, self.user1)

    def test_03_original_created_timestamp_preserved_exactly(self):
        """
        Requirement 3: The original created timestamp is preserved exactly.
        """
        past_time = timezone.now() - timedelta(days=14, hours=5, minutes=30)
        legacy_key = "drf_token_key_timestamp_test_44444444444444444444"
        DRFToken.objects.create(key=legacy_key, user=self.user1)
        DRFToken.objects.filter(key=legacy_key).update(created=past_time)

        self.copy_func(apps, self.schema_editor)

        migrated = UserAuthToken.objects.get(key=legacy_key)
        # Verify timestamp matches past_time exactly (within 1 second tolerance for DB precision)
        time_diff = abs((migrated.created - past_time).total_seconds())
        self.assertLess(time_diff, 1.0, f"Timestamp was modified during migration! Diff: {time_diff}s")

    def test_04_matching_user_duplicate_key_handled_safely(self):
        """
        Requirement 4: A duplicate key with matching user is handled safely without overwriting existing values.
        """
        key = "drf_token_key_duplicate_match_55555555555555555555"
        DRFToken.objects.create(key=key, user=self.user1)

        # Pre-seed UserAuthToken with the same key, user, and a distinct device_name
        UserAuthToken.objects.create(
            key=key,
            user=self.user1,
            device_name='Existing Custom Device Session'
        )

        # Migration should succeed without crashing on primary key collision
        self.copy_func(apps, self.schema_editor)

        # Exactly 1 record should exist, and original custom device_name remains intact
        self.assertEqual(UserAuthToken.objects.filter(key=key).count(), 1)
        token = UserAuthToken.objects.get(key=key)
        self.assertEqual(token.device_name, 'Existing Custom Device Session')
        self.assertEqual(token.user_id, self.user1.id)

        # Re-running migration again must also succeed idempotently
        self.copy_func(apps, self.schema_editor)
        self.assertEqual(UserAuthToken.objects.count(), 1)

    def test_05_conflicting_user_duplicate_key_raises_integrity_error(self):
        """
        Requirement 5: A duplicate key associated with a conflicting/different user raises a clear IntegrityError.
        """
        key = "drf_token_key_conflict_666666666666666666666666"

        # Pre-seed UserAuthToken with user1
        UserAuthToken.objects.create(
            key=key,
            user=self.user1,
            device_name='User 1 Session'
        )

        # Create legacy DRFToken with the same key but assigned to user2
        DRFToken.objects.create(key=key, user=self.user2)

        # Running migration copy_func must raise IntegrityError indicating conflict
        with self.assertRaises(IntegrityError) as ctx:
            self.copy_func(apps, self.schema_editor)

        self.assertIn("Conflict detected for token", str(ctx.exception))
        self.assertIn(key, str(ctx.exception))
        self.assertIn(str(self.user1.id), str(ctx.exception))
        self.assertIn(str(self.user2.id), str(ctx.exception))

    def test_06_unexpected_missing_user_causes_visible_migration_failure(self):
        """
        Requirement 6: An unexpected missing user causes a visible migration failure rather than silently skipping the token.
        """
        orphan_key = "drf_token_orphan_missing_user_7777777777777777777"
        non_existent_user_id = 999999
        self.assertFalse(User.objects.filter(id=non_existent_user_id).exists())

        # Create a mock token object representing an orphaned legacy token
        class MockDRFToken:
            key = orphan_key
            user_id = non_existent_user_id
            created = timezone.now()

        class MockDRFTokenManager:
            def using(self, alias):
                return self
            def all(self):
                return [MockDRFToken()]

        class MockDRFTokenModel:
            objects = MockDRFTokenManager()

        class MockApps:
            def get_model(self, app_label, model_name):
                if model_name == 'Token':
                    return MockDRFTokenModel
                return apps.get_model(app_label, model_name)

        # Running migration copy_func with orphaned token must raise IntegrityError
        with self.assertRaises(IntegrityError) as ctx:
            self.copy_func(MockApps(), self.schema_editor)

        self.assertIn("Cannot migrate auth token", str(ctx.exception))
        self.assertIn(str(non_existent_user_id), str(ctx.exception))

    def test_07_legacy_authtoken_record_remains_unchanged(self):
        """
        Requirement 7: The legacy authtoken_token record remains unchanged.
        """
        legacy_key = "drf_token_legacy_integrity_test_88888888888888888"
        created_time = timezone.now() - timedelta(days=3)
        DRFToken.objects.create(key=legacy_key, user=self.user1)
        DRFToken.objects.filter(key=legacy_key).update(created=created_time)

        # Capture legacy state before migration
        before_count = DRFToken.objects.count()
        before_token = DRFToken.objects.get(key=legacy_key)

        # Run migration
        self.copy_func(apps, self.schema_editor)

        # Verify legacy state after migration is completely unchanged
        self.assertEqual(DRFToken.objects.count(), before_count)
        after_token = DRFToken.objects.get(key=legacy_key)
        self.assertEqual(after_token.key, before_token.key)
        self.assertEqual(after_token.user_id, before_token.user_id)
        self.assertEqual(after_token.created, before_token.created)
