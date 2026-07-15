import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()
from hrms.models import Attendance
from hrms.serializers import AttendanceSerializer
from rest_framework.test import APIRequestFactory
factory = APIRequestFactory()
request = factory.get('/api/hrms/attendance/')
att = Attendance.objects.exclude(clock_in_photo='').first()
if att:
    print(f'File path: {att.clock_in_photo.path}')
    serializer = AttendanceSerializer(att, context={'request': request})
    print(f'URL: {serializer.data.get("clock_in_photo")}')
else:
    print('No attendance photos found.')
