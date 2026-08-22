import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import Student

print("Starting phone number normalization for existing records...")
students = Student.objects.all()
count = 0
for student in students:
    if student.mobile:
        original = student.mobile
        # Saving will trigger the pre_save hook of NormalizedMobileField
        student.save()
        if student.mobile != original:
            print(f"Normalized {student.crm_student_id}: {original} -> {student.mobile}")
            count += 1

print(f"Done! Normalized {count} phone numbers.")
