from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from core.models import Program, SubProgram, Course, Batch, Student, Transaction, ClassSession, Attendance
from forms_builder.models import DynamicField, StudentDynamicValue
from integrations.models import IntegrationSetting
from notifications.models import Notification
from datetime import date, datetime, timedelta
import random

User = get_user_model()

class Command(BaseCommand):
    help = 'Seeds the database with comprehensive dummy data for all modules'

    def handle(self, *args, **options):
        self.stdout.write("Seeding comprehensive dummy data...")

        # 1. Create Users
        roles = ['ADMIN', 'SALES', 'MENTOR', 'TEACHER']
        users = {}
        
        for role in roles:
            username = f"dummy_{role.lower()}"
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    'role': role,
                    'first_name': f"Dummy",
                    'last_name': role.capitalize(),
                    'is_staff': True if role == 'ADMIN' else False
                }
            )
            if created:
                user.set_password('password123')
                user.save()
            users[role] = user

        self.stdout.write("Users created.")

        # 2. Programs, Sub-Programs, Courses (Basic Setup)
        nca, _ = Program.objects.get_or_create(name='Natya Career Academy', defaults={'slug': 'nca'})
        aisect, _ = SubProgram.objects.get_or_create(program=nca, name='AISECT')
        
        course_names = ['B.Voc - Carnatic Music', 'B.Voc - Bharathanatyam', 'M.Voc - Carnatic Music']
        courses = []
        for name in course_names:
            c, _ = Course.objects.get_or_create(sub_program=aisect, name=name, defaults={'fee_amount': 25000})
            courses.append(c)

        self.stdout.write("Course hierarchy created.")

        # 3. Create Batches
        batches = []
        for i, course in enumerate(courses):
            batch, _ = Batch.objects.get_or_create(
                name=f"{course.name} - Batch {i+1}",
                course=course,
                defaults={
                    'start_date': date.today() - timedelta(days=30),
                    'end_date': date.today() + timedelta(days=150),
                    'primary_mentor': users['MENTOR'],
                    'teacher': users['TEACHER']
                }
            )
            batches.append(batch)

        self.stdout.write("Batches created.")

        # 4. Create Students
        first_names = ["Arjun", "Sneha", "Rahul", "Priya", "Vikram", "Anjali", "Karthik", "Deepa", "Rohan", "Meera"]
        last_names = ["Kumar", "Nair", "Sharma", "Iyer", "Varma", "Reddy", "Menon", "Pillai", "Das", "Joshi"]
        
        students = []
        for i in range(20):
            fname = random.choice(first_names)
            lname = random.choice(last_names)
            username = f"student_{i+1}"
            
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    'role': 'STUDENT',
                    'first_name': fname,
                    'last_name': lname,
                    'email': f"{username}@example.com"
                }
            )
            if created:
                user.set_password('password123')
                user.save()

            batch = random.choice(batches)
            student, created = Student.objects.get_or_create(
                user=user,
                defaults={
                    'crm_student_id': f"NATYA{2024000+i}",
                    'program_type': nca,
                    'sub_program': aisect,
                    'course': batch.course,
                    'batch': batch,
                    'first_name': fname,
                    'last_name': lname,
                    'mobile': f"98765432{i:02d}",
                    'is_active': True
                }
            )
            students.append(student)

        self.stdout.write(f"{len(students)} Students created.")

        # 5. Create Transactions
        for student in students:
            for _ in range(random.randint(1, 3)):
                Transaction.objects.create(
                    student=student,
                    transaction_id=f"TXN{random.randint(100000, 999999)}",
                    amount=random.choice([500, 1000, 2500, 5000]),
                )

        self.stdout.write("Transactions created.")

        # 6. Create Sessions and Attendance
        for batch in batches:
            # Create 5 past sessions
            for i in range(5):
                session_date = date.today() - timedelta(days=i+1)
                session, _ = ClassSession.objects.get_or_create(
                    batch=batch,
                    date=session_date,
                    defaults={'teacher_summary': f"Covered basic concepts of {batch.course.name} - Part {i+1}"}
                )
                
                # Add attendance for each student in this batch
                for student in Student.objects.filter(batch=batch):
                    Attendance.objects.get_or_create(
                        session=session,
                        student=student,
                        defaults={'is_present': random.choice([True, True, True, False])} # 75% attendance
                    )

        self.stdout.write("Attendance records created.")

        # 7. Create Dynamic Values for Students
        dynamic_fields = DynamicField.objects.filter(program=nca)
        if not dynamic_fields.exists():
             self.stdout.write("Creating dummy dynamic fields...")
             df1, _ = DynamicField.objects.get_or_create(program=nca, label="WhatsApp Number", defaults={'field_type': 'number', 'order': 1})
             df2, _ = DynamicField.objects.get_or_create(program=nca, label="Previous Qualification", defaults={'field_type': 'text', 'order': 2})
             dynamic_fields = [df1, df2]

        for student in students:
            for field in dynamic_fields:
                StudentDynamicValue.objects.get_or_create(
                    student=student,
                    field=field,
                    defaults={'value': "9988776655" if field.label == "WhatsApp Number" else "Graduate"}
                )
        self.stdout.write("Student dynamic values created.")

        # 8. Create Integration Settings
        IntegrationSetting.objects.get_or_create(
            name='razorpay_dummy',
            defaults={
                'config': {'key_id': 'rzp_test_123', 'key_secret': 'shhh_secret'},
                'is_active': True
            }
        )
        self.stdout.write("Integration settings created.")

        # 9. Create Notifications
        for user_role, user in users.items():
            Notification.objects.create(
                user=user,
                title=f"Welcome to Natya {user_role}",
                message=f"Hello {user.first_name}, your account is ready with role {user_role}.",
                notification_type='SUCCESS'
            )
            Notification.objects.create(
                user=user,
                title="System Maintenance",
                message="Scheduled maintenance on April 5th.",
                notification_type='WARNING'
            )
        self.stdout.write("Notifications created.")

        self.stdout.write(self.style.SUCCESS("Successfully seeded all dummy data!"))
