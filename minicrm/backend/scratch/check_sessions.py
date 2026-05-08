import os
import sys
import django

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import ClassSession

def check_sessions():
    count = ClassSession.objects.count()
    print(f"Total ClassSessions in DB: {count}")
    if count > 0:
        s = ClassSession.objects.first()
        print(f"Sample: {s.batch.name} on {s.date}")

if __name__ == "__main__":
    check_sessions()
