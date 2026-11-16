import uuid
import threading
from collections import Counter
from unittest.mock import patch, MagicMock
from django.test import TestCase, TransactionTestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connections
from rest_framework.test import APIClient
from rest_framework import status

from core.models import Student, Program
from crm.models import Campaign, PipelineStage, WebhookEndpoint
from crm.services.assignment import get_next_assigned_rep

User = get_user_model()


class AutoAssignmentTestSuite(TestCase):
    """
    Comprehensive test suite validating Phase 2 Centralized BDE Auto-Assignment & True Round-Robin System:
    - Deterministic active BDE round-robin (BDE1 -> BDE2 -> BDE3 -> BDE1)
    - Active BDE filtering (inactive BDEs are excluded)
    - Persistent database-backed state on Campaign.last_assigned_bde
    - Unified assignment behavior across Campaign Webhook, Meta Webhook, Google Sheets Sync, CSV/Batch Upload, Dynamic Webhook
    - Preservation of existing assignments and deduplication integrity
    - Robust error propagation when database exceptions occur
    """

    def setUp(self):
        self.client = APIClient()

        # Admin user for authenticated endpoints
        self.admin = User.objects.create_superuser(
            username='admin_assign_test',
            password='Password@123',
            email='admin_assign@gmail.com',
            role='SUPER_ADMIN'
        )
        self.client.force_authenticate(user=self.admin)

        # Create 3 active Sales Representatives (BDEs) with deterministic IDs
        self.bde1 = User.objects.create_user(
            username='bde1_test',
            password='Password@123',
            email='bde1@gmail.com',
            role='SALES',
            first_name='BDE',
            last_name='One',
            is_active=True
        )
        self.bde2 = User.objects.create_user(
            username='bde2_test',
            password='Password@123',
            email='bde2@gmail.com',
            role='SALES',
            first_name='BDE',
            last_name='Two',
            is_active=True
        )
        self.bde3 = User.objects.create_user(
            username='bde3_test',
            password='Password@123',
            email='bde3@gmail.com',
            role='SALES',
            first_name='BDE',
            last_name='Three',
            is_active=True
        )

        # Base program & Pipeline stages
        self.program = Program.objects.create(name='Natya Career Academy')
        self.stage_new = PipelineStage.objects.create(name='New', order=1)

        # Test Campaign
        self.campaign = Campaign.objects.create(
            name='Test Campaign Round Robin',
            section='CAREER_ACADEMY',
            secret_token=uuid.uuid4(),
            meta_form_id='meta_form_test_123',
            meta_auto_import=True,
            meta_access_token='mock_access_token',
            status='ACTIVE'
        )
        self.campaign.auto_assign_to.add(self.bde1, self.bde2, self.bde3)

        # Dynamic Webhook endpoint
        self.webhook_endpoint = WebhookEndpoint.objects.create(
            name='Test Dynamic Webhook',
            secret_token=uuid.uuid4(),
            is_active=True
        )

    def test_three_bde_sequential_round_robin(self):
        """1. Test that 3 active BDEs cycle deterministically: BDE1 -> BDE2 -> BDE3 -> BDE1 -> BDE2 -> BDE3"""
        reps = [
            get_next_assigned_rep(self.campaign),
            get_next_assigned_rep(self.campaign),
            get_next_assigned_rep(self.campaign),
            get_next_assigned_rep(self.campaign),
            get_next_assigned_rep(self.campaign),
            get_next_assigned_rep(self.campaign),
        ]
        expected_sequence = [self.bde1, self.bde2, self.bde3, self.bde1, self.bde2, self.bde3]
        self.assertEqual([r.id for r in reps], [e.id for e in expected_sequence])

    def test_only_active_bdes_selected(self):
        """2. Test that inactive BDEs (is_active=False) are skipped in round-robin sequence."""
        self.bde2.is_active = False
        self.bde2.save()

        reps = [
            get_next_assigned_rep(self.campaign),
            get_next_assigned_rep(self.campaign),
            get_next_assigned_rep(self.campaign),
            get_next_assigned_rep(self.campaign),
        ]
        # Since BDE2 is inactive, sequence must be BDE1 -> BDE3 -> BDE1 -> BDE3
        expected_sequence = [self.bde1, self.bde3, self.bde1, self.bde3]
        self.assertEqual([r.id for r in reps], [e.id for e in expected_sequence])

    def test_single_bde_configuration(self):
        """3. Test campaign configured with a single BDE assigns to that BDE consistently."""
        single_bde_campaign = Campaign.objects.create(
            name='Single BDE Campaign',
            section='REGULAR',
            secret_token=uuid.uuid4()
        )
        single_bde_campaign.auto_assign_to.add(self.bde1)

        for _ in range(4):
            rep = get_next_assigned_rep(single_bde_campaign)
            self.assertEqual(rep.id, self.bde1.id)

    def test_no_configured_bdes(self):
        """4. Test campaign with no configured BDEs returns None safely without raising errors."""
        empty_campaign = Campaign.objects.create(
            name='Empty BDE Campaign',
            section='REGULAR',
            secret_token=uuid.uuid4()
        )
        rep = get_next_assigned_rep(empty_campaign)
        self.assertIsNone(rep)

        # Test passing None as campaign
        self.assertIsNone(get_next_assigned_rep(None))

    def test_assignment_state_persists_in_database(self):
        """5. Test that assignment state persists on Campaign.last_assigned_bde across separate calls."""
        rep1 = get_next_assigned_rep(self.campaign)
        self.assertEqual(rep1.id, self.bde1.id)

        # Fetch fresh campaign instance from DB
        fresh_campaign = Campaign.objects.get(id=self.campaign.id)
        self.assertEqual(fresh_campaign.last_assigned_bde_id, self.bde1.id)

        # Next call uses persistent state to select BDE2
        rep2 = get_next_assigned_rep(fresh_campaign)
        self.assertEqual(rep2.id, self.bde2.id)

        fresh_campaign.refresh_from_db()
        self.assertEqual(fresh_campaign.last_assigned_bde_id, self.bde2.id)

    def test_google_sync_persists_round_robin_across_executions(self):
        """6. Test that Google Sheets sync does not reset assignment to BDE1 on every sync execution."""
        self.campaign.google_spreadsheet_id = 'test_sheet_rr_123'
        self.campaign.google_sheet_name = 'Leads'
        self.campaign.google_auto_sync = True
        self.campaign.google_last_synced_row = 1
        self.campaign.save()

        sync_url = '/api/crm/google/sync/'

        # Sync execution 1
        mock_sheet_1 = {
            'values': [
                ['First Name', 'Last Name', 'Mobile', 'Email'],
                ['Sync', 'Lead1', '9876500001', 'sync1@gmail.com']
            ]
        }
        mock_res1 = MagicMock()
        mock_res1.status_code = 200
        mock_res1.json.return_value = mock_sheet_1

        with patch('crm.views_google.get_refreshed_access_token', return_value='mock_token'), \
             patch('crm.views_google.requests.get', return_value=mock_res1):
            res1 = self.client.post(sync_url, {'campaign_id': self.campaign.id}, format='json')
            self.assertEqual(res1.status_code, status.HTTP_200_OK)

        lead1 = Student.objects.get(email='sync1@gmail.com')
        self.assertEqual(lead1.assigned_to, self.bde1)

        # Sync execution 2 (next row)
        mock_sheet_2 = {
            'values': [
                ['First Name', 'Last Name', 'Mobile', 'Email'],
                ['Sync', 'Lead1', '9876500001', 'sync1@gmail.com'],
                ['Sync', 'Lead2', '9876500002', 'sync2@gmail.com']
            ]
        }
        mock_res2 = MagicMock()
        mock_res2.status_code = 200
        mock_res2.json.return_value = mock_sheet_2

        with patch('crm.views_google.get_refreshed_access_token', return_value='mock_token'), \
             patch('crm.views_google.requests.get', return_value=mock_res2):
            res2 = self.client.post(sync_url, {'campaign_id': self.campaign.id}, format='json')
            self.assertEqual(res2.status_code, status.HTTP_200_OK)

        lead2 = Student.objects.get(email='sync2@gmail.com')
        self.assertEqual(lead2.assigned_to, self.bde2, "Second sync run must assign to BDE2, not reset to BDE1")

        # Sync execution 3 (next row)
        mock_sheet_3 = {
            'values': [
                ['First Name', 'Last Name', 'Mobile', 'Email'],
                ['Sync', 'Lead1', '9876500001', 'sync1@gmail.com'],
                ['Sync', 'Lead2', '9876500002', 'sync2@gmail.com'],
                ['Sync', 'Lead3', '9876500003', 'sync3@gmail.com']
            ]
        }
        mock_res3 = MagicMock()
        mock_res3.status_code = 200
        mock_res3.json.return_value = mock_sheet_3

        with patch('crm.views_google.get_refreshed_access_token', return_value='mock_token'), \
             patch('crm.views_google.requests.get', return_value=mock_res3):
            res3 = self.client.post(sync_url, {'campaign_id': self.campaign.id}, format='json')
            self.assertEqual(res3.status_code, status.HTTP_200_OK)

        lead3 = Student.objects.get(email='sync3@gmail.com')
        self.assertEqual(lead3.assigned_to, self.bde3)

    def test_csv_bulk_upload_round_robin(self):
        """7. Test CSV bulk upload assigns successive leads across active BDEs using centralized service."""
        csv_content = (
            "Full Name,Contact,Email,Place\n"
            "CSV Lead 1,9876511111,csv1@gmail.com,Kochi\n"
            "CSV Lead 2,9876522222,csv2@gmail.com,Calicut\n"
            "CSV Lead 3,9876533333,csv3@gmail.com,Trivandrum\n"
        )
        csv_file = SimpleUploadedFile("leads.csv", csv_content.encode("utf-8"), content_type="text/csv")

        response = self.client.post(
            f"/api/crm/campaigns/{self.campaign.id}/bulk_upload/",
            {"file": csv_file},
            format="multipart"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        l1 = Student.objects.get(email='csv1@gmail.com')
        l2 = Student.objects.get(email='csv2@gmail.com')
        l3 = Student.objects.get(email='csv3@gmail.com')

        self.assertEqual(l1.assigned_to, self.bde1)
        self.assertEqual(l2.assigned_to, self.bde2)
        self.assertEqual(l3.assigned_to, self.bde3)

    def test_batch_json_upload_round_robin(self):
        """8. Test Batch JSON upload assigns successive leads across active BDEs using centralized service."""
        payload = {
            "rows": [
                {"full_name": "Batch Lead 1", "mobile": "9876544441", "email": "batch1@gmail.com"},
                {"full_name": "Batch Lead 2", "mobile": "9876544442", "email": "batch2@gmail.com"},
                {"full_name": "Batch Lead 3", "mobile": "9876544443", "email": "batch3@gmail.com"}
            ]
        }
        response = self.client.post(
            f"/api/crm/campaigns/{self.campaign.id}/bulk_upload_batch/",
            payload,
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        b1 = Student.objects.get(email='batch1@gmail.com')
        b2 = Student.objects.get(email='batch2@gmail.com')
        b3 = Student.objects.get(email='batch3@gmail.com')

        self.assertEqual(b1.assigned_to, self.bde1)
        self.assertEqual(b2.assigned_to, self.bde2)
        self.assertEqual(b3.assigned_to, self.bde3)

    def test_meta_webhook_round_robin(self):
        """9. Test Meta Webhook assigns successive leads across active BDEs using centralized service."""
        import hashlib
        import hmac
        import json
        from django.test import override_settings

        self.campaign.meta_page_id = "page_id_123"
        self.campaign.save()

        webhook_url = "/api/crm/meta/webhook/"

        def mock_meta_graph(url, *args, **kwargs):
            mock_res = MagicMock()
            mock_res.status_code = 200
            for i in range(1, 4):
                if f"lead_meta_{i}" in str(url):
                    mock_res.json.return_value = {
                        "id": f"lead_meta_{i}",
                        "field_data": [
                            {"name": "full_name", "values": [f"Meta Lead {i}"]},
                            {"name": "phone_number", "values": [f"+91987655555{i}"]},
                            {"name": "email", "values": [f"meta{i}@gmail.com"]}
                        ]
                    }
                    return mock_res
            mock_res.json.return_value = {"field_data": []}
            return mock_res

        app_secret = "test_meta_rr_secret"
        with override_settings(META_APP_SECRET=app_secret), patch('crm.views_meta.requests.get', side_effect=mock_meta_graph):
            for i in range(1, 4):
                payload = {
                    "object": "page",
                    "entry": [{
                        "id": "page_id_123",
                        "changes": [{
                            "field": "leadgen",
                            "value": {
                                "page_id": "page_id_123",
                                "form_id": self.campaign.meta_form_id,
                                "leadgen_id": f"lead_meta_{i}",
                                "created_time": 1700000000
                            }
                        }]
                    }]
                }
                raw_body = json.dumps(payload).encode("utf-8")
                sig = "sha256=" + hmac.new(app_secret.encode(), raw_body, hashlib.sha256).hexdigest()
                response = self.client.generic(
                    "POST",
                    webhook_url,
                    raw_body,
                    content_type="application/json",
                    HTTP_X_HUB_SIGNATURE_256=sig,
                )
                self.assertEqual(response.status_code, status.HTTP_200_OK)

        m1 = Student.objects.get(email='meta1@gmail.com')
        m2 = Student.objects.get(email='meta2@gmail.com')
        m3 = Student.objects.get(email='meta3@gmail.com')

        self.assertEqual(m1.assigned_to, self.bde1)
        self.assertEqual(m2.assigned_to, self.bde2)
        self.assertEqual(m3.assigned_to, self.bde3)

    def test_campaign_webhook_round_robin(self):
        """10. Test Campaign Webhook assigns successive leads across active BDEs using centralized service."""
        webhook_url = f"/api/crm/webhooks/campaign/{self.campaign.secret_token}/lead/"

        for i in range(1, 4):
            payload = {
                "name": f"Campaign Webhook Lead {i}",
                "email": f"camp_webhook_{i}@gmail.com",
                "phone": f"987656666{i}"
            }
            response = self.client.post(webhook_url, payload, format="json")
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        c1 = Student.objects.get(email='camp_webhook_1@gmail.com')
        c2 = Student.objects.get(email='camp_webhook_2@gmail.com')
        c3 = Student.objects.get(email='camp_webhook_3@gmail.com')

        self.assertEqual(c1.assigned_to, self.bde1)
        self.assertEqual(c2.assigned_to, self.bde2)
        self.assertEqual(c3.assigned_to, self.bde3)

    def test_duplicate_lead_does_not_advance_pointer(self):
        """11. Test that duplicate lead submission does not advance the round-robin pointer."""
        webhook_url = f"/api/crm/webhooks/campaign/{self.campaign.secret_token}/lead/"

        # 1. First lead arrives -> Assigned to BDE1
        payload1 = {"name": "Lead A", "email": "leada@gmail.com", "phone": "9876577771"}
        res1 = self.client.post(webhook_url, payload1, format="json")
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        lead_a = Student.objects.get(email='leada@gmail.com')
        self.assertEqual(lead_a.assigned_to, self.bde1)

        # 2. Duplicate submission of Lead A arrives
        res_dup = self.client.post(webhook_url, payload1, format="json")
        self.assertEqual(res_dup.status_code, status.HTTP_200_OK)
        self.assertTrue(res_dup.data.get('is_duplicate'))

        # Verify Lead A is still assigned to BDE1 and campaign last_assigned_bde is still BDE1
        lead_a.refresh_from_db()
        self.assertEqual(lead_a.assigned_to, self.bde1)
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.last_assigned_bde, self.bde1)

        # 3. New Lead B arrives -> Must be assigned to BDE2 (not BDE3)
        payload2 = {"name": "Lead B", "email": "leadb@gmail.com", "phone": "9876577772"}
        res2 = self.client.post(webhook_url, payload2, format="json")
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        lead_b = Student.objects.get(email='leadb@gmail.com')
        self.assertEqual(lead_b.assigned_to, self.bde2)

    def test_existing_assigned_lead_not_reassigned_on_reengagement(self):
        """12. Test that existing explicitly assigned student is not reassigned upon re-engagement."""
        user_existing = User.objects.create_user(
            username='user_existing_bde3',
            email='existing_bde3@gmail.com',
            role='STUDENT'
        )
        student_existing = Student.objects.create(
            user=user_existing,
            crm_student_id='LEAD-BDE3-EXPLICIT',
            program_type=self.program,
            first_name='Existing',
            last_name='Student',
            email='existing_bde3@gmail.com',
            mobile='+919876588888',
            assigned_to=self.bde3,
            campaign=self.campaign,
            is_active=True
        )

        webhook_url = f"/api/crm/webhooks/campaign/{self.campaign.secret_token}/lead/"
        payload = {
            "name": "Existing Student",
            "email": "existing_bde3@gmail.com",
            "phone": "9876588888"
        }
        response = self.client.post(webhook_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        student_existing.refresh_from_db()
        self.assertEqual(student_existing.assigned_to, self.bde3, "Explicit assignment to BDE3 must be preserved")

    def test_dynamic_webhook_assignment(self):
        """13. Test dynamic webhook endpoint auto-assigns lead when campaign_id is provided."""
        webhook_url = f"/api/crm/webhooks/{self.webhook_endpoint.secret_token}/lead/"
        payload = {
            "name": "Dynamic Lead 1",
            "email": "dynamic1@gmail.com",
            "phone": "9876599991",
            "campaign_id": self.campaign.id
        }
        response = self.client.post(webhook_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        lead = Student.objects.get(email='dynamic1@gmail.com')
        self.assertEqual(lead.assigned_to, self.bde1)

    def test_assignment_raises_exception_on_db_error(self):
        """14. Test that database errors during assignment are raised rather than silently swallowed."""
        with patch('crm.models.Campaign.objects.select_for_update', side_effect=RuntimeError("DB Lock Failure")):
            with self.assertRaises(RuntimeError):
                get_next_assigned_rep(self.campaign)

    def test_career_academy_bde_never_receives_regular_campaign_leads(self):
        """15. Test that a Career Academy BDE (e.g. Ifthisha) never receives leads from a Regular campaign."""
        ifthisha = User.objects.create_user(
            username='ifthisha_ca',
            password='Password@123',
            email='ifthisha@natya.com',
            role='SALES',
            first_name='Ifthisha',
            sales_section='CAREER_ACADEMY',
            is_active=True
        )
        regular_bde1 = User.objects.create_user(
            username='reg_bde1',
            password='Password@123',
            email='reg1@natya.com',
            role='SALES',
            first_name='RegularOne',
            sales_section='REGULAR',
            is_active=True
        )
        regular_bde2 = User.objects.create_user(
            username='reg_bde2',
            password='Password@123',
            email='reg2@natya.com',
            role='SALES',
            first_name='RegularTwo',
            sales_section='REGULAR',
            is_active=True
        )

        reg_campaign = Campaign.objects.create(
            name='ABROAD (Regular)',
            section='REGULAR',
            secret_token=uuid.uuid4()
        )
        # Even if Ifthisha (CAREER_ACADEMY) was historically in auto_assign_to on a REGULAR campaign:
        reg_campaign.auto_assign_to.add(ifthisha, regular_bde1, regular_bde2)

        reps = [get_next_assigned_rep(reg_campaign) for _ in range(4)]
        self.assertEqual(
            [r.id for r in reps],
            [regular_bde1.id, regular_bde2.id, regular_bde1.id, regular_bde2.id],
            "Career Academy BDE Ifthisha must never be assigned leads from a REGULAR campaign",
        )

    def test_regular_bde_never_receives_career_academy_campaign_leads(self):
        """16. Test that a Regular BDE never receives leads from a Career Academy campaign."""
        regular_bde = User.objects.create_user(
            username='reg_only_bde',
            password='Password@123',
            role='SALES',
            sales_section='REGULAR',
            is_active=True
        )
        ca_bde = User.objects.create_user(
            username='ca_only_bde',
            password='Password@123',
            role='SALES',
            sales_section='CAREER_ACADEMY',
            is_active=True
        )

        ca_campaign = Campaign.objects.create(
            name='ABROAD (Diploma)',
            section='CAREER_ACADEMY',
            secret_token=uuid.uuid4()
        )
        ca_campaign.auto_assign_to.add(regular_bde, ca_bde)

        for _ in range(3):
            rep = get_next_assigned_rep(ca_campaign)
            self.assertEqual(rep.id, ca_bde.id)

    def test_campaign_serializer_enforces_bde_section_eligibility_on_create_and_update(self):
        """17. Test that CampaignSerializer filters out ineligible BDEs on campaign create and section update."""
        ifthisha = User.objects.create_user(
            username='ifthisha_ser',
            password='Password@123',
            role='SALES',
            sales_section='CAREER_ACADEMY',
            is_active=True
        )
        reg_bde = User.objects.create_user(
            username='reg_bde_ser',
            password='Password@123',
            role='SALES',
            sales_section='REGULAR',
            is_active=True
        )

        # 1. Create a REGULAR campaign while passing both Ifthisha (CAREER_ACADEMY) and reg_bde (REGULAR)
        res_create = self.client.post(
            '/api/crm/campaigns/',
            {
                'name': 'Regular Create Test',
                'platform': 'OTHER',
                'status': 'ACTIVE',
                'section': 'REGULAR',
                'auto_assign_to': [ifthisha.id, reg_bde.id],
            },
            format='json',
        )
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        camp_id = res_create.data['id']
        created_camp = Campaign.objects.get(id=camp_id)
        assigned_ids = list(created_camp.auto_assign_to.values_list('id', flat=True))
        self.assertEqual(assigned_ids, [reg_bde.id])
        self.assertNotIn(ifthisha.id, assigned_ids)

        # 2. Create a BOTH campaign with both BDEs, then update section to REGULAR
        res_both = self.client.post(
            '/api/crm/campaigns/',
            {
                'name': 'Both To Regular Test',
                'platform': 'OTHER',
                'status': 'ACTIVE',
                'section': 'BOTH',
                'auto_assign_to': [ifthisha.id, reg_bde.id],
            },
            format='json',
        )
        self.assertEqual(res_both.status_code, status.HTTP_201_CREATED)
        both_id = res_both.data['id']
        both_camp = Campaign.objects.get(id=both_id)
        both_camp.last_assigned_bde = ifthisha
        both_camp.save(update_fields=['last_assigned_bde'])

        # PATCH only section='REGULAR' -> must strip ifthisha from auto_assign_to and reset last_assigned_bde
        res_patch = self.client.patch(
            f'/api/crm/campaigns/{both_id}/',
            {'section': 'REGULAR'},
            format='json',
        )
        self.assertEqual(res_patch.status_code, status.HTTP_200_OK)
        both_camp.refresh_from_db()
        self.assertEqual(list(both_camp.auto_assign_to.values_list('id', flat=True)), [reg_bde.id])
        self.assertIsNone(both_camp.last_assigned_bde)

    def test_actual_career_academy_and_regular_campaign_end_to_end_scenarios(self):
        """
        18. End-to-end verification of actual Career Academy ('ABROAD (Diploma)') and
        Regular ('ABROAD (Regular)') campaign configurations across webhooks, Google Sheets sync,
        and bulk uploads, including duplicate submission across both campaigns.
        """
        prog_natya = Program.objects.create(name='Natya')
        ifthisha = User.objects.create_user(
            username='ifthisha_prod_sim',
            password='Password@123',
            first_name='Ifthisha',
            role='SALES',
            sales_section='CAREER_ACADEMY',
            is_active=True,
        )
        ca_bde2 = User.objects.create_user(
            username='ca_bde2_prod_sim',
            password='Password@123',
            first_name='CareerRep2',
            role='SALES',
            sales_section='CAREER_ACADEMY',
            is_active=True,
        )
        reg_bde1 = User.objects.create_user(
            username='reg_bde1_prod_sim',
            password='Password@123',
            first_name='RegularRep1',
            role='SALES',
            sales_section='REGULAR',
            is_active=True,
        )
        reg_bde2 = User.objects.create_user(
            username='reg_bde2_prod_sim',
            password='Password@123',
            first_name='RegularRep2',
            role='SALES',
            sales_section='REGULAR',
            is_active=True,
        )

        abroad_diploma = Campaign.objects.create(
            name='ABROAD (Diploma)',
            section='CAREER_ACADEMY',
            status='ACTIVE',
            secret_token=uuid.uuid4(),
        )
        abroad_diploma.auto_assign_to.add(ifthisha, ca_bde2)

        abroad_regular = Campaign.objects.create(
            name='ABROAD (Regular)',
            section='REGULAR',
            status='ACTIVE',
            secret_token=uuid.uuid4(),
        )
        # Simulate Ifthisha having been accidentally left in auto_assign_to alongside Regular BDEs
        abroad_regular.auto_assign_to.add(ifthisha, reg_bde1, reg_bde2)

        # A. Lead 1 arrives on ABROAD (Diploma) -> assigned to Ifthisha (CAREER_ACADEMY)
        r1 = self.client.post(
            f"/api/crm/webhooks/campaign/{abroad_diploma.secret_token}/lead/",
            {
                "name": "Geekgeeanath Aswathy Gopinathan Pillai",
                "phone": "+919895277332",
                "email": "gikginath@yahoo.com",
            },
            format="json",
        )
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)
        s1 = Student.objects.get(id=r1.data["student_id"])
        self.assertEqual(s1.assigned_to, ifthisha)
        self.assertEqual(s1.campaign, abroad_diploma)
        self.assertNotEqual(s1.lead_status, "DUPLICATE")

        # B. Same person arrives on ABROAD (Regular) -> marked DUPLICATE, unassigned, pointer on ABROAD (Regular) untouched
        r2 = self.client.post(
            f"/api/crm/webhooks/campaign/{abroad_regular.secret_token}/lead/",
            {
                "name": "Geekgeeanath Aswathy Gopinathan Pillai",
                "phone": "+919895277332",
                "email": "gikginath@yahoo.com",
            },
            format="json",
        )
        self.assertEqual(r2.status_code, status.HTTP_200_OK)
        self.assertTrue(r2.data["is_duplicate"])
        s2 = Student.objects.get(id=r2.data["student_id"])
        self.assertEqual(s2.lead_status, "DUPLICATE")
        self.assertEqual(s2.duplicate_of, s1)
        self.assertIsNone(s2.assigned_to)
        self.assertEqual(s2.campaign, abroad_regular)

        # C. 4 fresh Regular leads arrive on ABROAD (Regular) -> assigned strictly to reg_bde1, reg_bde2, reg_bde1, reg_bde2 (NEVER Ifthisha)
        reg_assignees = []
        for idx in range(1, 5):
            resp = self.client.post(
                f"/api/crm/webhooks/campaign/{abroad_regular.secret_token}/lead/",
                {
                    "name": f"Regular Applicant {idx}",
                    "phone": f"+91984700010{idx}",
                    "email": f"reg_applicant_{idx}@yahoo.com",
                },
                format="json",
            )
            self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
            lead_obj = Student.objects.get(id=resp.data["student_id"])
            reg_assignees.append(lead_obj.assigned_to_id)

        self.assertEqual(
            reg_assignees,
            [reg_bde1.id, reg_bde2.id, reg_bde1.id, reg_bde2.id],
        )
        self.assertNotIn(ifthisha.id, reg_assignees)


class AutoAssignmentConcurrencyTestSuite(TransactionTestCase):
    """
    Concurrency and Transactional Safety Test Suite for get_next_assigned_rep().

    Database & Environment Considerations:
    --------------------------------------
    - Production / PostgreSQL / MySQL:
      Django utilizes `SELECT ... FOR UPDATE` row-level locking on the `Campaign` table.
      Concurrent webhooks attempting to assign leads for the same campaign serialize
      at the database row lock, ensuring no two workers read or update the pointer simultaneously.

    - SQLite Test Environment Limitation:
      SQLite uses database-level / file-level locking rather than row-level locks (`SELECT ... FOR UPDATE`
      is a no-op / ignored in SQLite, and concurrent write transactions across multiple threads raise
      `OperationalError: database table is locked`).
      Therefore, genuine multi-threaded concurrent write testing is executed when running on databases
      supporting `has_select_for_update` (e.g. PostgreSQL in CI/Production), while on SQLite we execute
      the strongest practical transaction-isolation, atomic-locking, and rollback-safety tests.
    """

    def setUp(self):
        # Create 3 active BDEs
        self.bde1 = User.objects.create_user(
            username='conc_bde1',
            password='Password@123',
            email='conc_bde1@gmail.com',
            role='SALES',
            is_active=True
        )
        self.bde2 = User.objects.create_user(
            username='conc_bde2',
            password='Password@123',
            email='conc_bde2@gmail.com',
            role='SALES',
            is_active=True
        )
        self.bde3 = User.objects.create_user(
            username='conc_bde3',
            password='Password@123',
            email='conc_bde3@gmail.com',
            role='SALES',
            is_active=True
        )

        # Create Campaign with 3 BDEs
        self.campaign = Campaign.objects.create(
            name='Concurrent Auto Assign Campaign',
            section='CAREER_ACADEMY',
            secret_token=uuid.uuid4(),
            status='ACTIVE'
        )
        self.campaign.auto_assign_to.add(self.bde1, self.bde2, self.bde3)

    def test_row_locking_select_for_update_invoked(self):
        """
        Verifies that get_next_assigned_rep() explicitly requests row-level locking
        using `select_for_update()` inside an atomic transaction.
        """
        original_select_for_update = Campaign.objects.select_for_update
        select_for_update_called = False

        def spy_select_for_update(*args, **kwargs):
            nonlocal select_for_update_called
            select_for_update_called = True
            return original_select_for_update(*args, **kwargs)

        with patch.object(Campaign.objects, 'select_for_update', side_effect=spy_select_for_update):
            rep = get_next_assigned_rep(self.campaign.id)
            self.assertTrue(select_for_update_called, "get_next_assigned_rep must invoke select_for_update() for row locking")
            self.assertEqual(rep.id, self.bde1.id)

    def test_transaction_rollback_preserves_pointer(self):
        """
        Verifies that if an error occurs within an enclosing atomic transaction during lead creation,
        the entire transaction rolls back and the round-robin pointer on Campaign does NOT advance.
        """
        from django.db import transaction

        # Initial state: no BDE assigned
        self.assertIsNone(self.campaign.last_assigned_bde)

        try:
            with transaction.atomic():
                rep = get_next_assigned_rep(self.campaign.id)
                self.assertEqual(rep.id, self.bde1.id)
                # Simulate a failure during subsequent lead processing (e.g., student creation error)
                raise ValueError("Simulated lead creation failure")
        except ValueError:
            pass

        # Verify that rollback prevented pointer advancement
        self.campaign.refresh_from_db()
        self.assertIsNone(
            self.campaign.last_assigned_bde,
            "Failed transaction must roll back Campaign.last_assigned_bde to prevent skipped BDEs"
        )

    def test_multi_threaded_concurrency_on_supported_backends(self):
        """
        Executes a genuine multi-threaded concurrency test against backends supporting row-level locking (PostgreSQL/MySQL).
        Under SQLite, documents the engine limitation and skips multi-threaded write execution.
        """
        from django.db import connection
        if connection.vendor == 'sqlite':
            self.skipTest(
                "SQLite does not support row-level locks (`SELECT ... FOR UPDATE`) and uses file-level locking, "
                "causing concurrent multi-threaded write collisions (`database table is locked`). "
                "Row locking is active and verified for PostgreSQL/MySQL environments."
            )

        num_threads = 6
        assigned_rep_ids = []
        errors = []
        barrier = threading.Barrier(num_threads)
        lock = threading.Lock()

        def worker():
            try:
                barrier.wait()
                rep = get_next_assigned_rep(self.campaign.id)
                with lock:
                    if rep:
                        assigned_rep_ids.append(rep.id)
            except Exception as exc:
                with lock:
                    errors.append(exc)
            finally:
                connections.close_all()

        threads = [threading.Thread(target=worker) for _ in range(num_threads)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(errors), 0, f"Concurrent workers encountered errors: {errors}")
        self.assertEqual(len(assigned_rep_ids), num_threads, "All 6 threads must successfully receive an assignment")

        counts = Counter(assigned_rep_ids)
        self.assertEqual(counts[self.bde1.id], 2)
        self.assertEqual(counts[self.bde2.id], 2)
        self.assertEqual(counts[self.bde3.id], 2)

    def test_concurrent_duplicate_lead_creation_on_supported_backends(self):
        """
        Executes a multi-threaded concurrent webhook test for the same person across two campaigns
        on PostgreSQL/MySQL, verifying that acquire_lead_creation_lock() serializes check-then-create
        so exactly 1 NEW lead and 1 DUPLICATE lead (assigned_to=None) are created.
        """
        from django.db import connection
        if connection.vendor == 'sqlite':
            self.skipTest(
                "SQLite uses file-level locking rather than row-level `SELECT ... FOR UPDATE`. "
                "Multi-threaded duplicate serialization is executed on PostgreSQL."
            )

        Program.objects.get_or_create(name='Natya Career Academy')
        Program.objects.get_or_create(name='Natya')
        PipelineStage.objects.get_or_create(name='New', defaults={'order': 1})

        camp_reg = Campaign.objects.create(
            name='Concurrent ABROAD Regular',
            section='REGULAR',
            secret_token=uuid.uuid4(),
            status='ACTIVE',
        )
        camp_reg.auto_assign_to.add(self.bde1)

        tokens = [self.campaign.secret_token, camp_reg.secret_token]
        barrier = threading.Barrier(2)
        responses = []
        errors = []
        lock = threading.Lock()

        def post_webhook(token):
            client = APIClient()
            try:
                barrier.wait()
                res = client.post(
                    f"/api/crm/webhooks/campaign/{token}/lead/",
                    {
                        "name": "Geekgeeanath Aswathy Gopinathan Pillai",
                        "phone": "+919895277332",
                        "email": "gikginath@yahoo.com",
                    },
                    format="json",
                )
                with lock:
                    responses.append(res.status_code)
            except Exception as exc:
                with lock:
                    errors.append(exc)
            finally:
                connections.close_all()

        threads = [threading.Thread(target=post_webhook, args=(tok,)) for tok in tokens]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(errors), 0, f"Concurrent webhook errors: {errors}")
        leads = list(Student.objects.filter(mobile="+919895277332").order_by("id"))
        self.assertEqual(len(leads), 2)
        non_dup = [l for l in leads if l.lead_status != "DUPLICATE"]
        dup = [l for l in leads if l.lead_status == "DUPLICATE"]
        self.assertEqual(len(non_dup), 1)
        self.assertEqual(len(dup), 1)
        self.assertEqual(dup[0].duplicate_of_id, non_dup[0].id)
        self.assertIsNone(dup[0].assigned_to)

