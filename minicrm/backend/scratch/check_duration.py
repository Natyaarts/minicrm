import os
import sys
import django

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import ClassSession

def check():
    summaries = ClassSession.objects.filter(teacher_summary__icontains='Duration').values_list('teacher_summary', flat=True)[:10]
    for s in summaries:
        print(s)

if __name__ == "__main__":
    check()
