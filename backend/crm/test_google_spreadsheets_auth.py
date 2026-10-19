import unittest
from unittest.mock import patch, MagicMock
from datetime import timedelta
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from crm.models import Campaign

User = get_user_model()


class GoogleSpreadsheetsAuthTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='test_crm_admin',
            password='testpassword123',
            role='ADMIN',
            email='crmadmin@example.com'
        )
        self.campaign_no_google = Campaign.objects.create(
            name='Summer Marketing Campaign',
            platform='OTHER',
            status='ACTIVE',
            budget=10000.00
        )
        self.campaign_with_google = Campaign.objects.create(
            name='Connected Google Campaign',
            platform='OTHER',
            status='ACTIVE',
            budget=25000.00,
            google_access_token='valid_mock_access_token',
            google_refresh_token='valid_mock_refresh_token',
            google_token_expiry=timezone.now() + timedelta(hours=2),
            google_spreadsheet_id='sheet_xyz_123',
            google_sheet_name='Sheet1'
        )

    def test_spreadsheets_list_unauthenticated_returns_401(self):
        """Unauthenticated caller must be rejected with 401 by DRF."""
        url = f'/api/crm/google/spreadsheets/?campaign_id={self.campaign_no_google.id}'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('WWW-Authenticate', response.headers)

    def test_spreadsheets_list_authenticated_without_google_tokens_returns_200_not_401(self):
        """
        REGRESSION TEST:
        When a valid MiniCRM user requests spreadsheets for a campaign lacking Google OAuth,
        the server MUST NOT return 401 (which would evict the user's MiniCRM session).
        It must return 200 with authenticated=False and files=[].
        """
        self.client.force_authenticate(user=self.user)
        url = f'/api/crm/google/spreadsheets/?campaign_id={self.campaign_no_google.id}'
        response = self.client.get(url)
        self.assertNotEqual(
            response.status_code,
            status.HTTP_401_UNAUTHORIZED,
            "Must NOT return 401 when MiniCRM user is authenticated"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data.get('authenticated'))
        self.assertEqual(response.data.get('files'), [])
        self.assertIn('message', response.data)

    @patch('crm.views_google.requests.get')
    def test_spreadsheets_list_authenticated_with_valid_google_tokens(self, mock_get):
        """When Google OAuth is linked, returns 200 with spreadsheets list and authenticated=True."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'files': [
                {'id': 'sheet_1', 'name': 'Ad Leads 2026'},
                {'id': 'sheet_2', 'name': 'Dance Inquiries'}
            ]
        }
        mock_get.return_value = mock_response

        self.client.force_authenticate(user=self.user)
        url = f'/api/crm/google/spreadsheets/?campaign_id={self.campaign_with_google.id}'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get('authenticated'))
        self.assertEqual(len(response.data.get('files')), 2)
        self.assertEqual(response.data['files'][0]['name'], 'Ad Leads 2026')

    def test_google_sheet_sync_without_google_tokens_returns_400_not_401(self):
        """
        REGRESSION TEST:
        Attempting to sync a campaign without Google tokens must return 400 Bad Request,
        NEVER 401 Unauthorized.
        """
        self.client.force_authenticate(user=self.user)
        url = '/api/crm/google/sync/'
        payload = {
            'campaign_id': self.campaign_no_google.id,
            'spreadsheet_id': 'any_sheet_id',
            'sheet_name': 'Sheet1'
        }
        response = self.client.post(url, data=payload, format='json')
        self.assertNotEqual(
            response.status_code,
            status.HTTP_401_UNAUTHORIZED,
            "Sync endpoint must NOT return 401 for missing third-party connection"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data.get('authenticated'))
        self.assertIn('error', response.data)

    def test_campaign_not_found_returns_404(self):
        """Non-existent campaign returns 404, not 401."""
        self.client.force_authenticate(user=self.user)
        url = '/api/crm/google/spreadsheets/?campaign_id=999999'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
