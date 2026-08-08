from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PipelineStageViewSet, LeadInteractionViewSet, CampaignViewSet, WebhookReceiveView, WebhookEndpointViewSet, SalesUserListView, DashboardStatsView, MentorDashboardStatsView, TaskViewSet, BDEReportView, CallAnalyticsView, MarketingDashboardView, BulkAssignLeadsView, CampaignWebhookReceiveView
from .views_meta import MetaLeadWebhookView, LeadQualityFeedbackView

router = DefaultRouter()
router.register(r'stages', PipelineStageViewSet)
router.register(r'interactions', LeadInteractionViewSet, basename='interaction')
router.register(r'campaigns', CampaignViewSet, basename='campaign')
router.register(r'webhook-endpoints', WebhookEndpointViewSet, basename='webhook-endpoint')
router.register(r'tasks', TaskViewSet, basename='task')

urlpatterns = [
    path('dashboard-stats/', DashboardStatsView.as_view(), name='dashboard_stats'),
    path('mentor-dashboard-stats/', MentorDashboardStatsView.as_view(), name='mentor_dashboard_stats'),
    path('marketing-dashboard/', MarketingDashboardView.as_view(), name='marketing_dashboard'),
    path('leads/bulk_assign/', BulkAssignLeadsView.as_view(), name='bulk_assign_leads'),
    path('webhooks/<uuid:secret_token>/lead/', WebhookReceiveView.as_view(), name='webhook_lead'),
    path('webhooks/campaign/<uuid:secret_token>/lead/', CampaignWebhookReceiveView.as_view(), name='campaign_webhook_lead'),
    path('sales-users/', SalesUserListView.as_view(), name='sales_users'),
    path('bde-report/<int:user_id>/', BDEReportView.as_view(), name='bde_report'),
    path('call-analytics/', CallAnalyticsView.as_view(), name='call_analytics'),
    # Meta Facebook Lead Ads Integration
    path('meta/webhook/', MetaLeadWebhookView.as_view(), name='meta_lead_webhook'),
    path('leads/<int:student_id>/quality/', LeadQualityFeedbackView.as_view(), name='lead_quality_feedback'),
    path('', include(router.urls)),
]
