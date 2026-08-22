import os
import django
import datetime

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import Student

start_date = datetime.date(2026, 8, 15)
end_date = datetime.date(2026, 8, 20)

print(f"Scanning for leads created between {start_date} and {end_date} that have duplicates in the database...")

target_leads = Student.objects.filter(
    is_active=True,
    created_at__date__gte=start_date,
    created_at__date__lte=end_date
).exclude(lead_status='DUPLICATE')

phone_groups = {}
email_groups = {}

for lead in target_leads:
    if lead.mobile:
        # Find other active non-duplicate leads with the same mobile (created at any time)
        matches = Student.objects.filter(mobile=lead.mobile, is_active=True).exclude(lead_status='DUPLICATE')
        if matches.count() > 1:
            phone_groups[lead.mobile] = list(matches)
            
    if lead.email and "@webhook.temp" not in lead.email and lead.email.lower() != 'na':
        # Find other active non-duplicate leads with the same email (created at any time)
        matches = Student.objects.filter(email=lead.email, is_active=True).exclude(lead_status='DUPLICATE')
        if matches.count() > 1:
            email_groups[lead.email] = list(matches)

print("\n--- DUPLICATE PHONE NUMBERS (Leads created 15-20 Aug) ---")
total_phone = 0
for mobile, students in phone_groups.items():
    print(f"\nPhone: {mobile}")
    for s in students:
        assigned_name = f"{s.assigned_to.first_name} {s.assigned_to.last_name}".strip() if s.assigned_to else 'Unassigned'
        if assigned_name == '':
            assigned_name = s.assigned_to.username
        created_date = s.created_at.date() if s.created_at else 'Unknown'
        print(f"  - {s.crm_student_id} | {s.first_name} {s.last_name or ''} | Created: {created_date} | Status: {s.lead_status} | Assigned to: {assigned_name}")
    total_phone += 1

print("\n--- DUPLICATE EMAILS (Leads created 15-20 Aug) ---")
total_email = 0
for email, students in email_groups.items():
    print(f"\nEmail: {email}")
    for s in students:
        assigned_name = f"{s.assigned_to.first_name} {s.assigned_to.last_name}".strip() if s.assigned_to else 'Unassigned'
        if assigned_name == '':
            assigned_name = s.assigned_to.username
        created_date = s.created_at.date() if s.created_at else 'Unknown'
        print(f"  - {s.crm_student_id} | {s.first_name} {s.last_name or ''} | Created: {created_date} | Status: {s.lead_status} | Assigned to: {assigned_name}")
    total_email += 1

print(f"\nSummary for 15-20 Aug: Found {total_phone} phone duplicates and {total_email} email duplicates.")
