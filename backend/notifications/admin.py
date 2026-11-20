from django.contrib import admin
from .models import Notification, DeviceToken, MentorFollowupDigest

@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('user', 'title', 'notification_type', 'is_read', 'created_at')
    list_filter = ('notification_type', 'is_read', 'created_at')
    search_fields = ('user__username', 'title', 'message')


@admin.register(DeviceToken)
class DeviceTokenAdmin(admin.ModelAdmin):
    list_display = ('user', 'platform', 'device_name', 'is_active', 'last_seen_at', 'created_at')
    list_filter = ('is_active', 'platform')
    search_fields = ('user__username', 'token', 'device_name')


@admin.register(MentorFollowupDigest)
class MentorFollowupDigestAdmin(admin.ModelAdmin):
    list_display = ('user', 'date', 'count', 'sent_at')
    list_filter = ('date',)
    search_fields = ('user__username',)
