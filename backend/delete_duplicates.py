import os
import sys
import django
import datetime

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import Student

confirm = "--confirm" in sys.argv

start_date = datetime.date(2026, 8, 15)
end_date = datetime.date(2026, 8, 20)

if not confirm:
    print("====================================================")
    print("RUNNING IN DRY RUN MODE (NO DATA WILL BE DELETED)")
    print("To actually delete, run: python backend/delete_duplicates.py --confirm")
    print("====================================================\n")
else:
    print("====================================================")
    print("WARNING: PERFORMING ACTUAL DELETIONS")
    print("====================================================\n")

target_leads = Student.objects.filter(
    is_active=True,
    created_at__date__gte=start_date,
    created_at__date__lte=end_date
).exclude(lead_status='DUPLICATE')

processed_mobiles = set()
processed_emails = set()

deleted_count = 0

for lead in target_leads:
    # 1. Handle Phone duplicates
    if lead.mobile and lead.mobile not in processed_mobiles:
        matches = list(Student.objects.filter(mobile=lead.mobile, is_active=True).exclude(lead_status='DUPLICATE').order_by('id'))
        if len(matches) > 1:
            processed_mobiles.add(lead.mobile)
            
            # Determine which one to keep
            # Priority: 1. Has interactions, 2. Created outside 15-20 Aug, 3. Earliest ID
            def get_keep_score(s):
                from crm.models import LeadInteraction
                interactions_count = LeadInteraction.objects.filter(student=s).count()
                in_range = start_date <= s.created_at.date() <= end_date if s.created_at else False
                # We prefer leads with interactions, and we prefer keeping the one OUTSIDE the 15-20 Aug range
                return (interactions_count, -1 if in_range else 1, -s.id)

            matches.sort(key=get_keep_score, reverse=True)
            primary = matches[0]
            to_delete = matches[1:]
            
            print(f"\nPhone Group: {lead.mobile}")
            print(f"  [KEEP] Primary: {primary.crm_student_id} | {primary.first_name} | Created: {primary.created_at.date() if primary.created_at else 'N/A'}")
            
            for s in to_delete:
                in_range = start_date <= s.created_at.date() <= end_date if s.created_at else False
                if in_range:
                    if confirm:
                        user = s.user
                        s.delete()
                        if user:
                            user.delete()
                        print(f"  [DELETED] {s.crm_student_id} | {s.first_name} | Created: {s.created_at.date() if s.created_at else 'N/A'}")
                    else:
                        print(f"  [WOULD DELETE] {s.crm_student_id} | {s.first_name} | Created: {s.created_at.date() if s.created_at else 'N/A'}")
                    deleted_count += 1
                else:
                    print(f"  [SKIP - OUT OF RANGE] {s.crm_student_id} | {s.first_name} | Created: {s.created_at.date() if s.created_at else 'N/A'}")

    # 2. Handle Email duplicates
    if lead.email and "@webhook.temp" not in lead.email and lead.email.lower() != 'na' and lead.email not in processed_emails:
        matches = list(Student.objects.filter(email=lead.email, is_active=True).exclude(lead_status='DUPLICATE').order_by('id'))
        if len(matches) > 1:
            processed_emails.add(lead.email)
            
            # Determine which one to keep
            def get_keep_score(s):
                from crm.models import LeadInteraction
                interactions_count = LeadInteraction.objects.filter(student=s).count()
                in_range = start_date <= s.created_at.date() <= end_date if s.created_at else False
                return (interactions_count, -1 if in_range else 1, -s.id)

            matches.sort(key=get_keep_score, reverse=True)
            primary = matches[0]
            to_delete = matches[1:]
            
            print(f"\nEmail Group: {lead.email}")
            print(f"  [KEEP] Primary: {primary.crm_student_id} | {primary.first_name} | Created: {primary.created_at.date() if primary.created_at else 'N/A'}")
            
            for s in to_delete:
                in_range = start_date <= s.created_at.date() <= end_date if s.created_at else False
                if in_range:
                    if confirm:
                        user = s.user
                        s.delete()
                        if user:
                            user.delete()
                        print(f"  [DELETED] {s.crm_student_id} | {s.first_name} | Created: {s.created_at.date() if s.created_at else 'N/A'}")
                    else:
                        print(f"  [WOULD DELETE] {s.crm_student_id} | {s.first_name} | Created: {s.created_at.date() if s.created_at else 'N/A'}")
                    deleted_count += 1
                else:
                    print(f"  [SKIP - OUT OF RANGE] {s.crm_student_id} | {s.first_name} | Created: {s.created_at.date() if s.created_at else 'N/A'}")

print(f"\nTotal duplicates processed for deletion: {deleted_count}")
