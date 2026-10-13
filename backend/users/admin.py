from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, RolePermission, Teacher, UserAuthToken

@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ('username', 'email', 'role', 'is_staff', 'is_active')
    list_filter = ('role', 'is_staff', 'is_active')
    fieldsets = UserAdmin.fieldsets + (
        ('Custom Role Info', {'fields': ('role', 'phone_number', 'reports_to', 'lms_teacher_id')}),
    )

@admin.register(RolePermission)
class RolePermissionAdmin(admin.ModelAdmin):
    list_display = ('role', 'module', 'can_view', 'can_add', 'can_edit', 'can_delete')
    list_filter = ('role', 'module')

@admin.register(Teacher)
class TeacherAdmin(CustomUserAdmin):
    def get_queryset(self, request):
        return super().get_queryset(request).filter(role='TEACHER')

@admin.register(UserAuthToken)
class UserAuthTokenAdmin(admin.ModelAdmin):
    list_display = ('key_preview', 'user', 'device_name', 'created')
    list_filter = ('created',)
    search_fields = ('user__username', 'user__email', 'device_name', 'key')
    readonly_fields = ('key', 'created')

    def key_preview(self, obj):
        return f"{obj.key[:10]}..." if obj.key else ""
    key_preview.short_description = "Token Key"
