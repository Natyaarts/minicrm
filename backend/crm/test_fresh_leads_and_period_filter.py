import datetime
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from core.models import Program, Student
from crm.models import PipelineStage, LeadInteraction, Campaign
from crm.utils import (
    get_canonical_new_lead_stage,
    get_canonical_new_lead_stage_id,
    resolve_date_preset,
    get_new_stage_values,
)

User = get_user_model()


class FreshLeadsAndPeriodFilterTests(TestCase):
    """
    Focused tests for:
    1. Fresh Leads logic:
       - Strictly NEW status leads included in Fresh Leads count and list.
       - UNCONTACTED leads excluded.
       - CONTACTED, FOLLOW_UP, CONVERTED, LOST, and DROPPED excluded.
       - Fresh leads count in /api/crm/dashboard-stats/ strictly agrees with /api/students/?fresh=true.
       - Uncontacted leads without interactions are NOT classified as fresh.
       - Consistent semantics across API responses.
    2. Period Filter logic:
       - Presets (today, yesterday, this_week, this_month, last_7_days, last_30_days, last_month).
       - Custom start_date and end_date.
       - Out-of-period leads excluded.
       - In-period boundary handling.
       - Section isolation.
       - Period filtering applied to both dashboard stats and student drilldown list.
    """

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username='admin_test_fresh',
            password='Password123!',
            email='admin_fresh@example.com',
            role='SUPER_ADMIN'
        )
        self.bde = User.objects.create_user(
            username='bde_test_user',
            password='Password123!',
            email='bde_test@example.com',
            role='SALES',
            first_name='Aarav',
            last_name='Sharma'
        )
        self.client.force_authenticate(user=self.admin)

        self.program = Program.objects.create(name='Classical Music & Dance')
        self.campaign = Campaign.objects.create(name='Main Inbound Campaign', budget=50000, section='REGULAR')

        # Ensure pipeline stages exist
        self.stage_new = PipelineStage.objects.create(name='New Lead', order=1, is_default=True)
        self.stage_contacted = PipelineStage.objects.create(name='Contacted', order=2)
        self.stage_followup = PipelineStage.objects.create(name='Follow-up', order=3)
        self.stage_converted = PipelineStage.objects.create(name='Converted', order=4)
        self.stage_dropped = PipelineStage.objects.create(name='Dropped', order=5)

    def _create_lead(self, username, status_val, created_dt=None, has_interaction=False, sales_section='REGULAR', assigned_to=None, date_joined_dt=None, null_created_at=False):
        u = User.objects.create_user(
            username=username,
            password='Password123!',
            email=f'{username}@example.com',
            role='STUDENT',
            sales_section=sales_section
        )
        s = Student.objects.create(
            user=u,
            crm_student_id=f'CRM-{username}',
            first_name=username,
            last_name='Test',
            program_type=self.program,
            lead_status=status_val,
            campaign=self.campaign,
            sales_section=sales_section,
            assigned_to=assigned_to or self.bde
        )
        if null_created_at:
            Student.objects.filter(id=s.id).update(created_at=None)
            s.refresh_from_db()
        elif created_dt:
            Student.objects.filter(id=s.id).update(created_at=created_dt)
            s.refresh_from_db()
        if date_joined_dt is not None:
            User.objects.filter(id=u.id).update(date_joined=date_joined_dt)
            u.refresh_from_db()
        elif created_dt:
            User.objects.filter(id=u.id).update(date_joined=created_dt)
            u.refresh_from_db()

        if has_interaction:
            LeadInteraction.objects.create(
                student=s,
                author=self.bde,
                interaction_type='CALL',
                notes='Initial introductory outreach call'
            )
        return s

    # =========================================================================
    # TASK 1: FRESH LEADS RULE VERIFICATION
    # =========================================================================

    def test_fresh_leads_strictly_includes_new_status_and_excludes_others(self):
        """
        Verify that Fresh Leads:
        - Includes leads with NEW status (code 'NEW' or stage ID or stage name 'New Lead').
        - Excludes UNCONTACTED leads (even if they have zero interactions).
        - Excludes CONTACTED, FOLLOW_UP, CONVERTED, and LOST leads.
        - Excludes DROPPED leads.
        - Agrees between DashboardStatsView fresh_leads count and StudentViewSet list count.
        """
        now = timezone.now()

        # 1. NEW leads (should be included in Fresh Leads)
        lead_new_1 = self._create_lead('lead_new_str', 'NEW', created_dt=now, has_interaction=False)
        lead_new_2 = self._create_lead('lead_new_stage_id', str(self.stage_new.id), created_dt=now, has_interaction=False)
        lead_new_3 = self._create_lead('lead_new_stage_name', 'New Lead', created_dt=now, has_interaction=False)
        # Even if a NEW lead has an interaction record, its current stage is NEW:
        lead_new_with_interaction = self._create_lead('lead_new_with_call', 'NEW', created_dt=now, has_interaction=True)

        # 2. UNCONTACTED lead with NO interactions (MUST be excluded)
        lead_uncontacted = self._create_lead('lead_uncontacted', 'UNCONTACTED', created_dt=now, has_interaction=False)

        # 3. Other non-NEW statuses (MUST be excluded)
        lead_contacted = self._create_lead('lead_contacted', 'CONTACTED', created_dt=now, has_interaction=True)
        lead_followup = self._create_lead('lead_followup', 'FOLLOW_UP', created_dt=now, has_interaction=False)
        lead_followup_stage = self._create_lead('lead_followup_stage', str(self.stage_followup.id), created_dt=now, has_interaction=True)
        lead_converted = self._create_lead('lead_converted', 'CONVERTED', created_dt=now, has_interaction=True)
        lead_lost = self._create_lead('lead_lost', 'LOST', created_dt=now, has_interaction=False)
        lead_dropped = self._create_lead('lead_dropped', 'DROPPED', created_dt=now, has_interaction=False)

        # Query CRM Dashboard Stats
        resp = self.client.get('/api/crm/dashboard-stats/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        dashboard_fresh_count = resp.data.get('fresh_leads')

        # Query Student drilldown list with fresh=true
        list_resp = self.client.get('/api/students/?fresh=true')
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        list_leads = list_resp.data.get('results', list_resp.data)
        list_lead_ids = [l['id'] for l in list_leads]

        # Assertions
        # 4 NEW leads should be in fresh_leads
        expected_fresh_ids = {lead_new_1.id, lead_new_2.id, lead_new_3.id, lead_new_with_interaction.id}
        self.assertEqual(dashboard_fresh_count, 4)
        self.assertEqual(set(list_lead_ids), expected_fresh_ids)
        self.assertEqual(len(list_leads), dashboard_fresh_count, "Dashboard fresh_leads count must match list length")

        # UNCONTACTED lead must NOT be in Fresh Leads
        self.assertNotIn(lead_uncontacted.id, list_lead_ids)

        # Non-NEW statuses must NOT be in Fresh Leads
        self.assertNotIn(lead_contacted.id, list_lead_ids)
        self.assertNotIn(lead_followup.id, list_lead_ids)
        self.assertNotIn(lead_followup_stage.id, list_lead_ids)
        self.assertNotIn(lead_converted.id, list_lead_ids)
        self.assertNotIn(lead_lost.id, list_lead_ids)
        self.assertNotIn(lead_dropped.id, list_lead_ids)

    def test_uncontacted_lead_with_zero_interactions_is_never_fresh(self):
        """
        Explicit regression test:
        Previous bug was: open_students.filter(crm_interactions__isnull=True).
        A lead with status UNCONTACTED and zero interactions was mistakenly counted as fresh.
        Verify that this lead is excluded from fresh leads.
        """
        lead_uncontacted = self._create_lead('lead_zero_interaction_uncontacted', 'UNCONTACTED', has_interaction=False)
        lead_new = self._create_lead('lead_new_legit', 'NEW', has_interaction=False)

        resp = self.client.get('/api/crm/dashboard-stats/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data.get('fresh_leads'), 1)

        list_resp = self.client.get('/api/students/?fresh=true')
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        results = list_resp.data.get('results', list_resp.data)
        returned_ids = [r['id'] for r in results]

        self.assertIn(lead_new.id, returned_ids)
        self.assertNotIn(lead_uncontacted.id, returned_ids)

    # =========================================================================
    # TASK 2: PERIOD FILTER AUDIT AND RECONCILIATION
    # =========================================================================

    def test_resolve_date_preset_ranges(self):
        """
        Verify that resolve_date_preset correctly calculates date ranges for all presets.
        """
        today = timezone.now().date()

        # today
        start, end = resolve_date_preset('today')
        self.assertEqual(start, str(today))
        self.assertEqual(end, str(today))

        # yesterday
        y_date = today - datetime.timedelta(days=1)
        start, end = resolve_date_preset('yesterday')
        self.assertEqual(start, str(y_date))
        self.assertEqual(end, str(y_date))

        # this_week
        w_start = today - datetime.timedelta(days=today.weekday())
        start, end = resolve_date_preset('this_week')
        self.assertEqual(start, str(w_start))
        self.assertEqual(end, str(today))

        # this_month
        m_start = today.replace(day=1)
        start, end = resolve_date_preset('this_month')
        self.assertEqual(start, str(m_start))
        self.assertEqual(end, str(today))

        # last_7_days
        l7_start = today - datetime.timedelta(days=6)
        start, end = resolve_date_preset('last_7_days')
        self.assertEqual(start, str(l7_start))
        self.assertEqual(end, str(today))

        # last_30_days
        l30_start = today - datetime.timedelta(days=29)
        start, end = resolve_date_preset('last_30_days')
        self.assertEqual(start, str(l30_start))
        self.assertEqual(end, str(today))

        # last_month
        first_of_this_month = today.replace(day=1)
        last_day_last_month = first_of_this_month - datetime.timedelta(days=1)
        first_day_last_month = last_day_last_month.replace(day=1)
        start, end = resolve_date_preset('last_month')
        self.assertEqual(start, str(first_day_last_month))
        self.assertEqual(end, str(last_day_last_month))

        # custom start and end dates
        start, end = resolve_date_preset('', '2026-01-01', '2026-01-15')
        self.assertEqual(start, '2026-01-01')
        self.assertEqual(end, '2026-01-15')

    def test_period_filter_filters_leads_across_stats_and_student_list(self):
        """
        Verify that changing the period filter:
        - Accurately filters dashboard-stats total_leads and fresh_leads.
        - Accurately filters /api/students/?fresh=true.
        - Excludes leads created outside the selected period.
        """
        now = timezone.now()
        yesterday_dt = now - datetime.timedelta(days=1)
        two_months_ago_dt = now - datetime.timedelta(days=60)

        # 1 lead created today (NEW)
        lead_today = self._create_lead('lead_today_new', 'NEW', created_dt=now)

        # 1 lead created yesterday (NEW)
        lead_yesterday = self._create_lead('lead_yesterday_new', 'NEW', created_dt=yesterday_dt)

        # 1 lead created 60 days ago (NEW)
        lead_old = self._create_lead('lead_old_new', 'NEW', created_dt=two_months_ago_dt)

        # Filter by today
        resp_today = self.client.get('/api/crm/dashboard-stats/?date_preset=today')
        self.assertEqual(resp_today.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_today.data.get('total_leads'), 1)
        self.assertEqual(resp_today.data.get('fresh_leads'), 1)
        self.assertEqual(resp_today.data.get('start_date'), str(now.date()))
        self.assertEqual(resp_today.data.get('end_date'), str(now.date()))

        list_today = self.client.get('/api/students/?fresh=true&date_preset=today')
        self.assertEqual(list_today.status_code, status.HTTP_200_OK)
        today_ids = [l['id'] for l in list_today.data.get('results', list_today.data)]
        self.assertEqual(today_ids, [lead_today.id])

        # Filter by yesterday
        resp_yest = self.client.get('/api/crm/dashboard-stats/?date_preset=yesterday')
        self.assertEqual(resp_yest.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_yest.data.get('total_leads'), 1)
        self.assertEqual(resp_yest.data.get('fresh_leads'), 1)

        list_yest = self.client.get('/api/students/?fresh=true&date_preset=yesterday')
        self.assertEqual(list_yest.status_code, status.HTTP_200_OK)
        yest_ids = [l['id'] for l in list_yest.data.get('results', list_yest.data)]
        self.assertEqual(yest_ids, [lead_yesterday.id])

        # Custom date range covering yesterday and today
        resp_custom = self.client.get(f'/api/crm/dashboard-stats/?start_date={yesterday_dt.date()}&end_date={now.date()}')
        self.assertEqual(resp_custom.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_custom.data.get('total_leads'), 2)
        self.assertEqual(resp_custom.data.get('fresh_leads'), 2)

        list_custom = self.client.get(f'/api/students/?fresh=true&start_date={yesterday_dt.date()}&end_date={now.date()}')
        self.assertEqual(list_custom.status_code, status.HTTP_200_OK)
        custom_ids = [l['id'] for l in list_custom.data.get('results', list_custom.data)]
        self.assertEqual(set(custom_ids), {lead_today.id, lead_yesterday.id})
        self.assertNotIn(lead_old.id, custom_ids)

    def test_empty_results_period_handled_gracefully(self):
        """
        Verify that selecting a date range with zero leads returns 0 counts and empty list
        without crashing or leaving stale state.
        """
        # Create a lead today
        self._create_lead('lead_current', 'NEW')

        # Query a future period
        resp = self.client.get('/api/crm/dashboard-stats/?start_date=2030-01-01&end_date=2030-01-31')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data.get('total_leads'), 0)
        self.assertEqual(resp.data.get('fresh_leads'), 0)
        self.assertEqual(resp.data.get('contacted_leads'), 0)
        self.assertEqual(resp.data.get('converted_leads'), 0)

        # Drilldown list for that period
        list_resp = self.client.get('/api/students/?fresh=true&start_date=2030-01-01&end_date=2030-01-31')
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        results = list_resp.data.get('results', list_resp.data)
        self.assertEqual(len(results), 0)

    def test_sales_section_isolation_with_period_filter(self):
        """
        Verify that section filter (REGULAR vs KIDS) properly isolates leads
        when combined with period filters.
        """
        now = timezone.now()
        lead_regular = self._create_lead('lead_reg_sec', 'NEW', created_dt=now, sales_section='REGULAR')
        lead_kids = self._create_lead('lead_kids_sec', 'NEW', created_dt=now, sales_section='KIDS')

        # Query stats for REGULAR section
        resp_reg = self.client.get('/api/crm/dashboard-stats/?sales_section=REGULAR&date_preset=today')
        self.assertEqual(resp_reg.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_reg.data.get('fresh_leads'), 1)

        # Query students for REGULAR section
        list_reg = self.client.get('/api/students/?fresh=true&sales_section=REGULAR&date_preset=today')
        self.assertEqual(list_reg.status_code, status.HTTP_200_OK)
        reg_ids = [l['id'] for l in list_reg.data.get('results', list_reg.data)]
        self.assertEqual(reg_ids, [lead_regular.id])
        self.assertNotIn(lead_kids.id, reg_ids)

        # Query stats for KIDS section
        resp_kids = self.client.get('/api/crm/dashboard-stats/?sales_section=KIDS&date_preset=today')
        self.assertEqual(resp_kids.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_kids.data.get('fresh_leads'), 1)

        # Query students for KIDS section
        list_kids = self.client.get('/api/students/?fresh=true&sales_section=KIDS&date_preset=today')
        self.assertEqual(list_kids.status_code, status.HTTP_200_OK)
        kids_ids = [l['id'] for l in list_kids.data.get('results', list_kids.data)]
        self.assertEqual(kids_ids, [lead_kids.id])
        self.assertNotIn(lead_regular.id, kids_ids)

    def test_period_filter_cross_boundary_dates_do_not_leak(self):
        """
        REGRESSION TEST: Verify that leads whose created_at and date_joined fall on
        opposite sides of the requested period window DO NOT leak into bounded range queries.

        Range: 2026-10-10 to 2026-10-15
        - Lead 1: created_at in range (2026-10-12), date_joined before (2024-01-01) -> INCLUDED
        - Lead 2: created_at after range (2026-10-20), date_joined before (2024-01-01) -> MUST BE EXCLUDED
        - Lead 3: created_at before range (2024-01-01), date_joined after (2026-10-20) -> MUST BE EXCLUDED
        - Lead 4: created_at before range (2024-01-01), date_joined in range (2026-10-14) -> INCLUDED
        """
        tz = timezone.get_current_timezone()
        dt_old = datetime.datetime(2024, 1, 1, 10, 0, 0, tzinfo=tz)
        dt_future = datetime.datetime(2026, 10, 20, 10, 0, 0, tzinfo=tz)
        dt_in_1 = datetime.datetime(2026, 10, 12, 10, 0, 0, tzinfo=tz)
        dt_in_2 = datetime.datetime(2026, 10, 14, 10, 0, 0, tzinfo=tz)

        # Lead 1: created_at in range, date_joined before range
        lead_in_created = self._create_lead(
            'lead_in_created', 'NEW', created_dt=dt_in_1, date_joined_dt=dt_old
        )
        # Lead 2: created_at AFTER range, date_joined BEFORE range (The cross-term bug!)
        lead_cross_leak = self._create_lead(
            'lead_cross_leak', 'NEW', created_dt=dt_future, date_joined_dt=dt_old
        )
        # Lead 3: Inverse cross: created_at BEFORE range, date_joined AFTER range
        lead_inv_cross = self._create_lead(
            'lead_inv_cross', 'NEW', created_dt=dt_old, date_joined_dt=dt_future
        )
        # Lead 4: created_at is NULL, date_joined IN range (valid fallback)
        lead_in_joined = self._create_lead(
            'lead_in_joined', 'NEW', null_created_at=True, date_joined_dt=dt_in_2
        )
        # Lead 5: created_at before range, date_joined IN range (MUST be excluded)
        lead_created_out_joined_in = self._create_lead(
            'lead_created_out_joined_in', 'NEW', created_dt=dt_old, date_joined_dt=dt_in_2
        )

        start_str = '2026-10-10'
        end_str = '2026-10-15'

        # 1. Check Dashboard Stats
        resp = self.client.get(f'/api/crm/dashboard-stats/?start_date={start_str}&end_date={end_str}')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data.get('total_leads'), 2)
        self.assertEqual(resp.data.get('fresh_leads'), 2)

        # 2. Check Student List (Drilldown)
        list_resp = self.client.get(f'/api/students/?start_date={start_str}&end_date={end_str}')
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        results = list_resp.data.get('results', list_resp.data)
        result_ids = {l['id'] for l in results}

        # Expected: exactly lead 1 and lead 4; lead 2, 3, and 5 must be excluded!
        self.assertEqual(result_ids, {lead_in_created.id, lead_in_joined.id})
        self.assertNotIn(lead_cross_leak.id, result_ids)
        self.assertNotIn(lead_inv_cross.id, result_ids)
        self.assertNotIn(lead_created_out_joined_in.id, result_ids)

        # 3. Check Fresh Leads drilldown specifically
        fresh_resp = self.client.get(f'/api/students/?fresh=true&start_date={start_str}&end_date={end_str}')
        self.assertEqual(fresh_resp.status_code, status.HTTP_200_OK)
        fresh_results = fresh_resp.data.get('results', fresh_resp.data)
        fresh_ids = {l['id'] for l in fresh_results}
        self.assertEqual(fresh_ids, {lead_in_created.id, lead_in_joined.id})

    def test_period_filter_start_only_and_end_only(self):
        """
        Verify that unbounded single-ended date filters (start-only or end-only)
        operate consistently and do not crash or produce unexpected results.
        """
        tz = timezone.get_current_timezone()
        dt_old = datetime.datetime(2024, 1, 1, 10, 0, 0, tzinfo=tz)
        dt_recent = datetime.datetime(2026, 10, 15, 10, 0, 0, tzinfo=tz)

        lead_recent = self._create_lead('lead_recent', 'NEW', created_dt=dt_recent, date_joined_dt=dt_recent)
        lead_old = self._create_lead('lead_old_only', 'NEW', created_dt=dt_old, date_joined_dt=dt_old)

        # Start-only query (>= 2026-01-01)
        resp_start = self.client.get('/api/crm/dashboard-stats/?start_date=2026-01-01')
        self.assertEqual(resp_start.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_start.data.get('total_leads'), 1)

        list_start = self.client.get('/api/students/?start_date=2026-01-01')
        self.assertEqual(list_start.status_code, status.HTTP_200_OK)
        start_ids = [l['id'] for l in list_start.data.get('results', list_start.data)]
        self.assertEqual(start_ids, [lead_recent.id])

        # End-only query (<= 2025-01-01)
        resp_end = self.client.get('/api/crm/dashboard-stats/?end_date=2025-01-01')
        self.assertEqual(resp_end.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_end.data.get('total_leads'), 1)

        list_end = self.client.get('/api/students/?end_date=2025-01-01')
        self.assertEqual(list_end.status_code, status.HTTP_200_OK)
        end_ids = [l['id'] for l in list_end.data.get('results', list_end.data)]
        self.assertEqual(end_ids, [lead_old.id])

    def test_duplicate_status_casing_variations_and_workflows(self):
        """
        REGRESSION TEST: Verify that duplicate lead statuses with different capitalizations
        ('DUPLICATE', 'duplicate', 'Duplicate') are:
        - Excluded from normal dashboard stats.
        - Excluded from normal student list queries.
        - Included in dedicated duplicate query (?lead_status=DUPLICATE).
        - Correctly resolved by LeadStatusResolver.
        """
        lead_dup_upper = self._create_lead('lead_dup_upper', 'DUPLICATE')
        lead_dup_lower = self._create_lead('lead_dup_lower', 'duplicate')
        lead_dup_mixed = self._create_lead('lead_dup_mixed', 'Duplicate')
        lead_normal = self._create_lead('lead_normal_new', 'NEW')

        # 1. Normal Dashboard Stats: All duplicate variants must be excluded
        resp = self.client.get('/api/crm/dashboard-stats/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data.get('total_leads'), 1)
        self.assertEqual(resp.data.get('fresh_leads'), 1)
        # Verify pipeline breakdown does not contain a "Duplicate Lead" slice
        stage_names = [s['name'] for s in resp.data.get('pipeline_stages', [])]
        self.assertNotIn('Duplicate Lead', stage_names)
        self.assertNotIn('DUPLICATE', stage_names)

        # 2. Normal Student List: All duplicate variants must be excluded
        list_resp = self.client.get('/api/students/')
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        normal_ids = {l['id'] for l in list_resp.data.get('results', list_resp.data)}
        self.assertIn(lead_normal.id, normal_ids)
        self.assertNotIn(lead_dup_upper.id, normal_ids)
        self.assertNotIn(lead_dup_lower.id, normal_ids)
        self.assertNotIn(lead_dup_mixed.id, normal_ids)

        # 3. Dedicated Duplicate Lead List (?lead_status=DUPLICATE):
        # Must return all 3 duplicate leads regardless of capitalization
        dup_resp = self.client.get('/api/students/?lead_status=DUPLICATE')
        self.assertEqual(dup_resp.status_code, status.HTTP_200_OK)
        dup_results = dup_resp.data.get('results', dup_resp.data)
        dup_ids = {l['id'] for l in dup_results}
        self.assertEqual(dup_ids, {lead_dup_upper.id, lead_dup_lower.id, lead_dup_mixed.id})
        self.assertNotIn(lead_normal.id, dup_ids)

        # 4. LeadStatusResolver correctness across capitalizations
        from crm.utils import LeadStatusResolver
        resolver = LeadStatusResolver()
        for variant in ['DUPLICATE', 'duplicate', 'Duplicate', '  duplicate  ']:
            res = resolver.resolve(variant)
            self.assertTrue(res.is_resolved)
            self.assertTrue(res.is_duplicate)
            self.assertEqual(res.stage_name, 'Duplicate Lead')
            self.assertIsNone(res.stage_id)

    def test_marketing_dashboard_period_filter_and_null_created_at_fallback(self):
        """
        REGRESSION TEST: Verify MarketingDashboardView period filtering:
        - Eligible lead with created_at=None and user.date_joined inside range is INCLUDED.
        - Eligible lead with created_at inside range is INCLUDED.
        - Out-of-range leads are EXCLUDED.
        - Cross-boundary leak lead (created_at after, date_joined before) is EXCLUDED.
        - Total Leads Generated summary metric is strictly accurate.
        - Sales representative assigned count is strictly accurate.
        - Chart's date and count data correctly aggregates by the resolved date.
        - Existing date-filter behavior remains intact.
        """
        tz = timezone.get_current_timezone()
        dt_in_1 = datetime.datetime(2026, 10, 12, 10, 0, 0, tzinfo=tz)
        dt_in_2 = datetime.datetime(2026, 10, 14, 10, 0, 0, tzinfo=tz)
        dt_old = datetime.datetime(2024, 1, 1, 10, 0, 0, tzinfo=tz)
        dt_future = datetime.datetime(2026, 10, 20, 10, 0, 0, tzinfo=tz)

        # 1. Lead with created_at=None, user.date_joined inside target range (2026-10-12)
        lead_null_created = self._create_lead(
            'lead_mkt_null_created', 'NEW',
            date_joined_dt=dt_in_1,
            null_created_at=True,
            assigned_to=self.bde
        )
        self.assertIsNone(lead_null_created.created_at)

        # 2. Lead with normal created_at inside target range (2026-10-14)
        lead_normal_in_range = self._create_lead(
            'lead_mkt_normal_in_range', 'NEW',
            created_dt=dt_in_2,
            date_joined_dt=dt_in_2,
            assigned_to=self.bde
        )

        # 3. Lead completely outside target range (2024-01-01)
        lead_outside = self._create_lead(
            'lead_mkt_outside', 'NEW',
            created_dt=dt_old,
            date_joined_dt=dt_old,
            assigned_to=self.bde
        )

        # 4. Cross-boundary lead: created_at after range, date_joined before range (must not leak)
        lead_cross_leak = self._create_lead(
            'lead_mkt_cross_leak', 'NEW',
            created_dt=dt_future,
            date_joined_dt=dt_old,
            assigned_to=self.bde
        )

        start_str = '2026-10-10'
        end_str = '2026-10-15'

        resp = self.client.get(f'/api/crm/marketing-dashboard/?start_date={start_str}&end_date={end_str}')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.data

        # Verify summary stats
        summary = data.get('summary', {})
        self.assertEqual(summary.get('total_leads'), 2, "Must include exactly the 2 in-range leads (including created_at=None fallback)")

        # Verify sales report table
        sales_report = data.get('sales_report', [])
        bde_report = next((r for r in sales_report if r['id'] == self.bde.id), None)
        self.assertIsNotNone(bde_report, "Sales rep must be present in sales_report")
        self.assertEqual(bde_report['assigned'], 2, "Sales rep assigned count must match the 2 eligible in-range leads")

        # Verify chart data date/count aggregation
        chart_data = data.get('chart_data', [])
        chart_map = {item['date']: item['leads'] for item in chart_data}
        # Lead with created_at=None should appear under its user.date_joined date (2026-10-12)
        self.assertEqual(chart_map.get('2026-10-12'), 1, "Lead with null created_at must appear under user.date_joined in chart")
        # Lead with created_at in range should appear under 2026-10-14
        self.assertEqual(chart_map.get('2026-10-14'), 1, "Lead with created_at must appear under created_at in chart")
        # Outside leads must not appear in chart
        self.assertNotIn('2024-01-01', chart_map)
        self.assertNotIn('2026-10-20', chart_map)
        self.assertEqual(sum(item['leads'] for item in chart_data), 2)

    def test_student_viewset_strict_created_at_fallback_and_boundaries(self):
        """
        REGRESSION TEST: Verify StudentViewSet strict date filtering:
        - Lead with created_at outside range is EXCLUDED even if user.date_joined falls inside range.
        - Lead with created_at=None uses user.date_joined as fallback and is INCLUDED.
        - Lead with created_at inside range is INCLUDED.
        - Lead completely outside range is EXCLUDED.
        - Start-only and end-only filtering work correctly.
        """
        tz = timezone.get_current_timezone()
        dt_in_1 = datetime.datetime(2026, 10, 12, 10, 0, 0, tzinfo=tz)
        dt_in_2 = datetime.datetime(2026, 10, 14, 10, 0, 0, tzinfo=tz)
        dt_old = datetime.datetime(2024, 1, 1, 10, 0, 0, tzinfo=tz)
        dt_future = datetime.datetime(2026, 10, 20, 10, 0, 0, tzinfo=tz)

        # 1. Lead with created_at outside range (2024-01-01), but user.date_joined inside range (2026-10-12)
        # MUST be excluded because created_at is present and outside range!
        lead_with_old_created = self._create_lead(
            'lead_old_created_new_user', 'NEW',
            created_dt=dt_old,
            date_joined_dt=dt_in_1,
            assigned_to=self.bde
        )

        # 2. Lead with created_at=None, user.date_joined inside range (2026-10-12)
        # MUST be included via fallback because created_at is NULL!
        lead_null_created = self._create_lead(
            'lead_strict_null_created', 'NEW',
            date_joined_dt=dt_in_1,
            null_created_at=True,
            assigned_to=self.bde
        )

        # 3. Normal in-range lead: created_at inside range (2026-10-14)
        lead_normal_in = self._create_lead(
            'lead_strict_normal_in', 'NEW',
            created_dt=dt_in_2,
            date_joined_dt=dt_in_2,
            assigned_to=self.bde
        )

        # 4. Normal out-of-range lead: created_at and date_joined outside range (2024-01-01)
        lead_normal_out = self._create_lead(
            'lead_strict_normal_out', 'NEW',
            created_dt=dt_old,
            date_joined_dt=dt_old,
            assigned_to=self.bde
        )

        # Authenticate admin to view all students
        self.client.force_authenticate(user=self.admin)

        # Case A: Both start_date and end_date (2026-10-10 to 2026-10-15)
        resp = self.client.get('/api/students/?start_date=2026-10-10&end_date=2026-10-15')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data if isinstance(resp.data, list) else resp.data.get('results', [])
        ids = [s['id'] for s in results]

        # In-range leads MUST be present
        self.assertIn(lead_normal_in.id, ids, "Normal in-range lead must be included")
        self.assertIn(lead_null_created.id, ids, "Lead with null created_at and in-range date_joined must be included via fallback")
        # Leads with old created_at MUST be excluded
        self.assertNotIn(lead_with_old_created.id, ids, "Lead with created_at outside range must be excluded even if date_joined is in range")
        self.assertNotIn(lead_normal_out.id, ids, "Lead completely outside range must be excluded")

        # Case B: Start-only filtering (start_date=2026-10-13)
        resp_start = self.client.get('/api/students/?start_date=2026-10-13')
        self.assertEqual(resp_start.status_code, status.HTTP_200_OK)
        ids_start = [s['id'] for s in (resp_start.data if isinstance(resp_start.data, list) else resp_start.data.get('results', []))]
        self.assertIn(lead_normal_in.id, ids_start, "Lead created 2026-10-14 >= 2026-10-13 must be included")
        self.assertNotIn(lead_null_created.id, ids_start, "Fallback date_joined 2026-10-12 < 2026-10-13 must be excluded")
        self.assertNotIn(lead_with_old_created.id, ids_start, "Lead created 2024-01-01 < 2026-10-13 must be excluded")

        # Case C: End-only filtering (end_date=2026-10-13)
        resp_end = self.client.get('/api/students/?end_date=2026-10-13')
        self.assertEqual(resp_end.status_code, status.HTTP_200_OK)
        ids_end = [s['id'] for s in (resp_end.data if isinstance(resp_end.data, list) else resp_end.data.get('results', []))]
        self.assertIn(lead_null_created.id, ids_end, "Fallback date_joined 2026-10-12 <= 2026-10-13 must be included")
        self.assertNotIn(lead_normal_in.id, ids_end, "Lead created 2026-10-14 > 2026-10-13 must be excluded")
