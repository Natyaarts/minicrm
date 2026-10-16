from rest_framework import serializers
from core.validators import validate_tax_proof_file
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
    work_location = serializers.ReadOnlyField(source='employee.work_location')
    
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
        read_only_fields = ('employee', 'status', 'notes')

    def validate_proof_file(self, value):
        if value:
            return validate_tax_proof_file(value)
        return value

    def validate(self, attrs):
        # Because `employee` is read-only, DRF skips the unique-together check,
        # so a duplicate would crash with a 500. Check it here instead.
        request = self.context.get('request')
        if request and request.method == 'POST':
            profile = getattr(request.user, 'hrms_profile', None)
            if profile is None:
                raise serializers.ValidationError("Your account has no employee profile.")
            if TaxDeclaration.objects.filter(
                employee=profile, financial_year=attrs.get('financial_year')
            ).exists():
                raise serializers.ValidationError(
                    {"financial_year": "You have already submitted a declaration for this year."}
                )
        return attrs
