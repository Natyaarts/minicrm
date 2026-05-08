import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from users.models import RolePermission

print("--- Role Permissions ---")
for rp in RolePermission.objects.all():
    print(f"Role: {rp.role} | Module: {rp.module} | View: {rp.can_view}")

# Ensure TEACHER role has TEACHER module view permission
RolePermission.objects.get_or_create(
    role='TEACHER', 
    module='TEACHER',
    defaults={'can_view': True, 'can_add': True, 'can_edit': True, 'can_delete': False}
)

# Teachers need to see students (SALES module)
RolePermission.objects.get_or_create(
    role='TEACHER', 
    module='SALES',
    defaults={'can_view': True, 'can_add': False, 'can_edit': False, 'can_delete': False}
)

# Teachers need to manage syllabus and sessions (ACADEMIC module)
RolePermission.objects.get_or_create(
    role='TEACHER', 
    module='ACADEMIC',
    defaults={'can_view': True, 'can_add': True, 'can_edit': True, 'can_delete': False}
)

print("\n[OK] Granted TEACHER access to TEACHER, SALES, and ACADEMIC modules.")
