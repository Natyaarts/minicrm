from django.core.management.base import BaseCommand
from integrations.utils import WiseService
from core.models import Student, Program, Batch, Course
from django.db.models import Q
from django.contrib.auth import get_user_model
import uuid

User = get_user_model()

class Command(BaseCommand):
    help = 'Sync students and teachers from Wise LMS'

    def handle(self, *args, **options):
        wise = WiseService()
        if not wise.api_key:
            self.stdout.write(self.style.ERROR('Wise API not configured'))
            return

        self.stdout.write('--- SYNCING TEACHERS ---')
        courses = wise.get_all_courses()
        teacher_stats = {"scanned": 0, "created": 0}

        for course_data in courses:
            # Teacher is often in 'teacher' or 'coTeachers' fields
            teachers = []
            if course_data.get('teacher'):
                teachers.append(course_data.get('teacher'))
            if course_data.get('coTeachers'):
                teachers.extend(course_data.get('coTeachers'))

            for t in teachers:
                teacher_stats["scanned"] += 1
                t_id = t.get('_id') or t.get('id')
                t_fname = t.get('first_name', 'Wise')
                t_lname = t.get('last_name', 'Teacher')
                t_email = t.get('email')
                t_phone = t.get('phoneNumber') or t.get('mobile', '')

                if not t_email and not t_phone: continue

                # Check if user exists
                username = f"wise_t_{t_id}"
                user = User.objects.filter(Q(username=username) | Q(email=t_email)).first() if t_email else User.objects.filter(username=username).first()

                if not user:
                    user = User.objects.create_user(
                        username=username,
                        email=t_email or f"{username}@example.com",
                        password="Changeme@123",
                        role='MENTOR',
                        first_name=t_fname,
                        last_name=t_lname,
                        phone_number=t_phone
                    )
                    teacher_stats["created"] += 1
                    self.stdout.write(f"Created teacher: {t_fname} {t_lname}")
        
        self.stdout.write(self.style.SUCCESS(f"Teacher Sync Finished: {teacher_stats}"))

        self.stdout.write('\n--- SYNCING STUDENTS ---')
        # ... existing student sync logic ...
        # (I'll keep the student sync logic as it was but ensure it's robust)
        # For brevity in this command, I'll focus on the teacher part first or integrate fully
        
        # Ensure a default program exists for imports
        fallback_program, _ = Program.objects.get_or_create(name="Wise Import", defaults={"slug": "wise-import"})
        
        stats = {"scanned": 0, "created": 0, "linked": 0, "updated": 0, "errors": 0}
        
        for wise_student in wise.get_all_students():
            stats["scanned"] += 1
            wise_id = wise_student.get('_id') or wise_student.get('id')
            raw_mobile = wise_student.get('phoneNumber') or wise_student.get('mobile') or ''
            mobile = str(raw_mobile).replace(" ", "")
            email = wise_student.get('email') or wise_student.get('emailAddress')
            
            fname = wise_student.get('first_name')
            lname = wise_student.get('last_name')
            if not fname and not lname:
                full_name = wise_student.get('name', '').strip()
                if full_name:
                    parts = full_name.split(' ', 1)
                    fname = parts[0]
                    lname = parts[1] if len(parts) > 1 else ''
            
            if not mobile or len(mobile) < 10:
                continue
                
            mobile_suffix = mobile[-10:]
            student = Student.objects.filter(mobile__icontains=mobile_suffix).first()
            
            if student:
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
                try:
                    username = f"wise_{mobile_suffix}"
                    if User.objects.filter(username=username).exists():
                        username = f"wise_{mobile_suffix}_{str(uuid.uuid4())[:4]}"
                        
                    user = User.objects.create_user(
                        username=username,
                        email=email or f"{username}@example.com",
                        password="Changeme@123",
                        role='STUDENT',
                        first_name=fname or "Wise",
                        last_name=lname or "Student"
                    )
                    
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
                except Exception as e:
                    stats["errors"] += 1
        
        self.stdout.write(self.style.SUCCESS(f'Sync completed! Stats: {stats}'))
