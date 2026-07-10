from django.core.management.base import BaseCommand
from core.models import Student
from crm.models import PipelineStage

class Command(BaseCommand):
    help = 'Fix lead_status for students imported from Wise LMS'

    def handle(self, *args, **options):
        # Resolve 'CONVERTED' stage ID
        converted_stage_id = 'CONVERTED'
        try:
            stage = PipelineStage.objects.filter(name__iexact='CONVERTED').first()
            if stage:
                converted_stage_id = str(stage.id)
        except Exception:
            pass

        # Find all students imported from Wise LMS
        wise_students = Student.objects.filter(lms_student_id__isnull=False).exclude(lms_student_id="")
        
        # Check how many are missing CONVERTED status
        needs_fix = wise_students.exclude(lead_status=converted_stage_id)
        count = needs_fix.count()
        
        self.stdout.write(f"Found {count} Wise students that need their lead_status fixed.")
        
        if count > 0:
            updated = needs_fix.update(lead_status=converted_stage_id)
            self.stdout.write(self.style.SUCCESS(f"Successfully updated {updated} students to CONVERTED status!"))
        else:
            self.stdout.write(self.style.SUCCESS("All Wise students are already fixed."))
