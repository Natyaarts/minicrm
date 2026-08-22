import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import Student

print("Starting phone number and email normalization for existing records...")
students = Student.objects.all()
phone_count = 0
email_count = 0
for student in students:
    modified = False
    
    if student.mobile:
        original_phone = student.mobile
        # Saving triggers model field pre_save hooks
        student.mobile = student.mobile  # trigger setter
        modified = True
        
    if student.email:
        original_email = student.email
        student.email = student.email  # trigger setter
        modified = True
        
    if modified:
        student.save()
        
        if student.mobile and student.mobile != original_phone:
            print(f"Normalized Phone {student.crm_student_id}: {original_phone} -> {student.mobile}")
            phone_count += 1
            
        if student.email and student.email != original_email:
            print(f"Normalized Email {student.crm_student_id}: {original_email} -> {student.email}")
            email_count += 1

print(f"Done! Normalized {phone_count} phone numbers and {email_count} emails.")
