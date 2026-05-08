from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ExpenseViewSet, ExpenseCategoryViewSet

router = DefaultRouter()
router.register(r'expenses', ExpenseViewSet, basename='finance-expense')
router.register(r'categories', ExpenseCategoryViewSet, basename='finance-category')

urlpatterns = [
    path('', include(router.urls)),
]
