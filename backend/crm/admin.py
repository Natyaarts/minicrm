from django.contrib import admin
from .models import PipelineStage, LeadInteraction, Campaign, WebhookEndpoint, WebhookLog

@admin.register(PipelineStage)
class PipelineStageAdmin(admin.ModelAdmin):
    list_display = ('name', 'order', 'is_default')
    list_editable = ('order', 'is_default')

@admin.register(LeadInteraction)
class LeadInteractionAdmin(admin.ModelAdmin):
    list_display = ('student', 'author', 'interaction_type', 'date')
    list_filter = ('interaction_type', 'date')

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
