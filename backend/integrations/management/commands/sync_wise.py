from django.core.management.base import BaseCommand
from integrations.utils import WiseService
from core.models import Student, Program
from django.contrib.auth import get_user_model
import uuid

User = get_user_model()

class Command(BaseCommand):
    help = 'Sync students from Wise LMS'

    def handle(self, *args, **options):
        wise = WiseService()
        if not wise.api_key:
            self.stdout.write(self.style.ERROR('Wise API not configured (Check WISE_API_KEY in .env)'))
            return

        # Ensure a default program exists for imports
        fallback_program, _ = Program.objects.get_or_create(name="Wise Import", defaults={"slug": "wise-import"})
        
        stats = {"scanned": 0, "created": 0, "linked": 0, "updated": 0, "errors": 0}
        
        self.stdout.write('Starting sync with Wise LMS...')
        
        try:
            for wise_student in wise.get_all_students():
                stats["scanned"] += 1
                
                # Extract Data - Handle V3 Field Differences
                wise_id = wise_student.get('_id') or wise_student.get('id')
                
                # Phone: V3 uses 'phoneNumber', V2 might use 'mobile'
                raw_mobile = wise_student.get('phoneNumber') or wise_student.get('mobile') or ''
                mobile = str(raw_mobile).replace(" ", "")
                
                email = wise_student.get('email')
                if not email:
                    email = wise_student.get('emailAddress') # V3 variation
                
                # Name: V3 might just return 'name'
                fname = wise_student.get('first_name')
                lname = wise_student.get('last_name')
                
                if not fname and not lname:
                    full_name = wise_student.get('name', '').strip()
                    if full_name:
                        parts = full_name.split(' ', 1)
                        fname = parts[0]
                        lname = parts[1] if len(parts) > 1 else ''
                
                if not mobile or len(mobile) < 10:
                    self.stdout.write(f"Skipping student {wise_id}: Invalid mobile '{mobile}'")
                    continue
                    
                # Check if exists in CRM
                mobile_suffix = mobile[-10:]
                student = Student.objects.filter(mobile__icontains=mobile_suffix).first()
                
                if student:
                    # Exists -> Update Link
                    changed = False
                    if student.lms_student_id != wise_id:
                        student.lms_student_id = wise_id
                        changed = True
                        stats["linked"] += 1
                    
                    if email and student.email != email:
                        student.email = email
                        changed = True
                    
                    if changed:
                        student.save()
                        stats["updated"] += 1
                else:
                    # New Student -> Create
                    try:
                        # 1. Create User
                        username = f"wise_{mobile_suffix}"
                        if User.objects.filter(username=username).exists():
                            username = f"wise_{mobile_suffix}_{str(uuid.uuid4())[:4]}"
                            
                        user = User.objects.create_user(
                            username=username,
                            email=email or f"{username}@example.com",
                            password="Changeme@123", # Default password
                            role='STUDENT',
                            first_name=fname or "Wise",
                            last_name=lname or "Student"
                        )
                        
                        # 2. Create Student Profile
                        Student.objects.create(
                            user=user,
                            crm_student_id=f"WISE-{mobile_suffix}",
                            program_type=fallback_program,
                            first_name=fname or "Wise",
                            last_name=lname or "Student",
                            mobile=mobile,
                            email=email,
                            lms_student_id=wise_id
                        )
                        stats["created"] += 1
                        self.stdout.write(f"Created student: {fname} {lname} ({mobile})")
                    except Exception as e:
                        self.stdout.write(self.style.ERROR(f"Error creating student {mobile}: {e}"))
                        stats["errors"] += 1
            
            self.stdout.write(self.style.SUCCESS(f'Sync completed! Stats: {stats}'))
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Sync Error: {e}'))
