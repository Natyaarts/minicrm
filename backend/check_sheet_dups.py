import os
import sys
import django
import requests
import urllib.parse

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from crm.models import Campaign
from core.models import Student
from crm.views_google import get_refreshed_access_token

# Find the campaign
campaign = Campaign.objects.filter(name__icontains="META MORPH").first()
if not campaign:
    print("Campaign 'META MORPH' not found in database.")
    sys.exit(1)

print(f"Analyzing campaign: {campaign.name}")
print(f"Spreadsheet ID: {campaign.google_spreadsheet_id}")
print(f"Sheet Name: {campaign.google_sheet_name}")

access_token = get_refreshed_access_token(campaign)
if not access_token:
    print("Failed to get Google access token.")
    sys.exit(1)

quoted_sheet_name = f"'{campaign.google_sheet_name or 'Sheet1'}'"
encoded_range = urllib.parse.quote_plus(quoted_sheet_name)
sheets_url = f"https://sheets.googleapis.com/v4/spreadsheets/{campaign.google_spreadsheet_id}/values/{encoded_range}!A:Z"
headers = {'Authorization': f'Bearer {access_token}'}

try:
    res = requests.get(sheets_url, headers=headers)
    if res.status_code != 200:
        print(f"Failed to fetch sheet content: {res.status_code} {res.text}")
        sys.exit(1)

    sheet_data = res.json()
    rows = sheet_data.get('values', [])
    if not rows:
        print("Sheet is empty.")
        sys.exit(0)

    headers_row = [str(h).lower().strip() for h in rows[0]]
    def get_index(names):
        for name in names:
            if name in headers_row:
                return headers_row.index(name)
        return -1
        
    first_name_idx = get_index(['first name', 'firstname', 'name', 'student name', 'student_name', 'full_name', 'fullname'])
    mobile_idx = get_index(['mobile', 'phone', 'contact', 'mobile number', 'phone number', 'phone_number'])

    if mobile_idx == -1:
        print("Could not identify the Mobile/Phone column in the sheet headers.")
        sys.exit(1)

    print(f"Total rows in sheet: {len(rows)}")

    in_this_campaign = 0
    in_other_campaigns = 0
    not_in_db = 0
    blank_or_invalid = 0

    other_campaign_details = {}

    for idx, row in enumerate(rows[1:], start=2):
        if mobile_idx >= len(row):
            blank_or_invalid += 1
            continue
        mobile = str(row[mobile_idx]).strip()
        cleaned_phone = ''.join(c for c in mobile if c.isdigit())
        if len(cleaned_phone) > 10:
            cleaned_phone = cleaned_phone[-10:]
        if not cleaned_phone:
            blank_or_invalid += 1
            continue
            
        # Check in DB
        students = list(Student.objects.filter(mobile=cleaned_phone))
        if not students:
            not_in_db += 1
        else:
            # Check campaign
            matched_this = False
            for s in students:
                if s.campaign == campaign:
                    matched_this = True
                else:
                    camp_name = s.campaign.name if s.campaign else 'Direct/Wise Import'
                    other_campaign_details[camp_name] = other_campaign_details.get(camp_name, 0) + 1
            if matched_this:
                in_this_campaign += 1
            else:
                in_other_campaigns += 1

    print("\n=================== ANALYSIS RESULTS ===================")
    print(f"Total data rows checked: {len(rows) - 1}")
    print(f"Leads already in this campaign (active): {in_this_campaign}")
    print(f"Leads in other campaigns / Wise Imports: {in_other_campaigns}")
    print(f"Leads NOT in database (missing): {not_in_db}")
    print(f"Rows with blank or invalid phone numbers: {blank_or_invalid}")

    if other_campaign_details:
        print("\nBreakdown of leads found in other campaigns:")
        for camp, count in other_campaign_details.items():
            print(f"  - {camp}: {count} leads")
    print("========================================================\n")

except Exception as ex:
    print(f"Error occurred: {str(ex)}")
