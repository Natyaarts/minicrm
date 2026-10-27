
from rest_framework import permissions
from django.apps import apps
import logging
from users.permissions import (
    IsSuperAdminUser,
    IsAdminOrSuperAdmin,
    IsAdminOrReadOnly,
    IsSelfOrAdmin
)


logger = logging.getLogger(__name__)

SALES_SUBMODULES = [
    'CRM_DASHBOARD', 'CRM_CAMPAIGNS', 'CRM_PIPELINE',
    'CRM_LEADS_TABLE', 'CRM_TASKS', 'CRM_REPORTS', 'CRM_CALL_ANALYTICS',
]

class DynamicRolePermission(permissions.BasePermission):
    METHOD_TO_FLAG = {
        'GET': 'can_view', 'HEAD': 'can_view', 'OPTIONS': 'can_view',
        'POST': 'can_add',
        'PUT': 'can_edit', 'PATCH': 'can_edit',
        'DELETE': 'can_delete',
    }

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        if user.role == 'SUPER_ADMIN' or user.is_superuser:
            return True

        if getattr(view, 'allow_all_authenticated', False):
            return True

        module_name = getattr(view, 'module_name', None)
        if not module_name:
            logger.warning("View %s has no module_name; denying access",
                           view.__class__.__name__)
            return False

        flag = self.METHOD_TO_FLAG.get(request.method)
        if not flag:
            return False

        modules = [module_name]
        if module_name == 'SALES':
            modules += SALES_SUBMODULES

        RolePermission = apps.get_model('users', 'RolePermission')
        return RolePermission.objects.filter(
            role=user.role, module__in=modules, **{flag: True}
        ).exists()

class IsMentorOwner(permissions.BasePermission):
    """
    Allows Mentors to only edit their own batches.
    """
    def has_object_permission(self, request, view, obj):
        user = request.user
        
        # Determine the batch from the object if it's not a batch itself
        batch = obj if hasattr(obj, 'primary_mentor') and hasattr(obj, 'teacher') else getattr(obj, 'batch', None)
        
        if user.role == 'MENTOR' and batch:
            return batch.primary_mentor == user or user in batch.secondary_mentors.all()
            
        if user.role == 'TEACHER' and batch:
            return batch.teacher == user
            
        return True
