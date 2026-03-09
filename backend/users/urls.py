
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LoginView, UserDetailView, UserViewSet, MentorListView, TeacherListView, TeacherViewSet, RolePermissionViewSet

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'teachers', TeacherViewSet, basename='teacher-management')
router.register(r'permissions', RolePermissionViewSet)

urlpatterns = [
    path('login/', LoginView.as_view(), name='login'),
    path('me/', UserDetailView.as_view(), name='user-detail'),
    path('mentors/', MentorListView.as_view(), name='mentor-list'),
    path('teachers/', TeacherListView.as_view(), name='teacher-list'),
    path('management/', include(router.urls)),
]
