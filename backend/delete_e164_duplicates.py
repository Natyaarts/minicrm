import os
import sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import Student, normalize_phone_number
from crm.models import LeadInteraction
from django.contrib.auth import get_user_model
from django.db import transaction as django_db_transaction

User = get_user_model()

confirm = "--confirm" in sys.argv

if not confirm:
    print("====================================================")
    print("RUNNING IN DRY RUN MODE (NO DATA WILL BE DELETED)")
    print("To actually perform deletions, run:")
    print("python backend/delete_e164_duplicates.py --confirm")
    print("====================================================\n")
else:
    print("====================================================")
    print("WARNING: PERFORMING ACTUAL DELETIONS OF E164 DUPLICATES")
    print("====================================================\n")

# Step 1: Group active students by their E.164 normalized mobile number
normalized_groups = {}

all_students = Student.objects.filter(is_active=True).exclude(lead_status='DUPLICATE')
print(f"Scanning {all_students.count()} active students for duplicate phone numbers...")

for s in all_students:
    if not s.mobile:
        continue
    norm = normalize_phone_number(s.mobile)
    if not norm:
        continue
    if norm not in normalized_groups:
        normalized_groups[norm] = []
    normalized_groups[norm].append(s)

# Step 2: Identify groups with duplicates
duplicate_groups = {phone: group for phone, group in normalized_groups.items() if len(group) > 1}
print(f"Found {len(duplicate_groups)} phone numbers with duplicate records.\n")

deleted_count = 0

for phone, students in duplicate_groups.items():
    print(f"Phone Group: {phone} (Found {len(students)} entries)")
    
    # Sort students to determine which one to keep
    # Priority:
    # 1. Number of CRM interactions (keep notes/history)
    # 2. Number of transactions
    # 3. Earlier creation date / ID
    def get_keep_score(s):
        int_count = LeadInteraction.objects.filter(student=s).count()
        has_agent = 1 if s.assigned_to else 0
        not_new = 1 if s.lead_status != 'NEW' else 0
        tx_count = s.transactions.count() if hasattr(s, 'transactions') else 0
        # Priority:
        # 1. Number of interactions (history)
        # 2. Assigned sales agent
        # 3. Changed pipeline status (not 'NEW')
        # 4. Transactions
        # 5. Smaller ID (older lead)
        return (int_count, has_agent, not_new, tx_count, -s.id)

    students.sort(key=get_keep_score, reverse=True)
    primary = students[0]
    to_delete = students[1:]
    
    print(f"  [KEEP]  ID: {primary.crm_student_id} | Name: {primary.first_name} | Created: {primary.created_at} | Mobile in DB: {primary.mobile}")
    
    for s in to_delete:
        # Strict safeguard: Only delete if created today (Aug 28) between 7:00 PM and 8:30 PM local time (13:30 to 15:00 UTC)
        created_utc = s.created_at
        is_target_time = (
            created_utc.year == 2026 and 
            created_utc.month == 8 and 
            created_utc.day == 28 and 
            ( (created_utc.hour == 13 and created_utc.minute >= 30) or 
              (created_utc.hour == 14) or 
              (created_utc.hour == 15 and created_utc.minute <= 0) )
        )
        
        if not is_target_time:
            print(f"  [SKIP]  ID: {s.crm_student_id} | Name: {s.first_name} (Created outside 7pm-8:30pm today: {s.created_at})")
            continue

        print(f"  [DEL]   ID: {s.crm_student_id} | Name: {s.first_name} | Created: {s.created_at} | Mobile in DB: {s.mobile}")
        
        if confirm:
            try:
                with django_db_transaction.atomic():
                    user = s.user
                    # Delete the Student record
                    s.delete()
                    # Delete the linked User account
                    if user:
                        user.delete()
                    deleted_count += 1
            except Exception as ex:
                print(f"    - Failed to delete student {s.crm_student_id}: {ex}")
    print("-" * 50)

print(f"\nScan finished! Total duplicate records deleted: {deleted_count}")
