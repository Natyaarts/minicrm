from django.core.management.base import BaseCommand
from core.models import Student, Program, Course
from django.contrib.auth import get_user_model
import random

User = get_user_model()

class Command(BaseCommand):
    help = 'Seeds dummy students for testing'

    def handle(self, *args, **options):
        self.stdout.write("Seeding Sample Students...")
        
        # Get programs
        natya = Program.objects.filter(name='Natya').first()
        nca = Program.objects.filter(name='Natya Career Academy').first()
        
        if not natya:
            self.stdout.write(self.style.ERROR("Programs not found. Run 'python manage.py seed_brd' first."))
            return

        names = [
            ("Aravind", "Kumar", "9988776655"),
            ("Meera", "Nair", "9876543210"),
            ("Rahul", "Das", "9123456780"),
            ("Priya", "Lakshmi", "9445566778"),
            ("Sanjay", "Menon", "9556677889")
        ]

        # Get some courses
        courses = list(Course.objects.all())

        for fname, lname, mobile in names:
            username = f"user_{mobile}"
            if not User.objects.filter(username=username).exists():
                user = User.objects.create_user(
                    username=username,
                    email=f"{fname.lower()}@example.com",
                    password="welcome123",
                    role='STUDENT',
                    first_name=fname,
                    last_name=lname
                )
                
                # Fetch a random course if available
                course = random.choice(courses) if courses else None
                
                Student.objects.create(
                    user=user,
                    crm_student_id=f"NATYA-{random.randint(1000, 9999)}",
                    first_name=fname,
                    last_name=lname,
                    email=user.email,
                    mobile=mobile,
                    program_type=natya if random.random() > 0.4 else nca,
                    course=course,
                    is_active=True
                )
                self.stdout.write(f"Created student: {fname} {lname}")

        self.stdout.write(self.style.SUCCESS('Successfully seeded sample students'))
