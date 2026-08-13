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
print('Spreadsheet ID:', repr(c.google_spreadsheet_id))
print('Sheet Name:', repr(c.google_sheet_name))
token = get_refreshed_access_token(c)
# Let's test requesting just the metadata of the spreadsheet first, to see if the spreadsheet ID is valid
url_meta = f'https://sheets.googleapis.com/v4/spreadsheets/{c.google_spreadsheet_id}'
res_meta = requests.get(url_meta, headers={'Authorization': f'Bearer {token}'})
print('Meta Status:', res_meta.status_code)
print('Meta Response:', res_meta.text[:200])

sheet_name_part = urllib.parse.quote(c.google_sheet_name or 'Sheet1')
url = f'https://sheets.googleapis.com/v4/spreadsheets/{c.google_spreadsheet_id}/values/{sheet_name_part}!A:Z'
res = requests.get(url, headers={'Authorization': f'Bearer {token}'})
print('Status:', res.status_code)
print('Response:', res.text[:200])
