import os
import sys
import django
import time

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import Batch, ClassSession, Attendance
from integrations.utils import WiseService
from django.utils.dateparse import parse_datetime

batches = Batch.objects.filter(lms_batch_id__isnull=False)
wise = WiseService()

print(f'Starting sync for {batches.count()} batches...')
total_attendances = 0

for b in batches:
    try:
        logs = wise.get_session_logs(b.lms_batch_id)
        if not logs: continue
        
        for log in logs:
            start_time_str = log.get('start_time') or log.get('startTime')
            if not start_time_str: continue
            
            session = ClassSession.objects.filter(batch=b, date=parse_datetime(start_time_str).date()).first()
            if session:
                present_ids = log.get('students', [])
                for s in b.students.all():
                    is_present = bool(s.lms_student_id and s.lms_student_id in present_ids)
                    Attendance.objects.update_or_create(session=session, student=s, defaults={'is_present': is_present})
                    total_attendances += 1
        print(f'Synced {b.name}')
    except Exception as e:
        print(f'Error syncing {b.name}: {e}')

print(f'Finished! Created/Updated {total_attendances} attendances across all batches.')
