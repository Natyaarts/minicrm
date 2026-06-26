from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PipelineStageViewSet, LeadInteractionViewSet, CampaignViewSet, WebhookReceiveView, WebhookEndpointViewSet, SalesUserListView, DashboardStatsView, TaskViewSet, BDEReportView, CallAnalyticsView, BulkConvertAllView

router = DefaultRouter()
router.register(r'stages', PipelineStageViewSet)
router.register(r'interactions', LeadInteractionViewSet, basename='interaction')
router.register(r'campaigns', CampaignViewSet, basename='campaign')
router.register(r'webhook-endpoints', WebhookEndpointViewSet, basename='webhook-endpoint')
router.register(r'tasks', TaskViewSet, basename='task')

urlpatterns = [
    path('dashboard-stats/', DashboardStatsView.as_view(), name='dashboard_stats'),
    path('bulk-convert-all/', BulkConvertAllView.as_view(), name='bulk_convert_all'),
    path('webhooks/<uuid:secret_token>/lead/', WebhookReceiveView.as_view(), name='webhook_lead'),
    path('sales-users/', SalesUserListView.as_view(), name='sales_users'),
    path('bde-report/<int:user_id>/', BDEReportView.as_view(), name='bde_report'),
    path('call-analytics/', CallAnalyticsView.as_view(), name='call_analytics'),
    path('', include(router.urls)),
]
