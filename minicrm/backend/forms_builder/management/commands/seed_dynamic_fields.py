
from django.core.management.base import BaseCommand
from forms_builder.models import DynamicField
from core.models import Program, SubProgram

class Command(BaseCommand):
    help = 'Seeds initial dynamic fields for Sales Module'

    def handle(self, *args, **kwargs):
        # Programs
        natya = Program.objects.get(name='Natya')
        academy = Program.objects.get(name='Natya Career Academy')
        sted = SubProgram.objects.get(name='STED', program=academy)
        aisect = SubProgram.objects.get(name='AISECT', program=academy)

        # Natya Fields
        DynamicField.objects.get_or_create(
            program=natya, label='Age', field_type='number', order=2
        )
        DynamicField.objects.get_or_create(
            program=natya, label='Place', field_type='text', order=3
        )
        DynamicField.objects.get_or_create(
            program=natya, label='Subject', field_type='text', order=4
        )
        DynamicField.objects.get_or_create(
            program=natya, label='Occupation', field_type='text', order=5
        )
        DynamicField.objects.get_or_create(
            program=natya, label='WhatsApp Number', field_type='text', order=7
        )
        DynamicField.objects.get_or_create(
            program=natya, label='Transaction Amount Link', field_type='text', order=8
        )
        DynamicField.objects.get_or_create(
            program=natya, label='Transaction ID', field_type='text', order=9
        )

        # STED/AISECT Fields (Common)
        for sp in [sted, aisect]:
            DynamicField.objects.get_or_create(sub_program=sp, label='Father/Husband Name', field_type='text', order=3)
            DynamicField.objects.get_or_create(sub_program=sp, label='Mother Name', field_type='text', order=4)
            DynamicField.objects.get_or_create(sub_program=sp, label='DOB', field_type='date', order=5)
            # Gender Dropdown
            DynamicField.objects.get_or_create(
                sub_program=sp, label='Gender', field_type='dropdown', 
                options=['Male', 'Female', 'Other'], order=6
            )
            DynamicField.objects.get_or_create(
                sub_program=sp, label='Marital Status', field_type='dropdown',
                options=['Single', 'Married'], order=7
            )
            DynamicField.objects.get_or_create(sub_program=sp, label='Permanent Address', field_type='text', order=10)
            DynamicField.objects.get_or_create(sub_program=sp, label='Per. City', field_type='text', order=11)
            DynamicField.objects.get_or_create(sub_program=sp, label='Per. District', field_type='text', order=12)
            DynamicField.objects.get_or_create(sub_program=sp, label='Per. State', field_type='text', order=13)
            # File Uploads
            DynamicField.objects.get_or_create(sub_program=sp, label='Passport Photo', field_type='file', order=20)
            DynamicField.objects.get_or_create(sub_program=sp, label='Aadhar Card', field_type='file', order=21)
            DynamicField.objects.get_or_create(sub_program=sp, label='Marklist', field_type='file', order=22)

        self.stdout.write(self.style.SUCCESS('Successfully seeded dynamic fields'))
