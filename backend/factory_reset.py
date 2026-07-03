import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'minicrm.settings')
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()

def factory_reset_employees():
    # Keep SUPER_ADMIN (your account) but delete all other employee users
    # This will cascade and delete their EmployeeProfiles, SalaryStructures, etc.
    employees_to_delete = User.objects.exclude(role='SUPER_ADMIN')
    
    count = employees_to_delete.count()
    deleted_count, _ = employees_to_delete.delete()
    
    print(f"\nSuccessfully wiped {count} old employee accounts and duplicates.")
    print("Your database is now perfectly clean. Please run the import script to rebuild the workforce!")

if __name__ == '__main__':
    factory_reset_employees()
