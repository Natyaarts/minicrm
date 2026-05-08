import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from hrms.models import EmployeeProfile
from leaves.models import LeaveType, LeaveBalance

# 1. Create default leave types if they don't exist
leave_types_data = [
    {'name': 'Casual Leave', 'code': 'CL', 'max_days_per_year': 12, 'is_paid': True},
    {'name': 'Sick Leave', 'code': 'SL', 'max_days_per_year': 10, 'is_paid': True},
    {'name': 'Unpaid Leave', 'code': 'LOP', 'max_days_per_year': 0, 'is_paid': False},
]

for lt_data in leave_types_data:
    LeaveType.objects.get_or_create(code=lt_data['code'], defaults=lt_data)

# 2. Initialize balances for all employees
employees = EmployeeProfile.objects.all()
leave_types = LeaveType.objects.all()

for emp in employees:
    for lt in leave_types:
        LeaveBalance.objects.get_or_create(
            employee=emp,
            leave_type=lt,
            defaults={'total_days': lt.max_days_per_year}
        )
print("Leave balances initialized for all employees!")
