
from rest_framework import permissions
from django.apps import apps
import logging

logger = logging.getLogger(__name__)

class DynamicRolePermission(permissions.BasePermission):
    """
    Checks permissions against the RolePermission model in users app.
    Usage: Set view.module_name (e.g. 'SALES', 'MENTOR')
    """
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
            
        # Super Admins bypass all checks
        if request.user.role == 'SUPER_ADMIN' or request.user.is_superuser:
            return True

        module_name = getattr(view, 'module_name', None)
        if not module_name:
            # If no module name is specified, we assume it's publicly available to authenticated users
            return True 

        # Import model dynamically to avoid circular imports
        RolePermission = apps.get_model('users', 'RolePermission')
        
        try:
            perm = RolePermission.objects.get(role=request.user.role, module=module_name)
            
            if request.method in permissions.SAFE_METHODS: # GET, HEAD, OPTIONS
                return perm.can_view
            if request.method == 'POST':
                return perm.can_add
            if request.method in ['PUT', 'PATCH']:
                return perm.can_edit
            if request.method == 'DELETE':
                return perm.can_delete
                
        except RolePermission.DoesNotExist:
            # If no explicit record, default to no permission
            return False
            
        return False

class IsMentorOwner(permissions.BasePermission):
    """
    Allows Mentors to only edit their own batches.
    """
    def has_object_permission(self, request, view, obj):
        if request.user.role == 'MENTOR':
            if hasattr(obj, 'primary_mentor'):
                return obj.primary_mentor == request.user or request.user in obj.secondary_mentors.all()
            return False
        return True
