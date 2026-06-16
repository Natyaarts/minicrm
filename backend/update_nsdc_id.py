import os
import django
import sys

# Setup Django Environment
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import Program
from forms_builder.models import DynamicField

def run():
    print("Looking for NSDC Program...")
    program = Program.objects.filter(name__icontains="NSDC").first()
    
    if not program:
        print("NSDC Program not found!")
        return

    # Delete the old Aadhar fields
    DynamicField.objects.filter(program=program, label="Aadhar Card No").delete()
    DynamicField.objects.filter(program=program, label="Aadhar upload").delete()
    print("Deleted old Aadhar fields.")

    # We will insert the new fields where Aadhar used to be (Order 16)
    # We will just shift all fields after order 15 by 3 to make room
    fields_to_shift = DynamicField.objects.filter(program=program, order__gte=16)
    for field in fields_to_shift:
        field.order += 3
        field.save()

    # Create the new generic ID fields
    id_type_field = DynamicField.objects.create(
        program=program,
        label="ID Type",
        field_type="dropdown",
        options=["Aadhar Card", "PAN Card", "Identity Card", "Birth Certificate"],
        is_required=True,
        order=16,
        field_group='INITIAL'
    )
    print("Added ID Type field")

    # To make them conditional on ANY selection, we have to create one set of fields 
    # Or, the easiest and cleanest way is to just have generic "ID Number" and "Upload ID"
    # that always show up. Since "ID Type" is required, they will fill these out based on what they select.
    id_number_field = DynamicField.objects.create(
        program=program,
        label="ID Document Number",
        field_type="text",
        is_required=True,
        order=17,
        field_group='INITIAL'
    )
    print("Added ID Document Number field")

    upload_field = DynamicField.objects.create(
        program=program,
        label="Upload ID Document",
        field_type="file",
        is_required=True,
        order=18,
        field_group='INITIAL'
    )
    print("Added Upload ID Document field")

    print("\nAll done! The NSDC form has been updated with the new ID options without deleting your categories/courses.")

if __name__ == '__main__':
    run()
