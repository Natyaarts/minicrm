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

sheet_title = c.google_sheet_name or 'Sheet1'

# Test 4: Single quotes around sheet name, unencoded verbatim
url_unencoded_q = f"https://sheets.googleapis.com/v4/spreadsheets/{c.google_spreadsheet_id}/values/'{sheet_title}'!A:Z"
res_unencoded_q = requests.get(url_unencoded_q, headers={'Authorization': f'Bearer {token}'})
print('Unencoded single quotes status:', res_unencoded_q.status_code)
if res_unencoded_q.status_code == 200:
    print('SUCCESS 4!')

# Test 5: urllib.parse.quote_plus on the single quoted sheet name
encoded_sheet_plus = urllib.parse.quote_plus(f"'{sheet_title}'")
url_plus = f"https://sheets.googleapis.com/v4/spreadsheets/{c.google_spreadsheet_id}/values/{encoded_sheet_plus}!A:Z"
res_plus = requests.get(url_plus, headers={'Authorization': f'Bearer {token}'})
print('Quote Plus status:', res_plus.status_code)
if res_plus.status_code == 200:
    print('SUCCESS 5!')





