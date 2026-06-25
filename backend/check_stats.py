import os
import django
import sys

# Set up django environment
sys.path.append('c:/Users/91811/OneDrive/Desktop/Natya_Jun/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import Student, Batch, Course, MonthlyPayment
from django.db.models import Sum

print("Total Students:", Student.objects.count())
print("Active Students:", Student.objects.filter(is_active=True).count())
print("Students with Course assigned:", Student.objects.filter(course__isnull=False).count())
print("Students with Batch assigned:", Student.objects.filter(batch__isnull=False).count())
print("Total Batches:", Batch.objects.count())
print("Total Courses:", Course.objects.count())
print("Courses with fee_amount > 0:", Course.objects.filter(fee_amount__gt=0).count())

# Sample courses
for c in Course.objects.all()[:5]:
    print(f"Course: {c.name}, fee_amount: {c.fee_amount}")

# Sample students with no course but having a batch
students_no_course = Student.objects.filter(is_active=True, course__isnull=True, batch__isnull=False)
print("Active students with batch but no course:", students_no_course.count())

# Monthly payments count
print("Total MonthlyPayments:", MonthlyPayment.objects.count())
