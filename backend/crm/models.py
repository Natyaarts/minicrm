import uuid
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
    CALL_DIRECTION_CHOICES = (
        ('INCOMING', 'Incoming'),
        ('OUTGOING', 'Outgoing'),
    )
    CALL_STATUS_CHOICES = (
        ('CONNECTED', 'Connected'),
        ('MISSED', 'Missed'),
        ('REJECTED', 'Rejected'),
        ('UNANSWERED', 'Unanswered'),
        ('BUSY', 'Busy'),
        ('FAILED', 'Failed'),
    )

    student = models.ForeignKey(Student, on_delete=models.SET_NULL, null=True, blank=True, related_name='crm_interactions')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    interaction_type = models.CharField(max_length=20, choices=INTERACTION_TYPES, default='NOTE')
    
    # Telephony & Call Logging Fields
    mobile_call_id = models.CharField(max_length=150, blank=True, null=True, unique=True, db_index=True, help_text="Unique client-generated mobile call ID for deduplication")
    customer_number = models.CharField(max_length=50, blank=True, null=True, db_index=True, help_text="Customer / Lead phone number")
    caller_number = models.CharField(max_length=50, blank=True, null=True, db_index=True, help_text="Caller phone number")
    receiver_number = models.CharField(max_length=50, blank=True, null=True, db_index=True, help_text="Receiver / Destination phone number")
    call_direction = models.CharField(max_length=20, choices=CALL_DIRECTION_CHOICES, default='OUTGOING', null=True, blank=True)
    call_status = models.CharField(max_length=30, choices=CALL_STATUS_CHOICES, null=True, blank=True)
    call_duration = models.IntegerField(default=0, help_text="Duration in seconds")
    start_time = models.DateTimeField(null=True, blank=True)
    end_time = models.DateTimeField(null=True, blank=True)
    
    notes = models.TextField(blank=True, default='')
    audio_recording = models.FileField(upload_to='call_recordings/%Y/%m/', null=True, blank=True)
    recording_url = models.CharField(max_length=1000, blank=True, null=True, help_text="Remote/telephony audio recording URL")
    
    provider_call_id = models.CharField(max_length=150, blank=True, null=True, db_index=True, help_text="Provider call ID")
    provider_event_id = models.CharField(max_length=150, blank=True, null=True, db_index=True, help_text="Provider event ID")
    telephony_provider = models.CharField(max_length=50, blank=True, null=True, default='MOBILE_APP')
    is_matched = models.BooleanField(default=False, help_text="Whether this call is linked to an existing CRM Student/Lead")
    
    date = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date']

    def __str__(self):
        target = f"{self.student.first_name} {self.student.last_name}".strip() if self.student else (self.customer_number or self.caller_number or 'Unknown')
        direction = self.call_direction or 'OUTGOING'
        date_str = self.date.strftime('%Y-%m-%d') if self.date else ''
        return f"{self.interaction_type} ({direction}) with {target} on {date_str}"


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
    
    SECTION_CHOICES = (
        ('CAREER_ACADEMY', 'Career Academy'),
        ('REGULAR', 'Regular'),
        ('BOTH', 'Both'),
    )
    section = models.CharField(max_length=20, choices=SECTION_CHOICES, default='BOTH')
    
    # Meta Facebook Lead Ads Integration
    meta_page_id = models.CharField(max_length=100, null=True, blank=True, help_text='Facebook Page ID that this campaign belongs to')
    meta_form_id = models.CharField(max_length=100, null=True, blank=True, help_text='Facebook Lead Ad Form ID for auto-matching incoming leads')
    meta_ad_id = models.CharField(max_length=100, null=True, blank=True, help_text='Facebook Ad ID (optional, for more precise matching)')
    meta_pixel_id = models.CharField(max_length=100, null=True, blank=True, help_text='Facebook Pixel ID for Conversions API')
    meta_access_token = models.TextField(null=True, blank=True, help_text='Meta Page Access Token for Conversions API - keep this secret!')
    meta_auto_import = models.BooleanField(default=False, help_text='If enabled, leads from this Meta form auto-import into CRM')
    
    # Auto-Assignment to selected Sales Representatives
    auto_assign_to = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name='assigned_meta_campaigns', help_text='Sales representatives to auto-assign incoming leads to (Round-Robin)')
    
    # Campaign-wise Webhook Integration (e.g. Google Sheets)
    secret_token = models.UUIDField(default=uuid.uuid4, editable=False, unique=True, null=True, help_text='Secret token for Campaign-linked webhooks')
    
    # Google Sheets OAuth Direct Integration
    google_spreadsheet_id = models.CharField(max_length=255, null=True, blank=True, help_text='Google Sheets Spreadsheet ID')
    google_sheet_name = models.CharField(max_length=100, null=True, blank=True, help_text='Sheet Tab name (e.g., Sheet1)')
    google_access_token = models.TextField(null=True, blank=True)
    google_refresh_token = models.TextField(null=True, blank=True)
    google_token_expiry = models.DateTimeField(null=True, blank=True)
    google_last_synced_row = models.IntegerField(default=0, help_text='The last row index imported from this sheet')
    google_auto_sync = models.BooleanField(default=False, help_text='Automatically sync leads from this sheet in the background')

    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name

import uuid

class Task(models.Model):
    TASK_TYPES = (
        ('CALL', 'Phone Call'),
        ('EMAIL', 'Email'),
        ('MEETING', 'Meeting'),
        ('OTHER', 'Other'),
    )
    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
    )
    title = models.CharField(max_length=255)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='crm_tasks', null=True, blank=True)
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='assigned_crm_tasks')
    task_type = models.CharField(max_length=20, choices=TASK_TYPES, default='CALL')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    due_date = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['due_date']

    def __str__(self):
        return f"{self.title} - {self.status}"


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
