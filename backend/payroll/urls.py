from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SalaryStructureViewSet, PayslipViewSet, BonusDeductionViewSet, EmployeeLoanViewSet, TaxDeclarationViewSet

router = DefaultRouter()
router.register(r'salary-structures', SalaryStructureViewSet, basename='payroll-salary')
router.register(r'payslips', PayslipViewSet, basename='payroll-payslip')
router.register(r'adjustments', BonusDeductionViewSet, basename='payroll-adjustment')
router.register(r'loans', EmployeeLoanViewSet, basename='payroll-loan')
router.register(r'tax-declarations', TaxDeclarationViewSet, basename='payroll-tax-declaration')

urlpatterns = [
    path('', include(router.urls)),
]
