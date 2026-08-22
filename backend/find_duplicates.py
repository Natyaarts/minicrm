import os
import django
from django.db.models import Count

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import Student

# 1. Group by mobile and find duplicates
print("--- DUPLICATE PHONE NUMBERS ---")
duplicates_phone = Student.objects.filter(is_active=True)\
    .exclude(lead_status='DUPLICATE')\
    .values('mobile')\
    .annotate(count=Count('id'))\
    .filter(count__gt=1)\
    .exclude(mobile='')

total_phone_dups = 0
for entry in duplicates_phone:
    mobile = entry['mobile']
    count = entry['count']
    if mobile:
        students = Student.objects.filter(mobile=mobile, is_active=True).exclude(lead_status='DUPLICATE')
        print(f"\nPhone: {mobile} (Found {count} entries)")
        for s in students:
            assigned_name = f"{s.assigned_to.first_name} {s.assigned_to.last_name}".strip() if s.assigned_to else 'Unassigned'
            if assigned_name == '':
                assigned_name = s.assigned_to.username
            print(f"  - {s.crm_student_id} | {s.first_name} {s.last_name or ''} | Status: {s.lead_status} | Assigned to: {assigned_name}")
        total_phone_dups += 1

# 2. Group by email and find duplicates
print("\n--- DUPLICATE EMAILS ---")
duplicates_email = Student.objects.filter(is_active=True)\
    .exclude(lead_status='DUPLICATE')\
    .values('email')\
    .annotate(count=Count('id'))\
    .filter(count__gt=1)\
    .exclude(email='')\
    .exclude(email__contains='@webhook.temp')

total_email_dups = 0
for entry in duplicates_email:
    email = entry['email']
    count = entry['count']
    if email:
        students = Student.objects.filter(email=email, is_active=True).exclude(lead_status='DUPLICATE')
        print(f"\nEmail: {email} (Found {count} entries)")
        for s in students:
            assigned_name = f"{s.assigned_to.first_name} {s.assigned_to.last_name}".strip() if s.assigned_to else 'Unassigned'
            if assigned_name == '':
                assigned_name = s.assigned_to.username
            print(f"  - {s.crm_student_id} | {s.first_name} {s.last_name or ''} | Status: {s.lead_status} | Assigned to: {assigned_name}")
        total_email_dups += 1

print(f"\nSummary: Found {total_phone_dups} phone number duplicates and {total_email_dups} email duplicates.")
