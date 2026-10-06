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
