from rest_framework import viewsets, permissions, status, serializers
from rest_framework.views import APIView
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Sum
import traceback
from core.models import Student, Program, Transaction
from .models import PipelineStage, LeadInteraction, Campaign, WebhookEndpoint, WebhookLog, Task
from .serializers import PipelineStageSerializer, LeadInteractionSerializer, CampaignSerializer, TaskSerializer

User = get_user_model()

class DashboardStatsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from django.db.models import Count
        
        students = Student.objects.filter(is_active=True)
        total_leads = students.count()
        
        # Assignment metrics
        unassigned_leads = students.filter(assigned_to__isnull=True).count()
        assigned_leads = total_leads - unassigned_leads
        
        # Contacted vs Pending
        contacted_leads = students.filter(crm_interactions__isnull=False).distinct().count()
        pending_leads = total_leads - contacted_leads
        
        # Pipeline Stages Breakdown
        pipeline_stages_data = []
        standard_mapping = {
            'NEW': 'New Lead',
            'FOLLOW_UP': 'Follow-up',
            'PAYMENT_PENDING': 'Payment Pending',
            'ENROLLED': 'Enrolled',
            'DROPPED': 'Dropped'
        }
        status_counts = students.values('lead_status').annotate(count=Count('id'))
        dynamic_stages = {str(stage.id): stage.name for stage in PipelineStage.objects.all()}
        
        for item in status_counts:
            status_val = str(item['lead_status'])
            count = item['count']
            if status_val in standard_mapping:
                name = standard_mapping[status_val]
            elif status_val in dynamic_stages:
                name = dynamic_stages[status_val]
            else:
                name = status_val
                
            pipeline_stages_data.append({
                "id": status_val,
                "name": name,
                "count": count
            })
            
        # Leaderboard
        sales_reps = User.objects.filter(role='SALES')
        leaderboard = []
        for rep in sales_reps:
            rep_leads = students.filter(assigned_to=rep).count()
            rep_contacted = students.filter(assigned_to=rep, crm_interactions__isnull=False).distinct().count()
            if rep_leads > 0:
                leaderboard.append({
                    "id": rep.id,
                    "name": rep.get_full_name() or rep.username,
                    "assigned": rep_leads,
                    "contacted": rep_contacted
                })
        leaderboard.sort(key=lambda x: x['assigned'], reverse=True)
        
        revenue_agg = Transaction.objects.aggregate(total_revenue=Sum('amount'))
        revenue = revenue_agg.get('total_revenue') or 0
        
        return Response({
            "total_leads": total_leads,
            "unassigned_leads": unassigned_leads,
            "assigned_leads": assigned_leads,
            "contacted_leads": contacted_leads,
            "pending_leads": pending_leads,
            "pipeline_stages": pipeline_stages_data,
            "leaderboard": leaderboard,
            "revenue": revenue
        })

class WebhookEndpointSerializer(serializers.ModelSerializer):
    webhook_url = serializers.SerializerMethodField()

    class Meta:
        model = WebhookEndpoint
        fields = ['id', 'name', 'secret_token', 'is_active', 'created_at', 'webhook_url']
        read_only_fields = ['secret_token', 'created_at']

    def get_webhook_url(self, obj):
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(f'/api/crm/webhooks/{obj.secret_token}/lead/')
        return f"/api/crm/webhooks/{obj.secret_token}/lead/"

class WebhookEndpointViewSet(viewsets.ModelViewSet):
    queryset = WebhookEndpoint.objects.all()
    serializer_class = WebhookEndpointSerializer
    permission_classes = [permissions.IsAuthenticated]

class SalesUserListView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        users = User.objects.filter(role='SALES')
        data = [{'id': u.id, 'name': u.get_full_name() or u.username} for u in users]
        return Response(data)

class PipelineStageViewSet(viewsets.ModelViewSet):
    queryset = PipelineStage.objects.all()
    serializer_class = PipelineStageSerializer
    permission_classes = [permissions.IsAuthenticated]

class LeadInteractionViewSet(viewsets.ModelViewSet):
    serializer_class = LeadInteractionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = LeadInteraction.objects.all()
        student_id = self.request.query_params.get('student_id', None)
        if student_id is not None:
            queryset = queryset.filter(student_id=student_id)
        return queryset

    def perform_create(self, serializer):
        interaction = serializer.save(author=self.request.user)
        
        pipeline_status = self.request.data.get('pipeline_status')
        if pipeline_status:
            interaction.student.lead_status = pipeline_status
            interaction.student.save()
            
        next_followup_date = self.request.data.get('next_followup_date')
        if next_followup_date:
            Task.objects.create(
                title=f"Follow-up: {interaction.student.first_name} {interaction.student.last_name}",
                student=interaction.student,
                assigned_to=self.request.user,
                task_type='CALL',
                status='PENDING',
                due_date=next_followup_date,
                notes=f"Follow-up from previous interaction."
            )

class CampaignViewSet(viewsets.ModelViewSet):
    queryset = Campaign.objects.all()
    serializer_class = CampaignSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

from django.shortcuts import get_object_or_404

class BDEReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, user_id):
        bde = get_object_or_404(User, id=user_id, role='SALES')
        
        leads = Student.objects.filter(assigned_to=bde).order_by('-id')
        leads_data = []
        for lead in leads:
            leads_data.append({
                'id': lead.id,
                'name': f"{lead.first_name} {lead.last_name}",
                'crm_id': lead.crm_student_id,
                'status': lead.lead_status,
                'mobile': lead.mobile
            })

        interactions = LeadInteraction.objects.filter(author=bde).select_related('student').order_by('-date')
        timeline = []
        for inter in interactions:
            timeline.append({
                'id': inter.id,
                'student_name': f"{inter.student.first_name} {inter.student.last_name}",
                'student_id': inter.student.id,
                'type': inter.interaction_type,
                'notes': inter.notes,
                'date': inter.date,
                'audio_url': request.build_absolute_uri(inter.audio_recording.url) if inter.audio_recording else None
            })

        metrics = {
            'total_assigned': leads.count(),
            'total_interactions': interactions.count(),
            'pending_tasks': Task.objects.filter(assigned_to=bde, status='PENDING').count()
        }

        return Response({
            'bde': {'id': bde.id, 'name': bde.get_full_name() or bde.username, 'email': bde.email},
            'metrics': metrics,
            'leads': leads_data,
            'timeline': timeline
        })

class TaskViewSet(viewsets.ModelViewSet):
    queryset = Task.objects.all()
    serializer_class = TaskSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        student_id = self.request.query_params.get('student_id', None)
        status_param = self.request.query_params.get('status', None)
        
        if student_id:
            queryset = queryset.filter(student_id=student_id)
        if status_param:
            queryset = queryset.filter(status=status_param)
            
        return queryset

class WebhookReceiveView(APIView):
    permission_classes = [permissions.AllowAny] # Authenticated via secret_token in URL

    def post(self, request, secret_token):
        try:
            endpoint = WebhookEndpoint.objects.get(secret_token=secret_token, is_active=True)
        except WebhookEndpoint.DoesNotExist:
            return Response({"error": "Invalid or inactive webhook token."}, status=status.HTTP_401_UNAUTHORIZED)
        
        payload = request.data
        try:
            with transaction.atomic():
                # Extract fields with safe fallbacks
                first_name = payload.get('first_name') or payload.get('name', 'Unknown')
                last_name = payload.get('last_name', '')
                email = payload.get('email', '')
                mobile = payload.get('mobile') or payload.get('phone', '')
                campaign_id = payload.get('campaign_id')
                program_id = payload.get('program_id')

                # Create or get User
                username = email if email else f"lead_{mobile}"
                if not username:
                    raise ValueError("At least email or mobile is required to create a lead.")
                
                if not email:
                    email = f"{username}@webhook.temp"
                
                user, created = User.objects.get_or_create(
                    username=username,
                    defaults={'email': email, 'role': 'STUDENT'}
                )
                if created:
                    user.set_password('welcome123')
                    user.save()

                # Generate CRM ID
                count = Student.objects.filter(crm_student_id__startswith="NATYA-").count() + 1
                crm_id = f"NATYA-{count:04d}"

                # Assign Program (fallback to first available)
                program = None
                if program_id:
                    program = Program.objects.filter(id=program_id).first()
                if not program:
                    program = Program.objects.first()

                # Assign Campaign if valid
                campaign = None
                if campaign_id:
                    campaign = Campaign.objects.filter(id=campaign_id).first()

                # Create Student Lead
                student = Student.objects.create(
                    user=user,
                    crm_student_id=crm_id,
                    first_name=first_name,
                    last_name=last_name,
                    email=email if "@webhook.temp" not in email else '',
                    mobile=mobile,
                    program_type=program,
                    campaign=campaign,
                    is_active=True
                )

                # Log Success
                WebhookLog.objects.create(
                    endpoint=endpoint,
                    payload=payload,
                    status='SUCCESS'
                )
                
                return Response({
                    "message": "Lead created successfully.",
                    "student_id": student.id,
                    "crm_id": student.crm_student_id
                }, status=status.HTTP_201_CREATED)

        except Exception as e:
            # Log Failure
            error_msg = str(e) + "\n" + traceback.format_exc()
            WebhookLog.objects.create(
                endpoint=endpoint,
                payload=payload,
                status='FAILED',
                error_message=error_msg
            )
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
