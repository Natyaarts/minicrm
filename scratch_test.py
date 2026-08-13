import sys
sys.path.append('/home/ubuntu/minicrm/backend')
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from crm.models import Campaign
from crm.views_google import get_refreshed_access_token
import requests
import urllib.parse

c = Campaign.objects.get(id=6)
token = get_refreshed_access_token(c)
url_meta = f'https://sheets.googleapis.com/v4/spreadsheets/{c.google_spreadsheet_id}'
res_meta = requests.get(url_meta, headers={'Authorization': f'Bearer {token}'})
meta_data = res_meta.json()
print('Available sheets:')
for sheet in meta_data.get('sheets', []):
    print(' - Name:', repr(sheet.get('properties', {}).get('title')))

# Test 1: Quote sheet name separately, keep !A:Z literal, url-encode only the sheet name
sheet_title = c.google_sheet_name or 'Sheet1'
quoted_title = f"'{sheet_title}'"
encoded_sheet = urllib.parse.quote(quoted_title)
url_separate = f'https://sheets.googleapis.com/v4/spreadsheets/{c.google_spreadsheet_id}/values/{encoded_sheet}!A:Z'
res_separate = requests.get(url_separate, headers={'Authorization': f'Bearer {token}'})
print('Sep encode status:', res_separate.status_code)
if res_separate.status_code == 200:
    print('SUCCESS 1!')

# Test 2: Do not quote, url-encode only the sheet name
encoded_sheet_no_q = urllib.parse.quote(sheet_title)
url_no_q = f'https://sheets.googleapis.com/v4/spreadsheets/{c.google_spreadsheet_id}/values/{encoded_sheet_no_q}!A:Z'
res_no_q = requests.get(url_no_q, headers={'Authorization': f'Bearer {token}'})
print('No Q Sep encode status:', res_no_q.status_code)
if res_no_q.status_code == 200:
    print('SUCCESS 2!')

# Test 3: Fetch LEADS REPORT sheet
url_leads = f'https://sheets.googleapis.com/v4/spreadsheets/{c.google_spreadsheet_id}/values/LEADS%20REPORT!A:Z'
res_leads = requests.get(url_leads, headers={'Authorization': f'Bearer {token}'})
print('LEADS REPORT status:', res_leads.status_code)
if res_leads.status_code == 200:
    print('SUCCESS 3! LEADS REPORT working.')




