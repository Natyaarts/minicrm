import os
import sys
import django
import requests
import urllib.parse

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from crm.models import Campaign, PipelineStage
from core.models import Student, Program
from django.contrib.auth import get_user_model
from django.db import transaction as django_db_transaction

User = get_user_model()

campaign = Campaign.objects.filter(name__icontains="META MORPH(career academy)").first()
if not campaign:
    print("Campaign 'META MORPH(career academy)' not found in database.")
    sys.exit(1)

from crm.views_google import get_refreshed_access_token
access_token = get_refreshed_access_token(campaign)
if not access_token:
    print("Failed to refresh Google access token.")
    sys.exit(1)

quoted_sheet_name = f"'{campaign.google_sheet_name or 'Sheet1'}'"
encoded_range = urllib.parse.quote_plus(quoted_sheet_name)
sheets_url = f"https://sheets.googleapis.com/v4/spreadsheets/{campaign.google_spreadsheet_id}/values/{encoded_range}!A:Z"
headers = {'Authorization': f'Bearer {access_token}'}

try:
    res = requests.get(sheets_url, headers=headers)
    rows = res.json().get('values', [])
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
    last_name_idx = get_index(['last name', 'lastname', 'surname'])
    mobile_idx = get_index(['mobile', 'phone', 'contact', 'mobile number', 'phone number', 'phone_number'])
    email_idx = get_index(['email', 'email address', 'mail'])

    new_stage = PipelineStage.objects.filter(name__iexact='New Lead').first() or PipelineStage.objects.filter(is_default=True).first()
    new_stage_id = str(new_stage.id) if new_stage else 'NEW'

    print("Diagnosing first 3 missing leads failures...\n")
    diagnosed_count = 0

    for idx, row in enumerate(rows[1:], start=2):
        if mobile_idx >= len(row):
            continue
        mobile = str(row[mobile_idx]).strip()
        cleaned_phone = ''.join(c for c in mobile if c.isdigit())
        if len(cleaned_phone) > 10:
            cleaned_phone = cleaned_phone[-10:]
        if not cleaned_phone:
            continue
            
        # Check if student exists
        if not Student.objects.filter(mobile=cleaned_phone).exists():
            diagnosed_count += 1
            print(f"Row {idx}: Diagnosing lead for phone {cleaned_phone}...")
            
            full_name = row[first_name_idx] if first_name_idx != -1 and first_name_idx < len(row) else "Sheet Lead"
            last_name = row[last_name_idx] if last_name_idx != -1 and last_name_idx < len(row) else ""
            email = row[email_idx] if email_idx != -1 and email_idx < len(row) else ""
            
            if full_name and not last_name:
                parts = str(full_name).split(' ', 1)
                first_name = parts[0]
                last_name = parts[1] if len(parts) > 1 else ''
            else:
                first_name = full_name
                
            temp_username = f"st_{cleaned_phone}"
            count = Student.objects.filter(crm_student_id__startswith="NATYA-").count() + 1
            crm_id = f"NATYA-{1000 + count}"
            
            try:
                # We do NOT run in atomic transaction here to check sub-errors, 
                # but we will print progress
                user, created = User.objects.get_or_create(
                    username=temp_username,
                    defaults={
                        'first_name': first_name,
                        'last_name': last_name,
                        'email': email or f"{temp_username}@gmail.com",
                        'role': 'STUDENT'
                    }
                )
                print(f"  - User: username={temp_username}, created={created}, id={user.id}")
                
                program = None
                if campaign.section == 'CAREER_ACADEMY':
                    program = Program.objects.filter(name='Natya Career Academy').first()
                elif campaign.section == 'REGULAR':
                    program = Program.objects.filter(name='Natya').first()
                if not program:
                    program = Program.objects.exclude(name="Wise Import").first() or Program.objects.first()
                
                student = Student.objects.create(
                    user=user,
                    crm_student_id=crm_id,
                    program_type=program,
                    first_name=first_name,
                    last_name=last_name,
                    email=email,
                    mobile=cleaned_phone,
                    campaign=campaign,
                    lead_status=new_stage_id,
                    sales_section=campaign.section
                )
                print(f"  - Student created: id={student.id}, crm_student_id={crm_id}")
                
                # Delete test creation to keep DB clean
                student.delete()
                if created:
                    user.delete()
                print("  - Cleaned up test records successfully.")
                
            except Exception as e:
                print(f"  - FAILED WITH ERROR: {type(e).__name__}: {str(e)}")
                import traceback
                traceback.print_exc()
                
            print("-" * 50)
            if diagnosed_count >= 3:
                break

except Exception as ex:
    print(f"General error: {str(ex)}")
