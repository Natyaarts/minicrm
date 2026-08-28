import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import Student, normalize_phone_number
from django.contrib.auth import get_user_model
from django.db import transaction as django_db_transaction

User = get_user_model()

print("Starting database-wide phone number normalization to E.164 standard...\n")

students = Student.objects.filter(is_active=True)
phone_count = 0

for student in students:
    if not student.mobile:
        continue
        
    original_phone = student.mobile
    clean_phone = normalize_phone_number(original_phone)
    
    if original_phone != clean_phone:
        try:
            with django_db_transaction.atomic():
                student.mobile = clean_phone
                student.save()
                
                # Update username if starts with 'st_'
                user = student.user
                if user:
                    clean_username = f"st_{clean_phone.replace('+', '')}"
                    if user.username != clean_username:
                        if not User.objects.filter(username=clean_username).exists():
                            user.username = clean_username
                            user.save()
                            
                phone_count += 1
                print(f"Normalized {student.crm_student_id} ({student.first_name}): {original_phone} -> {clean_phone}")
        except Exception as e:
            print(f"Error normalizing student {student.crm_student_id}: {e}")

print(f"\nDone! Updated {phone_count} phone numbers in the database to E.164 standard.")
