import json
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from core.models import Student, Program
from core.serializers import StudentSerializer
from crm.models import PipelineStage, LeadInteraction
from crm.utils import LeadStatusResolver, ResolvedStatus, resolve_stage_filter_values

User = get_user_model()


class LeadStatusResolverUnitTest(TestCase):
    """
    Unit tests for LeadStatusResolver:
    Tests resolution logic in isolation with arbitrary, non-sequential, and custom PipelineStage configurations.
    """

    def setUp(self):
        # Create non-sequential, custom stage IDs: 101, 102, 103, 104
        # Note: 101 is NOT New Lead (it's Follow-up), 102 is New Lead.
        # This proves the system never hardcodes ID 1 as New Lead or ID 2 as Follow-up.
        self.stage_followup = PipelineStage.objects.create(id=101, name='Follow-up', order=2)
        self.stage_new = PipelineStage.objects.create(id=102, name='New Lead', order=1, is_default=True)
        self.stage_converted = PipelineStage.objects.create(id=103, name='Enrolled', order=3)
        self.stage_dropped = PipelineStage.objects.create(id=104, name='Dropped', order=4)
        self.resolver = LeadStatusResolver()

    def test_numeric_id_matching_actual_stage(self):
        """A numeric string matching an existing stage resolves to that stage."""
        resolved = self.resolver.resolve('101')
        self.assertTrue(resolved.is_resolved)
        self.assertEqual(resolved.stage_id, '101')
        self.assertEqual(resolved.stage_name, 'Follow-up')
        self.assertEqual(resolved.raw_status, '101')

        resolved_new = self.resolver.resolve('102')
        self.assertTrue(resolved_new.is_resolved)
        self.assertEqual(resolved_new.stage_id, '102')
        self.assertEqual(resolved_new.stage_name, 'New Lead')

    def test_no_assumption_that_id_1_or_2_has_fixed_meaning(self):
        """
        When ID '1' or '2' does not exist in the database, the resolver NEVER
        assumes '1' means New Lead or '2' means Follow-up.
        It must mark them explicitly as unresolved.
        """
        resolved_1 = self.resolver.resolve('1')
        self.assertFalse(resolved_1.is_resolved)
        self.assertIsNone(resolved_1.stage_id)
        self.assertEqual(resolved_1.raw_status, '1')
        self.assertEqual(resolved_1.stage_name, 'Unresolved (1)')

        resolved_2 = self.resolver.resolve('2')
        self.assertFalse(resolved_2.is_resolved)
        self.assertIsNone(resolved_2.stage_id)
        self.assertEqual(resolved_2.raw_status, '2')
        self.assertEqual(resolved_2.stage_name, 'Unresolved (2)')

    def test_case_insensitive_stage_name_matching(self):
        """Case-insensitive matching for stage names."""
        res1 = self.resolver.resolve('follow-up')
        self.assertTrue(res1.is_resolved)
        self.assertEqual(res1.stage_id, '101')
        self.assertEqual(res1.stage_name, 'Follow-up')

        res2 = self.resolver.resolve('NEW LEAD')
        self.assertTrue(res2.is_resolved)
        self.assertEqual(res2.stage_id, '102')
        self.assertEqual(res2.stage_name, 'New Lead')

        res3 = self.resolver.resolve('Enrolled')
        self.assertTrue(res3.is_resolved)
        self.assertEqual(res3.stage_id, '103')
        self.assertEqual(res3.stage_name, 'Enrolled')

    def test_legacy_enum_resolution(self):
        """Legacy enums map to the current database's canonical stages unambiguously."""
        res_new = self.resolver.resolve('NEW')
        self.assertTrue(res_new.is_resolved)
        self.assertEqual(res_new.stage_id, '102')
        self.assertEqual(res_new.stage_name, 'New Lead')

        res_fu = self.resolver.resolve('FOLLOW_UP')
        self.assertTrue(res_fu.is_resolved)
        self.assertEqual(res_fu.stage_id, '101')
        self.assertEqual(res_fu.stage_name, 'Follow-up')

        res_conv = self.resolver.resolve('CONVERTED')
        self.assertTrue(res_conv.is_resolved)
        self.assertEqual(res_conv.stage_id, '103')
        self.assertEqual(res_conv.stage_name, 'Enrolled')

        res_drop = self.resolver.resolve('DROPPED')
        self.assertTrue(res_drop.is_resolved)
        self.assertEqual(res_drop.stage_id, '104')
        self.assertEqual(res_drop.stage_name, 'Dropped')

    def test_duplicate_pseudo_status(self):
        """DUPLICATE pseudo-status is marked resolved with is_duplicate=True across capitalizations."""
        for val in ['DUPLICATE', 'duplicate', 'Duplicate', '  duplicate  ']:
            res = self.resolver.resolve(val)
            self.assertTrue(res.is_resolved)
            self.assertTrue(res.is_duplicate)
            self.assertIsNone(res.stage_id)
            self.assertEqual(res.stage_name, 'Duplicate Lead')
            self.assertEqual(res.raw_status, val.strip())

    def test_orphaned_and_unknown_and_null_status(self):
        """Orphaned numeric IDs, nulls, and unknown strings are marked unresolved and preserved."""
        # Orphaned numeric ID
        res_orphaned = self.resolver.resolve('999')
        self.assertFalse(res_orphaned.is_resolved)
        self.assertIsNone(res_orphaned.stage_id)
        self.assertEqual(res_orphaned.raw_status, '999')
        self.assertEqual(res_orphaned.stage_name, 'Unresolved (999)')

        # Null status
        res_none = self.resolver.resolve(None)
        self.assertFalse(res_none.is_resolved)
        self.assertIsNone(res_none.stage_id)
        self.assertEqual(res_none.raw_status, '')
        self.assertEqual(res_none.stage_name, 'Unresolved (None)')

        # Empty string
        res_empty = self.resolver.resolve('')
        self.assertFalse(res_empty.is_resolved)
        self.assertEqual(res_empty.raw_status, '')
        self.assertEqual(res_empty.stage_name, 'Unresolved (Empty)')

        # Unknown string
        res_unknown = self.resolver.resolve('RANDOM_STRING_STATUS')
        self.assertFalse(res_unknown.is_resolved)
        self.assertIsNone(res_unknown.stage_id)
        self.assertEqual(res_unknown.raw_status, 'RANDOM_STRING_STATUS')
        self.assertEqual(res_unknown.stage_name, 'Unresolved (RANDOM_STRING_STATUS)')

    def test_ambiguous_stage_name_matches_handled_safely(self):
        """
        If two stages have the exact same name (e.g. two stages called 'Review'),
        resolving by that name must NOT arbitrarily guess one stage over the other;
        it must flag the value as ambiguous and unresolved.
        """
        # Create a resolver with stages containing duplicate names
        s1 = PipelineStage(id=201, name='Review', order=5)
        s2 = PipelineStage(id=202, name='Review', order=6)
        ambiguous_resolver = LeadStatusResolver(stages=[s1, s2])

        # Exact numeric ID matches still work unambiguously
        res_num = ambiguous_resolver.resolve('201')
        self.assertTrue(res_num.is_resolved)
        self.assertEqual(res_num.stage_id, '201')

        # Name match is ambiguous
        res_name = ambiguous_resolver.resolve('Review')
        self.assertFalse(res_name.is_resolved)
        self.assertIsNone(res_name.stage_id)
        self.assertIn('Ambiguous', res_name.stage_name)


class StudentSerializerStatusMetadataTest(TestCase):
    """
    Tests StudentSerializer exposure of:
    - lead_status_display
    - lead_stage_id
    - is_lead_status_resolved
    - lead_status (preserved raw)
    """

    def setUp(self):
        self.program = Program.objects.create(name='Music Program')
        self.stage_new = PipelineStage.objects.create(id=101, name='New Lead', order=1, is_default=True)
        self.stage_contacted = PipelineStage.objects.create(id=102, name='Contacted', order=2)

        # 1. Lead with numeric stage ID matching current stage
        u1 = User.objects.create_user(username='lead_user_1', password='password123')
        self.lead_valid = Student.objects.create(
            user=u1,
            crm_student_id='L-VAL-1',
            first_name='Ananya',
            program_type=self.program,
            lead_status=str(self.stage_new.id)
        )

        # 2. Lead with legacy enum code 'NEW' (persisted directly in DB without save() re-assignment)
        u2 = User.objects.create_user(username='lead_user_2', password='password123')
        self.lead_legacy = Student.objects.create(
            user=u2,
            crm_student_id='L-LEG-1',
            first_name='Ravi',
            program_type=self.program
        )
        Student.objects.filter(id=self.lead_legacy.id).update(lead_status='NEW')
        self.lead_legacy.refresh_from_db()

        # 3. Lead with orphaned numeric ID '999'
        u3 = User.objects.create_user(username='lead_user_3', password='password123')
        self.lead_orphaned = Student.objects.create(
            user=u3,
            crm_student_id='L-ORP-1',
            first_name='Dev',
            program_type=self.program,
            lead_status='999'
        )

        # 4. In-memory lead with null status to test serializer resilience
        u4 = User.objects.create_user(username='lead_user_4', password='password123')
        self.lead_null = Student(
            id=9994,
            user=u4,
            crm_student_id='L-NUL-1',
            first_name='Sunita',
            program_type=self.program,
            lead_status=None
        )

        # 5. Lead with empty string status in DB
        u5 = User.objects.create_user(username='lead_user_5', password='password123')
        self.lead_empty = Student.objects.create(
            user=u5,
            crm_student_id='L-EMP-1',
            first_name='Kiran',
            program_type=self.program
        )
        Student.objects.filter(id=self.lead_empty.id).update(lead_status='')
        self.lead_empty.refresh_from_db()

    def test_serializer_metadata_valid_stage_id(self):
        """Serializer produces resolved metadata for numeric stage ID."""
        data = StudentSerializer(self.lead_valid).data
        self.assertEqual(data['lead_status'], str(self.stage_new.id))
        self.assertEqual(data['lead_status_display'], 'New Lead')
        self.assertEqual(data['lead_stage_id'], self.stage_new.id)
        self.assertTrue(data['is_lead_status_resolved'])

    def test_serializer_metadata_legacy_enum(self):
        """Serializer resolves legacy enum to canonical stage metadata while preserving raw value."""
        data = StudentSerializer(self.lead_legacy).data
        self.assertEqual(data['lead_status'], 'NEW')  # Raw preserved
        self.assertEqual(data['lead_status_display'], 'New Lead')
        self.assertEqual(data['lead_stage_id'], self.stage_new.id)
        self.assertTrue(data['is_lead_status_resolved'])

    def test_serializer_metadata_orphaned_status(self):
        """Serializer marks orphaned ID as unresolved and preserves raw stored value."""
        data = StudentSerializer(self.lead_orphaned).data
        self.assertEqual(data['lead_status'], '999')  # Raw preserved
        self.assertEqual(data['lead_status_display'], 'Unresolved (999)')
        self.assertIsNone(data['lead_stage_id'])
        self.assertFalse(data['is_lead_status_resolved'])

    def test_serializer_metadata_null_status(self):
        """Serializer handles null lead_status gracefully."""
        data = StudentSerializer(self.lead_null).data
        self.assertIsNone(data['lead_status'])
        self.assertEqual(data['lead_status_display'], 'Unresolved (None)')
        self.assertIsNone(data['lead_stage_id'])
        self.assertFalse(data['is_lead_status_resolved'])

    def test_serializer_metadata_empty_status(self):
        """Serializer handles empty string lead_status gracefully."""
        data = StudentSerializer(self.lead_empty).data
        self.assertEqual(data['lead_status'], '')
        self.assertEqual(data['lead_status_display'], 'Unresolved (Empty)')
        self.assertIsNone(data['lead_stage_id'])
        self.assertFalse(data['is_lead_status_resolved'])


class DashboardStatsAggregationStatusTest(TestCase):
    """
    Tests DashboardStatsView aggregation with LeadStatusResolver:
    - Human-readable stage labels
    - No leads omitted
    - Unresolved diagnostic buckets
    - Preserves existing filters & Fresh Leads count semantics
    """

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username='admin_dash_test',
            password='password123',
            email='admin_dash@example.com',
            role='SUPER_ADMIN'
        )
        self.client.force_authenticate(user=self.admin)

        self.program = Program.objects.create(name='Test Program')
        self.stage_new = PipelineStage.objects.create(id=101, name='New Lead', order=1, is_default=True)
        self.stage_fu = PipelineStage.objects.create(id=102, name='Follow-up', order=2)
        self.stage_conv = PipelineStage.objects.create(id=103, name='Enrolled', order=3)

        # Lead 1: raw '101' -> New Lead
        u1 = User.objects.create_user(username='u_dash_1', password='password123')
        Student.objects.create(user=u1, crm_student_id='D-1', program_type=self.program, lead_status='101')

        # Lead 2: raw 'NEW' -> canonical New Lead (101)
        u2 = User.objects.create_user(username='u_dash_2', password='password123')
        s2 = Student.objects.create(user=u2, crm_student_id='D-2', program_type=self.program)
        Student.objects.filter(id=s2.id).update(lead_status='NEW')

        # Lead 3: raw '102' -> Follow-up
        u3 = User.objects.create_user(username='u_dash_3', password='password123')
        Student.objects.create(user=u3, crm_student_id='D-3', program_type=self.program, lead_status='102')

        # Lead 4: raw '999' -> Orphaned
        u4 = User.objects.create_user(username='u_dash_4', password='password123')
        Student.objects.create(user=u4, crm_student_id='D-4', program_type=self.program, lead_status='999')

    def test_dashboard_aggregates_labels_and_diagnostic_bucket(self):
        """Dashboard groups counts under human-readable names and reports unresolved explicitly."""
        res = self.client.get('/api/crm/dashboard-stats/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data

        # Total leads should be 4
        self.assertEqual(data['total_leads'], 4)

        pipeline_stages = data.get('pipeline_stages', [])
        stage_map = {item['name']: item for item in pipeline_stages}

        # 'New Lead' should aggregate both '101' and 'NEW' (count = 2)
        self.assertIn('New Lead', stage_map)
        self.assertEqual(stage_map['New Lead']['count'], 2)
        self.assertFalse(stage_map['New Lead'].get('is_unresolved', False))

        # 'Follow-up' should have count = 1
        self.assertIn('Follow-up', stage_map)
        self.assertEqual(stage_map['Follow-up']['count'], 1)

        # 'Unresolved (999)' should be an explicit diagnostic bucket with count = 1
        self.assertIn('Unresolved (999)', stage_map)
        self.assertEqual(stage_map['Unresolved (999)']['count'], 1)
        self.assertTrue(stage_map['Unresolved (999)']['is_unresolved'])

        # Sum of counts across all buckets equals total leads (no lead omitted!)
        total_in_buckets = sum(item['count'] for item in pipeline_stages)
        self.assertEqual(total_in_buckets, 4)

        # Fresh Leads semantic: only leads with NEW status ('101' and 'NEW' matching new_stages)
        self.assertEqual(data['fresh_leads'], 2)


class StudentsAPIFilterAndStatusConsistencyTest(TestCase):
    """
    Integration tests verifying:
    - Querying leads API (?lead_status=101, ?lead_status=NEW)
    - Patching lead_status to new stage ID records accurate transition notes
    - Unresolved values are preserved and exposed with display metadata
    """

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username='admin_api_test',
            password='password123',
            email='admin_api@example.com',
            role='SUPER_ADMIN'
        )
        self.client.force_authenticate(user=self.admin)

        self.program = Program.objects.create(name='Dance Program')
        self.stage_new = PipelineStage.objects.create(id=101, name='New Lead', order=1, is_default=True)
        self.stage_fu = PipelineStage.objects.create(id=102, name='Follow-up', order=2)

        u1 = User.objects.create_user(username='u_api_1', password='password123')
        self.lead_1 = Student.objects.create(user=u1, crm_student_id='API-1', program_type=self.program, lead_status='101')

        u2 = User.objects.create_user(username='u_api_2', password='password123')
        self.lead_2 = Student.objects.create(user=u2, crm_student_id='API-2', program_type=self.program)
        Student.objects.filter(id=self.lead_2.id).update(lead_status='NEW')

        u3 = User.objects.create_user(username='u_api_3', password='password123')
        self.lead_orphaned = Student.objects.create(user=u3, crm_student_id='API-3', program_type=self.program, lead_status='999')

    def test_filter_by_stage_id_returns_both_stage_id_and_legacy_records(self):
        """Querying ?lead_status=101 returns both lead_status='101' and lead_status='NEW'."""
        res = self.client.get(f'/api/students/?lead_status={self.stage_new.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data if isinstance(res.data, list) else res.data.get('results', [])
        ids = [r['id'] for r in results]
        self.assertIn(self.lead_1.id, ids)
        self.assertIn(self.lead_2.id, ids)

    def test_filter_by_legacy_enum_returns_matching_records(self):
        """Querying ?lead_status=NEW returns both lead_status='101' and lead_status='NEW'."""
        res = self.client.get('/api/students/?lead_status=NEW')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data if isinstance(res.data, list) else res.data.get('results', [])
        ids = [r['id'] for r in results]
        self.assertIn(self.lead_1.id, ids)
        self.assertIn(self.lead_2.id, ids)

    def test_api_patch_lead_status_records_interaction_with_human_readable_name(self):
        """PATCH /api/students/<id>/ with lead_status records transition notes using stage names."""
        res = self.client.patch(f'/api/students/{self.lead_1.id}/', {'lead_status': str(self.stage_fu.id)})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['lead_status'], str(self.stage_fu.id))
        self.assertEqual(res.data['lead_status_display'], 'Follow-up')
        self.assertEqual(res.data['lead_stage_id'], self.stage_fu.id)
        self.assertTrue(res.data['is_lead_status_resolved'])

        interaction = LeadInteraction.objects.filter(student=self.lead_1).first()
        self.assertIsNotNone(interaction)
        self.assertIn("Status changed from 'New Lead' to 'Follow-up'", interaction.notes)

    def test_api_returns_unresolved_fields_accurately(self):
        """GET /api/students/<id>/ for orphaned status preserves raw status and exposes unresolved metadata."""
        res = self.client.get(f'/api/students/{self.lead_orphaned.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['lead_status'], '999')
        self.assertEqual(res.data['lead_status_display'], 'Unresolved (999)')
        self.assertIsNone(res.data['lead_stage_id'])
        self.assertFalse(res.data['is_lead_status_resolved'])
