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
sheet_title = c.google_sheet_name or 'Sheet1'
quoted_title = f"'{sheet_title}'"
encoded_sheet = urllib.parse.quote_plus(quoted_title)
url = f'https://sheets.googleapis.com/v4/spreadsheets/{c.google_spreadsheet_id}/values/{encoded_sheet}!A:Z'
res = requests.get(url, headers={'Authorization': f'Bearer {token}'})
if res.status_code == 200:
    rows = res.json().get('values', [])
    print('Total rows in Google Sheet:', len(rows))
    print('Campaign google_last_synced_row:', c.google_last_synced_row)
    if len(rows) > 0:
        print('Last row data:', rows[-1])
else:
    print('Error status:', res.status_code)






