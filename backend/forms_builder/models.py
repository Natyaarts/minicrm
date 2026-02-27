from django.db import models
from core.models import Program, SubProgram

class DynamicField(models.Model):
    FIELD_TYPE_CHOICES = (
        ('text', 'Text'),
        ('number', 'Number'),
        ('date', 'Date'),
        ('dropdown', 'Dropdown'),
        ('file', 'File Upload'),
    )
    
    program = models.ForeignKey(Program, on_delete=models.CASCADE, related_name='dynamic_fields', null=True, blank=True)
    sub_program = models.ForeignKey(SubProgram, on_delete=models.CASCADE, related_name='dynamic_fields', null=True, blank=True)
    course = models.ForeignKey('core.Course', on_delete=models.CASCADE, related_name='dynamic_fields', null=True, blank=True)
    
    label = models.CharField(max_length=100)
    field_type = models.CharField(max_length=20, choices=FIELD_TYPE_CHOICES)
    is_required = models.BooleanField(default=True)
    options = models.JSONField(null=True, blank=True, help_text="Dropdown options as list of strings")
    order = models.PositiveIntegerField(default=0)
    conditional_rule = models.JSONField(null=True, blank=True, help_text="Rules for visibility")

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"{self.label} ({self.field_type})"

class StudentDynamicValue(models.Model):
    student = models.ForeignKey('core.Student', on_delete=models.CASCADE, related_name='dynamic_values')
    field = models.ForeignKey(DynamicField, on_delete=models.CASCADE)
    value = models.TextField() # Store as string, parse based on field_type

    def __str__(self):
        return f"{self.student} - {self.field.label}: {self.value}"
