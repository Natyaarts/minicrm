from django.contrib import admin
from .models import PipelineStage, LeadInteraction, Campaign, WebhookEndpoint, WebhookLog

@admin.register(PipelineStage)
class PipelineStageAdmin(admin.ModelAdmin):
    list_display = ('name', 'order', 'is_default')
    list_editable = ('order', 'is_default')

from django.utils.safestring import mark_safe

@admin.register(LeadInteraction)
class LeadInteractionAdmin(admin.ModelAdmin):
    list_display = ('student', 'author', 'interaction_type', 'date', 'audio_recording_display')
    list_filter = ('interaction_type', 'date')
    readonly_fields = ('audio_recording_display',)

    def audio_recording_display(self, obj):
        if obj.audio_recording:
            return mark_safe(f'<audio src="{obj.audio_recording.url}" controls>Your browser does not support the audio element.</audio>')
        return "No Recording"
    audio_recording_display.short_description = "Call Recording"

@admin.register(Campaign)
class CampaignAdmin(admin.ModelAdmin):
    list_display = ('name', 'platform', 'status', 'budget', 'start_date')
    list_filter = ('platform', 'status')

@admin.register(WebhookEndpoint)
class WebhookEndpointAdmin(admin.ModelAdmin):
    list_display = ('name', 'secret_token', 'is_active', 'created_at')
    readonly_fields = ('secret_token', 'created_at')

@admin.register(WebhookLog)
class WebhookLogAdmin(admin.ModelAdmin):
    list_display = ('endpoint', 'status', 'timestamp')
    list_filter = ('status', 'endpoint')
    readonly_fields = ('timestamp',)
