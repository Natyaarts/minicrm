import logging
import traceback
import uuid
from rest_framework import viewsets, permissions, status, serializers
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Sum
from core.models import Student, Program, Transaction, normalize_phone_number
from .models import PipelineStage, LeadInteraction, Campaign, WebhookEndpoint, WebhookLog, Task, LeadTask, LeadTaskItem, LeadTaskAssignmentHistory
from .serializers import (
    PipelineStageSerializer, LeadInteractionSerializer, CampaignSerializer, TaskSerializer,
    LeadTaskListSerializer, LeadTaskDetailSerializer, LeadTaskItemSerializer, LeadTaskAssignmentHistorySerializer
)
from .utils import (
    normalize_phone_for_matching, match_lead_by_phone, match_agent_by_phone,
    get_converted_stage_values, get_new_stage_values, get_dropped_stage_values,
)
from .services.deduplication import lookup_existing_student, record_reengagement_interaction, normalize_lead_phone, normalize_lead_email, create_duplicate_lead
from .services.assignment import get_next_assigned_rep

logger = logging.getLogger(__name__)

User = get_user_model()
from django.shortcuts import get_object_or_404

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
        try:
            from django.db.models import Count, Sum, Q
            from django.utils.dateparse import parse_date
            import datetime
            from datetime import timedelta
            from django.utils import timezone
            
            students = Student.objects.filter(is_active=True).exclude(lead_status__iexact='DUPLICATE')
            
            # Super Admin / Admin section filter (optional, if they want to drill down)
            section_filter = request.query_params.get('sales_section')
            if section_filter and section_filter.upper() != 'ALL' and request.user.role in ['SUPER_ADMIN', 'ADMIN']:
                students = students.filter(Q(sales_section=section_filter) | Q(assigned_to__sales_section=section_filter))

            if request.user.role in ['SALES', 'SALES_HEAD', 'SALES_MANAGER', 'MANAGER', 'SALES_LEAD']:
                user_section = getattr(request.user, 'sales_section', 'BOTH')
                if user_section and user_section != 'BOTH':
                    students = students.filter(
                        Q(assigned_to__sales_section=user_section) |
                        Q(sales_section=user_section)
                    )
                elif section_filter and section_filter.upper() != 'ALL':
                    students = students.filter(
                        Q(assigned_to__sales_section=section_filter) |
                        Q(sales_section=section_filter)
                    )
                    
                from .utils import check_is_sales_manager
                is_sales_manager = check_is_sales_manager(request.user)
                
                if not is_sales_manager:
                    # STRICT ACCESS CONTROL: Standard SALES rep only sees their own assigned leads
                    students = students.filter(assigned_to=request.user)
                else:
                    assigned_to_param = request.query_params.get('assigned_to')
                    if assigned_to_param:
                        if assigned_to_param == 'unassigned':
                            students = students.filter(assigned_to__isnull=True)
                        elif assigned_to_param != 'assigned':
                            try:
                                students = students.filter(assigned_to_id=int(assigned_to_param))
                            except (ValueError, TypeError):
                                students = students.none()
                        else:
                            students = students.filter(assigned_to__isnull=False)
            elif request.user.role in ['SUPER_ADMIN', 'ADMIN']:
                assigned_to_param = request.query_params.get('assigned_to')
                if assigned_to_param:
                    if assigned_to_param == 'unassigned':
                        students = students.filter(assigned_to__isnull=True)
                    elif assigned_to_param != 'assigned':
                        try:
                            students = students.filter(assigned_to_id=int(assigned_to_param))
                        except (ValueError, TypeError):
                            students = students.none()
                    else:
                        students = students.filter(assigned_to__isnull=False)

            campaign_id = request.query_params.get('campaign_id')
            camp_id_int = None
            if campaign_id:
                try:
                    camp_id_int = int(campaign_id)
                    students = students.filter(campaign_id=camp_id_int)
                except (ValueError, TypeError):
                    camp_id_int = None
                    students = students.none()

            campaign_only = request.query_params.get('campaign_only') == 'true'
            hide_converted = request.query_params.get('hide_converted') == 'true'
            if campaign_only:
                students = students.filter(campaign__isnull=False)

            # Date Presets (today, yesterday, this_week, this_month, last_7_days, last_30_days, last_month, custom)
            date_preset = request.query_params.get('date_preset')
            start_date = request.query_params.get('start_date')
            end_date = request.query_params.get('end_date')
            
            from .utils import resolve_date_preset
            start_date, end_date = resolve_date_preset(date_preset, start_date, end_date)
            
            # Snapshot students BEFORE date filter for total assigned counts in leaderboard
            all_time_students = students
            
            parsed_start = parse_date(start_date) if start_date else None
            parsed_end = parse_date(end_date) if end_date else None

            if parsed_start and parsed_end:
                students = students.filter(
                    Q(created_at__date__gte=parsed_start, created_at__date__lte=parsed_end) |
                    Q(created_at__isnull=True, user__date_joined__date__gte=parsed_start, user__date_joined__date__lte=parsed_end)
                )
            elif parsed_start:
                students = students.filter(
                    Q(created_at__date__gte=parsed_start) |
                    Q(created_at__isnull=True, user__date_joined__date__gte=parsed_start)
                )
            elif parsed_end:
                students = students.filter(
                    Q(created_at__date__lte=parsed_end) |
                    Q(created_at__isnull=True, user__date_joined__date__lte=parsed_end)
                )
            
            # Identify converted and dropped leads to exclude them from active open pipeline totals
            converted_stages = get_converted_stage_values()
            new_stages = get_new_stage_values()
            dropped_stages = get_dropped_stage_values()

            # Active open pipeline leads: exclude converted and dropped leads
            open_students = students.exclude(lead_status__in=converted_stages).exclude(lead_status__in=dropped_stages)

            total_leads = students.count()
            converted_leads = students.filter(lead_status__in=converted_stages).count()
            dropped_leads = students.filter(lead_status__in=dropped_stages).count()

            unassigned_leads = open_students.filter(assigned_to__isnull=True).count()
            assigned_leads = open_students.filter(assigned_to__isnull=False).count()

            # Contacted leads: open leads with at least one interaction logged
            contacted_leads = (
                open_students
                .filter(crm_interactions__isnull=False)
                .distinct()
                .count()
            )
            # Fresh leads: open leads whose actual current status is NEW
            fresh_leads = open_students.filter(lead_status__in=new_stages).count()

            
            # Leaderboard & Call Duration per Sales Rep
            sales_reps = User.objects.filter(Q(role__in=['SALES', 'SALES_HEAD', 'SALES_MANAGER', 'SALES_LEAD', 'MANAGER']) | Q(assigned_leads__isnull=False), is_active=True).distinct()
            if request.user.role in ['SALES', 'SALES_HEAD', 'SALES_MANAGER', 'MANAGER', 'SALES_LEAD']:
                user_section = getattr(request.user, 'sales_section', 'BOTH')
                if user_section and user_section != 'BOTH':
                    sales_reps = sales_reps.filter(Q(sales_section=user_section) | Q(sales_section='BOTH'))
                elif section_filter and section_filter.upper() != 'ALL':
                    sales_reps = sales_reps.filter(Q(sales_section=section_filter) | Q(sales_section='BOTH'))
                if not is_sales_manager:
                    sales_reps = sales_reps.filter(id=request.user.id)
            elif section_filter and section_filter.upper() != 'ALL' and request.user.role in ['SUPER_ADMIN', 'ADMIN']:
                sales_reps = sales_reps.filter(Q(sales_section=section_filter) | Q(sales_section='BOTH'))

            assigned_to_param = request.query_params.get('assigned_to')
            if assigned_to_param and assigned_to_param not in ['assigned', 'unassigned']:
                try:
                    sales_reps = sales_reps.filter(id=int(assigned_to_param))
                except (ValueError, TypeError):
                    pass

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

            connected_calls = interactions_qs.filter(Q(call_status='CONNECTED') | Q(call_duration__gt=0)).count()
            missed_calls = interactions_qs.filter(Q(call_status='MISSED') | Q(call_duration=0, call_status__isnull=True)).count()
            incoming_calls = interactions_qs.filter(call_direction='INCOMING').count()
            outgoing_calls = interactions_qs.filter(call_direction='OUTGOING').count()

            # Pipeline Stages Breakdown
            from .utils import LeadStatusResolver
            dynamic_stages_obj = list(PipelineStage.objects.all().order_by('order', 'id'))
            resolver = LeadStatusResolver(stages=dynamic_stages_obj)
            status_counts = students.values('lead_status').annotate(count=Count('id'))

            combined_stages = {}
            for item in status_counts:
                raw_status = item['lead_status']
                count = item['count']
                resolved = resolver.resolve(raw_status)

                if resolved.is_resolved:
                    if resolved.stage_id:
                        bucket_key = str(resolved.stage_id)
                        stage_id_val = resolved.stage_id
                        stage_name_val = resolved.stage_name
                    elif resolved.is_duplicate:
                        bucket_key = "DUPLICATE"
                        stage_id_val = "DUPLICATE"
                        stage_name_val = resolved.stage_name
                    else:
                        bucket_key = resolved.raw_status or "resolved"
                        stage_id_val = resolved.raw_status
                        stage_name_val = resolved.stage_name
                    is_unresolved = False
                else:
                    # Unresolved status: explicit diagnostic bucket
                    bucket_key = f"unresolved_{resolved.raw_status}"
                    stage_id_val = resolved.raw_status if resolved.raw_status else "unknown"
                    stage_name_val = f"Unresolved ({resolved.raw_status})" if resolved.raw_status else "Unresolved"
                    is_unresolved = True

                if bucket_key not in combined_stages:
                    combined_stages[bucket_key] = {
                        "id": stage_id_val,
                        "name": stage_name_val,
                        "count": 0,
                        "is_unresolved": is_unresolved
                    }
                combined_stages[bucket_key]["count"] += count

            pipeline_stages_data = list(combined_stages.values())
                
            leaderboard = []
            for rep in sales_reps:
                # Count unique assigned leads for this sales rep respecting current filters and assignment
                rep_students = students.filter(assigned_to=rep)
                rep_leads = rep_students.count()
                
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
                
                rep_contacted = rep_students.filter(crm_interactions__isnull=False).distinct().count()
                rep_duration_sec = rep_interactions.aggregate(total_sec=Sum('call_duration'))['total_sec'] or 0
                rep_call_count = rep_interactions.count()
                rep_connected = rep_interactions.filter(Q(call_status='CONNECTED') | Q(call_duration__gt=0)).count()
                rep_missed = rep_interactions.filter(Q(call_status='MISSED') | Q(call_duration=0, call_status__isnull=True)).count()
                
                leaderboard.append({
                    "id": rep.id,
                    "name": rep.get_full_name() or rep.username,
                    "role": rep.get_role_display() if hasattr(rep, 'get_role_display') else getattr(rep, 'role', 'Sales Rep'),
                    "assigned": rep_leads,
                    "contacted": rep_contacted,
                    "total_calls": rep_call_count,
                    "connected_calls": rep_connected,
                    "missed_calls": rep_missed,
                    "total_call_duration": rep_duration_sec,
                    "formatted_call_duration": format_duration_seconds(rep_duration_sec)
                })
            leaderboard.sort(key=lambda x: x['total_call_duration'], reverse=True)
            
            revenue_qs = Transaction.objects.all()
            if request.user.role in ['SALES', 'SALES_HEAD', 'SALES_MANAGER', 'MANAGER', 'SALES_LEAD']:
                user_section = getattr(request.user, 'sales_section', 'BOTH')
                if user_section and user_section != 'BOTH':
                    revenue_qs = revenue_qs.filter(
                        Q(student__assigned_to__sales_section=user_section) |
                        Q(student__sales_section=user_section)
                    )
                if not is_sales_manager:
                    revenue_qs = revenue_qs.filter(student__assigned_to=request.user)
            elif section_filter and request.user.role in ['SUPER_ADMIN', 'ADMIN']:
                revenue_qs = revenue_qs.filter(Q(student__sales_section=section_filter) | Q(student__assigned_to__sales_section=section_filter))

            # Campaign revenue attribution: filter by student campaign
            if campaign_id:
                if camp_id_int is not None:
                    revenue_qs = revenue_qs.filter(student__campaign_id=camp_id_int)
                else:
                    revenue_qs = revenue_qs.none()
            elif campaign_only:
                revenue_qs = revenue_qs.filter(student__campaign__isnull=False)

            if start_date:
                parsed_start = parse_date(start_date)
                if parsed_start:
                    revenue_qs = revenue_qs.filter(date__date__gte=parsed_start)
            if end_date:
                parsed_end = parse_date(end_date)
                if parsed_end:
                    revenue_qs = revenue_qs.filter(date__date__lte=parsed_end)
                    
            revenue_agg = revenue_qs.aggregate(total_revenue=Sum('amount'))
            revenue = float(revenue_agg.get('total_revenue') or 0)
            
            return Response({
                "total_leads": total_leads,
                "unassigned_leads": unassigned_leads,
                "assigned_leads": assigned_leads,
                "fresh_leads": fresh_leads,
                "contacted_leads": contacted_leads,
                "converted_leads": converted_leads,
                "dropped_leads": dropped_leads,
                "total_call_duration": total_call_duration_sec,
                "formatted_total_call_duration": formatted_total_call_duration,
                "connected_calls": connected_calls,
                "missed_calls": missed_calls,
                "incoming_calls": incoming_calls,
                "outgoing_calls": outgoing_calls,
                "pipeline_stages": pipeline_stages_data,
                "leaderboard": leaderboard,
                "revenue": revenue,
                "start_date": start_date or "",
                "end_date": end_date or "",
                "date_preset": date_preset or ""
            })
        except Exception as e:
            logger.error(f"Dashboard stats error: {e}")
            return Response({"error": "Failed to load dashboard metrics. Please try again later."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

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
        users = User.objects.filter(Q(role__in=['SALES', 'SALES_HEAD', 'SALES_MANAGER', 'SALES_LEAD', 'MANAGER', 'BDE']) | Q(assigned_leads__isnull=False), is_active=True).distinct()
        
        if request.user.role == 'SALES':
            user_section = getattr(request.user, 'sales_section', 'BOTH')
            if user_section != 'BOTH':
                users = users.filter(Q(sales_section=user_section) | Q(sales_section='BOTH'))

        if request.user.role not in ['SUPER_ADMIN', 'ADMIN'] and not request.user.is_superuser:
            subordinates = request.user.get_all_subordinates() if hasattr(request.user, 'get_all_subordinates') else []
            if not subordinates and hasattr(request.user, 'hrms_profile') and hasattr(request.user.hrms_profile, 'subordinates'):
                hrms_subs = request.user.hrms_profile.subordinates.select_related('user').all()
                subordinates = [sub.user for sub in hrms_subs if sub.user]
            if subordinates:
                team_user_ids = [request.user.id] + [s.id for s in subordinates]
                users = users.filter(id__in=team_user_ids)

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
        if self.request.user.role in ['SALES', 'SALES_HEAD', 'SALES_MANAGER', 'MANAGER', 'SALES_LEAD']:
            from .utils import check_is_sales_manager
            if not check_is_sales_manager(self.request.user):
                from django.db.models import Q
                queryset = queryset.filter(Q(student__assigned_to=self.request.user) | Q(author=self.request.user))
            else:
                user_section = getattr(self.request.user, 'sales_section', 'BOTH')
                if user_section and user_section != 'BOTH':
                    from django.db.models import Q
                    queryset = queryset.filter(
                        Q(student__assigned_to__sales_section=user_section) |
                        Q(student__sales_section=user_section) |
                        Q(author__sales_section=user_section)
                    )
        student_id = self.request.query_params.get('student_id', None)
        if student_id is not None:
            if str(student_id).lower() in ['null', 'none', 'unmatched', '0']:
                queryset = queryset.filter(student__isnull=True)
            else:
                queryset = queryset.filter(student_id=student_id)
            
        interaction_type = self.request.query_params.get('interaction_type', None)
        if interaction_type:
            queryset = queryset.filter(interaction_type=interaction_type)
            
        direction = self.request.query_params.get('direction') or self.request.query_params.get('call_direction')
        if direction:
            queryset = queryset.filter(call_direction=direction.upper())

        call_status = self.request.query_params.get('status') or self.request.query_params.get('call_status')
        if call_status:
            queryset = queryset.filter(call_status=call_status.upper())

        is_matched = self.request.query_params.get('is_matched')
        if is_matched is not None:
            if is_matched.lower() in ['true', '1']:
                queryset = queryset.filter(is_matched=True)
            elif is_matched.lower() in ['false', '0']:
                queryset = queryset.filter(is_matched=False)
            
        assigned_to = self.request.query_params.get('assigned_to', None)
        if assigned_to:
            if assigned_to == 'unassigned':
                queryset = queryset.filter(student__assigned_to__isnull=True)
            elif assigned_to != 'assigned':
                queryset = queryset.filter(student__assigned_to_id=assigned_to)
            else:
                queryset = queryset.filter(student__assigned_to__isnull=False)
                
        sales_section = self.request.query_params.get('sales_section', None)
        if sales_section and sales_section != 'ALL':
            queryset = queryset.filter(student__sales_section=sales_section)
            
        campaign_id = self.request.query_params.get('campaign_id', None)
        if campaign_id:
            queryset = queryset.filter(student__campaign_id=campaign_id)
            
        search = self.request.query_params.get('search', None)
        if search:
            from django.db.models import Q
            queryset = queryset.filter(
                Q(student__first_name__icontains=search) |
                Q(student__last_name__icontains=search) |
                Q(student__mobile__icontains=search) |
                Q(student__email__icontains=search) |
                Q(customer_number__icontains=search) |
                Q(caller_number__icontains=search) |
                Q(receiver_number__icontains=search) |
                Q(notes__icontains=search)
            )
            
        start_date = self.request.query_params.get('start_date', None)
        end_date = self.request.query_params.get('end_date', None)
        if start_date:
            from django.utils.dateparse import parse_date
            parsed_start = parse_date(start_date)
            if parsed_start:
                queryset = queryset.filter(date__date__gte=parsed_start)
        if end_date:
            from django.utils.dateparse import parse_date
            parsed_end = parse_date(end_date)
            if parsed_end:
                queryset = queryset.filter(date__date__lte=parsed_end)
                
        return queryset

    def create(self, request, *args, **kwargs):
        mobile_call_id = request.data.get('mobile_call_id')
        provider_call_id = request.data.get('provider_call_id')
        
        # Deduplication check: if mobile_call_id or provider_call_id already exists, perform idempotent update
        existing = None
        if mobile_call_id:
            existing = LeadInteraction.objects.filter(mobile_call_id=mobile_call_id).first()
        elif provider_call_id:
            existing = LeadInteraction.objects.filter(provider_call_id=provider_call_id).first()
            
        if existing:
            is_already_connected_with_recording = (
                (existing.call_status or '').upper() == 'CONNECTED'
                and (existing.call_duration or 0) > 0
                and bool(existing.audio_recording or existing.recording_url)
            )

            if is_already_connected_with_recording:
                # Rule 3: An already-valid CONNECTED LeadInteraction with call_duration > 0
                # and existing audio_recording attached must NOT have its genuine recording or status
                # downgraded merely because a later duplicate/idempotent sync sends call_duration=0 or missed.
                if request.data.get('notes'):
                    existing.notes = request.data.get('notes')
                if request.data.get('customer_name') and request.data.get('customer_name').strip():
                    existing.customer_name = request.data.get('customer_name').strip()
                existing.save()
                serializer = self.get_serializer(existing)
                return Response(serializer.data, status=status.HTTP_200_OK)

            # Update with newly provided fields
            if request.data.get('call_status'):
                existing.call_status = request.data.get('call_status').upper()

            try:
                new_dur = int(request.data.get('call_duration')) if request.data.get('call_duration') is not None else None
            except (ValueError, TypeError):
                new_dur = None

            if new_dur is not None:
                existing.call_duration = max(0, new_dur)

            uploaded_audio = request.FILES.get('audio_recording')
            if uploaded_audio and (existing.call_status or '').upper() not in ['MISSED', 'REJECTED', 'UNANSWERED', 'FAILED']:
                existing.audio_recording = uploaded_audio

            # STRICT UNIFIED RULES:
            # duration == 0 or explicit missed/unanswered/rejected/failed => MISSED, duration 0, no audio
            if existing.call_duration <= 0 or (existing.call_status or '').upper() in ['MISSED', 'REJECTED', 'UNANSWERED', 'FAILED']:
                existing.call_status = 'MISSED' if (existing.call_status or '').upper() not in ['REJECTED', 'UNANSWERED', 'FAILED'] else existing.call_status
                existing.call_duration = 0
                existing.audio_recording = None
                existing.audio_file_hash = None
                existing.recording_url = None
            else:
                existing.call_status = 'CONNECTED'
                if request.data.get('recording_url'):
                    existing.recording_url = request.data.get('recording_url')

            if request.data.get('notes'):
                existing.notes = request.data.get('notes')
            existing.save()
            serializer = self.get_serializer(existing)
            return Response(serializer.data, status=status.HTTP_200_OK)

        # Extract parameters
        student_id = request.data.get('student')
        customer_number = str(request.data.get('customer_number') or '').strip()
        caller_number = str(request.data.get('caller_number') or '').strip()
        receiver_number = str(request.data.get('receiver_number') or '').strip()
        call_direction = (request.data.get('call_direction') or 'OUTGOING').upper()
        call_duration = request.data.get('call_duration', 0)
        notes = request.data.get('notes', '')
        interaction_type = request.data.get('interaction_type', 'CALL')

        try:
            dur_int = int(call_duration)
        except (ValueError, TypeError):
            dur_int = 0

        raw_status = request.data.get('call_status')
        if raw_status:
            call_status = str(raw_status).strip().upper()
        elif dur_int > 0:
            call_status = 'CONNECTED'
        else:
            call_status = 'MISSED'

        # Fallback for customer number based on call direction
        if not customer_number:
            if call_direction == 'INCOMING':
                customer_number = caller_number or receiver_number
            else:
                customer_number = receiver_number or caller_number

        # STRICT UNIFIED RULES:
        # A call is ONLY confirmed connected if CallLog duration > 0 and call_status is not missed/unanswered/rejected/failed.
        # If dur_int <= 0 or call_status in ['MISSED', 'REJECTED', 'UNANSWERED', 'FAILED']:
        # -> Call is UNCONNECTED: MISSED, duration exactly 0, NO audio/recording attached.
        # -> NEVER use fallback mic or OEM recording duration to determine whether the call connected.
        if dur_int <= 0 or call_status in ['MISSED', 'REJECTED', 'UNANSWERED', 'FAILED']:
            call_status = 'MISSED' if call_status not in ['REJECTED', 'UNANSWERED', 'FAILED'] else call_status
            dur_int = 0
            audio_file = None
            rec_url = None
            file_hash = None
        else:
            # Call is confirmed CONNECTED by authoritative CallLog duration > 0.
            # Recording duration may synchronize the displayed duration only after call is already confirmed CONNECTED.
            call_status = 'CONNECTED'
            audio_file = request.FILES.get('audio_recording')
            rec_url = request.data.get('recording_url')

        # Secondary lead matching: search complete CRM dataset
        student = None
        is_matched = False
        if student_id and str(student_id) not in ['0', '', 'null', 'None']:
            try:
                student = Student.objects.filter(id=student_id).first()
                if student:
                    is_matched = True
            except (ValueError, TypeError):
                student = None

        if not student and customer_number:
            student, is_matched = match_lead_by_phone(customer_number)

        # Guaranteed persistence - Call is created FIRST
        interaction = LeadInteraction.objects.create(
            student=student,
            author=request.user if request.user.is_authenticated else None,
            interaction_type=interaction_type,
            mobile_call_id=mobile_call_id if mobile_call_id else None,
            customer_number=customer_number,
            caller_number=caller_number,
            receiver_number=receiver_number,
            call_direction=call_direction,
            call_status=call_status,
            call_duration=dur_int,
            start_time=request.data.get('start_time'),
            end_time=request.data.get('end_time'),
            recording_url=rec_url,
            provider_call_id=provider_call_id,
            provider_event_id=request.data.get('provider_event_id'),
            telephony_provider=request.data.get('telephony_provider', 'MOBILE_APP'),
            is_matched=is_matched,
            notes=notes,
            audio_recording=audio_file,
        )

        # Optional pipeline update & follow-up task only if student matched
        if student:
            pipeline_status = request.data.get('pipeline_status')
            if pipeline_status:
                student.lead_status = pipeline_status
                student.save()

            next_followup_date = request.data.get('next_followup_date')
            if next_followup_date:
                Task.objects.create(
                    title=f"Follow-up: {student.first_name} {student.last_name}",
                    student=student,
                    assigned_to=request.user if request.user.is_authenticated else None,
                    task_type='CALL',
                    status='PENDING',
                    due_date=next_followup_date,
                    notes=notes or 'Follow-up from previous call interaction.'
                )

        serializer = self.get_serializer(interaction)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()

        is_already_connected_with_recording = (
            (instance.call_status or '').upper() == 'CONNECTED'
            and (instance.call_duration or 0) > 0
            and bool(instance.audio_recording or instance.recording_url)
        )
        
        raw_status = request.data.get('call_status')
        if raw_status:
            # Do not downgrade an already connected interaction with a genuine recording
            if not (is_already_connected_with_recording and str(raw_status).strip().upper() in ['MISSED', 'REJECTED', 'UNANSWERED', 'FAILED']):
                instance.call_status = str(raw_status).strip().upper()

        if request.data.get('call_duration') is not None:
            try:
                dur_val = int(request.data.get('call_duration'))
                # Do not overwrite duration to 0 if already connected with a genuine recording
                if not (is_already_connected_with_recording and dur_val <= 0):
                    instance.call_duration = max(0, dur_val)
            except (ValueError, TypeError):
                pass

        # STRICT UNIFIED RULES:
        if not is_already_connected_with_recording and (instance.call_duration <= 0 or (instance.call_status or '').upper() in ['MISSED', 'REJECTED', 'UNANSWERED', 'FAILED']):
            instance.call_status = 'MISSED' if (instance.call_status or '').upper() not in ['REJECTED', 'UNANSWERED', 'FAILED'] else instance.call_status
            instance.call_duration = 0
            instance.audio_recording = None
            instance.audio_file_hash = None
            instance.recording_url = None
            # Do not accept audio recording for unconnected calls
        else:
            instance.call_status = 'CONNECTED'
            if request.FILES.get('audio_recording'):
                instance.audio_recording = request.FILES.get('audio_recording')
            if request.data.get('recording_url'):
                instance.recording_url = request.data.get('recording_url')

        if request.data.get('notes'):
            instance.notes = request.data.get('notes')
        if request.data.get('pipeline_status') and instance.student:
            instance.student.lead_status = request.data.get('pipeline_status')
            instance.student.save()

        instance.save()
        serializer = self.get_serializer(instance)
        return Response(serializer.data, status=status.HTTP_200_OK)

class CampaignViewSet(viewsets.ModelViewSet):
    queryset = Campaign.objects.all()
    serializer_class = CampaignSerializer
    permission_classes = [permissions.IsAuthenticated]

    def check_permissions(self, request):
        super().check_permissions(request)
        user = request.user
        from .utils import check_is_sales_manager
        # Super Admin, Admin, Marketer, and Team Leads can access Campaigns.
        # Standard SALES / BDE executives are restricted from Campaigns.
        if getattr(user, 'role', '') == 'SALES' and not check_is_sales_manager(user):
            self.permission_denied(
                request,
                message="BDE executives do not have permission to access Campaigns."
            )

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.request.user.role in ['SALES', 'SALES_HEAD', 'SALES_MANAGER', 'MANAGER', 'SALES_LEAD'] and getattr(self.request.user, 'sales_section', 'BOTH') != 'BOTH':
            from django.db.models import Q
            queryset = queryset.filter(Q(section=self.request.user.sales_section) | Q(section='BOTH'))

        status_param = self.request.query_params.get('status')
        if status_param and status_param.upper() != 'ALL':
            queryset = queryset.filter(status=status_param.upper())

        section_param = self.request.query_params.get('section') or self.request.query_params.get('sales_section')
        if section_param and section_param.upper() != 'ALL':
            from django.db.models import Q
            queryset = queryset.filter(Q(section=section_param.upper()) | Q(section='BOTH'))

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
        
        from core.validators import validate_spreadsheet_file
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            validate_spreadsheet_file(file)
        except DjangoValidationError as ve:
            return Response({'error': ve.messages if hasattr(ve, 'messages') else str(ve)}, status=status.HTTP_400_BAD_REQUEST)

        from core.models import Program
        if program_id:
            default_program = Program.objects.filter(id=program_id).first()
        else:
            default_program = None
            if campaign and campaign.section == 'CAREER_ACADEMY':
                default_program = Program.objects.filter(name='Natya Career Academy').first()
            elif campaign and campaign.section == 'REGULAR':
                default_program = Program.objects.filter(name='Natya').first()
            if not default_program:
                default_program = Program.objects.exclude(name="Wise Import").first() or Program.objects.first()
            
        try:
            decoded_file = file.read().decode('utf-8-sig')
            io_string = io.StringIO(decoded_file)
            reader = csv.DictReader(io_string)
            
            leads_created = 0
            duplicates_skipped = 0
            skipped_leads = 0
            total_rows = 0
            
            # Reset reader pointer by reading from file again if we want to run loop correctly
            file.seek(0)
            decoded_file = file.read().decode('utf-8-sig')
            io_string = io.StringIO(decoded_file)
            reader = csv.DictReader(io_string)

            for row in reader:
                total_rows += 1
                # Clean up column headers (lowercase, strip whitespace)
                clean_row = {str(k).strip().lower(): v for k, v in row.items() if k}
                
                raw_name = (
                    clean_row.get('full name') or 
                    clean_row.get('fullname') or 
                    clean_row.get('student name') or 
                    clean_row.get('student_name') or 
                    clean_row.get('name') or 
                    clean_row.get('first name') or 
                    clean_row.get('first_name') or 
                    ''
                ).strip()
                name_parts = raw_name.split(' ', 1)
                first_name = name_parts[0] if name_parts[0] else 'Unknown'
                last_name = name_parts[1] if len(name_parts) > 1 else (clean_row.get('last name') or clean_row.get('lastname') or clean_row.get('last_name', '')).strip()
                
                email = clean_row.get('email', '').strip()
                mobile = (clean_row.get('contact') or clean_row.get('mobile') or clean_row.get('phone') or '').strip()
                
                clean_phone = normalize_lead_phone(mobile)
                clean_em = normalize_lead_email(email)
                
                place = clean_row.get('place', '').strip()
                tag = clean_row.get('tag', '').strip()
                
                if first_name or clean_phone or clean_em:
                    # Centralized duplicate check
                    dup_student, dup_reason = lookup_existing_student(mobile=mobile, email=email)
                    if dup_student:
                        create_duplicate_lead(
                            existing_student=dup_student,
                            first_name=first_name,
                            last_name=last_name,
                            mobile=clean_phone or mobile,
                            email=clean_em or email,
                            campaign=campaign,
                            program=default_program,
                            sales_section=campaign.section if campaign else 'BOTH',
                            duplicate_reason=dup_reason,
                            extra_fields={'perm_city': place, 'lms_course_names': tag},
                            log_reengagement=False
                        )
                        leads_created += 1
                        continue

                    with transaction.atomic():
                        import uuid
                        base_username = clean_phone if clean_phone else clean_em if clean_em else first_name
                        username = f"{base_username}_{str(uuid.uuid4())[:8]}" if base_username else f"lead_{str(uuid.uuid4())[:8]}"
                        import re
                        username = re.sub(r'[^\w@+\.-]', '_', username)

                        User = get_user_model()
                        user = User.objects.create_user(
                            username=username,
                            email=clean_em,
                            first_name=first_name,
                            last_name=last_name,
                            role='STUDENT',
                            password='Password@123'
                        )
                        
                        # Generate unique CRM Student ID
                        crm_id = f"LEAD-{str(uuid.uuid4())[:8].upper()}"
                        
                        # Handle Auto-Assignment Round Robin for bulk uploaded non-duplicate leads
                        assigned_to_user = get_next_assigned_rep(campaign)

                        from .utils import get_canonical_new_lead_stage_id
                        stage_id = get_canonical_new_lead_stage_id()

                        student = Student.objects.create(
                            user=user,
                            crm_student_id=crm_id,
                            first_name=first_name,
                            last_name=last_name,
                            email=clean_em,
                            mobile=clean_phone,
                            perm_city=place,
                            lms_course_names=tag,
                            campaign=campaign,
                            sales_section=campaign.section,
                            program_type=default_program,
                            assigned_to=assigned_to_user,
                            lead_status=stage_id
                        )
                        leads_created += 1
                else:
                    skipped_leads += 1
                    
            return Response({
                'message': f'CSV upload processed. Total rows: {total_rows}. Successful additions: {leads_created}. Duplicates skipped: {duplicates_skipped}. Skipped (invalid): {skipped_leads}.'
            })
        except Exception as e:
            logger.error(f"Upload leads CSV error: {e}")
            return Response({'error': 'Failed to process CSV file. Please verify format and column structure.'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def bulk_upload_batch(self, request, pk=None):
        campaign = self.get_object()
        rows = request.data.get('rows', [])
        program_id = request.data.get('program_id')

        from core.models import Program
        if program_id:
            default_program = Program.objects.filter(id=program_id).first()
        else:
            default_program = None
            if campaign and campaign.section == 'CAREER_ACADEMY':
                default_program = Program.objects.filter(name='Natya Career Academy').first()
            elif campaign and campaign.section == 'REGULAR':
                default_program = Program.objects.filter(name='Natya').first()
            if not default_program:
                default_program = Program.objects.exclude(name="Wise Import").first() or Program.objects.first()

        results = []
        for i, row in enumerate(rows):
            clean_row = {str(k).strip().lower(): v for k, v in row.items() if k}
            
            raw_name = (
                clean_row.get('full name') or 
                clean_row.get('fullname') or 
                clean_row.get('student name') or 
                clean_row.get('student_name') or 
                clean_row.get('name') or 
                clean_row.get('first name') or 
                clean_row.get('first_name') or 
                ''
            ).strip()
            name_parts = raw_name.split(' ', 1)
            first_name = name_parts[0] if name_parts[0] else 'Unknown'
            last_name = name_parts[1] if len(name_parts) > 1 else (clean_row.get('last name') or clean_row.get('lastname') or clean_row.get('last_name', '')).strip()

            email = clean_row.get('email', '').strip()
            mobile = clean_row.get('contact', clean_row.get('mobile', '')).strip()

            clean_phone = normalize_lead_phone(mobile)
            clean_em = normalize_lead_email(email)

            place = clean_row.get('place', '').strip()
            tag = clean_row.get('tag', '').strip()

            if not first_name and not clean_phone and not clean_em:
                results.append({
                    'status': 'SKIPPED',
                    'name': 'Row ' + str(i+1),
                    'message': 'Empty name, mobile, and email'
                })
                continue

            # Centralized duplicate check
            dup_student, dup_reason = lookup_existing_student(mobile=mobile, email=email)
            if dup_student:
                new_dup = create_duplicate_lead(
                    existing_student=dup_student,
                    first_name=first_name,
                    last_name=last_name,
                    mobile=clean_phone or mobile,
                    email=clean_em or email,
                    campaign=campaign,
                    program=default_program,
                    sales_section=campaign.section if campaign else 'BOTH',
                    duplicate_reason=dup_reason,
                    extra_fields={'perm_city': place, 'lms_course_names': tag},
                    log_reengagement=False
                )
                results.append({
                    'status': 'SUCCESS',
                    'name': f"{first_name} {last_name}".strip() or 'Lead',
                    'message': f"Duplicate lead created (Original CRM ID: {dup_student.crm_student_id})",
                    'crm_id': new_dup.crm_student_id,
                    'is_duplicate': True
                })
                continue

            try:
                    with transaction.atomic():
                        import uuid
                        base_username = clean_phone if clean_phone else clean_em if clean_em else first_name
                        username = f"{base_username}_{str(uuid.uuid4())[:8]}" if base_username else f"lead_{str(uuid.uuid4())[:8]}"
                        # Sanitize username to prevent invalid character crashes (only letters, numbers, _, @, +, ., -)
                        import re
                        username = re.sub(r'[^\w@+\.-]', '_', username)

                        User = get_user_model()
                        user = User.objects.create_user(
                            username=username,
                            email=clean_em,
                            first_name=first_name,
                            last_name=last_name,
                            role='STUDENT',
                            password='Password@123'
                        )

                        crm_id = f"LEAD-{str(uuid.uuid4())[:8].upper()}"

                        # Handle Auto-Assignment Round Robin for batch uploaded non-duplicate leads
                        assigned_to_user = get_next_assigned_rep(campaign)

                        from .utils import get_canonical_new_lead_stage_id
                        stage_id = get_canonical_new_lead_stage_id()

                        student = Student.objects.create(
                            user=user,
                            crm_student_id=crm_id,
                            first_name=first_name,
                            last_name=last_name,
                            email=clean_em,
                            mobile=clean_phone,
                            perm_city=place,
                            lms_course_names=tag,
                            campaign=campaign,
                            sales_section=campaign.section,
                            program_type=default_program,
                            assigned_to=assigned_to_user,
                            lead_status=stage_id
                        )

                        results.append({
                            'status': 'SUCCESS',
                            'name': f"{first_name} {last_name}",
                            'message': 'Successfully imported',
                            'crm_id': student.crm_student_id
                        })

            except Exception as row_error:
                results.append({
                    'status': 'FAILED',
                    'name': f"{first_name} {last_name}",
                    'message': str(row_error)
                })

        return Response({'results': results})

    @action(detail=True, methods=['get'])
    def report(self, request, pk=None):
        campaign = self.get_object()
        from .models import Student
        students = Student.objects.filter(campaign=campaign, is_active=True).exclude(lead_status__iexact='DUPLICATE')
        
        total_leads = students.count()
        
        from .utils import get_converted_stage_values, get_dropped_stage_values
        converted_stages = get_converted_stage_values()
        lost_stages = get_dropped_stage_values()
            
        converted_leads = students.filter(lead_status__in=converted_stages).count()
        lost_leads = students.filter(lead_status__in=lost_stages).count()
        active_leads = max(0, total_leads - converted_leads - lost_leads)
        
        stages_data = []
        try:
            from django.db.models import Count
            status_counts = students.values('lead_status').annotate(count=Count('id'))
            dynamic_stages_obj = list(PipelineStage.objects.all())
            stages_map = {str(stage.id): stage.name for stage in dynamic_stages_obj}
            stage_by_name = {stage.name.strip().lower(): stage for stage in dynamic_stages_obj}
            standard_mapping = {
                'NEW': 'New Lead',
                'FOLLOW_UP': 'Follow-up',
                'PAYMENT_PENDING': 'Payment Pending',
                'ENROLLED': 'Converted',
                'CONVERTED': 'Converted',
                'DROPPED': 'Dropped'
            }

            combined_campaign_stages = {}
            for item in status_counts:
                status_id = str(item['lead_status'])
                count = item['count']

                if status_id in standard_mapping:
                    name = standard_mapping[status_id]
                else:
                    name = stages_map.get(status_id, status_id)

                if status_id in stages_map:
                    canonical_id = status_id
                    matched_obj = next((s for s in dynamic_stages_obj if str(s.id) == status_id), None)
                    name = matched_obj.name if matched_obj else name
                elif name.strip().lower() in stage_by_name:
                    matched_stage = stage_by_name[name.strip().lower()]
                    canonical_id = str(matched_stage.id)
                    name = matched_stage.name
                else:
                    canonical_id = status_id

                if canonical_id not in combined_campaign_stages:
                    combined_campaign_stages[canonical_id] = {
                        'status': canonical_id,
                        'name': name,
                        'count': 0
                    }
                combined_campaign_stages[canonical_id]['count'] += count

            stages_data = list(combined_campaign_stages.values())
        except Exception:
            pass
            
        from django.db.models import Sum
        revenue = students.aggregate(total_rev=Sum('paid_fee'))['total_rev'] or 0
        
        return Response({
            'campaign_name': campaign.name,
            'total_leads': total_leads,
            'converted_leads': converted_leads,
            'lost_leads': lost_leads,
            'active_leads': active_leads,
            'revenue': float(revenue),
            'stages_breakdown': stages_data
        })


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
        
        allowed_roles = ['SUPER_ADMIN', 'ADMIN', 'SALES', 'SALES_HEAD', 'SALES_MANAGER', 'MANAGER', 'SALES_LEAD', 'HR']
        if not (request.user.is_superuser or request.user.is_staff or request.user.role in allowed_roles):
            return Response({"error": "Unauthorized access to BDE reports"}, status=status.HTTP_403_FORBIDDEN)

        from .utils import check_is_sales_manager
        if request.user.role == 'SALES' and not check_is_sales_manager(request.user):
            bde = request.user
        else:
            if user_id == 'me' or user_id == 'undefined' or not str(user_id).isdigit():
                bde = request.user
            else:
                bde = get_object_or_404(User, id=int(user_id))
                if request.user.role in ['SALES', 'SALES_HEAD', 'SALES_MANAGER', 'MANAGER', 'SALES_LEAD']:
                    user_sec = getattr(request.user, 'sales_section', 'BOTH')
                    if user_sec != 'BOTH' and getattr(bde, 'sales_section', 'BOTH') not in [user_sec, 'BOTH']:
                        return Response({"error": "Unauthorized to access representatives outside your section"}, status=status.HTTP_403_FORBIDDEN)

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
        elif date_preset == 'last_7_days':
            start_date = str(today - timedelta(days=6))
            end_date = str(today)
        elif date_preset == 'last_30_days':
            start_date = str(today - timedelta(days=29))
            end_date = str(today)
        elif date_preset == 'last_month':
            first_of_this_month = today.replace(day=1)
            last_day_last_month = first_of_this_month - timedelta(days=1)
            first_day_last_month = last_day_last_month.replace(day=1)
            start_date = str(first_day_last_month)
            end_date = str(last_day_last_month)
        
        leads = Student.objects.filter(assigned_to=bde, is_active=True).exclude(lead_status__iexact='DUPLICATE').select_related('user')
        parsed_start = parse_date(start_date) if start_date else None
        parsed_end = parse_date(end_date) if end_date else None

        if parsed_start and parsed_end:
            leads = leads.filter(
                Q(created_at__date__gte=parsed_start, created_at__date__lte=parsed_end) |
                Q(created_at__isnull=True, user__date_joined__date__gte=parsed_start, user__date_joined__date__lte=parsed_end)
            )
        elif parsed_start:
            leads = leads.filter(
                Q(created_at__date__gte=parsed_start) |
                Q(created_at__isnull=True, user__date_joined__date__gte=parsed_start)
            )
        elif parsed_end:
            leads = leads.filter(
                Q(created_at__date__lte=parsed_end) |
                Q(created_at__isnull=True, user__date_joined__date__lte=parsed_end)
            )

        interactions = LeadInteraction.objects.filter(author=bde).select_related('student', 'student__user')
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
        all_interactions = interactions
        
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
        
        dynamic_stages = {str(stage.id): stage.name for stage in PipelineStage.objects.all()}
        standard_mapping = {
            'NEW': 'New Lead',
            'FOLLOW_UP': 'Follow-up',
            'PAYMENT_PENDING': 'Payment Pending',
            'ENROLLED': 'Converted',
            'CONVERTED': 'Converted',
            'DROPPED': 'Dropped'
        }
        def get_display_stage(val):
            if not val:
                return 'New Lead'
            s_val = str(val).strip()
            if s_val in dynamic_stages:
                return dynamic_stages[s_val]
            if s_val in standard_mapping:
                return standard_mapping[s_val]
            return s_val

        timeline = []
        for inter in interactions:
            dur_sec = parse_duration_sec(inter.call_duration, inter.notes)
            try:
                audio_url = inter.audio_recording.url if inter.audio_recording else None
                if audio_url and not (audio_url.startswith('http://') or audio_url.startswith('https://')):
                    audio_url = request.build_absolute_uri(audio_url)
            except Exception:
                audio_url = None

            timeline.append({
                'id': inter.id,
                'student_name': f"{inter.student.first_name} {inter.student.last_name}".strip() if inter.student else (inter.customer_number or inter.caller_number or inter.receiver_number or 'Unknown / Unmatched'),
                'student_id': inter.student.id if inter.student else None,
                'student_phone': inter.student.mobile if inter.student else (inter.customer_number or inter.caller_number or inter.receiver_number or ''),
                'student_email': inter.student.email if inter.student else '',
                'student_crm_id': inter.student.crm_student_id if inter.student else '',
                'student_status': get_display_stage(inter.student.lead_status) if inter.student else '',
                'is_matched': bool(inter.student_id),
                'type': inter.interaction_type,
                'call_duration': dur_sec,
                'formatted_call_duration': format_duration_seconds(dur_sec),
                'call_direction': inter.call_direction or 'OUTGOING',
                'call_status': inter.call_status or 'CONNECTED',
                'notes': inter.notes,
                'date': inter.date,
                'audio_url': audio_url or inter.recording_url
            })

        pending_tasks = Task.objects.filter(Q(assigned_to=bde) | Q(student__assigned_to=bde), status='PENDING').distinct()
        if start_date:
            parsed_start = parse_date(start_date)
            if parsed_start:
                pending_tasks = pending_tasks.filter(created_at__date__gte=parsed_start)
        if end_date:
            parsed_end = parse_date(end_date)
            if parsed_end:
                pending_tasks = pending_tasks.filter(created_at__date__lte=parsed_end)

        from collections import defaultdict
        from .utils import get_whatsapp_connected_stage_values, get_converted_stage_values

        whatsapp_stages = set(get_whatsapp_connected_stage_values())
        converted_stages = set(get_converted_stage_values())

        lead_ids = list(leads.values_list('id', flat=True))

        # Query all interactions associated with these assigned leads logged by bde
        lead_interactions_qs = LeadInteraction.objects.filter(
            student_id__in=lead_ids,
            author=bde
        )
        if start_date:
            parsed_start = parse_date(start_date)
            if parsed_start:
                lead_interactions_qs = lead_interactions_qs.filter(date__date__gte=parsed_start)
        if end_date:
            parsed_end = parse_date(end_date)
            if parsed_end:
                lead_interactions_qs = lead_interactions_qs.filter(date__date__lte=parsed_end)

        lead_interactions_by_student = defaultdict(list)
        for inter in lead_interactions_qs:
            lead_interactions_by_student[inter.student_id].append(inter)

        connected_lead_ids = set()
        contacted_not_connected_lead_ids = set()
        not_connected_lead_ids = set()
        whatsapp_connected_lead_ids = set()
        connection_status_map = {}

        for lead in leads:
            lead_inters = lead_interactions_by_student.get(lead.id, [])
            lead_status_str = str(lead.lead_status)

            # 1. WhatsApp Connection check
            is_wa_stage = lead_status_str in whatsapp_stages
            has_wa_connected_inter = any(
                i.interaction_type == 'WHATSAPP' and (i.call_status or '').upper() == 'CONNECTED'
                for i in lead_inters
            )
            is_wa_connected = is_wa_stage or has_wa_connected_inter
            if is_wa_connected:
                whatsapp_connected_lead_ids.add(lead.id)

            # 2. Call outcomes check
            calls = [i for i in lead_inters if i.interaction_type == 'CALL']
            has_connected_call = any(
                (c.call_status or '').upper() == 'CONNECTED' and (c.call_duration > 0 or not (c.call_status or '').upper() in ['MISSED', 'UNANSWERED', 'REJECTED', 'BUSY', 'FAILED'])
                for c in calls
            )
            has_attempted_call = any(
                (c.call_status or '').upper() in ['MISSED', 'UNANSWERED', 'REJECTED', 'BUSY', 'FAILED'] or c.call_duration == 0
                for c in calls
            )

            # 3. Canonical conversion stage check
            is_converted = lead_status_str in converted_stages

            # 4. Other recorded successful connections
            has_other_connected = any(
                i.interaction_type in ['MEETING', 'VISIT'] and (i.call_status or '').upper() == 'CONNECTED'
                for i in lead_inters
            )

            # Strict Mutual Exclusivity:
            # Category A: Connected Leads
            if has_connected_call or is_wa_connected or is_converted or has_other_connected:
                connected_lead_ids.add(lead.id)
                connection_status_map[lead.id] = 'CONNECTED'
            # Category B: Contacted but Not Connected (attempted call with no successful connection)
            elif has_attempted_call:
                contacted_not_connected_lead_ids.add(lead.id)
                connection_status_map[lead.id] = 'CONTACTED_NOT_CONNECTED'
            # Category C: Not Connected (new leads, notes-only, plain WhatsApp message without response, etc.)
            else:
                not_connected_lead_ids.add(lead.id)
                connection_status_map[lead.id] = 'NOT_CONNECTED'

        total_calls = all_interactions.filter(interaction_type='CALL').count()
        total_notes = all_interactions.filter(interaction_type='NOTE').count()
        total_whatsapp = all_interactions.filter(interaction_type='WHATSAPP').count()
        total_emails = all_interactions.filter(interaction_type='EMAIL').count()
        total_meetings = all_interactions.filter(interaction_type='MEETING').count()

        calls_qs = all_interactions.filter(interaction_type='CALL')
        connected_calls = calls_qs.filter(Q(call_status='CONNECTED') | Q(call_duration__gt=0)).exclude(call_status__in=['MISSED', 'UNANSWERED', 'REJECTED', 'BUSY', 'FAILED']).count()
        unsuccessful_calls = total_calls - connected_calls
        total_bde_duration_sec = sum(parse_duration_sec(c.call_duration, c.notes) for c in calls_qs)

        metrics = {
            'total_assigned': leads.count(),
            'connected_leads': len(connected_lead_ids),
            'contacted_not_connected_leads': len(contacted_not_connected_lead_ids),
            'not_connected_leads': len(not_connected_lead_ids),
            'whatsapp_connected': len(whatsapp_connected_lead_ids),
            'total_calls': total_calls,
            'connected_calls': connected_calls,
            'unsuccessful_calls': unsuccessful_calls,
            'total_notes': total_notes,
            'total_whatsapp': total_whatsapp,
            'total_emails': total_emails,
            'total_meetings': total_meetings,
            'total_interactions': all_interactions.count(),
            'total_call_duration': total_bde_duration_sec,
            'formatted_total_call_duration': format_duration_seconds(total_bde_duration_sec),
            'pending_tasks': pending_tasks.count()
        }

        leads_list = []
        for lead in leads:
            try:
                username = lead.user.username if lead.user else 'Unknown'
            except Exception:
                username = 'Unknown'
            leads_list.append({
                'id': lead.id,
                'name': f"{lead.first_name or ''} {lead.last_name or ''}".strip() or username,
                'crm_id': lead.crm_student_id,
                'status': get_display_stage(lead.lead_status),
                'raw_status': lead.lead_status,
                'connection_status': connection_status_map.get(lead.id, 'NOT_CONNECTED')
            })

        return Response({
            'bde': {'id': bde.id, 'name': bde.get_full_name() or bde.username, 'email': bde.email},
            'leads': leads_list,
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
        if self.request.user.role in ['SALES', 'SALES_HEAD', 'SALES_MANAGER', 'MANAGER', 'SALES_LEAD']:
            from .utils import check_is_sales_manager
            if not check_is_sales_manager(self.request.user):
                from django.db.models import Q
                queryset = queryset.filter(Q(assigned_to=self.request.user) | Q(student__assigned_to=self.request.user))
            else:
                user_section = getattr(self.request.user, 'sales_section', 'BOTH')
                if user_section and user_section != 'BOTH':
                    from django.db.models import Q
                    queryset = queryset.filter(
                        Q(assigned_to__sales_section=user_section) |
                        Q(student__sales_section=user_section) |
                        Q(student__assigned_to__sales_section=user_section)
                    )
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
                # Extract fields with safe fallbacks (supporting Google Sheet key names)
                raw_name = payload.get('first_name') or payload.get('name') or payload.get('full_name') or 'Unknown'
                name_parts = str(raw_name).strip().split(' ', 1)
                first_name = name_parts[0]
                last_name = name_parts[1] if len(name_parts) > 1 else payload.get('last_name', '')
                
                email = payload.get('email', '')
                mobile = payload.get('mobile') or payload.get('phone') or payload.get('phone_number') or ''
                
                clean_phone = normalize_lead_phone(mobile)
                clean_em = normalize_lead_email(email)

                if not clean_phone and not clean_em:
                    raise ValueError("At least valid email or mobile is required to create a lead.")

                campaign_id = payload.get('campaign_id')
                program_id = payload.get('program_id')

                # Assign Campaign if valid
                campaign = None
                if campaign_id:
                    campaign = Campaign.objects.filter(id=campaign_id).first()

                # Centralized duplicate check
                dup_student, dup_reason = lookup_existing_student(mobile=clean_phone, email=clean_em)
                if dup_student:
                    # Lead already exists! Log re-engagement on original student AND create new duplicate lead.
                    event_id = payload.get('event_id') or payload.get('id') or payload.get('lead_id')
                    record_reengagement_interaction(
                        student=dup_student,
                        source_name=f"webhook '{endpoint.name}'",
                        campaign_name=campaign.name if campaign else None,
                        event_id=str(event_id) if event_id else None,
                        extra_notes=dup_reason
                    )

                    new_dup_student = create_duplicate_lead(
                        existing_student=dup_student,
                        first_name=first_name,
                        last_name=last_name,
                        mobile=clean_phone,
                        email=clean_em,
                        campaign=campaign,
                        duplicate_reason=dup_reason,
                        log_reengagement=False
                    )

                    # Log Success
                    WebhookLog.objects.create(
                        endpoint=endpoint,
                        payload=payload,
                        status='SUCCESS'
                    )

                    return Response({
                        "message": "Duplicate lead created and re-engagement logged.",
                        "student_id": new_dup_student.id,
                        "crm_id": new_dup_student.crm_student_id,
                        "original_crm_id": dup_student.crm_student_id,
                        "is_duplicate": True
                    }, status=status.HTTP_200_OK)

                # Create new User
                username = clean_em if clean_em else f"lead_{clean_phone}"
                user_email = clean_em if clean_em else f"{username}@webhook.temp"
                
                user, created = User.objects.get_or_create(
                    username=username,
                    defaults={'email': user_email, 'role': 'STUDENT'}
                )
                if created:
                    user.set_password('welcome123')
                    user.save()

                # Generate CRM ID
                crm_id = Student.generate_next_crm_id()

                # Assign Program (fallback to campaign section match)
                program = None
                if program_id:
                    program = Program.objects.filter(id=program_id).first()
                if not program:
                    if campaign and campaign.section == 'CAREER_ACADEMY':
                        program = Program.objects.filter(name='Natya Career Academy').first()
                    elif campaign and campaign.section == 'REGULAR':
                        program = Program.objects.filter(name='Natya').first()
                    if not program:
                        program = Program.objects.exclude(name="Wise Import").first() or Program.objects.first()

                # Auto-assign lead if campaign is configured for auto-assignment
                assigned_to_user = get_next_assigned_rep(campaign) if campaign else None

                # Create Student Lead
                from .utils import get_canonical_new_lead_stage_id
                student = Student.objects.create(
                    user=user,
                    crm_student_id=crm_id,
                    first_name=first_name,
                    last_name=last_name,
                    email=clean_em,
                    mobile=clean_phone,
                    program_type=program,
                    campaign=campaign,
                    sales_section=campaign.section if campaign else 'BOTH',
                    assigned_to=assigned_to_user,
                    lead_status=get_canonical_new_lead_stage_id(),
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
            # Log Failure internally in DB and logger
            error_msg = str(e) + "\n" + traceback.format_exc()
            logger.error(f"Webhook processing error: {e}")
            WebhookLog.objects.create(
                endpoint=endpoint,
                payload=payload,
                status='FAILED',
                error_message=error_msg
            )
            return Response({"error": "Failed to process webhook payload."}, status=status.HTTP_400_BAD_REQUEST)

class CampaignWebhookReceiveView(APIView):
    permission_classes = [permissions.AllowAny] # Authenticated via campaign secret_token in URL

    def post(self, request, secret_token):
        try:
            campaign = Campaign.objects.get(secret_token=secret_token)
        except Campaign.DoesNotExist:
            return Response({"error": "Invalid campaign webhook token."}, status=status.HTTP_401_UNAUTHORIZED)
        
        payload = request.data
        try:
            with transaction.atomic():
                # Extract fields with safe fallbacks (supporting Google Sheet key names)
                raw_name = payload.get('first_name') or payload.get('name') or payload.get('full_name') or 'Unknown'
                name_parts = str(raw_name).strip().split(' ', 1)
                first_name = name_parts[0]
                last_name = name_parts[1] if len(name_parts) > 1 else payload.get('last_name', '')
                
                email = payload.get('email', '')
                mobile = payload.get('mobile') or payload.get('phone') or payload.get('phone_number') or ''
                
                clean_phone = normalize_lead_phone(mobile)
                clean_em = normalize_lead_email(email)

                if not clean_phone and not clean_em:
                    raise ValueError("At least valid email or mobile is required to create a lead.")

                program_id = payload.get('program_id')

                # Centralized duplicate check
                dup_student, dup_reason = lookup_existing_student(mobile=clean_phone, email=clean_em)
                if dup_student:
                    event_id = payload.get('event_id') or payload.get('id') or payload.get('lead_id')
                    record_reengagement_interaction(
                        student=dup_student,
                        source_name="Campaign Webhook",
                        campaign_name=campaign.name if campaign else None,
                        event_id=str(event_id) if event_id else None,
                        extra_notes=dup_reason
                    )

                    program = None
                    if program_id:
                        program = Program.objects.filter(id=program_id).first()

                    new_dup_student = create_duplicate_lead(
                        existing_student=dup_student,
                        first_name=first_name,
                        last_name=last_name,
                        mobile=clean_phone,
                        email=clean_em,
                        campaign=campaign,
                        program=program,
                        sales_section=campaign.section if campaign else 'BOTH',
                        duplicate_reason=dup_reason,
                        log_reengagement=False
                    )

                    return Response({
                        "message": "Duplicate lead created and re-engagement logged.",
                        "student_id": new_dup_student.id,
                        "crm_id": new_dup_student.crm_student_id,
                        "original_crm_id": dup_student.crm_student_id,
                        "assigned_to": "Unassigned",
                        "status": "DUPLICATE",
                        "is_duplicate": True
                    }, status=status.HTTP_200_OK)

                # Create or get User
                username = clean_em if clean_em else f"lead_{clean_phone}"
                user_email = clean_em if clean_em else f"{username}@webhook.temp"
                
                user, created = User.objects.get_or_create(
                    username=username,
                    defaults={'email': user_email, 'role': 'STUDENT'}
                )
                if created:
                    user.set_password('welcome123')
                    user.save()

                # Generate CRM ID
                crm_id = Student.generate_next_crm_id()

                # Assign Program (fallback to campaign section match)
                program = None
                if program_id:
                    program = Program.objects.filter(id=program_id).first()
                if not program:
                    if campaign and campaign.section == 'CAREER_ACADEMY':
                        program = Program.objects.filter(name='Natya Career Academy').first()
                    elif campaign and campaign.section == 'REGULAR':
                        program = Program.objects.filter(name='Natya').first()
                    if not program:
                        program = Program.objects.exclude(name="Wise Import").first() or Program.objects.first()

                # Check if Student profile already exists for this User
                student = Student.objects.filter(user=user).first()
                if student:
                    student.first_name = first_name
                    student.last_name = last_name
                    if clean_em:
                        student.email = clean_em
                    if clean_phone:
                        student.mobile = clean_phone
                    if program:
                        student.program_type = program
                    student.campaign = campaign
                    student.sales_section = campaign.section
                    student.save()
                    
                    LeadInteraction.objects.create(
                        student=student,
                        author=None,
                        interaction_type='NOTE',
                        notes=f"Re-engaged lead from Campaign Webhook: {campaign.name}."
                    )
                else:
                    # Genuinely new lead: determine assignment and create Student Lead
                    assigned_to_user = get_next_assigned_rep(campaign)

                    from .utils import get_canonical_new_lead_stage_id
                    student = Student.objects.create(
                        user=user,
                        crm_student_id=crm_id,
                        first_name=first_name,
                        last_name=last_name,
                        email=clean_em,
                        mobile=clean_phone,
                        program_type=program,
                        campaign=campaign,
                        sales_section=campaign.section,
                        lead_status=get_canonical_new_lead_stage_id(),
                        assigned_to=assigned_to_user,
                        is_active=True
                    )

                return Response({
                    "message": "Lead processed successfully.",
                    "student_id": student.id,
                    "crm_id": student.crm_student_id,
                    "assigned_to": student.assigned_to.username if student.assigned_to else "Unassigned",
                    "status": student.lead_status
                }, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error(f"Campaign lead webhook error: {e}")
            return Response({"error": "Failed to process campaign lead."}, status=status.HTTP_400_BAD_REQUEST)




from django.db.models import Sum, Count, Q
from django.utils.dateparse import parse_date
from datetime import timedelta



class CallAnalyticsView(APIView):

    permission_classes = [permissions.IsAuthenticated]



    def get(self, request):
        allowed_roles = ['SUPER_ADMIN', 'ADMIN', 'SALES', 'SALES_HEAD', 'SALES_MANAGER', 'MANAGER', 'SALES_LEAD', 'HR']
        if not (request.user.is_superuser or request.user.is_staff or request.user.role in allowed_roles):
            return Response({"error": "Unauthorized access to call analytics"}, status=status.HTTP_403_FORBIDDEN)

        interactions = LeadInteraction.objects.filter(interaction_type='CALL')
        from .utils import check_is_sales_manager
        is_sales_mgr = check_is_sales_manager(request.user)
        if request.user.role == 'SALES' and not is_sales_mgr:
            interactions = interactions.filter(author=request.user)
        elif getattr(request.user, 'sales_section', 'BOTH') != 'BOTH' and request.user.role in ['SALES', 'SALES_HEAD', 'SALES_MANAGER', 'MANAGER', 'SALES_LEAD']:
            interactions = interactions.filter(
                Q(author__sales_section=request.user.sales_section) |
                Q(student__sales_section=request.user.sales_section)
            )

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
            try:
                emp_id_int = int(employee_id)
                if request.user.role == 'SALES' and not is_sales_mgr:
                    if emp_id_int != request.user.id:
                        return Response({"error": "Unauthorized to view other representatives' call analytics"}, status=status.HTTP_403_FORBIDDEN)
                interactions = interactions.filter(author_id=emp_id_int)
            except (ValueError, TypeError):
                interactions = interactions.none()
            
        direction = request.query_params.get('direction')
        if direction:
            interactions = interactions.filter(call_direction=direction)
            
        status_param = request.query_params.get('status')
        if status_param:
            if status_param.upper() == 'MISSED':
                interactions = interactions.filter(call_status__in=['MISSED', 'UNANSWERED', 'missed', 'unanswered'])
            else:
                interactions = interactions.filter(call_status__iexact=status_param)

        total_incoming = interactions.filter(call_direction='INCOMING').count()
        total_outgoing = interactions.filter(call_direction='OUTGOING').count()
        
        missed = interactions.filter(call_status__in=['MISSED', 'UNANSWERED', 'missed', 'unanswered']).count()
        rejected = interactions.filter(call_status__iexact='REJECTED').count()

        duration_incoming = interactions.filter(call_direction='INCOMING').aggregate(Sum('call_duration'))['call_duration__sum'] or 0
        duration_outgoing = interactions.filter(call_direction='OUTGOING').aggregate(Sum('call_duration'))['call_duration__sum'] or 0
        
        total_calls = interactions.count()
        total_duration = interactions.aggregate(Sum('call_duration'))['call_duration__sum'] or 0



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



        try:
            page = max(1, int(request.query_params.get('page', 1)))
        except (ValueError, TypeError):
            page = 1
        page_size = 20
        start = (page - 1) * page_size
        end = start + page_size
        
        history_qs = interactions.select_related('author', 'student').order_by('-date')
        total_history = history_qs.count()

        history = []
        for inter in history_qs[start:end]:
            rec_url = None
            if inter.audio_recording:
                try:
                    rec_url = request.build_absolute_uri(inter.audio_recording.url)
                except Exception:
                    rec_url = inter.audio_recording.url
            elif inter.recording_url:
                rec_url = inter.recording_url

            client_name = f"{inter.student.first_name} {inter.student.last_name}".strip() if inter.student else (inter.customer_number or inter.caller_number or inter.receiver_number or 'Unknown / Unmatched')
            client_phone = inter.student.mobile if inter.student else (inter.customer_number or inter.caller_number or inter.receiver_number or '')

            history.append({
                'id': inter.id,
                'date': inter.date,
                'employee': f"{inter.author.first_name} {inter.author.last_name}".strip() if inter.author else 'System / Unknown',
                'client': client_name,
                'phone_number': client_phone,
                'student_id': inter.student_id,
                'is_matched': bool(inter.student_id),
                'direction': inter.call_direction or 'OUTGOING',
                'status': inter.call_status or 'CONNECTED',
                'duration': inter.call_duration,
                'recording_url': rec_url
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
        from django.db.models import Count, Sum, Q
        from datetime import datetime, timedelta
        from django.utils import timezone
        
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')

        # Summary Stats
        campaigns = Campaign.objects.all()
        students = Student.objects.filter(is_active=True, campaign__isnull=False).exclude(lead_status__iexact='DUPLICATE')

        campaign_id = request.query_params.get('campaign_id')
        if campaign_id:
            try:
                camp_id = int(campaign_id)
                campaigns = campaigns.filter(id=camp_id)
                students = students.filter(campaign_id=camp_id)
            except (ValueError, TypeError):
                campaigns = campaigns.none()
                students = students.none()

        section_param = request.query_params.get('section') or request.query_params.get('sales_section')
        if section_param and section_param.upper() != 'ALL':
            campaigns = campaigns.filter(Q(section=section_param.upper()) | Q(section='BOTH'))
            students = students.filter(Q(sales_section=section_param.upper()) | Q(assigned_to__sales_section=section_param.upper()))

        if request.user.role in ['SALES', 'SALES_HEAD', 'SALES_MANAGER', 'MANAGER', 'SALES_LEAD'] and getattr(request.user, 'sales_section', 'BOTH') != 'BOTH':
            campaigns = campaigns.filter(Q(section=request.user.sales_section) | Q(section='BOTH'))
            students = students.filter(Q(sales_section=request.user.sales_section) | Q(assigned_to__sales_section=request.user.sales_section))

        parsed_start = None
        parsed_end = None
        if start_date_str:
            try:
                parsed_start = datetime.strptime(start_date_str, '%Y-%m-%d').date()
                campaigns = campaigns.filter(created_at__date__gte=parsed_start)
            except ValueError:
                pass
        
        if end_date_str:
            try:
                parsed_end = datetime.strptime(end_date_str, '%Y-%m-%d').date()
                campaigns = campaigns.filter(created_at__date__lte=parsed_end)
            except ValueError:
                pass

        if parsed_start and parsed_end:
            students = students.filter(
                Q(created_at__date__gte=parsed_start, created_at__date__lte=parsed_end) |
                Q(created_at__isnull=True, user__date_joined__date__gte=parsed_start, user__date_joined__date__lte=parsed_end)
            )
        elif parsed_start:
            students = students.filter(
                Q(created_at__date__gte=parsed_start) |
                Q(created_at__isnull=True, user__date_joined__date__gte=parsed_start)
            )
        elif parsed_end:
            students = students.filter(
                Q(created_at__date__lte=parsed_end) |
                Q(created_at__isnull=True, user__date_joined__date__lte=parsed_end)
            )

        # Dynamically determine all converted/enrolled pipeline stage values using canonical helper
        from .utils import get_converted_stage_values
        converted_stages_list = get_converted_stage_values()

        total_spend = campaigns.aggregate(total=Sum('budget'))['total'] or 0
        total_leads = students.count()
        total_converted = students.filter(lead_status__in=converted_stages_list).count()

        # Chart Data
        from django.db.models.functions import Coalesce, TruncDate
        
        daily_leads_qs = students
        if not parsed_start:
            # Default to 30 days if no start date provided
            thirty_days_ago = timezone.now().date() - timedelta(days=30)
            daily_leads_qs = students.filter(
                Q(created_at__date__gte=thirty_days_ago) |
                Q(created_at__isnull=True, user__date_joined__date__gte=thirty_days_ago)
            )
            
        daily_leads = daily_leads_qs.annotate(lead_date=Coalesce('created_at', 'user__date_joined')).annotate(date=TruncDate('lead_date')).values('date').annotate(count=Count('id')).order_by('date')
        
        chart_data = []
        for d in daily_leads:
            chart_data.append({
                'date': str(d['date']),
                'leads': d['count']
            })

        # Sales Team Report
        sales_reps = User.objects.filter(role='SALES')
        from .utils import check_is_sales_manager
        if request.user.role == 'SALES' and not check_is_sales_manager(request.user):
            sales_reps = sales_reps.filter(id=request.user.id)
        elif getattr(request.user, 'sales_section', 'BOTH') != 'BOTH':
            from django.db.models import Q
            sales_reps = sales_reps.filter(Q(sales_section=request.user.sales_section) | Q(sales_section='BOTH'))

        sales_report = []
        for rep in sales_reps:
            rep_leads = Student.objects.filter(assigned_to=rep, is_active=True).exclude(lead_status__iexact='DUPLICATE')
            if parsed_start and parsed_end:
                rep_leads = rep_leads.filter(
                    Q(created_at__date__gte=parsed_start, created_at__date__lte=parsed_end) |
                    Q(created_at__isnull=True, user__date_joined__date__gte=parsed_start, user__date_joined__date__lte=parsed_end)
                )
            elif parsed_start:
                rep_leads = rep_leads.filter(
                    Q(created_at__date__gte=parsed_start) |
                    Q(created_at__isnull=True, user__date_joined__date__gte=parsed_start)
                )
            elif parsed_end:
                rep_leads = rep_leads.filter(
                    Q(created_at__date__lte=parsed_end) |
                    Q(created_at__isnull=True, user__date_joined__date__lte=parsed_end)
                )

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
        user = request.user
        from .utils import check_is_sales_manager
        if not check_is_sales_manager(user):
            return Response({'error': 'You do not have permission to assign leads.'}, status=status.HTTP_403_FORBIDDEN)

        lead_ids = request.data.get('lead_ids', [])
        sales_user_id = request.data.get('sales_user_id')

        if not lead_ids or not sales_user_id:
            return Response({'error': 'lead_ids and sales_user_id are required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            sales_user = User.objects.get(id=sales_user_id, role='SALES')
            students = Student.objects.filter(id__in=lead_ids).exclude(lead_status__iexact='DUPLICATE')
            updated = students.update(assigned_to=sales_user)
            return Response({'message': f'Successfully assigned {updated} leads to {sales_user.username}'})
        except User.DoesNotExist:
            return Response({'error': 'Sales user not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Bulk lead assignment error: {e}")
            return Response({'error': 'Failed to assign leads. Please try again.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class LeadTaskViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ['retrieve', 'update', 'partial_update']:
            return LeadTaskDetailSerializer
        return LeadTaskListSerializer

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return LeadTask.objects.none()

        sales_roles = ['SALES', 'SALES_HEAD', 'SALES_MANAGER', 'MANAGER', 'SALES_LEAD', 'SUPER_ADMIN', 'ADMIN', 'TEAM_LEAD']
        if getattr(user, 'role', '') not in sales_roles and not user.is_superuser:
            return LeadTask.objects.none()

        from .utils import check_is_sales_manager
        qs = LeadTask.objects.all().select_related('assigned_to', 'created_by').prefetch_related(
            'items__lead', 'items__assigned_to', 'items__lead__program_type',
            'items__lead__course', 'items__lead__assigned_to', 'items__completed_by',
            'assigned_bdes', 'assignment_history'
        )
        if not check_is_sales_manager(user):
            # Regular BDE only sees tasks assigned to them (either as primary, in assigned_bdes, or having assigned items)
            from django.db.models import Q
            qs = qs.filter(
                Q(assigned_to=user) |
                Q(assigned_bdes=user) |
                Q(items__assigned_to=user)
            ).distinct()
        else:
            # Sales manager can optionally filter by assigned_to or status
            user_section = getattr(user, 'sales_section', 'BOTH')
            if user_section and user_section != 'BOTH':
                from django.db.models import Q
                qs = qs.filter(
                    Q(assigned_to__sales_section=user_section) |
                    Q(created_by__sales_section=user_section) |
                    Q(items__lead__sales_section=user_section) |
                    Q(assigned_bdes__sales_section=user_section)
                ).distinct()

            # Team Lead authorized scope filtering:
            if getattr(user, 'role', '') not in ['SUPER_ADMIN', 'ADMIN'] and not user.is_superuser:
                subordinates = user.get_all_subordinates() if hasattr(user, 'get_all_subordinates') else []
                if not subordinates and hasattr(user, 'hrms_profile') and hasattr(user.hrms_profile, 'subordinates'):
                    hrms_subs = user.hrms_profile.subordinates.select_related('user').all()
                    subordinates = [sub.user for sub in hrms_subs if sub.user]

                if subordinates:
                    team_user_ids = [user.id] + [s.id for s in subordinates]
                    from django.db.models import Q
                    qs = qs.filter(
                        Q(assigned_to_id__in=team_user_ids) |
                        Q(created_by_id__in=team_user_ids) |
                        Q(assigned_bdes__id__in=team_user_ids) |
                        Q(items__assigned_to_id__in=team_user_ids)
                    ).distinct()

            assigned_to = self.request.query_params.get('assigned_to')
            if assigned_to:
                from django.db.models import Q
                qs = qs.filter(
                    Q(assigned_to_id=assigned_to) |
                    Q(assigned_bdes__id=assigned_to) |
                    Q(items__assigned_to_id=assigned_to)
                ).distinct()
            status_param = self.request.query_params.get('status')
            if status_param:
                qs = qs.filter(status=status_param.upper())
        return qs

    @action(detail=False, methods=['post'], url_path='validate-csv')
    def validate_csv(self, request):
        user = request.user
        from .utils import check_is_sales_manager
        if not check_is_sales_manager(user):
            return Response({'error': 'You do not have permission to upload task leads.'}, status=status.HTTP_403_FORBIDDEN)

        rows = request.data.get('rows')
        if rows is None and 'file' in request.FILES:
            import csv
            import io
            file_obj = request.FILES['file']
            try:
                decoded = file_obj.read().decode('utf-8-sig', errors='replace')
                reader = csv.DictReader(io.StringIO(decoded))
                rows = list(reader)
            except Exception as e:
                return Response({'error': f'Failed to parse CSV file: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

        if not rows or not isinstance(rows, list):
            return Response({'error': 'No rows found in the uploaded file or payload.'}, status=status.HTTP_400_BAD_REQUEST)

        first_row = rows[0] if rows else {}
        headers_lower = {k.strip().lower(): k for k in first_row.keys()}

        id_col = None
        for candidate in ['crm_student_id', 'lead_id', 'student_id', 'crm_id', 'lead id', 'student id', 'id']:
            if candidate in headers_lower:
                id_col = headers_lower[candidate]
                break

        contact_col = None
        for candidate in ['mobile', 'contact', 'phone', 'phone_number', 'mobile_number', 'contact_number']:
            if candidate in headers_lower:
                contact_col = headers_lower[candidate]
                break

        email_col = None
        for candidate in ['email', 'email_address', 'mail']:
            if candidate in headers_lower:
                email_col = headers_lower[candidate]
                break

        if not id_col and not contact_col and not email_col:
            return Response({
                'error': (
                    "CSV must contain at least one recognized lead identifier column: "
                    "'lead_id' (or 'crm_student_id' / 'id'), 'contact' (or 'mobile'), or 'email'."
                ),
                'available_columns': list(first_row.keys())
            }, status=status.HTTP_400_BAD_REQUEST)

        id_vals = set()
        mobile_vals = set()
        email_vals = set()
        for r in rows:
            if id_col and r.get(id_col):
                val = str(r[id_col]).strip()
                if val:
                    id_vals.add(val)
            if contact_col and r.get(contact_col):
                val = str(r[contact_col]).strip()
                if val:
                    import re
                    digits = re.sub(r'\D', '', val)
                    if digits:
                        mobile_vals.add(digits)
                        if len(digits) > 10:
                            mobile_vals.add(digits[-10:])
            if email_col and r.get(email_col):
                val = str(r[email_col]).strip().lower()
                if val:
                    email_vals.add(val)

        from django.db.models import Q
        query = Q()
        if id_vals:
            numeric_ids = [int(v) for v in id_vals if v.isdigit()]
            query |= Q(crm_student_id__in=id_vals)
            if numeric_ids:
                query |= Q(id__in=numeric_ids)
        if mobile_vals:
            query |= Q(mobile__in=mobile_vals)
            for m in list(mobile_vals)[:50]:
                query |= Q(mobile__endswith=m[-10:])
        if email_vals:
            query |= Q(email__in=email_vals)

        matching_students = list(
            Student.objects.filter(query)
            .select_related('program_type', 'course', 'assigned_to')
        )

        by_crm_id = {}
        by_pk = {}
        by_mobile = {}
        by_email = {}
        for s in matching_students:
            if s.crm_student_id:
                by_crm_id[s.crm_student_id.strip().upper()] = s
            by_pk[str(s.id)] = s
            if s.mobile:
                import re
                d = re.sub(r'\D', '', s.mobile)
                if d:
                    by_mobile[d] = s
                    if len(d) >= 10:
                        by_mobile[d[-10:]] = s
            if s.email:
                by_email[s.email.strip().lower()] = s

        matched_leads = []
        matched_lead_ids = set()
        duplicate_rows = []
        unmatched_rows = []

        user_section = getattr(user, 'sales_section', 'BOTH')

        for idx, row in enumerate(rows):
            row_num = idx + 2
            matched_student = None
            used_identifier = None

            if id_col and row.get(id_col):
                raw_id = str(row[id_col]).strip()
                if raw_id:
                    used_identifier = f"ID: {raw_id}"
                    matched_student = by_crm_id.get(raw_id.upper()) or by_pk.get(raw_id)

            if not matched_student and contact_col and row.get(contact_col):
                raw_mob = str(row[contact_col]).strip()
                if raw_mob:
                    import re
                    d = re.sub(r'\D', '', raw_mob)
                    used_identifier = used_identifier or f"Contact: {raw_mob}"
                    matched_student = by_mobile.get(d) or (by_mobile.get(d[-10:]) if len(d) >= 10 else None)

            if not matched_student and email_col and row.get(email_col):
                raw_email = str(row[email_col]).strip().lower()
                if raw_email:
                    used_identifier = used_identifier or f"Email: {raw_email}"
                    matched_student = by_email.get(raw_email)

            if not matched_student:
                unmatched_rows.append({
                    'row': row_num,
                    'row_number': row_num,
                    'identifier': used_identifier or 'Empty row identifier',
                    'data': {k: str(v)[:40] for k, v in row.items() if v},
                    'reason': f"No existing CRM lead matches identifier '{used_identifier}'." if used_identifier else 'Empty row identifier.'
                })
                continue

            if user_section and user_section != 'BOTH' and getattr(user, 'role', '') not in ['SUPER_ADMIN', 'ADMIN']:
                if getattr(matched_student, 'sales_section', '') not in [user_section, 'BOTH']:
                    unmatched_rows.append({
                        'row': row_num,
                        'row_number': row_num,
                        'identifier': used_identifier,
                        'reason': f"Lead belongs to section '{matched_student.sales_section}', outside your authorized section ({user_section})."
                    })
                    continue

            if matched_student.id in matched_lead_ids:
                duplicate_rows.append({
                    'row': row_num,
                    'row_number': row_num,
                    'identifier': used_identifier,
                    'lead_id': matched_student.id,
                    'lead_name': f"{matched_student.first_name or ''} {matched_student.last_name or ''}".strip() or matched_student.crm_student_id,
                    'reason': f"Duplicate row: Lead {matched_student.crm_student_id} was already matched in an earlier row."
                })
                continue

            matched_lead_ids.add(matched_student.id)
            owner_name = (
                f"{matched_student.assigned_to.first_name} {matched_student.assigned_to.last_name}".strip()
                or matched_student.assigned_to.username
            ) if matched_student.assigned_to else "Unassigned"
            matched_leads.append({
                'id': matched_student.id,
                'lead_id': matched_student.id,
                'crm_student_id': matched_student.crm_student_id,
                'name': f"{matched_student.first_name or ''} {matched_student.last_name or ''}".strip() or f"Lead #{matched_student.id}",
                'mobile': matched_student.mobile or '',
                'email': matched_student.email or '',
                'lead_status': matched_student.lead_status or 'NEW',
                'program_name': matched_student.program_type.name if matched_student.program_type else '',
                'owner_name': owner_name
            })

        return Response({
            'valid': True,
            'total_rows': len(rows),
            'matched_count': len(matched_leads),
            'unmatched_count': len(unmatched_rows),
            'duplicate_count': len(duplicate_rows),
            'matched_leads': matched_leads,
            'unmatched_rows': unmatched_rows,
            'duplicate_rows': duplicate_rows
        }, status=status.HTTP_200_OK)

    def create(self, request, *args, **kwargs):
        user = request.user
        from .utils import check_is_sales_manager
        if not check_is_sales_manager(user):
            return Response({'error': 'You do not have permission to create tasks.'}, status=status.HTTP_403_FORBIDDEN)

        title = str(request.data.get('title', '')).strip()
        assigned_to_ids = request.data.get('assigned_to_ids')
        if not assigned_to_ids:
            single_assignee = request.data.get('assigned_to')
            if single_assignee:
                assigned_to_ids = [single_assignee]
            else:
                assigned_to_ids = []

        if isinstance(assigned_to_ids, (str, int)):
            assigned_to_ids = [assigned_to_ids]

        lead_ids = request.data.get('lead_ids', [])

        if not title:
            return Response({'error': 'Task name is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not assigned_to_ids or not isinstance(assigned_to_ids, list):
            return Response({'error': 'Please select at least one BDE executive to assign.'}, status=status.HTTP_400_BAD_REQUEST)
        if not lead_ids or not isinstance(lead_ids, list):
            return Response({'error': 'At least one lead must be selected.'}, status=status.HTTP_400_BAD_REQUEST)

        # Normalize IDs to int and preserve specified order
        normalized_bde_ids = []
        for x in assigned_to_ids:
            try:
                normalized_bde_ids.append(int(x))
            except (ValueError, TypeError):
                pass
        unique_bde_ids = list(dict.fromkeys(normalized_bde_ids))

        bde_qs = User.objects.filter(id__in=unique_bde_ids)
        bde_map = {u.id: u for u in bde_qs}
        if len(bde_map) != len(unique_bde_ids):
            return Response({'error': 'One or more assigned BDE executives do not exist.'}, status=status.HTTP_404_NOT_FOUND)
        bde_users = [bde_map[uid] for uid in unique_bde_ids]

        # Team Lead authorized scope verification for assignees:
        if getattr(user, 'role', '') not in ['SUPER_ADMIN', 'ADMIN'] and not user.is_superuser:
            subordinates = user.get_all_subordinates() if hasattr(user, 'get_all_subordinates') else []
            if not subordinates and hasattr(user, 'hrms_profile') and hasattr(user.hrms_profile, 'subordinates'):
                hrms_subs = user.hrms_profile.subordinates.select_related('user').all()
                subordinates = [sub.user for sub in hrms_subs if sub.user]

            if subordinates:
                team_user_ids = {user.id} | {s.id for s in subordinates}
                for bde in bde_users:
                    if bde.id not in team_user_ids:
                        return Response({'error': f'You can only assign tasks to executives within your team ({bde.get_full_name() or bde.username} is outside your team).'}, status=status.HTTP_403_FORBIDDEN)

        unique_lead_ids = list(dict.fromkeys(lead_ids))
        leads = list(Student.objects.filter(id__in=unique_lead_ids))
        if not leads:
            return Response({'error': 'No valid leads found from the selected IDs.'}, status=status.HTTP_400_BAD_REQUEST)

        lead_map = {l.id: l for l in leads}
        ordered_leads = [lead_map[lid] for lid in unique_lead_ids if lid in lead_map]

        user_section = getattr(user, 'sales_section', 'BOTH')
        if user_section and user_section != 'BOTH' and getattr(user, 'role', '') not in ['SUPER_ADMIN', 'ADMIN']:
            invalid_scope = [l for l in ordered_leads if getattr(l, 'sales_section', '') not in [user_section, 'BOTH']]
            if invalid_scope:
                return Response({'error': f"{len(invalid_scope)} lead(s) are outside your assigned section ({user_section})."}, status=status.HTTP_403_FORBIDDEN)

        # Idempotency / duplicate submission safeguard:
        from datetime import timedelta
        from django.utils import timezone
        recent_duplicate = LeadTask.objects.filter(
            title__iexact=title,
            created_by=user,
            created_at__gte=timezone.now() - timedelta(seconds=15)
        ).first()
        if recent_duplicate:
            existing_lead_ids = set(recent_duplicate.items.values_list('lead_id', flat=True))
            existing_bde_ids = set(recent_duplicate.assigned_bdes.values_list('id', flat=True))
            if not existing_bde_ids and recent_duplicate.assigned_to_id:
                existing_bde_ids = {recent_duplicate.assigned_to_id}
            if existing_lead_ids == set(unique_lead_ids) and existing_bde_ids == set(bde.id for bde in bde_users):
                serializer = LeadTaskDetailSerializer(recent_duplicate, context={'request': request})
                return Response(serializer.data, status=status.HTTP_200_OK)

        # Multiple BDE Workload Distribution:
        # Deterministic approximately equal distribution across selected BDE executives
        # e.g. 100 leads across 3 BDEs: 34, 33, 33
        num_leads = len(ordered_leads)
        num_bdes = len(bde_users)
        base = num_leads // num_bdes
        remainder = num_leads % num_bdes

        with transaction.atomic():
            task = LeadTask.objects.create(
                title=title,
                assigned_to=bde_users[0] if bde_users else None,
                created_by=user,
                status='PENDING'
            )
            task.assigned_bdes.set(bde_users)

            task_items = []
            start_idx = 0
            for i, bde in enumerate(bde_users):
                count = base + (1 if i < remainder else 0)
                chunk = ordered_leads[start_idx:start_idx + count]
                for lead in chunk:
                    task_items.append(LeadTaskItem(task=task, lead=lead, assigned_to=bde))
                start_idx += count

            LeadTaskItem.objects.bulk_create(task_items)

            bde_names = ", ".join([u.get_full_name() or u.username for u in bde_users])
            LeadTaskAssignmentHistory.objects.create(
                task=task,
                previous_assignee=None,
                new_assignee=bde_users[0],
                reassigned_by=user,
                notes=f"Task created with {len(ordered_leads)} leads distributed across {len(bde_users)} BDE(s): {bde_names}."
            )

        serializer = LeadTaskDetailSerializer(task, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='reassign')
    def reassign(self, request, pk=None):
        task = self.get_object()
        user = request.user
        from .utils import check_is_sales_manager
        if not check_is_sales_manager(user):
            return Response({'error': 'Only team leads and managers can reassign tasks.'}, status=status.HTTP_403_FORBIDDEN)

        new_assignee_id = request.data.get('new_assignee_id')
        lead_id = request.data.get('lead_id')
        notes = str(request.data.get('notes', '')).strip()

        if not new_assignee_id:
            return Response({'error': 'new_assignee_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            new_assignee = User.objects.get(id=new_assignee_id)
        except User.DoesNotExist:
            return Response({'error': 'New assignee not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Team Lead authorized scope verification:
        if getattr(user, 'role', '') not in ['SUPER_ADMIN', 'ADMIN'] and not user.is_superuser:
            subordinates = user.get_all_subordinates() if hasattr(user, 'get_all_subordinates') else []
            if not subordinates and hasattr(user, 'hrms_profile') and hasattr(user.hrms_profile, 'subordinates'):
                hrms_subs = user.hrms_profile.subordinates.select_related('user').all()
                subordinates = [sub.user for sub in hrms_subs if sub.user]

            if subordinates:
                team_user_ids = {user.id} | {s.id for s in subordinates}
                if new_assignee.id not in team_user_ids:
                    return Response({'error': 'You can only reassign tasks to executives within your team.'}, status=status.HTTP_403_FORBIDDEN)

        with transaction.atomic():
            new_name = new_assignee.get_full_name() or new_assignee.username
            if lead_id:
                try:
                    item = task.items.get(lead_id=lead_id)
                except LeadTaskItem.DoesNotExist:
                    return Response({'error': 'Lead item not found in this task.'}, status=status.HTTP_404_NOT_FOUND)
                old_assignee = item.assigned_to or task.assigned_to
                if old_assignee and old_assignee.id == new_assignee.id:
                    return Response({'error': 'Lead is already assigned to this executive.'}, status=status.HTTP_400_BAD_REQUEST)
                item.assigned_to = new_assignee
                item.save(update_fields=['assigned_to', 'updated_at'])
                task.assigned_bdes.add(new_assignee)
                old_name = old_assignee.get_full_name() or old_assignee.username if old_assignee else 'Unassigned'
                lead_title = f"{item.lead.first_name or ''} {item.lead.last_name or ''}".strip() or item.lead.crm_student_id
                LeadTaskAssignmentHistory.objects.create(
                    task=task,
                    item=item,
                    previous_assignee=old_assignee,
                    new_assignee=new_assignee,
                    reassigned_by=user,
                    notes=notes or f"Lead {lead_title} reassigned from {old_name} to {new_name}"
                )
            else:
                old_assignee = task.assigned_to
                task.assigned_to = new_assignee
                task.save(update_fields=['assigned_to', 'updated_at'])
                task.assigned_bdes.add(new_assignee)
                task.items.update(assigned_to=new_assignee)
                old_name = old_assignee.get_full_name() or old_assignee.username if old_assignee else 'Unassigned'
                LeadTaskAssignmentHistory.objects.create(
                    task=task,
                    previous_assignee=old_assignee,
                    new_assignee=new_assignee,
                    reassigned_by=user,
                    notes=notes or f"Entire task reassigned from {old_name} to {new_name}"
                )

        serializer = LeadTaskDetailSerializer(task, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='update-lead')
    def update_lead(self, request, pk=None):
        task = self.get_object()
        user = request.user
        from .utils import check_is_sales_manager

        lead_id = request.data.get('lead_id')
        is_completed = request.data.get('is_completed')
        notes = request.data.get('notes')

        if lead_id is None:
            return Response({'error': 'lead_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            item = task.items.get(lead_id=lead_id)
        except LeadTaskItem.DoesNotExist:
            return Response({'error': 'Lead item not found in this task.'}, status=status.HTTP_404_NOT_FOUND)

        is_manager = check_is_sales_manager(user)
        is_item_assignee = (item.assigned_to_id == user.id) or (item.assigned_to_id is None and task.assigned_to_id == user.id)
        if not is_manager and not is_item_assignee:
            return Response({'error': 'You do not have permission to update this lead. It is assigned to another executive.'}, status=status.HTTP_403_FORBIDDEN)

        with transaction.atomic():
            from django.utils import timezone
            if is_completed is not None:
                item.is_completed = bool(is_completed)
                if item.is_completed:
                    item.completed_at = timezone.now()
                    item.completed_by = user
                else:
                    item.completed_at = None
                    item.completed_by = None
            if notes is not None:
                item.notes = str(notes).strip()

            item.save()
            task.update_status_from_items(save=True)

        serializer = LeadTaskDetailSerializer(task, context={'request': request})
        return Response(serializer.data)

    def update(self, request, *args, **kwargs):
        user = request.user
        from .utils import check_is_sales_manager
        if not check_is_sales_manager(user):
            return Response({'error': 'You do not have permission to edit task details.'}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        user = request.user
        from .utils import check_is_sales_manager
        if not check_is_sales_manager(user):
            return Response({'error': 'You do not have permission to edit task details.'}, status=status.HTTP_403_FORBIDDEN)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        user = request.user
        from .utils import check_is_sales_manager
        if not check_is_sales_manager(user):
            return Response({'error': 'You do not have permission to delete tasks.'}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)
