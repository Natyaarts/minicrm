
from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import RolePermission

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'role', 'sales_section', 'phone_number', 'password', 'permissions', 'teacher_batches_details', 'total_classes_conducted', 'lms_teacher_id', 'is_manager')

    teacher_batches_details = serializers.SerializerMethodField()
    total_classes_conducted = serializers.SerializerMethodField()
    is_manager = serializers.SerializerMethodField()

    def get_is_manager(self, obj):
        if obj.role in ['ADMIN', 'SUPER_ADMIN']:
            return True
        if hasattr(obj, 'hrms_profile'):
            profile = obj.hrms_profile
            if profile.subordinates.exists():
                return True
            if profile.designation and any(kw in profile.designation.name.lower() for kw in ['lead', 'manager', 'vp', 'head', 'director']):
                return True
        return False

    def get_teacher_batches_details(self, obj):
        if obj.role == 'TEACHER':
            return [{'id': b.id, 'name': b.name} for b in obj.teacher_batches.all()]
        return []
    
    def get_total_classes_conducted(self, obj):
        from core.models import ClassSession
        return ClassSession.objects.filter(batch__teacher=obj).count()

    def get_permissions(self, obj):
        # Super Admins get all permissions implicitely, but for frontend simplicity
        # let's return a list of permissions
        perms = RolePermission.objects.filter(role=obj.role)
        return {p.module: {
            'view': p.can_view,
            'add': p.can_add,
            'edit': p.can_edit,
            'delete': p.can_delete
        } for p in perms}

    def validate_role(self, value):
        request = self.context.get('request')
        if request and hasattr(request, 'user') and request.user.is_authenticated:
            req_user = request.user
            if not (req_user.role in ['ADMIN', 'SUPER_ADMIN'] or req_user.is_superuser):
                raise serializers.ValidationError("You do not have permission to assign or change user roles.")
            if req_user.role == 'ADMIN' and not req_user.is_superuser:
                if value == 'SUPER_ADMIN':
                    raise serializers.ValidationError("Only Super Admins can assign the Super Admin role.")
        return value

    def create(self, validated_data):
        request = self.context.get('request')
        if request and hasattr(request, 'user') and request.user.is_authenticated:
            req_user = request.user
            if not (req_user.role == 'SUPER_ADMIN' or req_user.is_superuser):
                validated_data.pop('is_superuser', None)
                validated_data.pop('is_staff', None)

        password = validated_data.pop('password', None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_password('welcome123') # Default password if none provided
        user.save()
        return user

    def update(self, instance, validated_data):
        request = self.context.get('request')
        if request and hasattr(request, 'user') and request.user.is_authenticated:
            req_user = request.user
            # Protect Super Admin accounts from modification by regular Admins
            if instance.role == 'SUPER_ADMIN' and req_user.role != 'SUPER_ADMIN' and not req_user.is_superuser:
                raise serializers.ValidationError({"error": "Only Super Admins can modify Super Admin accounts."})

            # Non-admins cannot modify privileged attributes
            if not (req_user.role in ['ADMIN', 'SUPER_ADMIN'] or req_user.is_superuser):
                validated_data.pop('role', None)
                validated_data.pop('is_staff', None)
                validated_data.pop('is_superuser', None)
                validated_data.pop('is_active', None)

        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
            from rest_framework.authtoken.models import Token
            Token.objects.filter(user=instance).delete()
        instance.save()
        return instance


class RolePermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = RolePermission
        fields = '__all__'
