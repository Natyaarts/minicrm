from rest_framework import permissions

class IsSuperAdminUser(permissions.BasePermission):
    """
    Allows access only to Super Admins (or superusers).
    """
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            (request.user.role == 'SUPER_ADMIN' or request.user.is_superuser)
        )


class IsAdminOrSuperAdmin(permissions.BasePermission):
    """
    Allows access only to Admin and Super Admin users.
    Normal employees (EMPLOYEE, SALES, MENTOR, TEACHER, STUDENT, etc.) are rejected with HTTP 403.
    """
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            (request.user.role in ['ADMIN', 'SUPER_ADMIN'] or request.user.is_superuser)
        )


class IsAdminOrReadOnly(permissions.BasePermission):
    """
    Allows read access (GET, HEAD, OPTIONS) to authenticated users,
    but restricts write operations (POST, PUT, PATCH, DELETE) to Admins and Super Admins.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(
            request.user.role in ['ADMIN', 'SUPER_ADMIN'] or request.user.is_superuser
        )


class IsSelfOrAdmin(permissions.BasePermission):
    """
    Allows user to access/modify their own object, while Admins/SuperAdmins can access any object.
    """
    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.role in ['ADMIN', 'SUPER_ADMIN'] or request.user.is_superuser:
            return True
        # If obj is User
        if hasattr(obj, 'username'):
            return obj == request.user
        # If obj is EmployeeProfile
        if hasattr(obj, 'user'):
            return obj.user == request.user
        return False




from .models import RolePermission

class ModulePermission(permissions.BasePermission):
    """
    Enforces the RolePermission table on the server.
    The view must declare `permission_module = '<MODULE_KEY>'`.
    """
    ACTION_MAP = {
        'GET': 'can_view', 'HEAD': 'can_view', 'OPTIONS': 'can_view',
        'POST': 'can_add',
        'PUT': 'can_edit', 'PATCH': 'can_edit',
        'DELETE': 'can_delete',
    }

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_superuser or user.role == 'SUPER_ADMIN':
            return True
        module = getattr(view, 'permission_module', None)
        if not module:
            return False          # deny by default if a view forgot to declare a module
        field = self.ACTION_MAP.get(request.method)
        if not field:
            return False
        return RolePermission.objects.filter(
            role=user.role, module=module, **{field: True}
        ).exists()