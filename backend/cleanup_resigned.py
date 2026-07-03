import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'minicrm.settings')
django.setup()

from hrms.models import EmployeeProfile
from django.contrib.auth import get_user_model

User = get_user_model()

def run_cleanup():
    resigned_profiles = EmployeeProfile.objects.filter(status='RESIGNED')
    count = resigned_profiles.count()
    
    if count == 0:
        print("No resigned/inactive employees found to delete.")
        return

    # Extract user IDs before deleting, so we can delete the core User accounts 
    # which will cascade delete the EmployeeProfiles too.
    user_ids = list(resigned_profiles.values_list('user_id', flat=True))
    
    deleted_count, _ = User.objects.filter(id__in=user_ids).delete()
    print(f"Successfully deleted {deleted_count} inactive/resigned users and their associated data.")

if __name__ == '__main__':
    run_cleanup()
