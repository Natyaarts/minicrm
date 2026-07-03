import os
import django
import re
from collections import defaultdict

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'minicrm.settings')
django.setup()

from hrms.models import EmployeeProfile
from django.contrib.auth import get_user_model

User = get_user_model()

def find_and_delete_duplicates():
    profiles = EmployeeProfile.objects.select_related('user').all()
    
    # Group by name (case-insensitive)
    name_groups = defaultdict(list)
    for p in profiles:
        name = (p.user.get_full_name() or p.user.username).strip().lower()
        name_groups[name].append(p)
        
    deleted_count = 0
    
    for name, group in name_groups.items():
        if len(group) > 1:
            print(f"\nFound {len(group)} duplicates for '{name}':")
            # Sort the group to decide which one to KEEP.
            # We prefer profiles with 'EMP-NA-' IDs over auto-generated 'EMP-XXXX-XXXX' IDs.
            # We also prefer ACTIVE over RESIGNED just in case.
            
            def score_profile(p):
                score = 0
                if 'EMP-NA-' in p.employee_id:
                    score += 100
                if p.status == 'ACTIVE':
                    score += 10
                # Tie-breaker: older profile is kept (lower ID)
                score -= p.id * 0.01 
                return score
                
            sorted_group = sorted(group, key=score_profile, reverse=True)
            
            keeper = sorted_group[0]
            print(f"  -> KEEPING: {keeper.employee_id} (Status: {keeper.status})")
            
            # Delete the rest
            for duplicate in sorted_group[1:]:
                print(f"  -> DELETING DUPLICATE: {duplicate.employee_id} (Status: {duplicate.status})")
                duplicate.user.delete()
                deleted_count += 1
                
    print(f"\nDone! Automatically removed {deleted_count} duplicate users.")

if __name__ == '__main__':
    find_and_delete_duplicates()
