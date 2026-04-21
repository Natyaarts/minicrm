from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, RolePermission, Teacher

@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ('username', 'email', 'role', 'is_staff', 'is_active')
    list_filter = ('role', 'is_staff', 'is_active')
    fieldsets = UserAdmin.fieldsets + (
        ('Custom Role Info', {'fields': ('role', 'phone_number')}),
    )

@admin.register(RolePermission)
class RolePermissionAdmin(admin.ModelAdmin):
    list_display = ('role', 'module', 'can_view', 'can_add', 'can_edit', 'can_delete')
    list_filter = ('role', 'module')

@admin.register(Teacher)
class TeacherAdmin(CustomUserAdmin):
    def get_queryset(self, request):
        return super().get_queryset(request).filter(role='TEACHER')
