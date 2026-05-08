from django.db import models

class IntegrationSetting(models.Model):
    name = models.CharField(max_length=50, unique=True) # e.g., 'razorpay'
    config = models.JSONField(default=dict) # stores keys, secret, etc.
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name
