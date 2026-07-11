import os
import django
import sys

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from hrms.models import EmployeeProfile

# List of Employee IDs from your screenshots
remote_employee_ids = [
    "EMP-3940-7915", # Kalakshetra Namitha
    "EMP-3941-3609", # Kalakshetra Sreelakshmi
    "EMP-3942-2718", # Kalakshetra Sreeranjini
    "EMP-3943-4740", # Kalakshetra Vishnupriya
    "EMP-3932-7375", # Kalamandalam Athira Ravi
    "EMP-3937-1361", # Anjali Nair Kalakshetra
    "EMP-3935-5058", # Kalamandalam Akshaya
    "EMP-3944-7205", # Kalamandalam Athira Jayakumar
    "EMP-3945-7417", # Kalamandalam Parvathy Panicker
    "EMP-3946-3336", # Kalamandalam Rasmi
    "EMP-3952-4342", # Kalakshetra Pranija
    "EMP-3953-5346", # Kalamandalam Anupama
    "EMP-3954-3838", # KALASHREE SREENA
    "EMP-3957-4223", # Kalamandalam Vaishnavi
    "EMP-3958-2918", # Kalamandalam Jayalakshmi
    "EMP-3959-1391", # Kalakshetra Anaswara
    "EMP-3960-1191", # KALAKSHETHRA SREE VISHNUPRIYA
    "EMP-3934-7582", # Kalakshetra Jisma
]

def main():
    print(f"Finding and updating {len(remote_employee_ids)} employees...")
    
    updated_count = 0
    not_found = []
    
    for emp_id in remote_employee_ids:
        try:
            employee = EmployeeProfile.objects.get(employee_id=emp_id)
            employee.work_location = 'REMOTE'
            employee.save()
            print(f"✅ Updated: {employee.full_name or employee.display_username} ({emp_id})")
            updated_count += 1
        except EmployeeProfile.DoesNotExist:
            print(f"❌ Not Found: Employee with ID {emp_id}")
            not_found.append(emp_id)
            
    print("\n" + "="*40)
    print(f"Successfully converted {updated_count} employees to Work From Home!")
    if not_found:
        print(f"Could not find {len(not_found)} employees: {', '.join(not_found)}")
    print("="*40)

if __name__ == '__main__':
    main()
