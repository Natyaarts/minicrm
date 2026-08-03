from rest_framework import viewsets, permissions, status, serializers
from rest_framework.decorators import action
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

def format_duration_seconds(seconds):
    if not seconds or seconds <= 0:
        return "0s"
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    parts = []
    if hours > 0:
        parts.append(f"{hours}h")
    if minutes > 0 or hours > 0:
        parts.append(f"{minutes}m")
    parts.append(f"{secs}s")
    return " ".join(parts)

class DashboardStatsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from django.db.models import Count, Sum, Q
        from django.utils.dateparse import parse_date
        import datetime
        from datetime import timedelta
        from django.utils import timezone
        
        students = Student.objects.filter(is_active=True)
        
        # Super Admin / Admin section filter (optional, if they want to drill down)
        section_filter = request.query_params.get('sales_section')
        if section_filter and request.user.role in ['SUPER_ADMIN', 'ADMIN']:
            students = students.filter(Q(sales_section=section_filter) | Q(assigned_to__sales_section=section_filter))

        if request.user.role in ['SALES', 'SALES_HEAD', 'SALES_MANAGER', 'MANAGER', 'SALES_LEAD']:
            user_section = getattr(request.user, 'sales_section', 'BOTH')
            if user_section and user_section != 'BOTH':
                students = students.filter(
                    Q(assigned_to__sales_section=user_section) |
                    Q(sales_section=user_section)
                )
                
            is_sales_manager = False
            if request.user.role in ['SALES_HEAD', 'SALES_MANAGER', 'MANAGER', 'SUPER_ADMIN', 'ADMIN']:
                is_sales_manager = True
            elif getattr(request.user, 'is_manager', False):
                is_sales_manager = True
            elif hasattr(request.user, 'hrms_profile'):
                profile = request.user.hrms_profile
                if profile.subordinates.exists():
                    is_sales_manager = True
                elif profile.designation and any(kw in profile.designation.name.lower() for kw in ['lead', 'manager', 'vp', 'head', 'director']):
                    is_sales_manager = True
            
            if not is_sales_manager:
                students = students.filter(assigned_to=request.user)
        
        assigned_to_param = request.query_params.get('assigned_to')
        if assigned_to_param:
            if assigned_to_param == 'unassigned':
                students = students.filter(assigned_to__isnull=True)
            elif assigned_to_param != 'assigned':
                students = students.filter(assigned_to_id=assigned_to_param)
            else:
                students = students.filter(assigned_to__isnull=False)

        # Date Presets (today, yesterday, this_week, this_month, custom)
        date_preset = request.query_params.get('date_preset')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        today = timezone.now().date()
        if date_preset == 'today':
            start_date = str(today)
            end_date = str(today)
        elif date_preset == 'yesterday':
            yesterday = today - timedelta(days=1)
            start_date = str(yesterday)
            end_date = str(yesterday)
        elif date_preset == 'this_week':
            start_date = str(today - timedelta(days=today.weekday()))
            end_date = str(today)
        elif date_preset == 'this_month':
            start_date = str(today.replace(day=1))
            end_date = str(today)
        
        if start_date:
            parsed_start = parse_date(start_date)
            if parsed_start:
                students = students.filter(Q(created_at__date__gte=parsed_start) | Q(user__date_joined__date__gte=parsed_start))
        
        if end_date:
            parsed_end = parse_date(end_date)
            if parsed_end:
                students = students.filter(Q(created_at__date__lte=parsed_end) | Q(user__date_joined__date__lte=parsed_end))
        
        # Identify converted/enrolled leads to exclude them from active totals
        converted_stages = ['ENROLLED', 'CONVERTED', '4', 'enrolled', 'converted', 'Enrolled', 'Converted']
        try:
            from .models import PipelineStage
            for stage in PipelineStage.objects.filter(name__icontains='convert') | PipelineStage.objects.filter(name__icontains='enroll'):
                converted_stages.append(str(stage.id))
                if stage.name:
                    converted_stages.append(stage.name)
        except Exception:
            pass

        # Converted Leads count
        converted_leads = students.filter(lead_status__in=converted_stages).count()

        # Exclude converted leads from active pool so Total Leads excludes Converted Leads
        active_students = students.exclude(lead_status__in=converted_stages)

        # Active lead totals matching filters (excluding converted)
        total_leads = active_students.count()
        
        # Assignment metrics (excluding converted)
        unassigned_leads = active_students.filter(assigned_to__isnull=True).count()
        assigned_leads = active_students.filter(assigned_to__isnull=False).count()
        
        # Contacted vs Pending (excluding converted)
        contacted_leads = active_students.filter(crm_interactions__isnull=False).distinct().count()
        pending_leads = max(0, total_leads - contacted_leads)
        
        # Leaderboard & Call Duration per Sales Rep
        sales_reps = User.objects.filter(Q(role__in=['SALES', 'SALES_HEAD', 'SALES_MANAGER', 'SALES_LEAD', 'MANAGER']) | Q(assigned_students__isnull=False), is_active=True).distinct()
        if request.user.role in ['SALES', 'SALES_HEAD', 'SALES_MANAGER', 'MANAGER', 'SALES_LEAD']:
            user_section = getattr(request.user, 'sales_section', 'BOTH')
            if user_section and user_section != 'BOTH':
                sales_reps = sales_reps.filter(Q(sales_section=user_section) | Q(sales_section='BOTH'))
            if not is_sales_manager:
                sales_reps = sales_reps.filter(id=request.user.id)
        elif section_filter and request.user.role in ['SUPER_ADMIN', 'ADMIN']:
            sales_reps = sales_reps.filter(Q(sales_section=section_filter) | Q(sales_section='BOTH'))

        # Call Duration Metrics for department calls (strictly matching the sales reps in the leaderboard)
        interactions_qs = LeadInteraction.objects.filter(author__in=sales_reps, interaction_type='CALL')
        if start_date:
            parsed_start = parse_date(start_date)
            if parsed_start:
                interactions_qs = interactions_qs.filter(date__date__gte=parsed_start)
        if end_date:
            parsed_end = parse_date(end_date)
            if parsed_end:
                interactions_qs = interactions_qs.filter(date__date__lte=parsed_end)

        total_call_duration_sec = interactions_qs.aggregate(total_sec=Sum('call_duration'))['total_sec'] or 0
        formatted_total_call_duration = format_duration_seconds(total_call_duration_sec)

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
            
        leaderboard = []
        for rep in sales_reps:
            rep_leads = students.filter(assigned_to=rep).count()
            
            # Filter interactions strictly by author (sales rep) and call date
            rep_interactions = LeadInteraction.objects.filter(author=rep, interaction_type='CALL')
            if start_date:
                parsed_start = parse_date(start_date)
                if parsed_start:
                    rep_interactions = rep_interactions.filter(date__date__gte=parsed_start)
            if end_date:
                parsed_end = parse_date(end_date)
                if parsed_end:
                    rep_interactions = rep_interactions.filter(date__date__lte=parsed_end)
            
            rep_contacted = rep_interactions.values('student').distinct().count()
            rep_duration_sec = rep_interactions.aggregate(total_sec=Sum('call_duration'))['total_sec'] or 0
            rep_call_count = rep_interactions.count()
            
            leaderboard.append({
                "id": rep.id,
                "name": rep.get_full_name() or rep.username,
                "assigned": rep_leads,
                "contacted": rep_contacted,
                "total_calls": rep_call_count,
                "total_call_duration": rep_duration_sec,
                "formatted_call_duration": format_duration_seconds(rep_duration_sec)
            })
        leaderboard.sort(key=lambda x: x['total_call_duration'], reverse=True)
        
        revenue_qs = Transaction.objects.all()
        if start_date:
            parsed_start = parse_date(start_date)
            if parsed_start:
                revenue_qs = revenue_qs.filter(date__date__gte=parsed_start)
        if end_date:
            parsed_end = parse_date(end_date)
            if parsed_end:
                revenue_qs = revenue_qs.filter(date__date__lte=parsed_end)
                
        revenue_agg = revenue_qs.aggregate(total_revenue=Sum('amount'))
        revenue = revenue_agg.get('total_revenue') or 0
        
        return Response({
            "total_leads": total_leads,
            "unassigned_leads": unassigned_leads,
            "assigned_leads": assigned_leads,
            "contacted_leads": contacted_leads,
            "pending_leads": pending_leads,
            "converted_leads": converted_leads,
            "total_call_duration": total_call_duration_sec,
            "formatted_total_call_duration": formatted_total_call_duration,
            "pipeline_stages": pipeline_stages_data,
            "leaderboard": leaderboard,
            "revenue": revenue
        })

class MentorDashboardStatsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.role != 'MENTOR':
            return Response({"error": "Only mentors can access this dashboard"}, status=403)
            
        from core.models import Student, Batch
        from django.db.models import Q
        
        # Get batches where user is primary or secondary mentor
        batches = Batch.objects.filter(Q(primary_mentor=user) | Q(secondary_mentors=user)).distinct()
        
        # Get all students in those batches
        students = Student.objects.filter(batch__in=batches).distinct()
        
        # Calculate stats
        total_students = students.count()
        active_students = students.filter(academic_status='ACTIVE').count()
        on_break_students = students.filter(academic_status='ON_BREAK').count()
        discontinued_students = students.filter(academic_status='DISCONTINUED').count()
        
        # Serialize students for the list view
        from core.serializers import StudentSerializer
        student_data = StudentSerializer(students, many=True).data
        
        return Response({
            "total_students": total_students,
            "active_students": active_students,
            "on_break_students": on_break_students,
            "discontinued_students": discontinued_students,
            "results": student_data
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
        from django.db.models import Q
        users = User.objects.filter(Q(role='SALES') | Q(assigned_students__isnull=False), is_active=True).distinct()
        
        if request.user.role == 'SALES':
            user_section = getattr(request.user, 'sales_section', 'BOTH')
            if user_section != 'BOTH':
                users = users.filter(Q(sales_section=user_section) | Q(sales_section='BOTH'))

        section_filter = request.query_params.get('sales_section')
        if section_filter and request.user.role in ['SUPER_ADMIN', 'ADMIN']:
            users = users.filter(Q(sales_section=section_filter) | Q(sales_section='BOTH'))

        data = [{'id': u.id, 'name': u.get_full_name() or u.username, 'sales_section': getattr(u, 'sales_section', 'BOTH')} for u in users]
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
        print("======== DEBUG INTERACTION UPLOAD ========")
        print("request.data:", self.request.data)
        print("request.FILES:", self.request.FILES)
        print("audio_recording from data:", self.request.data.get('audio_recording'))
        print("audio_recording type:", type(self.request.data.get('audio_recording')))
        print("==========================================")
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
                notes=self.request.data.get('notes', 'Follow-up from previous interaction.')
            )

class CampaignViewSet(viewsets.ModelViewSet):
    queryset = Campaign.objects.all()
    serializer_class = CampaignSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.request.user.role == 'SALES' and getattr(self.request.user, 'sales_section', 'BOTH') != 'BOTH':
            from django.db.models import Q
            queryset = queryset.filter(Q(section=self.request.user.sales_section) | Q(section='BOTH'))
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def bulk_upload(self, request, pk=None):
        import csv
        import io
        
        campaign = self.get_object()
        file = request.FILES.get('file')
        program_id = request.data.get('program_id')
        
        if not file:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)
        
        from core.models import Program
        if program_id:
            default_program = Program.objects.filter(id=program_id).first()
        else:
            default_program = Program.objects.first()
            
        try:
            decoded_file = file.read().decode('utf-8-sig')
            io_string = io.StringIO(decoded_file)
            reader = csv.DictReader(io_string)
            
            leads_created = 0
            for row in reader:
                # Clean up column headers (lowercase, strip whitespace)
                clean_row = {str(k).strip().lower(): v for k, v in row.items() if k}
                
                # Extract Name
                raw_name = clean_row.get('name', clean_row.get('first_name', '')).strip()
                name_parts = raw_name.split(' ', 1)
                first_name = name_parts[0]
                last_name = name_parts[1] if len(name_parts) > 1 else clean_row.get('last_name', '').strip()
                
                email = clean_row.get('email', '').strip()
                mobile = clean_row.get('contact', clean_row.get('mobile', '')).strip()
                place = clean_row.get('place', '').strip()
                tag = clean_row.get('tag', '').strip()
                
                
                if first_name or mobile or email:
                    import uuid
                    base_username = mobile if mobile else email if email else first_name
                    username = f"{base_username}_{str(uuid.uuid4())[:8]}" if base_username else f"lead_{str(uuid.uuid4())[:8]}"
                    
                    User = get_user_model()
                    user = User.objects.create_user(
                        username=username,
                        email=email,
                        first_name=first_name,
                        last_name=last_name,
                        role='STUDENT',
                        password='Password@123'
                    )
                    
                    # Generate unique CRM Student ID
                    import uuid
                    crm_id = f"LEAD-{str(uuid.uuid4())[:8].upper()}"
                    
                    Student.objects.create(
                        user=user,
                        crm_student_id=crm_id,
                        first_name=first_name,
                        last_name=last_name,
                        email=email,
                        mobile=mobile,
                        perm_city=place,
                        lms_course_names=tag,
                        campaign=campaign,
                        sales_section=campaign.section,
                        program_type=default_program,
                        lead_status='2' # Assuming '2' is NEW status, or we can look it up. Let's look it up.
                    )
                    leads_created += 1
                    
            # Actually, let's make sure lead_status uses the pipeline stage ID for NEW
            stage = PipelineStage.objects.filter(name__iexact='New').first()
            stage_id = str(stage.id) if stage else '2'
            Student.objects.filter(campaign=campaign, lead_status='2').update(lead_status=stage_id)

            return Response({'message': f'Successfully uploaded {leads_created} leads'})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

from django.shortcuts import get_object_or_404

import re

def parse_duration_sec(call_duration, notes):
    if call_duration and call_duration > 0:
        return call_duration
    if notes:
        match = re.search(r'(?:Duration:\s*)?(\d+):(\d{2})(?::(\d{2}))?', str(notes), re.IGNORECASE)
        if match:
            if match.group(3):
                h, m, s = int(match.group(1)), int(match.group(2)), int(match.group(3))
                return h * 3600 + m * 60 + s
            else:
                m, s = int(match.group(1)), int(match.group(2))
                return m * 60 + s
    return 0

class BDEReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, user_id):
        from django.utils.dateparse import parse_date
        from datetime import timedelta
        from django.utils import timezone
        
        bde = get_object_or_404(User, id=user_id)
        date_preset = request.query_params.get('date_preset')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        sort_by = request.query_params.get('sort_by', 'newest')

        today = timezone.now().date()
        if date_preset == 'today':
            start_date = str(today)
            end_date = str(today)
        elif date_preset == 'yesterday':
            yesterday = today - timedelta(days=1)
            start_date = str(yesterday)
            end_date = str(yesterday)
        elif date_preset == 'this_week':
            start_date = str(today - timedelta(days=today.weekday()))
            end_date = str(today)
        elif date_preset == 'this_month':
            start_date = str(today.replace(day=1))
            end_date = str(today)
        
        leads = Student.objects.filter(assigned_to=bde, is_active=True)
        if start_date:
            parsed_start = parse_date(start_date)
            if parsed_start:
                leads = leads.filter(created_at__date__gte=parsed_start)
        if end_date:
            parsed_end = parse_date(end_date)
            if parsed_end:
                leads = leads.filter(created_at__date__lte=parsed_end)

        interactions = LeadInteraction.objects.filter(author=bde).select_related('student')
        if start_date:
            parsed_start = parse_date(start_date)
            if parsed_start:
                interactions = interactions.filter(date__date__gte=parsed_start)
        if end_date:
            parsed_end = parse_date(end_date)
            if parsed_end:
                interactions = interactions.filter(date__date__lte=parsed_end)
                
        if sort_by == 'oldest':
            interactions = interactions.order_by('date')
        elif sort_by == 'longest_call':
            interactions = interactions.filter(interaction_type='CALL').order_by('-call_duration', '-date')
        else:
            interactions = interactions.order_by('-date')
        
        page = request.query_params.get('page')
        has_more = False
        if page:
            try:
                page_num = int(page)
            except ValueError:
                page_num = 1
            limit = 20
            offset = (page_num - 1) * limit
            interactions_slice = interactions[offset:offset + limit + 1]
            if len(interactions_slice) > limit:
                has_more = True
                interactions = interactions_slice[:limit]
            else:
                interactions = interactions_slice
        
        timeline = []
        for inter in interactions:
            dur_sec = parse_duration_sec(inter.call_duration, inter.notes)
            timeline.append({
                'id': inter.id,
                'student_name': f"{inter.student.first_name} {inter.student.last_name}" if inter.student else 'Unknown',
                'student_id': inter.student.id if inter.student else None,
                'student_phone': inter.student.mobile if inter.student else '',
                'student_email': inter.student.email if inter.student else '',
                'student_crm_id': inter.student.crm_student_id if inter.student else '',
                'student_status': inter.student.lead_status if inter.student else '',
                'type': inter.interaction_type,
                'call_duration': dur_sec,
                'formatted_call_duration': format_duration_seconds(dur_sec),
                'call_direction': inter.call_direction,
                'call_status': inter.call_status,
                'notes': inter.notes,
                'date': inter.date,
                'audio_url': request.build_absolute_uri(inter.audio_recording.url) if inter.audio_recording else None
            })

        pending_tasks = Task.objects.filter(assigned_to=bde, status='PENDING')
        if start_date:
            parsed_start = parse_date(start_date)
            if parsed_start:
                pending_tasks = pending_tasks.filter(created_at__date__gte=parsed_start)
        if end_date:
            parsed_end = parse_date(end_date)
            if parsed_end:
                pending_tasks = pending_tasks.filter(created_at__date__lte=parsed_end)

        calls_qs = LeadInteraction.objects.filter(author=bde, interaction_type='CALL')
        if start_date:
            parsed_start = parse_date(start_date)
            if parsed_start:
                calls_qs = calls_qs.filter(date__date__gte=parsed_start)
        if end_date:
            parsed_end = parse_date(end_date)
            if parsed_end:
                calls_qs = calls_qs.filter(date__date__lte=parsed_end)

        total_bde_duration_sec = sum(parse_duration_sec(c.call_duration, c.notes) for c in calls_qs)

        metrics = {
            'total_assigned': leads.count(),
            'total_interactions': calls_qs.count(),
            'total_call_duration': total_bde_duration_sec,
            'formatted_total_call_duration': format_duration_seconds(total_bde_duration_sec),
            'pending_tasks': pending_tasks.count()
        }

        return Response({
            'bde': {'id': bde.id, 'name': bde.get_full_name() or bde.username, 'email': bde.email},
            'metrics': metrics,
            'timeline': timeline,
            'has_more': has_more
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
                        student.sales_section = campaign.section
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
                        sales_section=campaign.section if campaign else 'BOTH',
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



        page = int(request.query_params.get('page', 1))
        page_size = 20
        start = (page - 1) * page_size
        end = start + page_size
        
        history_qs = interactions.select_related('author', 'student').order_by('-date')
        total_history = history_qs.count()

        history = []
        for inter in history_qs[start:end]:
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
            'total_history': total_history,
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



class MarketingDashboardView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from django.db.models import Count, Sum
        from datetime import datetime, timedelta
        from django.utils import timezone
        
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')

        # Summary Stats
        campaigns = Campaign.objects.all()
        students = Student.objects.filter(is_active=True, campaign__isnull=False)

        if start_date_str:
            try:
                start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
                campaigns = campaigns.filter(created_at__date__gte=start_date)
                students = students.filter(user__date_joined__date__gte=start_date)
            except ValueError:
                pass
        
        if end_date_str:
            try:
                end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
                campaigns = campaigns.filter(created_at__date__lte=end_date)
                students = students.filter(user__date_joined__date__lte=end_date)
            except ValueError:
                pass

        # Dynamically determine all converted/enrolled pipeline stage values
        converted_stage_values = set(['ENROLLED', 'CONVERTED', '4', 'converted', 'enrolled', 'Converted', 'Enrolled', 'POSITIVE', 'positive'])
        try:
            from .models import PipelineStage
            for stage in PipelineStage.objects.all():
                s_name = (stage.name or '').lower()
                if any(kw in s_name for kw in ['convert', 'enroll', 'positive', 'paid', 'join']):
                    converted_stage_values.add(str(stage.id))
                    converted_stage_values.add(stage.name)
                    converted_stage_values.add(stage.name.lower())
                    converted_stage_values.add(stage.name.upper())
        except Exception:
            pass
        converted_stages_list = list(converted_stage_values)

        total_spend = campaigns.aggregate(total=Sum('budget'))['total'] or 0
        total_leads = students.count()
        total_converted = students.filter(lead_status__in=converted_stages_list).count()

        # Chart Data
        from django.db.models.functions import TruncDate
        
        daily_leads_qs = students
        if not start_date_str:
            # Default to 30 days if no start date provided
            thirty_days_ago = timezone.now().date() - timedelta(days=30)
            daily_leads_qs = students.filter(user__date_joined__date__gte=thirty_days_ago)
            
        daily_leads = daily_leads_qs.annotate(date=TruncDate('user__date_joined')).values('date').annotate(count=Count('id')).order_by('date')
        
        chart_data = []
        for d in daily_leads:
            chart_data.append({
                'date': str(d['date']),
                'leads': d['count']
            })

        # Sales Team Report
        sales_reps = User.objects.filter(role='SALES')
        if request.user.role == 'SALES' and getattr(request.user, 'sales_section', 'BOTH') != 'BOTH':
            from django.db.models import Q
            sales_reps = sales_reps.filter(Q(sales_section=request.user.sales_section) | Q(sales_section='BOTH'))

        sales_report = []
        for rep in sales_reps:
            rep_leads = Student.objects.filter(assigned_to=rep)
            if start_date_str:
                try:
                    p_start = datetime.strptime(start_date_str, '%Y-%m-%d').date()
                    rep_leads = rep_leads.filter(Q(created_at__date__gte=p_start) | Q(user__date_joined__date__gte=p_start))
                except ValueError:
                    pass
            if end_date_str:
                try:
                    p_end = datetime.strptime(end_date_str, '%Y-%m-%d').date()
                    rep_leads = rep_leads.filter(Q(created_at__date__lte=p_end) | Q(user__date_joined__date__lte=p_end))
                except ValueError:
                    pass

            assigned = rep_leads.count()
            contacted = rep_leads.filter(crm_interactions__isnull=False).distinct().count()
            converted = rep_leads.filter(lead_status__in=converted_stages_list).count()
            conversion_rate = round((converted / assigned * 100), 2) if assigned > 0 else 0
            
            sales_report.append({
                'id': rep.id,
                'name': rep.get_full_name() or rep.username,
                'assigned': assigned,
                'contacted': contacted,
                'converted': converted,
                'conversion_rate': conversion_rate
            })

        return Response({
            'summary': {
                'total_spend': total_spend,
                'total_leads': total_leads,
                'total_converted': total_converted
            },
            'chart_data': chart_data,
            'sales_report': sales_report
        })

class BulkAssignLeadsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        lead_ids = request.data.get('lead_ids', [])
        sales_user_id = request.data.get('sales_user_id')

        if not lead_ids or not sales_user_id:
            return Response({'error': 'lead_ids and sales_user_id are required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            sales_user = User.objects.get(id=sales_user_id, role='SALES')
            students = Student.objects.filter(id__in=lead_ids)
            updated = students.update(assigned_to=sales_user)
            return Response({'message': f'Successfully assigned {updated} leads to {sales_user.username}'})
        except User.DoesNotExist:
            return Response({'error': 'Sales user not found'}, status=status.HTTP_404_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
