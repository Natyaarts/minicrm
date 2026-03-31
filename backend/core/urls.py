
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProgramViewSet, SubProgramViewSet, CourseViewSet, 
    BatchViewSet, StudentViewSet, TransactionViewSet, DocumentViewSet,
    SyllabusPartViewSet, ClassSessionViewSet, AttendanceViewSet, BatchResourceViewSet,
    ExamViewSet, ExamResultViewSet, QuestionViewSet, DashboardStatsView, AnalyticsDetailView
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
router.register(r'syllabus-parts', SyllabusPartViewSet)
router.register(r'class-sessions', ClassSessionViewSet)
router.register(r'attendances', AttendanceViewSet)
router.register(r'batch-resources', BatchResourceViewSet)
router.register(r'exams', ExamViewSet)
router.register(r'exam-results', ExamResultViewSet)
router.register(r'questions', QuestionViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('dashboard-stats/', DashboardStatsView.as_view(), name='dashboard-stats'),
    path('analytics-details/', AnalyticsDetailView.as_view(), name='analytics-details'),
    path('bulk/upload-students/', BulkUploadView.as_view(), name='bulk-upload-students'),
]
