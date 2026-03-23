import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from users.models import RolePermission

def seed_permissions():
    # Grant TEACHER role access to TEACHER module
    p, created = RolePermission.objects.get_or_create(
        role='TEACHER', 
        module='TEACHER', 
        defaults={'can_view': True, 'can_add': True, 'can_edit': True, 'can_delete': False}
    )
    if not created:
        p.can_view = True
        p.can_add = True
        p.can_edit = True
        p.save()
    print(f"Permission for TEACHER role on TEACHER module: {'Created' if created else 'Updated'}")

    # Also grant ACADEMIC role access to MENTOR module (since they might need it for coordination)
    p2, created = RolePermission.objects.get_or_create(
        role='ACADEMIC',
        module='MENTOR',
        defaults={'can_view': True, 'can_add': True, 'can_edit': True, 'can_delete': True}
    )
    print(f"Permission for ACADEMIC role on MENTOR module: {'Created' if created else 'Updated'}")

if __name__ == "__main__":
    seed_permissions()
