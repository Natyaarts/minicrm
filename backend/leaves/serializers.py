from rest_framework import serializers
from .models import LeaveType, LeaveBalance, LeaveRequest, Holiday

class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = '__all__'

class LeaveTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveType
        fields = '__all__'

class LeaveBalanceSerializer(serializers.ModelSerializer):
    leave_type_name = serializers.ReadOnlyField(source='leave_type.name')
    leave_type_code = serializers.ReadOnlyField(source='leave_type.code')
    user_id = serializers.ReadOnlyField(source='employee.user.id')
    employee_name = serializers.SerializerMethodField()
    employee_code = serializers.ReadOnlyField(source='employee.employee_id')
    remaining_days = serializers.ReadOnlyField()
    
    def get_employee_name(self, obj):
        if obj.employee and obj.employee.user:
            return obj.employee.user.get_full_name() or obj.employee.user.username
        return ""

    class Meta:
        model = LeaveBalance
        fields = [
            'id', 'employee', 'employee_name', 'employee_code', 
            'user_id', 'leave_type', 'leave_type_name', 'leave_type_code', 
            'total_days', 'used_days', 'remaining_days'
        ]

class LeaveRequestSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_code = serializers.ReadOnlyField(source='employee.employee_id')
    user_id = serializers.ReadOnlyField(source='employee.user.id')
    leave_type_name = serializers.ReadOnlyField(source='leave_type.name')
    leave_type_code = serializers.ReadOnlyField(source='leave_type.code')
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    duration = serializers.ReadOnlyField()
    manager_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    can_approve = serializers.SerializerMethodField()
    can_reject = serializers.SerializerMethodField()

    def get_employee_name(self, obj):
        if obj.employee and obj.employee.user:
            return obj.employee.user.get_full_name() or obj.employee.user.username
        return ""

    def get_manager_name(self, obj):
        if obj.manager_approved_by and obj.manager_approved_by.user:
            return obj.manager_approved_by.user.get_full_name() or obj.manager_approved_by.user.username
        return ""

    def get_approved_by_name(self, obj):
        if obj.approved_by and obj.approved_by.user:
            return obj.approved_by.user.get_full_name() or obj.approved_by.user.username
        return ""

    def get_can_approve(self, obj):
        request = self.context.get('request')
        user = request.user if request else None
        if not user or not user.is_authenticated:
            return False
        is_manager = bool(obj.employee.reporting_to and obj.employee.reporting_to.user == user)
        is_hr = bool(user.role in ['SUPER_ADMIN', 'ADMIN'] or user.is_superuser)
        if obj.status == 'PENDING_MANAGER':
            return is_manager
        if obj.status == 'PENDING_HR':
            return is_hr
        return False

    def get_can_reject(self, obj):
        request = self.context.get('request')
        user = request.user if request else None
        if not user or not user.is_authenticated:
            return False
        is_manager = bool(obj.employee.reporting_to and obj.employee.reporting_to.user == user)
        is_hr = bool(user.role in ['SUPER_ADMIN', 'ADMIN'] or user.is_superuser)
        if obj.status == 'PENDING_MANAGER':
            return is_manager or is_hr
        if obj.status == 'PENDING_HR':
            return is_hr
        return False
    
    class Meta:
        model = LeaveRequest
        fields = '__all__'
        read_only_fields = ['employee', 'status', 'manager_approved_by', 'approved_by', 'rejection_reason', 'applied_at']

