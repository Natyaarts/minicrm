from django.core.management.base import BaseCommand
from core.models import Program, SubProgram, Course
from forms_builder.models import DynamicField

class Command(BaseCommand):
    help = 'Seeds the database with BRD configuration (Programs, SubPrograms, Fields)'

    def handle(self, *args, **options):
        self.stdout.write("Seeding BRD Configuration...")

        # 1. Programs
        natya, _ = Program.objects.get_or_create(name='Natya', defaults={'slug': 'natya'})
        nca, _ = Program.objects.get_or_create(name='Natya Career Academy', defaults={'slug': 'nca'})

        # 2. Sub-Programs (For NCA)
        sted, _ = SubProgram.objects.get_or_create(program=nca, name='STED')
        aisect, _ = SubProgram.objects.get_or_create(program=nca, name='AISECT')

        # 3. Courses (For AISECT)
        bvoc, _ = Course.objects.get_or_create(sub_program=aisect, name='B.Voc')
        mvoc, _ = Course.objects.get_or_create(sub_program=aisect, name='M.Voc')
        
        # Add Subjects for B.Voc/M.Voc (Actually BRD says "If B.Voc -> Carnatic/Bharathanatyam")
        # Since Course model is single level, we can name them "B.Voc - Carnatic Music", etc.
        # Or better, just create them as separate courses under AISECT to appear in dropdown.
        Course.objects.get_or_create(sub_program=aisect, name='B.Voc - Carnatic Music')
        Course.objects.get_or_create(sub_program=aisect, name='B.Voc - Bharathanatyam')
        Course.objects.get_or_create(sub_program=aisect, name='M.Voc - Carnatic Music')
        Course.objects.get_or_create(sub_program=aisect, name='M.Voc - Bharathanatyam')

        # 4. Dynamic Fields - Natya
        # Fields: Age, Place, Occupation, WhatsApp Number, Transaction Amount, Transaction ID
        natya_fields = [
            {'label': 'Age', 'type': 'number', 'order': 1, 'req': True},
            {'label': 'Place', 'type': 'text', 'order': 2, 'req': True},
            {'label': 'Occupation', 'type': 'text', 'order': 3, 'req': True},
            {'label': 'WhatsApp Number', 'type': 'number', 'order': 4, 'req': True},
            {'label': 'Subject', 'type': 'text', 'order': 5, 'req': True}, # BRD mentions Subject
            {'label': 'Amount', 'type': 'number', 'order': 6, 'req': True},
            {'label': 'Transaction ID', 'type': 'text', 'order': 7, 'req': True},
        ]

        for f in natya_fields:
            DynamicField.objects.get_or_create(
                program=natya,
                label=f['label'],
                defaults={
                    'field_type': f['type'],
                    'order': f['order'],
                    'is_required': f['req']
                }
            )

        # 5. Dynamic Fields - STED (and AISECT shares same)
        # Fields: Passport Photo, Aadhar Card, Marklist, Qualifications
        # Note: Core fields (Name, Address, etc.) are hardcoded in Student model/form.
        # We only add the Uploads and Extra info here.
        common_fields = [
            {'label': 'Passport Photo', 'type': 'file', 'order': 10, 'req': True},
            {'label': 'Aadhar Card', 'type': 'file', 'order': 11, 'req': True},
            {'label': 'Qualification', 'type': 'dropdown', 'order': 12, 'req': True, 'opts': ['SSLC', 'Plus Two', 'Degree', 'PG', 'Others']},
            {'label': 'Year of Passing', 'type': 'number', 'order': 13, 'req': True},
            {'label': 'Percentage', 'type': 'number', 'order': 14, 'req': True},
            {'label': 'Board/University', 'type': 'text', 'order': 15, 'req': True},
            {'label': 'Marklist Upload', 'type': 'file', 'order': 16, 'req': True},
            {'label': 'Amount', 'type': 'number', 'order': 20, 'req': True},
            {'label': 'Transaction ID', 'type': 'text', 'order': 21, 'req': True},
        ]

        # Add to STED
        for f in common_fields:
            DynamicField.objects.get_or_create(
                sub_program=sted,
                label=f['label'],
                defaults={
                    'field_type': f['type'],
                    'order': f['order'],
                    'is_required': f['req'],
                    'options': f.get('opts')
                }
            )

        # Add to AISECT
        for f in common_fields:
            DynamicField.objects.get_or_create(
                sub_program=aisect,
                label=f['label'],
                defaults={
                    'field_type': f['type'],
                    'order': f['order'],
                    'is_required': f['req'],
                    'options': f.get('opts')
                }
            )

        self.stdout.write(self.style.SUCCESS('Successfully seeded BRD configuration'))
