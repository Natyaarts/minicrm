
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProgramViewSet, SubProgramViewSet, CourseViewSet, 
    BatchViewSet, StudentViewSet, TransactionViewSet, DocumentViewSet,
    DashboardStatsView
)
from .bulk_views import BulkUploadView

router = DefaultRouter()
router.register(r'programs', ProgramViewSet)
router.register(r'sub-programs', SubProgramViewSet)
router.register(r'courses', CourseViewSet)
router.register(r'batches', BatchViewSet)
router.register(r'students', StudentViewSet)
router.register(r'transactions', TransactionViewSet)
router.register(r'documents', DocumentViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('dashboard-stats/', DashboardStatsView.as_view(), name='dashboard-stats'),
    path('bulk/upload-students/', BulkUploadView.as_view(), name='bulk-upload-students'),
]
