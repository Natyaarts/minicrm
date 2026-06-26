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

class BulkConvertAllView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        stage = PipelineStage.objects.filter(name__iexact='CONVERTED').first()
        if not stage:
            stage = PipelineStage.objects.filter(name__icontains='convert').first()
        if not stage:
            return Response({"error": "No converted stage found"}, status=status.HTTP_400_BAD_REQUEST)
        
        students = Student.objects.all()
        count = students.count()
        students.update(lead_status=str(stage.id))
        
        return Response({"message": f"Successfully marked {count} leads as CONVERTED!", "stage_id": stage.id}, status=status.HTTP_200_OK)

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
        
        # Manually update new fields if provided
        call_duration = self.request.data.get('call_duration')
        if call_duration is not None:
            try:
                interaction.call_duration = int(call_duration)
            except ValueError:
                pass
        
        call_direction = self.request.data.get('call_direction')
        if call_direction in ['INCOMING', 'OUTGOING']:
            interaction.call_direction = call_direction
            
        call_status = self.request.data.get('call_status')
        if call_status in ['CONNECTED', 'MISSED', 'REJECTED', 'UNANSWERED']:
            interaction.call_status = call_status
            
        interaction.save()

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
                'student_phone': inter.student.mobile,
                'student_email': inter.student.email,
                'student_crm_id': inter.student.crm_student_id,
                'student_status': inter.student.lead_status,
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
        assigned_to_me = self.request.query_params.get('assigned_to_me', None)
        due_date_after = self.request.query_params.get('due_date_after', None)
        ordering = self.request.query_params.get('ordering', 'due_date')

        if student_id:
            queryset = queryset.filter(student_id=student_id)
        if status_param:
            queryset = queryset.filter(status=status_param)
        if assigned_to_me == 'true':
            queryset = queryset.filter(assigned_to=self.request.user)
        if due_date_after:
            queryset = queryset.filter(due_date__date__gte=due_date_after)

        # Safe ordering
        allowed_orderings = ['due_date', '-due_date', 'created_at', '-created_at']
        if ordering in allowed_orderings:
            queryset = queryset.order_by(ordering)

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

                # Check if Student profile already exists for this user
                student = Student.objects.filter(user=user).first()
                if student:
                    # Lead already exists! Update the lead information instead of crashing.
                    student.first_name = first_name
                    student.last_name = last_name
                    if email and "@webhook.temp" not in email:
                        student.email = email
                    if mobile:
                        student.mobile = mobile
                    if program:
                        student.program_type = program
                    if campaign:
                        student.campaign = campaign
                    student.save()
                    
                    # Log system interaction
                    LeadInteraction.objects.create(
                        student=student,
                        author=None,
                        interaction_type='NOTE',
                        notes=f"Re-engaged lead from webhook: {endpoint.name}. Campaign: {campaign.name if campaign else 'N/A'}."
                    )
                else:
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




from django.db.models import Sum, Count, Q
from django.utils.dateparse import parse_date
from datetime import timedelta



class CallAnalyticsView(APIView):

    permission_classes = [permissions.IsAuthenticated]



    def get(self, request):

        interactions = LeadInteraction.objects.filter(interaction_type='CALL')

        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        
        if start_date_str:
            start_date = parse_date(start_date_str)
            if start_date:
                interactions = interactions.filter(date__date__gte=start_date)
        if end_date_str:
            end_date = parse_date(end_date_str)
            if end_date:
                interactions = interactions.filter(date__date__lte=end_date)
                
        employee_id = request.query_params.get('employee_id')
        if employee_id:
            interactions = interactions.filter(author_id=employee_id)
            
        direction = request.query_params.get('direction')
        if direction:
            interactions = interactions.filter(call_direction=direction)
            
        status = request.query_params.get('status')
        if status:
            interactions = interactions.filter(call_status=status)

        total_incoming = interactions.filter(call_direction='INCOMING').count()

        total_outgoing = interactions.filter(call_direction='OUTGOING').count()

        

        missed = interactions.filter(call_status__in=['MISSED', 'UNANSWERED']).count()

        rejected = interactions.filter(call_status='REJECTED').count()



        duration_incoming = interactions.filter(call_direction='INCOMING').aggregate(Sum('call_duration'))['call_duration__sum'] or 0

        duration_outgoing = interactions.filter(call_direction='OUTGOING').aggregate(Sum('call_duration'))['call_duration__sum'] or 0

        

        total_calls = interactions.count()

        total_duration = duration_incoming + duration_outgoing



        never_attended = missed + rejected

        unique_clients = interactions.values('student').distinct().count()

        connected_calls = interactions.filter(call_status='CONNECTED').count()

        unique_connected_calls = interactions.filter(call_status='CONNECTED').values('student').distinct().count()



        employees = {}

        for inter in interactions.select_related('author'):

            author_id = inter.author.id if inter.author else 0

            if author_id not in employees:

                employees[author_id] = {

                    'id': author_id,

                    'name': f"{inter.author.first_name} {inter.author.last_name}".strip() if inter.author else 'Unknown',

                    'total_calls': 0,

                    'total_duration': 0,

                    'connected_calls': 0,

                    'connected_duration': 0,

                    'unique_clients_set': set(),

                    'unique_connected_set': set()

                }

            

            emp = employees[author_id]

            emp['total_calls'] += 1

            emp['total_duration'] += inter.call_duration

            if inter.student_id:

                emp['unique_clients_set'].add(inter.student_id)

            

            if inter.call_status == 'CONNECTED':

                emp['connected_calls'] += 1

                emp['connected_duration'] += inter.call_duration

                if inter.student_id:

                    emp['unique_connected_set'].add(inter.student_id)



        employee_summary = []

        for i, (k, v) in enumerate(employees.items()):

            avg_duration = round(v['connected_duration'] / v['connected_calls']) if v['connected_calls'] > 0 else 0

            employee_summary.append({

                'sr_no': i + 1,

                'id': v['id'],

                'name': v['name'] or 'Unknown',

                'total_calls': v['total_calls'],

                'total_duration': v['total_duration'],

                'connected_calls': v['connected_calls'],

                'connected_duration': v['connected_duration'],

                'avg_duration': avg_duration,

                'unique_clients': len(v['unique_clients_set']),

                'unique_connected': len(v['unique_connected_set'])

            })



        history = []
        for inter in interactions.select_related('author', 'student').order_by('-date')[:50]:
            history.append({
                'id': inter.id,
                'date': inter.date,
                'employee': f"{inter.author.first_name} {inter.author.last_name}".strip() if inter.author else 'Unknown',
                'client': f"{inter.student.first_name} {inter.student.last_name}".strip() if inter.student else 'Unknown',
                'direction': inter.call_direction,
                'status': inter.call_status,
                'duration': inter.call_duration,
                'recording_url': inter.audio_recording.url if inter.audio_recording else None
            })

        return Response({
            'history': history,
            'summary': {

                'incoming_calls': total_incoming,

                'incoming_duration': duration_incoming,

                'outgoing_calls': total_outgoing,

                'outgoing_duration': duration_outgoing,

                'missed_calls': missed,

                'rejected_calls': rejected,

                'total_calls': total_calls,

                'total_duration': total_duration

            },

            'quick_stats': {

                'never_attended': never_attended,

                'not_pickup': missed,

                'connected': connected_calls,

                'unique_connected': unique_connected_calls,

                'unique_clients': unique_clients,

                'working_hours': total_duration

            },

            'employee_summary': employee_summary

        })

