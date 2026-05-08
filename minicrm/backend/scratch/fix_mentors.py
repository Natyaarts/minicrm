import os
import sys
import django

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import Batch
from django.contrib.auth import get_user_model

def fix_mentors():
    User = get_user_model()
    try:
        vijay = User.objects.get(username='vijay')
        batches = Batch.objects.filter(primary_mentor=vijay)
        count = batches.count()
        batches.update(primary_mentor=None)
        print(f"Removed 'vijay' as primary mentor from {count} batches.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    fix_mentors()
