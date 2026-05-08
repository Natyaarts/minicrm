import os
import sys
import django

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import ClassSession
from django.contrib.auth import get_user_model
import re

def check_accuracy():
    User = get_user_model()
    teachers = User.objects.filter(role__in=['TEACHER', 'MENTOR'])
    
    print("Teacher | DB Sessions | DB Hours")
    for teacher in teachers:
        sessions = ClassSession.objects.filter(teacher=teacher)
        s_count = sessions.count()
        if s_count == 0: continue
        
        total_milliseconds = 0
        for session in sessions:
            if session.teacher_summary:
                match = re.search(r'Duration:\s*(\d+)', session.teacher_summary)
                if match:
                    total_milliseconds += int(match.group(1))
        
        total_hours = total_milliseconds / (1000 * 60 * 60)
        print(f"{teacher.username} | {s_count} | {round(total_hours, 1)} hrs")

if __name__ == "__main__":
    check_accuracy()
