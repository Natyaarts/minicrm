from django.db import models
from django.conf import settings
from core.models import Student

class PipelineStage(models.Model):
    name = models.CharField(max_length=50) # e.g. "New Lead", "Follow-up", "In Discussion", "Enrolled", "Dropped"
    order = models.PositiveIntegerField(default=0)
    color = models.CharField(max_length=20, default="#e2e8f0") # Hex color for UI
    is_default = models.BooleanField(default=False)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return self.name

class LeadInteraction(models.Model):
    INTERACTION_TYPES = (
        ('NOTE', 'Note'),
        ('CALL', 'Phone Call'),
        ('EMAIL', 'Email'),
        ('MEETING', 'Meeting'),
        ('WHATSAPP', 'WhatsApp'),
    )
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='crm_interactions')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    interaction_type = models.CharField(max_length=20, choices=INTERACTION_TYPES, default='NOTE')
    notes = models.TextField()
    audio_recording = models.FileField(upload_to='call_recordings/%Y/%m/', null=True, blank=True)
    date = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date']

    def __str__(self):
        return f"{self.interaction_type} with {self.student.first_name} on {self.date.strftime('%Y-%m-%d')}"

class Campaign(models.Model):
    STATUS_CHOICES = (
        ('ACTIVE', 'Active'),
        ('PAUSED', 'Paused'),
        ('COMPLETED', 'Completed'),
    )
    PLATFORM_CHOICES = (
        ('FACEBOOK', 'Facebook Ads'),
        ('GOOGLE', 'Google Ads'),
        ('INSTAGRAM', 'Instagram Ads'),
        ('LINKEDIN', 'LinkedIn Ads'),
        ('WALKIN', 'Walk-in / Offline'),
        ('OTHER', 'Other'),
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ACTIVE')
    platform = models.CharField(max_length=20, choices=PLATFORM_CHOICES, default='OTHER')
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    budget = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name

import uuid

class WebhookEndpoint(models.Model):
    name = models.CharField(max_length=100) # e.g. "Zapier FB Ads"
    secret_token = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return self.name

class WebhookLog(models.Model):
    STATUS_CHOICES = (
        ('SUCCESS', 'Success'),
        ('FAILED', 'Failed'),
    )
    endpoint = models.ForeignKey(WebhookEndpoint, on_delete=models.CASCADE, related_name='logs')
    payload = models.JSONField(default=dict)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='SUCCESS')
    error_message = models.TextField(blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.endpoint.name} - {self.status} at {self.timestamp}"
