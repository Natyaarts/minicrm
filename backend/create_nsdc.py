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
    brand_name = "National Skill Development Corporation (NSDC)"
    
    # Delete existing if any to avoid duplicates
    Program.objects.filter(name__icontains="NSDC").delete()
    Program.objects.filter(name__icontains="National Skill Development").delete()
    
    # Create the Program
    program = Program.objects.create(
        name=brand_name,
        description="Auto-generated NSDC Registration Form"
    )
    print(f"✅ Created Program: {program.name}")

    fields = [
        {
            "label": "Salutation",
            "field_type": "dropdown",
            "options": ["Mr.", "Ms.", "Mrs.", "Dr.", "Prof.", "Other"],
            "is_required": True
        },
        {
            "label": "Full Name",
            "field_type": "text",
            "is_required": True
        },
        {
            "label": "Gender",
            "field_type": "dropdown",
            "options": ["Male", "Female", "Transgender", "Other"],
            "is_required": True
        },
        {
            "label": "Date Of Birth",
            "field_type": "date",
            "is_required": True
        },
        {
            "label": "Email Id",
            "field_type": "text",
            "is_required": True,
            "validation_rules": {
                "pattern": "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
                "message": "Please enter a valid email address."
            }
        },
        {
            "label": "Marital status",
            "field_type": "dropdown",
            "options": ["Single", "Married", "Divorced", "Widowed", "Separated"],
            "is_required": True
        },
        {
            "label": "Father's Name",
            "field_type": "text",
            "is_required": False
        },
        {
            "label": "Mother's Name",
            "field_type": "text",
            "is_required": False
        },
        {
            "label": "Religion",
            "field_type": "dropdown",
            "options": ["Hinduism", "Islam", "Christianity", "Sikhism", "Buddhism", "Jainism", "Other"],
            "is_required": True
        },
        {
            "label": "Disability",
            "field_type": "dropdown",
            "options": ["Yes", "No"],
            "is_required": True
        },
        {
            "label": "Type of Disability",
            "field_type": "dropdown",
            "options": [
                "Locomotor Disability", "Leprosy Cured Person", "Dwarfism", 
                "Acid Attack Victims", "Blindness/Visual Impairment", 
                "Low-vision (Visual Impairment)", "Deaf", "Hard of Hearing", 
                "Speech and Language Disability", "Intellectual Disability / Mental Retardation", 
                "Autism Spectrum Disorder", "Specific Learning Disabilities", 
                "Mental Behavior-Mental Illness", "Haemophilia", "Thalassemia", 
                "Sickle Cell Disease", "Deaf Blindness", "Cerebral Palsy", 
                "Multiple Sclerosis", "Muscular Dystrophy", "Persons with spine deformity/spine injury"
            ],
            "is_required": True,
            "depends_on": "Disability",
            "depends_value": "Yes"
        },
        {
            "label": "Category",
            "field_type": "dropdown",
            "options": ["General", "OBC", "SC", "ST", "EWS", "Other"],
            "is_required": True
        },
        {
            "label": "State",
            "field_type": "text",
            "is_required": True
        },
        {
            "label": "District",
            "field_type": "text",
            "is_required": True
        },
        {
            "label": "Constituency",
            "field_type": "text",
            "is_required": True
        },
        {
            "label": "Permanent Address",
            "field_type": "text",
            "is_required": True
        },
        {
            "label": "Aadhar Card No",
            "field_type": "text",
            "is_required": True,
            "validation_rules": {
                "pattern": "^[0-9]{12}$",
                "message": "Aadhar Card must be exactly 12 digits."
            }
        },
        {
            "label": "Aadhar upload",
            "field_type": "file",
            "is_required": True
        },
        {
            "label": "Educational Level",
            "field_type": "dropdown",
            "options": ["10th Pass", "12th Pass", "Diploma", "Graduate", "Post Graduate", "PhD", "Other"],
            "is_required": True
        },
        {
            "label": "Employment status",
            "field_type": "dropdown",
            "options": ["Employed", "Unemployed", "Self-employed", "Student"],
            "is_required": False
        },
        {
            "label": "Previous experience and what they do",
            "field_type": "text",
            "is_required": False
        },
        {
            "label": "Education qualifications needed",
            "field_type": "text",
            "is_required": False
        },
        {
            "label": "Training status",
            "field_type": "dropdown",
            "options": ["Fresher", "Experienced"],
            "is_required": False
        }
    ]

    created_fields = {}
    
    for i, data in enumerate(fields):
        # Handle Condition Logic
        conditional_rule = None
        if "depends_on" in data:
            parent_field = created_fields.get(data["depends_on"])
            if parent_field:
                conditional_rule = {
                    "depends_on": parent_field.id,
                    "value": data["depends_value"]
                }
        
        field = DynamicField.objects.create(
            program=program,
            label=data["label"],
            field_type=data["field_type"],
            is_required=data["is_required"],
            options=data.get("options", None),
            order=i,
            validation_rules=data.get("validation_rules", None),
            conditional_rule=conditional_rule,
            field_group='INITIAL'
        )
        created_fields[field.label] = field
        print(f"  + Added field: {field.label} (Order: {i})")

    print("\n🚀 All done! NSDC Program has been set up with exactly 23 fields in proper order.")

if __name__ == '__main__':
    run()
