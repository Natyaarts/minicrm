from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LeaveTypeViewSet, LeaveBalanceViewSet, LeaveRequestViewSet, HolidayViewSet

router = DefaultRouter()
router.register(r'types', LeaveTypeViewSet)
router.register(r'balances', LeaveBalanceViewSet, basename='leave-balance')
router.register(r'requests', LeaveRequestViewSet, basename='leave-request')
router.register(r'holidays', HolidayViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
