from rest_framework import serializers
from .models import Department, Designation, EmployeeProfile, CustomField, Attendance, ShiftSetting, Task, TaskComment, CompanyPost, EmployeeDocument, Asset, Expense, PerformanceReview, Offboarding

class ShiftSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShiftSetting
        fields = '__all__'

class AttendanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.user.get_full_name')
    employee_id_display = serializers.ReadOnlyField(source='employee.employee_id')
    user_id = serializers.ReadOnlyField(source='employee.user.id')
    
    class Meta:
        model = Attendance
        fields = [
            'id', 'employee', 'user_id', 'employee_name', 'employee_id_display', 
            'date', 'clock_in', 'clock_out', 
            'clock_in_latitude', 'clock_in_longitude',
            'clock_out_latitude', 'clock_out_longitude',
            'clock_in_photo', 'is_face_verified', 'verification_confidence',
            'status', 'notes'
        ]
        read_only_fields = ['id', 'date', 'status']
from django.contrib.auth import get_user_model

User = get_user_model()

class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = '__all__'

class CustomFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomField
        fields = '__all__'

class DesignationSerializer(serializers.ModelSerializer):
    department_name = serializers.ReadOnlyField(source='department.name')
    
    class Meta:
        model = Designation
        fields = ['id', 'name', 'department', 'department_name', 'description', 'permission_role', 'created_at']

class EmployeeProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(write_only=True)
    password = serializers.CharField(write_only=True)
    email = serializers.EmailField(write_only=True)
    first_name = serializers.CharField(write_only=True)
    last_name = serializers.CharField(write_only=True)
    
    # Read-only fields for display
    display_username = serializers.ReadOnlyField(source='user.username')
    full_name = serializers.ReadOnlyField(source='user.get_full_name')
    department_name = serializers.ReadOnlyField(source='department.name')
    designation_name = serializers.ReadOnlyField(source='designation.name')
    reporting_to_name = serializers.ReadOnlyField(source='reporting_to.user.get_full_name')
    
    class Meta:
        model = EmployeeProfile
        fields = [
            'id', 'username', 'password', 'email', 'first_name', 'last_name',
            'display_username', 'full_name', 'employee_id', 'department', 
            'department_name', 'designation', 'designation_name', 
            'reporting_to', 'reporting_to_name',
            'date_of_joining', 'date_of_birth', 'gender', 'status', 'base_salary', 'additional_data'
        ]
        read_only_fields = ['id', 'status']

    def create(self, validated_data):
        user_data = {
            'username': validated_data.pop('username'),
            'email': validated_data.pop('email'),
            'first_name': validated_data.pop('first_name'),
            'last_name': validated_data.pop('last_name'),
        }
        password = validated_data.pop('password')
        
        # Create the user with the EMPLOYEE role
        user = User.objects.create_user(**user_data, password=password, role='EMPLOYEE')
        
        # Create the profile linked to the user
        profile = EmployeeProfile.objects.create(user=user, **validated_data)
        
        # Auto-create the salary structure for the new employee
        from payroll.models import SalaryStructure
        SalaryStructure.objects.create(employee=profile, base_salary=profile.base_salary)
        
        return profile

class TaskCommentSerializer(serializers.ModelSerializer):
    author_name = serializers.ReadOnlyField(source='author.get_full_name')
    author_username = serializers.ReadOnlyField(source='author.username')

    class Meta:
        model = TaskComment
        fields = ['id', 'task', 'author', 'author_name', 'author_username', 'content', 'created_at']
        read_only_fields = ['author', 'created_at']

class TaskSerializer(serializers.ModelSerializer):
    assignee_name = serializers.ReadOnlyField(source='assignee.user.get_full_name')
    assigned_by_name = serializers.ReadOnlyField(source='assigned_by.user.get_full_name')
    comments = TaskCommentSerializer(many=True, read_only=True)

    class Meta:
        model = Task
        fields = '__all__'

class CompanyPostSerializer(serializers.ModelSerializer):
    author_name = serializers.ReadOnlyField(source='author.get_full_name')
    author_username = serializers.ReadOnlyField(source='author.username')
    author_designation = serializers.SerializerMethodField()

    class Meta:
        model = CompanyPost
        fields = ['id', 'author', 'author_name', 'author_username', 'author_designation', 'content', 'post_type', 'created_at']
        read_only_fields = ['author', 'created_at']

    def get_author_designation(self, obj):
        try:
            return obj.author.hrms_profile.designation.name if obj.author.hrms_profile.designation else 'No Role'
        except:
            return 'No Role'

class EmployeeDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeDocument
        fields = '__all__'

class AssetSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.ReadOnlyField(source='assigned_to.user.get_full_name')

    class Meta:
        model = Asset
        fields = '__all__'

class ExpenseSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.user.get_full_name')

    class Meta:
        model = Expense
        fields = '__all__'

class PerformanceReviewSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.user.get_full_name')
    reviewer_name = serializers.ReadOnlyField(source='reviewer.user.get_full_name')

    class Meta:
        model = PerformanceReview
        fields = '__all__'

class OffboardingSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.user.get_full_name')

    class Meta:
        model = Offboarding
        fields = '__all__'
