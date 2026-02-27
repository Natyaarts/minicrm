
from django.core.management.base import BaseCommand
from core.models import Program, SubProgram, Course

class Command(BaseCommand):
    help = 'Seeds initial data for Programs and Courses'

    def handle(self, *args, **kwargs):
        # Create Programs
        natya, _ = Program.objects.get_or_create(name='Natya')
        academy, _ = Program.objects.get_or_create(name='Natya Career Academy')

        # Create SubPrograms for Academy
        sted, _ = SubProgram.objects.get_or_create(name='STED', program=academy)
        aisect, _ = SubProgram.objects.get_or_create(name='AISECT', program=academy)

        # Create Courses
        # Natya might have subjects as courses? BRD says "Subject" for Natya. Let's assume generic subjects.
        # But BRD explicitly lists courses for AISECT
        
        # AISECT Courses
        for course_name in ['B.Voc - Carnatic Music', 'B.Voc - Bharathanatyam', 'M.Voc - Carnatic Music', 'M.Voc - Bharathanatyam']:
            Course.objects.get_or_create(name=course_name, sub_program=aisect)
            
        # STED Courses (Example, as BRD says "Display a list of courses (Admin configurable)")
        for course_name in ['STED Course 1', 'STED Course 2']:
            Course.objects.get_or_create(name=course_name, sub_program=sted)

        self.stdout.write(self.style.SUCCESS('Successfully seeded data'))
