import os
import sys
import django

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import Batch, ClassSession, Attendance
from integrations.utils import WiseService
from django.utils.dateparse import parse_datetime

b = Batch.objects.filter(name__icontains='G 11 CMS').first()
wise = WiseService()
logs = wise.get_session_logs(b.lms_batch_id)
print(f'Found {len(logs)} logs for batch {b.name}')
count = 0
for log in logs:
    start_time_str = log.get('start_time') or log.get('startTime')
    if not start_time_str: continue
    
    session = ClassSession.objects.filter(batch=b, date=parse_datetime(start_time_str).date()).first()
    if session:
        present_ids = log.get('students', [])
        print(f'Log students present: {present_ids}')
        for s in b.students.all():
            is_present = bool(s.lms_student_id and s.lms_student_id in present_ids)
            Attendance.objects.update_or_create(session=session, student=s, defaults={'is_present': is_present})
            count += 1
            
print(f'Created/Updated {count} attendances')
