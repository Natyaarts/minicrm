from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    ROLE_CHOICES = (
        ('SUPER_ADMIN', 'Super Admin'),
        ('ADMIN', 'Admin'),
        ('SALES', 'Sales User'),
        ('MENTOR', 'Mentor'),
        ('ACADEMIC', 'Academic User'),
        ('ACADEMIC_COORDINATOR', 'Academic Coordinator'),
        ('TEACHER', 'Teacher'),
        ('STUDENT', 'Student'),
        ('EMPLOYEE', 'General Employee'),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='STUDENT')
    phone_number = models.CharField(max_length=15, blank=True, null=True)
    lms_teacher_id = models.CharField(max_length=100, blank=True, null=True, help_text="Wise LMS Teacher ID")
    expo_push_token = models.CharField(max_length=255, blank=True, null=True)
    
    # Hierarchy for mentors (TL, Manager, etc.)
    reports_to = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='subordinates', help_text="The person this user reports to (e.g. TL or Manager)")

    class Meta:
        ordering = ['-id']

    def __str__(self):
        return f"{self.username} ({self.role})"
        
    def get_all_subordinates(self):
        """Recursively get all users who report to this user."""
        subordinates = list(self.subordinates.all())
        all_subs = list(subordinates)
        for sub in subordinates:
            all_subs.extend(sub.get_all_subordinates())
        return all_subs

class RolePermission(models.Model):
    MODULE_CHOICES = (
        ('SALES', 'Sales & Leads'),
        ('MENTOR', 'Mentor Module'),
        ('STUDENT', 'Student Portal'),
        ('ACADEMIC_HIERARCHY', 'Academic Hierarchy'),
        ('COORDINATOR', 'Coordinator Module'),
        ('TEACHER', 'Teacher Module'),
        ('COURSES', 'Courses & Batches'),
        ('ANALYTICS', 'Analytics & Reports'),
        ('WORKFORCE', 'HRMS: Workforce Hub'),
        ('ATTENDANCE', 'HRMS: Attendance'),
        ('PAYROLL', 'HRMS: Payroll'),
        ('STAFF_DIRECTORY', 'Staff Directory'),
        ('ADMIN', 'Administrator Portal'),
    )
    role = models.CharField(max_length=20, choices=User.ROLE_CHOICES)
    module = models.CharField(max_length=20, choices=MODULE_CHOICES)
    
    can_view = models.BooleanField(default=False)
    can_add = models.BooleanField(default=False)
    can_edit = models.BooleanField(default=False)
    can_delete = models.BooleanField(default=False)

    class Meta:
        unique_together = ('role', 'module')

    def __str__(self):
        return f"{self.role} - {self.module} Permissions"

class Teacher(User):
    class Meta:
        proxy = True
        verbose_name = 'Teacher'
        verbose_name_plural = 'Teachers'

    def save(self, *args, **kwargs):
        self.role = 'TEACHER'
        super().save(*args, **kwargs)
