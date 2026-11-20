from django.db import models
from django.conf import settings

class Notification(models.Model):
    NOTIFICATION_TYPES = (
        ('INFO', 'Information'),
        ('SUCCESS', 'Success'),
        ('WARNING', 'Warning'),
        ('ERROR', 'Error'),
        ('APPLICATION', 'New Application'),
        ('PAYMENT', 'Payment Received'),
        ('BATCH', 'Batch Update'),
        ('TASK', 'New Task'),
        ('LEAVE', 'Leave Update'),
    )

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')
    title = models.CharField(max_length=255)
    message = models.TextField()
    notification_type = models.CharField(max_length=20, choices=NOTIFICATION_TYPES, default='INFO')
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    
    # Optional link to navigate to a specific page
    target_url = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} - {self.title}"


class DeviceToken(models.Model):
    """
    One row per installed app (Expo push token). A user can have several devices;
    a token always belongs to the user who registered it most recently.
    Logging out sets is_active=False; Expo 'DeviceNotRegistered' does the same.
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='device_tokens')
    token = models.CharField(max_length=255, unique=True)
    platform = models.CharField(max_length=20, blank=True, default='')
    device_name = models.CharField(max_length=255, blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=['user', 'is_active'])]

    def __str__(self):
        state = 'active' if self.is_active else 'inactive'
        return f"{self.user.username} - {self.platform or 'device'} ({state})"


class MentorFollowupDigest(models.Model):
    """
    One row per mentor per India date: the morning "Student follow-ups" push was sent
    (crm send_task_reminders). The unique (user, date) row is created BEFORE sending,
    so a mentor gets at most one digest a day even if runs overlap.
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='mentor_followup_digests')
    date = models.DateField()
    count = models.PositiveIntegerField(default=0)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'date'], name='uniq_mentor_followup_digest_per_day')]

    def __str__(self):
        return f"{self.user.username} - {self.date} ({self.count})"
