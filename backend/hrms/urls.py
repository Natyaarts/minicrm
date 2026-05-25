from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DepartmentViewSet, DesignationViewSet, EmployeeProfileViewSet, 
    CustomFieldViewSet, AttendanceViewSet, ShiftSettingViewSet, TaskViewSet,
    TaskCommentViewSet, CompanyPostViewSet, EmployeeDocumentViewSet,
    AssetViewSet, ExpenseViewSet, PerformanceReviewViewSet, OffboardingViewSet
)

router = DefaultRouter()
router.register(r'departments', DepartmentViewSet, basename='hrms-department')
router.register(r'designations', DesignationViewSet, basename='hrms-designation')
router.register(r'employees', EmployeeProfileViewSet, basename='hrms-employee')
router.register(r'custom-fields', CustomFieldViewSet, basename='hrms-customfield')
router.register(r'attendance', AttendanceViewSet, basename='hrms-attendance')
router.register(r'shifts', ShiftSettingViewSet, basename='hrms-shift')
router.register(r'tasks', TaskViewSet, basename='hrms-task')
router.register(r'task-comments', TaskCommentViewSet, basename='hrms-task-comment')
router.register(r'company-posts', CompanyPostViewSet, basename='hrms-company-post')
router.register(r'documents', EmployeeDocumentViewSet, basename='hrms-document')
router.register(r'assets', AssetViewSet, basename='hrms-asset')
router.register(r'expenses', ExpenseViewSet, basename='hrms-expense')
router.register(r'reviews', PerformanceReviewViewSet, basename='hrms-review')
router.register(r'offboarding', OffboardingViewSet, basename='hrms-offboarding')
urlpatterns = [
    path('', include(router.urls)),
]
