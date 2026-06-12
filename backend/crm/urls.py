from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PipelineStageViewSet, LeadInteractionViewSet, CampaignViewSet, WebhookReceiveView, WebhookEndpointViewSet, SalesUserListView, DashboardStatsView, TaskViewSet, BDEReportView

router = DefaultRouter()
router.register(r'stages', PipelineStageViewSet)
router.register(r'interactions', LeadInteractionViewSet, basename='interaction')
router.register(r'campaigns', CampaignViewSet, basename='campaign')
router.register(r'webhook-endpoints', WebhookEndpointViewSet, basename='webhook-endpoint')
router.register(r'tasks', TaskViewSet, basename='task')

urlpatterns = [
    path('dashboard-stats/', DashboardStatsView.as_view(), name='dashboard_stats'),
    path('webhooks/<uuid:secret_token>/lead/', WebhookReceiveView.as_view(), name='webhook_lead'),
    path('sales-users/', SalesUserListView.as_view(), name='sales_users'),
    path('bde-report/<int:user_id>/', BDEReportView.as_view(), name='bde_report'),
    path('', include(router.urls)),
]
