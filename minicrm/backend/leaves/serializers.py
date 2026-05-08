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
    remaining_days = serializers.ReadOnlyField()
    
    class Meta:
        model = LeaveBalance
        fields = ['id', 'employee', 'user_id', 'leave_type', 'leave_type_name', 'leave_type_code', 'total_days', 'used_days', 'remaining_days']

class LeaveRequestSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.user.get_full_name')
    user_id = serializers.ReadOnlyField(source='employee.user.id')
    leave_type_name = serializers.ReadOnlyField(source='leave_type.name')
    duration = serializers.ReadOnlyField()
    
    class Meta:
        model = LeaveRequest
        fields = '__all__'
        read_only_fields = ['employee', 'status', 'approved_by', 'rejection_reason']
