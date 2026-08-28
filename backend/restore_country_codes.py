import os
import sys
import django
import requests
import urllib.parse

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from crm.models import Campaign
from core.models import Student, normalize_phone_number
from django.contrib.auth import get_user_model
from django.db import transaction as django_db_transaction

User = get_user_model()

# Find all active campaigns with spreadsheets
campaigns = Campaign.objects.filter(
    status='ACTIVE'
).exclude(google_spreadsheet_id__isnull=True).exclude(google_spreadsheet_id='')

if not campaigns.exists():
    print("No active campaigns configured with Google Spreadsheet ID.")
    sys.exit(0)

from crm.views_google import get_refreshed_access_token

print("Starting restoration of country codes for existing leads...\n")

total_updated = 0

for campaign in campaigns:
    print(f"Fetching sheet rows for campaign: {campaign.name}")
    access_token = get_refreshed_access_token(campaign)
    if not access_token:
        print(f"  - Failed to get Google access token for campaign: {campaign.name}")
        continue

    quoted_sheet_name = f"'{campaign.google_sheet_name or 'Sheet1'}'"
    encoded_range = urllib.parse.quote_plus(quoted_sheet_name)
    sheets_url = f"https://sheets.googleapis.com/v4/spreadsheets/{campaign.google_spreadsheet_id}/values/{encoded_range}!A:Z"
    headers = {'Authorization': f'Bearer {access_token}'}

    try:
        res = requests.get(sheets_url, headers=headers)
        if res.status_code != 200:
            print(f"  - Failed to fetch sheet content: {res.status_code}")
            continue

        sheet_data = res.json()
        rows = sheet_data.get('values', [])
        if not rows:
            print("  - Sheet is empty.")
            continue

        headers_row = [str(h).lower().strip() for h in rows[0]]
        def get_index(names):
            for name in names:
                if name in headers_row:
                    return headers_row.index(name)
            return -1

        mobile_idx = get_index(['mobile', 'phone', 'contact', 'mobile number', 'phone number', 'phone_number'])
        if mobile_idx == -1:
            print(f"  - Mobile column not found in headers for campaign: {campaign.name}")
            continue

        print(f"  - Read {len(rows) - 1} data rows from sheet. Processing...")

        campaign_updated = 0

        for idx, row in enumerate(rows[1:], start=2):
            if mobile_idx >= len(row):
                continue
            mobile = str(row[mobile_idx]).strip()
            
            # Replicate old normalization (last 10 digits)
            digits_only = ''.join(c for c in mobile if c.isdigit())
            if not digits_only or len(digits_only) < 10:
                continue
            old_normalized = digits_only[-10:]

            # Replicate new E.164 normalization
            new_normalized = normalize_phone_number(mobile)
            if not new_normalized:
                continue

            # Find matching student by the old format in database
            students = Student.objects.filter(mobile=old_normalized, campaign=campaign)
            for student in students:
                # If it already has the new format, skip
                if student.mobile == new_normalized:
                    continue

                try:
                    with django_db_transaction.atomic():
                        # Update Student mobile
                        old_mobile = student.mobile
                        student.mobile = new_normalized
                        student.save()

                        # Update linked user username (strip '+' for username safety)
                        user = student.user
                        clean_username = f"st_{new_normalized.replace('+', '')}"
                        if user.username != clean_username:
                            # Verify no other user has this username
                            if not User.objects.filter(username=clean_username).exists():
                                user.username = clean_username
                                user.save()

                        print(f"    [ROW {idx}] Updated lead '{student.first_name}': {old_mobile} -> {new_normalized}")
                        campaign_updated += 1
                        total_updated += 1
                except Exception as ex:
                    print(f"    [ROW {idx}] Error updating student ID {student.id}: {ex}")

        print(f"  - Completed campaign '{campaign.name}'. Updated: {campaign_updated} leads.\n")

    except Exception as ex:
        print(f"  - Error processing campaign: {ex}")

print(f"Restoration finished! Total leads updated: {total_updated}")
