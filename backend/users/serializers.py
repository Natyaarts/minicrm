
from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import RolePermission

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'role', 'phone_number', 'password', 'permissions')

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

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_password('welcome123') # Default password if none provided
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance

class RolePermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = RolePermission
        fields = '__all__'
