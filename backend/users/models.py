from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    ROLE_CHOICES = (
        ('SUPER_ADMIN', 'Super Admin'),
        ('ADMIN', 'Admin'),
        ('SALES', 'Sales User'),
        ('MENTOR', 'Mentor'),
        ('ACADEMIC', 'Academic User'),
        ('STUDENT', 'Student'),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='STUDENT')
    phone_number = models.CharField(max_length=15, blank=True, null=True)

    class Meta:
        ordering = ['-id']

    def __str__(self):
        return f"{self.username} ({self.role})"

class RolePermission(models.Model):
    MODULE_CHOICES = (
        ('SALES', 'Sales Module'),
        ('MENTOR', 'Mentor Module'),
        ('STUDENT', 'Student Portal'),
        ('ACADEMIC', 'Academic Module'),
        ('ADMIN', 'Admin Module'),
        ('ANALYTICS', 'Analytics & Reports'),
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
