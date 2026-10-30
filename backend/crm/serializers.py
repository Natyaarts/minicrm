from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import PipelineStage, LeadInteraction, Campaign, Task, LeadTask, LeadTaskItem, LeadTaskAssignmentHistory

from core.models import Student

class PipelineStageSerializer(serializers.ModelSerializer):
    class Meta:
        model = PipelineStage
        fields = '__all__'

class LeadInteractionSerializer(serializers.ModelSerializer):
    student = serializers.PrimaryKeyRelatedField(queryset=Student.objects.all(), required=False, allow_null=True)
    author_name = serializers.CharField(source='author.first_name', read_only=True)
    author_last_name = serializers.CharField(source='author.last_name', read_only=True)
    student_name = serializers.SerializerMethodField()
    student_phone = serializers.SerializerMethodField()
    student_created_at = serializers.DateTimeField(source='student.created_at', read_only=True)
    formatted_call_duration = serializers.SerializerMethodField()
    recording_file_or_url = serializers.SerializerMethodField()

    class Meta:
        model = LeadInteraction
        fields = '__all__'

    def get_student_name(self, obj):
        if obj.student:
            name = f"{obj.student.first_name or ''} {obj.student.last_name or ''}".strip()
            return name if name else f"Student #{obj.student.id}"
        return obj.customer_number or obj.caller_number or obj.receiver_number or "Unknown / Unmatched"

    def get_student_phone(self, obj):
        if obj.student and obj.student.mobile:
            return obj.student.mobile
        return obj.customer_number or obj.caller_number or obj.receiver_number or ""

    def get_formatted_call_duration(self, obj):
        sec = obj.call_duration or 0
        if sec <= 0:
            return "0s"
        h = sec // 3600
        m = (sec % 3600) // 60
        s = sec % 60
        parts = []
        if h > 0:
            parts.append(f"{h}h")
        if m > 0 or h > 0:
            parts.append(f"{m}m")
        parts.append(f"{s}s")
        return " ".join(parts)

    def get_recording_file_or_url(self, obj):
        if obj.audio_recording:
            try:
                request = self.context.get('request')
                if request:
                    return request.build_absolute_uri(obj.audio_recording.url)
                return obj.audio_recording.url
            except Exception:
                pass
        if obj.recording_url:
            return obj.recording_url
        return None

class CampaignSerializer(serializers.ModelSerializer):
    lead_count = serializers.SerializerMethodField()
    cost_per_lead = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    auto_assign_to = serializers.PrimaryKeyRelatedField(
        many=True, queryset=get_user_model().objects.all(), required=False
    )

    webhook_url = serializers.SerializerMethodField()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from django.contrib.auth import get_user_model
        self.fields['auto_assign_to'].queryset = get_user_model().objects.all()

    class Meta:
        model = Campaign
        fields = '__all__'
        read_only_fields = ['created_by', 'last_assigned_bde']

    def get_lead_count(self, obj):
        return obj.leads.filter(is_active=True).exclude(lead_status__iexact='DUPLICATE').count()

    def get_cost_per_lead(self, obj):
        count = self.get_lead_count(obj)
        if count > 0 and obj.budget > 0:
            return round(obj.budget / count, 2)
        return 0

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username
        return None

    def get_webhook_url(self, obj):
        if not obj.secret_token:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(f'/api/crm/webhooks/campaign/{obj.secret_token}/lead/')
        return f'/api/crm/webhooks/campaign/{obj.secret_token}/lead/'

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


class LeadTaskItemSerializer(serializers.ModelSerializer):
    lead_name = serializers.SerializerMethodField()
    crm_student_id = serializers.CharField(source='lead.crm_student_id', read_only=True)
    mobile = serializers.CharField(source='lead.mobile', read_only=True)
    email = serializers.CharField(source='lead.email', read_only=True)
    lead_status = serializers.CharField(source='lead.lead_status', read_only=True)
    program_name = serializers.SerializerMethodField()
    course_name = serializers.SerializerMethodField()
    owner_name = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()
    completed_by_name = serializers.SerializerMethodField()
    last_interaction = serializers.SerializerMethodField()
    recent_interactions = serializers.SerializerMethodField()

    class Meta:
        model = LeadTaskItem
        fields = [
            'id', 'task', 'lead', 'lead_name', 'crm_student_id', 'mobile', 'email',
            'lead_status', 'program_name', 'course_name', 'owner_name',
            'assigned_to', 'assigned_to_name',
            'is_completed', 'completed_at', 'completed_by', 'completed_by_name',
            'notes', 'created_at', 'updated_at', 'last_interaction', 'recent_interactions'
        ]
        read_only_fields = ['id', 'task', 'created_at', 'updated_at']

    def get_lead_name(self, obj):
        if obj.lead:
            name = f"{obj.lead.first_name or ''} {obj.lead.last_name or ''}".strip()
            return name or f"Lead #{obj.lead.id}"
        return "Unknown Lead"

    def get_program_name(self, obj):
        if obj.lead and obj.lead.program_type:
            return obj.lead.program_type.name
        return None

    def get_course_name(self, obj):
        if obj.lead and obj.lead.course:
            return obj.lead.course.name
        return None

    def get_owner_name(self, obj):
        if obj.lead and obj.lead.assigned_to:
            return f"{obj.lead.assigned_to.first_name} {obj.lead.assigned_to.last_name}".strip() or obj.lead.assigned_to.username
        return "Unassigned"

    def get_assigned_to_name(self, obj):
        assignee = obj.assigned_to or (obj.task.assigned_to if obj.task else None)
        if assignee:
            return f"{assignee.first_name} {assignee.last_name}".strip() or assignee.username
        return "Unassigned"

    def get_completed_by_name(self, obj):
        if obj.completed_by:
            return f"{obj.completed_by.first_name} {obj.completed_by.last_name}".strip() or obj.completed_by.username
        return None

    def get_last_interaction(self, obj):
        if not obj.lead:
            return None
        last = obj.lead.crm_interactions.order_by('-date').first()
        if not last:
            return None
        return {
            'interaction_type': last.interaction_type,
            'date': last.date,
            'notes': last.notes,
            'call_status': last.call_status,
            'call_duration': last.call_duration
        }

    def get_recent_interactions(self, obj):
        if not obj.lead:
            return []
        interactions = obj.lead.crm_interactions.order_by('-date')[:5]
        return [
            {
                'id': i.id,
                'interaction_type': i.interaction_type,
                'date': i.date,
                'notes': i.notes,
                'call_status': i.call_status,
                'call_duration': i.call_duration,
                'author_name': f"{i.author.first_name} {i.author.last_name}".strip() if i.author else "System"
            }
            for i in interactions
        ]


class LeadTaskAssignmentHistorySerializer(serializers.ModelSerializer):
    previous_assignee_name = serializers.SerializerMethodField()
    new_assignee_name = serializers.SerializerMethodField()
    reassigned_by_name = serializers.SerializerMethodField()
    lead_name = serializers.SerializerMethodField()

    class Meta:
        model = LeadTaskAssignmentHistory
        fields = [
            'id', 'task', 'item', 'lead_name',
            'previous_assignee', 'previous_assignee_name',
            'new_assignee', 'new_assignee_name',
            'reassigned_by', 'reassigned_by_name',
            'reassigned_at', 'notes'
        ]
        read_only_fields = fields

    def get_previous_assignee_name(self, obj):
        if obj.previous_assignee:
            return f"{obj.previous_assignee.first_name} {obj.previous_assignee.last_name}".strip() or obj.previous_assignee.username
        return "None"

    def get_new_assignee_name(self, obj):
        if obj.new_assignee:
            return f"{obj.new_assignee.first_name} {obj.new_assignee.last_name}".strip() or obj.new_assignee.username
        return ""

    def get_reassigned_by_name(self, obj):
        if obj.reassigned_by:
            return f"{obj.reassigned_by.first_name} {obj.reassigned_by.last_name}".strip() or obj.reassigned_by.username
        return ""

    def get_lead_name(self, obj):
        if obj.item and obj.item.lead:
            return f"{obj.item.lead.first_name or ''} {obj.item.lead.last_name or ''}".strip() or f"Lead #{obj.item.lead_id}"
        return None


class LeadTaskListSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()
    assigned_bdes = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    total_leads = serializers.IntegerField(read_only=True)
    completed_leads = serializers.IntegerField(read_only=True)
    progress_percent = serializers.IntegerField(read_only=True)
    my_leads_count = serializers.SerializerMethodField()
    my_completed_leads = serializers.SerializerMethodField()
    my_progress_percent = serializers.SerializerMethodField()

    class Meta:
        model = LeadTask
        fields = [
            'id', 'title', 'assigned_to', 'assigned_to_name', 'assigned_bdes',
            'created_by', 'created_by_name', 'status',
            'total_leads', 'completed_leads', 'progress_percent',
            'my_leads_count', 'my_completed_leads', 'my_progress_percent',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']

    def get_assigned_bdes(self, obj):
        bdes = list(obj.assigned_bdes.all())
        if not bdes and obj.assigned_to:
            bdes = [obj.assigned_to]
        return [
            {
                'id': u.id,
                'name': f"{u.first_name} {u.last_name}".strip() or u.username,
                'username': u.username
            }
            for u in bdes
        ]

    def get_assigned_to_name(self, obj):
        bdes = list(obj.assigned_bdes.all())
        if bdes:
            names = [f"{u.first_name} {u.last_name}".strip() or u.username for u in bdes]
            return ", ".join(names)
        if obj.assigned_to:
            return f"{obj.assigned_to.first_name} {obj.assigned_to.last_name}".strip() or obj.assigned_to.username
        return "Unassigned"

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username
        return ""

    def get_my_leads_count(self, obj):
        req = self.context.get('request')
        user = req.user if req else None
        if user and user.is_authenticated:
            from .utils import check_is_sales_manager
            if not check_is_sales_manager(user):
                from django.db.models import Q
                return obj.items.filter(Q(assigned_to=user) | Q(assigned_to__isnull=True, task__assigned_to=user)).count()
        return obj.total_leads

    def get_my_completed_leads(self, obj):
        req = self.context.get('request')
        user = req.user if req else None
        if user and user.is_authenticated:
            from .utils import check_is_sales_manager
            if not check_is_sales_manager(user):
                from django.db.models import Q
                return obj.items.filter(Q(assigned_to=user) | Q(assigned_to__isnull=True, task__assigned_to=user), is_completed=True).count()
        return obj.completed_leads

    def get_my_progress_percent(self, obj):
        total = self.get_my_leads_count(obj)
        if total == 0:
            return 0
        completed = self.get_my_completed_leads(obj)
        return int((completed / total) * 100)


class LeadTaskDetailSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()
    assigned_bdes = serializers.SerializerMethodField()
    bde_progress = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    total_leads = serializers.IntegerField(read_only=True)
    completed_leads = serializers.IntegerField(read_only=True)
    progress_percent = serializers.IntegerField(read_only=True)
    items = serializers.SerializerMethodField()
    assignment_history = LeadTaskAssignmentHistorySerializer(many=True, read_only=True)

    class Meta:
        model = LeadTask
        fields = [
            'id', 'title', 'assigned_to', 'assigned_to_name', 'assigned_bdes', 'bde_progress',
            'created_by', 'created_by_name', 'status',
            'total_leads', 'completed_leads', 'progress_percent',
            'created_at', 'updated_at',
            'items', 'assignment_history'
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']

    def get_assigned_bdes(self, obj):
        bdes = list(obj.assigned_bdes.all())
        if not bdes and obj.assigned_to:
            bdes = [obj.assigned_to]
        return [
            {
                'id': u.id,
                'name': f"{u.first_name} {u.last_name}".strip() or u.username,
                'username': u.username
            }
            for u in bdes
        ]

    def get_assigned_to_name(self, obj):
        bdes = list(obj.assigned_bdes.all())
        if bdes:
            names = [f"{u.first_name} {u.last_name}".strip() or u.username for u in bdes]
            return ", ".join(names)
        if obj.assigned_to:
            return f"{obj.assigned_to.first_name} {obj.assigned_to.last_name}".strip() or obj.assigned_to.username
        return "Unassigned"

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username
        return ""

    def get_bde_progress(self, obj):
        bdes = list(obj.assigned_bdes.all())
        if not bdes and obj.assigned_to:
            bdes = [obj.assigned_to]
        result = []
        for bde in bdes:
            from django.db.models import Q
            items = obj.items.filter(Q(assigned_to=bde) | Q(assigned_to__isnull=True, task__assigned_to=bde))
            total = items.count()
            completed = items.filter(is_completed=True).count()
            percent = int((completed / total) * 100) if total > 0 else 0
            result.append({
                'bde_id': bde.id,
                'bde_name': f"{bde.first_name} {bde.last_name}".strip() or bde.username,
                'total_leads': total,
                'completed_leads': completed,
                'progress_percent': percent
            })
        return result

    def get_items(self, obj):
        request = self.context.get('request')
        user = request.user if request else None
        from .utils import check_is_sales_manager
        items_qs = obj.items.all().select_related('lead', 'lead__program_type', 'lead__course', 'lead__assigned_to', 'completed_by', 'assigned_to')
        if user and user.is_authenticated and not check_is_sales_manager(user):
            from django.db.models import Q
            items_qs = items_qs.filter(Q(assigned_to=user) | Q(assigned_to__isnull=True, task__assigned_to=user))
        return LeadTaskItemSerializer(items_qs, many=True, context=self.context).data
