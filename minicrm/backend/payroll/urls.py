from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SalaryStructureViewSet, PayslipViewSet, BonusDeductionViewSet, EmployeeLoanViewSet

router = DefaultRouter()
router.register(r'salary-structures', SalaryStructureViewSet, basename='payroll-salary')
router.register(r'payslips', PayslipViewSet, basename='payroll-payslip')
router.register(r'adjustments', BonusDeductionViewSet, basename='payroll-adjustment')
router.register(r'loans', EmployeeLoanViewSet, basename='payroll-loan')

urlpatterns = [
    path('', include(router.urls)),
]
