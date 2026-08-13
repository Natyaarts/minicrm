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

# Let's test fetch range using sheet title verbatim without quotes
sheet_title = c.google_sheet_name or 'Sheet1'
url_no_quote = f'https://sheets.googleapis.com/v4/spreadsheets/{c.google_spreadsheet_id}/values/{sheet_title}!A:Z'
res_no_quote = requests.get(url_no_quote, headers={'Authorization': f'Bearer {token}'})
print('No urllib quote status:', res_no_quote.status_code)
if res_no_quote.status_code != 200:
    print('No urllib quote response:', res_no_quote.text[:200])

