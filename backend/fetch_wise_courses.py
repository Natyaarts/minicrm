import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import Student
from integrations.utils import WiseService

def run():
    wise = WiseService()
    students = Student.objects.exclude(lms_student_id__isnull=True).exclude(lms_student_id='')
    total = students.count()
    print(f"Fetching courses for {total} students...")
    
    updated = 0
    for i, s in enumerate(students):
        try:
            print(f"[{i+1}/{total}] Fetching for {s.first_name} {s.last_name} ({s.lms_student_id})...")
            # Fetch fee summary which includes courses
            res = wise.get_student_fee_summary(s.lms_student_id)
            class_summary = res.get('classWiseStudentSummary', [])
            
            course_names = []
            for cs in class_summary:
                classroom = cs.get('classroom', {})
                cname = ""
                if isinstance(classroom, dict):
                    class_type = classroom.get('classType', '')
                    if class_type == 'ONE_TO_ONE':
                        cname = classroom.get('subject') or classroom.get('name') or classroom.get('title')
                    else:
                        cname = classroom.get('name') or classroom.get('title') or classroom.get('subject') or classroom.get('className')
                elif isinstance(classroom, str):
                    cname = classroom
                    
                if not cname:
                    cname = cs.get('className') or cs.get('title') or cs.get('subject') or cs.get('name')
                
                if cname:
                    course_names.append(cname)
                    
            if course_names:
                # Deduplicate and join
                unique_names = list(dict.fromkeys(course_names))
                joined_names = " & ".join(unique_names)
                s.lms_course_names = joined_names
                s.save(update_fields=['lms_course_names'])
                updated += 1
                print(f"  -> Saved: {joined_names}")
            else:
                s.lms_course_names = None
                s.save(update_fields=['lms_course_names'])
        except Exception as e:
            print(f"  -> Error: {e}")
            
    print(f"Done. Updated {updated} students.")

if __name__ == '__main__':
    run()
