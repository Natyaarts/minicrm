
from rest_framework import serializers
from .models import DynamicField, StudentDynamicValue

class DynamicFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = DynamicField
        fields = '__all__'

class StudentDynamicValueSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentDynamicValue
        fields = '__all__'
