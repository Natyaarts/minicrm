from rest_framework import serializers
from .models import PipelineStage, LeadInteraction, Campaign

class PipelineStageSerializer(serializers.ModelSerializer):
    class Meta:
        model = PipelineStage
        fields = '__all__'

class LeadInteractionSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.first_name', read_only=True)
    author_last_name = serializers.CharField(source='author.last_name', read_only=True)

    class Meta:
        model = LeadInteraction
        fields = '__all__'

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
