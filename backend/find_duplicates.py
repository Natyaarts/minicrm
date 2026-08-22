import os
import sys
import django
import datetime
from django.db.models import Count

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import Student

use_date_range = "--date-range" in sys.argv
start_date = datetime.date(2026, 8, 15)
end_date = datetime.date(2026, 8, 20)

if use_date_range:
    print(f"Scanning for leads created between {start_date} and {end_date} that have duplicates in the database...")
    target_leads = Student.objects.filter(
        is_active=True,
        created_at__date__gte=start_date,
        created_at__date__lte=end_date
    ).exclude(lead_status='DUPLICATE')
else:
    print("Running database-wide scan for all duplicate leads (no date filter)...")
    print("To filter by 15-20 Aug, run: python backend/find_duplicates.py --date-range\n")
    target_leads = Student.objects.filter(is_active=True).exclude(lead_status='DUPLICATE')

phone_groups = {}
email_groups = {}

processed_mobiles = set()
processed_emails = set()

for lead in target_leads:
    if lead.mobile and lead.mobile not in processed_mobiles:
        matches = Student.objects.filter(mobile=lead.mobile, is_active=True).exclude(lead_status='DUPLICATE')
        if matches.count() > 1:
            phone_groups[lead.mobile] = list(matches)
            processed_mobiles.add(lead.mobile)
            
    if lead.email and "@webhook.temp" not in lead.email and lead.email.lower() != 'na' and lead.email not in processed_emails:
        matches = Student.objects.filter(email=lead.email, is_active=True).exclude(lead_status='DUPLICATE')
        if matches.count() > 1:
            email_groups[lead.email] = list(matches)
            processed_emails.add(lead.email)

print("\n--- DUPLICATE PHONE NUMBERS ---")
total_phone = 0
for mobile, students in phone_groups.items():
    print(f"\nPhone: {mobile} (Found {len(students)} entries)")
    for s in students:
        assigned_name = f"{s.assigned_to.first_name} {s.assigned_to.last_name}".strip() if s.assigned_to else 'Unassigned'
        if assigned_name == '':
            assigned_name = s.assigned_to.username
        created_date = s.created_at.date() if s.created_at else 'Unknown'
        print(f"  - {s.crm_student_id} | {s.first_name} {s.last_name or ''} | Created: {created_date} | Status: {s.lead_status} | Assigned to: {assigned_name}")
    total_phone += 1

print("\n--- DUPLICATE EMAILS ---")
total_email = 0
for email, students in email_groups.items():
    print(f"\nEmail: {email} (Found {len(students)} entries)")
    for s in students:
        assigned_name = f"{s.assigned_to.first_name} {s.assigned_to.last_name}".strip() if s.assigned_to else 'Unassigned'
        if assigned_name == '':
            assigned_name = s.assigned_to.username
        created_date = s.created_at.date() if s.created_at else 'Unknown'
        print(f"  - {s.crm_student_id} | {s.first_name} {s.last_name or ''} | Created: {created_date} | Status: {s.lead_status} | Assigned to: {assigned_name}")
    total_email += 1

print(f"\nSummary: Found {total_phone} phone duplicates and {total_email} email duplicates.")
