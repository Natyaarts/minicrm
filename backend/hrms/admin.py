from django.contrib import admin
from .models import (
    Department, Designation, CustomField, EmployeeProfile,
    ShiftSetting, Attendance, Task, TaskComment, CompanyPost
)

@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at')

@admin.register(Designation)
class DesignationAdmin(admin.ModelAdmin):
    list_display = ('name', 'department', 'permission_role')
    list_filter = ('department', 'permission_role')

@admin.register(CustomField)
class CustomFieldAdmin(admin.ModelAdmin):
    list_display = ('label', 'name', 'field_type', 'required')

@admin.register(EmployeeProfile)
class EmployeeProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'employee_id', 'department', 'designation', 'status')
    list_filter = ('department', 'status', 'employment_type')
    search_fields = ('user__username', 'user__first_name', 'user__last_name', 'employee_id')

@admin.register(ShiftSetting)
class ShiftSettingAdmin(admin.ModelAdmin):
    list_display = ('name', 'start_time', 'end_time', 'is_active')

@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = ('employee', 'date', 'status', 'clock_in', 'clock_out')
    list_filter = ('status', 'date')

@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'assignee', 'status', 'priority', 'due_date')
    list_filter = ('status', 'priority')

@admin.register(TaskComment)
class TaskCommentAdmin(admin.ModelAdmin):
    list_display = ('task', 'author', 'created_at')

@admin.register(CompanyPost)
class CompanyPostAdmin(admin.ModelAdmin):
    list_display = ('post_type', 'author', 'created_at')
    list_filter = ('post_type',)
