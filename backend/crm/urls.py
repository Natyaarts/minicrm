from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PipelineStageViewSet, LeadInteractionViewSet, CampaignViewSet, WebhookReceiveView, WebhookEndpointViewSet, SalesUserListView, DashboardStatsView

router = DefaultRouter()
router.register(r'stages', PipelineStageViewSet)
router.register(r'interactions', LeadInteractionViewSet, basename='interaction')
router.register(r'campaigns', CampaignViewSet, basename='campaign')
router.register(r'webhook-endpoints', WebhookEndpointViewSet, basename='webhook-endpoint')

urlpatterns = [
    path('dashboard-stats/', DashboardStatsView.as_view(), name='dashboard_stats'),
    path('webhooks/<uuid:secret_token>/lead/', WebhookReceiveView.as_view(), name='webhook_lead'),
    path('sales-users/', SalesUserListView.as_view(), name='sales_users'),
    path('', include(router.urls)),
]
