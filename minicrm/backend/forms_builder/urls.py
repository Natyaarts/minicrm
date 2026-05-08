
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DynamicFieldViewSet

router = DefaultRouter()
router.register(r'fields', DynamicFieldViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
