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

# Test quoting the sheet title in single quotes
sheet_title = c.google_sheet_name or 'Sheet1'
quoted_title = f"'{sheet_title}'!A:Z"
import urllib.parse
encoded_range = urllib.parse.quote(quoted_title)
url_quoted = f'https://sheets.googleapis.com/v4/spreadsheets/{c.google_spreadsheet_id}/values/{encoded_range}'
res_quoted = requests.get(url_quoted, headers={'Authorization': f'Bearer {token}'})
print('Quoted sheet name status:', res_quoted.status_code)
if res_quoted.status_code != 200:
    print('Quoted response:', res_quoted.text[:200])
else:
    print('SUCCESS! Sample data:', res_quoted.json().get('values', [])[:2])


