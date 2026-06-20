from rest_framework import serializers
from .models import SalaryStructure, Payslip, BonusDeduction, EmployeeLoan, TaxDeclaration

class SalaryStructureSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.user.get_full_name')
    
    class Meta:
        model = SalaryStructure
        fields = '__all__'

class PayslipSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.user.get_full_name')
    employee_id = serializers.ReadOnlyField(source='employee.employee_id')
    user_id = serializers.ReadOnlyField(source='employee.user.id')
    
    class Meta:
        model = Payslip
        fields = '__all__'

class BonusDeductionSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.user.get_full_name')
    
    class Meta:
        model = BonusDeduction
        fields = '__all__'

class EmployeeLoanSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.user.get_full_name')
    
    class Meta:
        model = EmployeeLoan
        fields = '__all__'

class TaxDeclarationSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.user.get_full_name')
    employee_id = serializers.ReadOnlyField(source='employee.employee_id')
    
    class Meta:
        model = TaxDeclaration
        fields = '__all__'
