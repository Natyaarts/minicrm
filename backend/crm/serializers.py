from rest_framework import serializers
from .models import PipelineStage, LeadInteraction, Campaign, Task

class PipelineStageSerializer(serializers.ModelSerializer):
    class Meta:
        model = PipelineStage
        fields = '__all__'

class LeadInteractionSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.first_name', read_only=True)
    author_last_name = serializers.CharField(source='author.last_name', read_only=True)
    student_name = serializers.SerializerMethodField()
    student_phone = serializers.CharField(source='student.mobile', read_only=True)

    class Meta:
        model = LeadInteraction
        fields = '__all__'

    def get_student_name(self, obj):
        if obj.student:
            return f"{obj.student.first_name} {obj.student.last_name}".strip()
        return None

class CampaignSerializer(serializers.ModelSerializer):
    lead_count = serializers.SerializerMethodField()
    cost_per_lead = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Campaign
        fields = '__all__'
        read_only_fields = ['created_by']

    def get_lead_count(self, obj):
        return obj.leads.count()

    def get_cost_per_lead(self, obj):
        count = self.get_lead_count(obj)
        if count > 0 and obj.budget > 0:
            return round(obj.budget / count, 2)
        return 0

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username
        return None

class TaskSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = '__all__'

    def get_student_name(self, obj):
        if obj.student:
            return f"{obj.student.first_name} {obj.student.last_name}".strip()
        return None

    def get_assigned_to_name(self, obj):
        if obj.assigned_to:
            return f"{obj.assigned_to.first_name} {obj.assigned_to.last_name}".strip() or obj.assigned_to.username
        return None

