from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DepartmentViewSet, DesignationViewSet, EmployeeProfileViewSet, 
    CustomFieldViewSet, AttendanceViewSet, ShiftSettingViewSet, TaskViewSet,
    TaskCommentViewSet
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

urlpatterns = [
    path('', include(router.urls)),
]
