import os
import sys
import django

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import Batch

def check_batches():
    print("--- CHECKING CRM BATCHES ---")
    batches = Batch.objects.all()
    print(f"Total Batches in CRM: {batches.count()}")
    
    linked = Batch.objects.exclude(lms_batch_id__isnull=True).exclude(lms_batch_id='')
    print(f"Linked (Synced) Batches: {linked.count()}")
    
    if linked.count() > 0:
        for b in linked[:5]:
            print(f"- Batch: {b.batch_name}, Wise ID: {b.lms_batch_id}")
    else:
        print("No batches have a Wise LMS ID linked yet.")

if __name__ == "__main__":
    check_batches()
