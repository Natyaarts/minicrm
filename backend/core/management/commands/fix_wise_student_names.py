from django.core.management.base import BaseCommand
from core.models import Student

class Command(BaseCommand):
    help = 'Fix missing first_name and last_name for students synced from Wise LMS'

    def handle(self, *args, **options):
        # Find students with no first name
        students_to_fix = Student.objects.filter(first_name__exact='') | Student.objects.filter(first_name__isnull=True)
        count = students_to_fix.count()
        
        self.stdout.write(f"Found {count} students with missing first_name.")
        
        updated = 0
        for student in students_to_fix:
            if student.user:
                student.first_name = student.user.first_name
                student.last_name = student.user.last_name
                student.save(update_fields=['first_name', 'last_name'])
                updated += 1
            else:
                student.first_name = "Wise"
                student.last_name = "Student"
                student.save(update_fields=['first_name', 'last_name'])
                updated += 1
                
        self.stdout.write(self.style.SUCCESS(f"Successfully updated {updated} students with names!"))
