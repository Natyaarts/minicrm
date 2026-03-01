
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LoginView, UserDetailView, UserViewSet, MentorListView, RolePermissionViewSet

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'permissions', RolePermissionViewSet)

urlpatterns = [
    path('login/', LoginView.as_view(), name='login'),
    path('me/', UserDetailView.as_view(), name='user-detail'),
    path('mentors/', MentorListView.as_view(), name='mentor-list'),
    path('management/', include(router.urls)),
]
