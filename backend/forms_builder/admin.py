from django.contrib import admin
from .models import DynamicField, StudentDynamicValue

@admin.register(DynamicField)
class DynamicFieldAdmin(admin.ModelAdmin):
    list_display = ('label', 'field_type', 'is_required', 'program', 'sub_program', 'course', 'order')
    list_filter = ('field_type', 'is_required', 'program', 'sub_program')
    search_fields = ('label',)
    ordering = ('order',)

@admin.register(StudentDynamicValue)
class StudentDynamicValueAdmin(admin.ModelAdmin):
    list_display = ('student', 'field', 'value')
    search_fields = ('student__first_name', 'student__last_name', 'field__label', 'value')
