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
    original_phone = student.mobile
    original_email = student.email
    
    if student.mobile:
        digits = ''.join(c for c in str(student.mobile) if c.isdigit())
        clean_phone = digits[-10:] if len(digits) >= 10 else digits
        if student.mobile != clean_phone:
            student.mobile = clean_phone
            modified = True
            phone_count += 1
            print(f"Normalizing Phone for {student.crm_student_id}: {original_phone} -> {clean_phone}")
        
    if student.email:
        clean_email = str(student.email).strip().lower()
        if student.email != clean_email:
            student.email = clean_email
            modified = True
            email_count += 1
            print(f"Normalizing Email for {student.crm_student_id}: {original_email} -> {clean_email}")
        
    if modified:
        student.save()

print(f"Done! Updated {phone_count} phone numbers and {email_count} emails in the database.")
