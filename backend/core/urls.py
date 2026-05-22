
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProgramViewSet, SubProgramViewSet, CourseViewSet, 
    BatchViewSet, StudentViewSet, TransactionViewSet, DocumentViewSet,
    SyllabusPartViewSet, ClassSessionViewSet, AttendanceViewSet, BatchResourceViewSet,
    ExamViewSet, ExamResultViewSet, QuestionViewSet, DashboardStatsView, AnalyticsDetailView,
    StudentSubmissionViewSet
)
from .bulk_views import BulkUploadView

router = DefaultRouter()
router.register(r'programs', ProgramViewSet, basename='core-program')
router.register(r'sub-programs', SubProgramViewSet, basename='core-subprogram')
router.register(r'courses', CourseViewSet, basename='core-course')
router.register(r'batches', BatchViewSet, basename='core-batch')
router.register(r'students', StudentViewSet, basename='core-student')
router.register(r'transactions', TransactionViewSet, basename='core-transaction')
router.register(r'documents', DocumentViewSet, basename='core-document')
router.register(r'syllabus-parts', SyllabusPartViewSet, basename='core-syllabus')
router.register(r'class-sessions', ClassSessionViewSet, basename='core-session')
router.register(r'attendances', AttendanceViewSet, basename='core-attendance')
router.register(r'batch-resources', BatchResourceViewSet, basename='core-resource')
router.register(r'exams', ExamViewSet, basename='core-exam')
router.register(r'exam-results', ExamResultViewSet, basename='core-result')
router.register(r'questions', QuestionViewSet, basename='core-question')
router.register(r'student-submissions', StudentSubmissionViewSet, basename='core-submission')

urlpatterns = [
    path('', include(router.urls)),
    path('dashboard-stats/', DashboardStatsView.as_view(), name='dashboard-stats'),
    path('analytics-details/', AnalyticsDetailView.as_view(), name='analytics-details'),
    path('bulk/upload-students/', BulkUploadView.as_view(), name='bulk-upload-students'),
]
