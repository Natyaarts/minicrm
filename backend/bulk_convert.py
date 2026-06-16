import os
import django
import sys

# Setup Django Environment
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import Student
from crm.models import PipelineStage

def run():
    print("Finding the 'CONVERTED' pipeline stage...")
    stage = PipelineStage.objects.filter(name__iexact='CONVERTED').first()
    
    if not stage:
        print("ERROR: Could not find a Pipeline Stage named 'CONVERTED'.")
        print("Please make sure you have a stage named exactly 'CONVERTED' in your CRM settings.")
        return

    # Find all students who are already assigned to a batch but aren't marked as converted yet
    students_to_convert = Student.objects.filter(batch__isnull=False).exclude(lead_status=str(stage.id))
    count = students_to_convert.count()
    
    if count == 0:
        print("All students who are in batches are already marked as CONVERTED!")
    else:
        students_to_convert.update(lead_status=str(stage.id))
        print(f"Successfully marked {count} students as CONVERTED!")
        
        # If there are students who aren't in a batch but you also want them converted:
        # Student.objects.all().update(lead_status=str(stage.id))
        # print("Marked EVERY student as CONVERTED!")

if __name__ == '__main__':
    run()
