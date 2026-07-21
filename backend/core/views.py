
from rest_framework import viewsets, permissions, status, filters
from rest_framework.filters import SearchFilter
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q, Sum, Count, F
from django.http import HttpResponse
from django.contrib.auth import get_user_model
import pandas as pd

from .models import Program, SubProgram, Course, Batch, Student, Transaction, Document, SyllabusPart, ClassSession, Attendance, BatchResource, Exam, ExamResult, Question, QuestionOption, StudentSubmission
from .serializers import (
    ProgramSerializer, SubProgramSerializer, CourseSerializer, 
    BatchSerializer, StudentSerializer, TransactionSerializer, DocumentSerializer,
    ProgramHierarchySerializer, SyllabusPartSerializer, ClassSessionSerializer, AttendanceSerializer, BatchResourceSerializer,
    ExamSerializer, ExamResultSerializer, QuestionSerializer, StudentSubmissionSerializer
)
from rest_framework.views import APIView
from .permissions import DynamicRolePermission, IsMentorOwner

class IsAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.is_authenticated and request.user.role in ['ADMIN', 'SUPER_ADMIN']

class ProgramViewSet(viewsets.ModelViewSet):
    queryset = Program.objects.all()
    serializer_class = ProgramSerializer
    permission_classes = [DynamicRolePermission]
    module_name = 'ACADEMIC'
    pagination_class = None
    filter_backends = [SearchFilter]
    search_fields = ['name', 'description']
    
    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'hierarchy']:
            return [permissions.AllowAny()]
        return super().get_permissions()

    @action(detail=False, methods=['get'])
    def hierarchy(self, request):
        programs = self.get_queryset()
        serializer = ProgramHierarchySerializer(programs, many=True)
        return Response(serializer.data)

class SubProgramViewSet(viewsets.ModelViewSet):
    queryset = SubProgram.objects.all()
    serializer_class = SubProgramSerializer
    permission_classes = [DynamicRolePermission]
    module_name = 'ACADEMIC'
    pagination_class = None
    filter_backends = [SearchFilter]
    search_fields = ['name']

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.AllowAny()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = SubProgram.objects.all()
        program_id = self.request.query_params.get('program')
        if program_id:
            queryset = queryset.filter(program_id=program_id)
        return queryset

class CourseViewSet(viewsets.ModelViewSet):
    queryset = Course.objects.all()
    serializer_class = CourseSerializer
    permission_classes = [DynamicRolePermission]
    module_name = 'ACADEMIC'
    pagination_class = None
    filter_backends = [SearchFilter]
    search_fields = ['name']

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.AllowAny()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = Course.objects.all()
        sub_program_id = self.request.query_params.get('sub_program')
        if sub_program_id:
            queryset = queryset.filter(sub_program_id=sub_program_id)
        return queryset

class BatchViewSet(viewsets.ModelViewSet):
    serializer_class = BatchSerializer
    queryset = Batch.objects.all()
    filter_backends = [SearchFilter]
    search_fields = ['name', 'primary_mentor__first_name', 'primary_mentor__last_name', 'teacher__first_name', 'teacher__last_name', 'course__name']
    permission_classes = [DynamicRolePermission, IsMentorOwner]
    @property
    def module_name(self):
        # Determine module based on user role for shared view
        if hasattr(self, 'request') and self.request.user.is_authenticated:
            if self.request.user.role == 'TEACHER':
                return 'TEACHER'
        return 'MENTOR'

    def get_permissions(self):
        if self.request.user.is_authenticated and self.action in ['list', 'retrieve']:
            if self.request.user.role in ['ACADEMIC', 'ACADEMIC_COORDINATOR', 'ADMIN', 'SUPER_ADMIN']:
                return [permissions.IsAuthenticated()]
        return super().get_permissions()

    def get_queryset(self):
        user = self.request.user
        qs = Batch.objects.select_related('primary_mentor', 'course').prefetch_related('secondary_mentors')
        qs = qs.annotate(student_count_annotated=Count('students'))
        
        if user.role in ['ADMIN', 'SUPER_ADMIN', 'ACADEMIC', 'ACADEMIC_COORDINATOR', 'SALES']:
            pass
        elif user.role in ['MENTOR', 'TEACHER']:
            # Include subordinates if any
            subordinates = user.get_all_subordinates()
            if subordinates:
                # User can see their own batches AND their subordinates' batches
                users_to_check = [user] + subordinates
                qs = qs.filter(Q(primary_mentor__in=users_to_check) | Q(secondary_mentors__in=users_to_check) | Q(teacher__in=users_to_check)).distinct()
            else:
                qs = qs.filter(Q(primary_mentor=user) | Q(secondary_mentors=user) | Q(teacher=user)).distinct()
        elif user.role == 'STUDENT':
            qs = qs.filter(students__user=user).distinct()
        else:
            return Batch.objects.none()
            
        mentor_id = self.request.query_params.get('mentor_id')
        if mentor_id:
            qs = qs.filter(primary_mentor_id=mentor_id)
                    
        teacher_id = self.request.query_params.get('teacher_id')
        if teacher_id:
            qs = qs.filter(teacher_id=teacher_id)
            
        return qs.order_by('-id')

    @action(detail=True, methods=['post'])
    def add_student(self, request, pk=None):
        try:
            batch = self.get_object()
        except:
            return Response({'error': 'Batch not found or access denied'}, status=status.HTTP_404_NOT_FOUND)
            
        student_id = request.data.get('student_id')
        try:
            student = Student.objects.get(id=student_id)
            student.batch = batch
            student.save()
            
            from notifications.models import Notification
            if batch.primary_mentor:
                Notification.objects.create(
                    user=batch.primary_mentor,
                    title="New Student Assigned",
                    message=f"Student {student.first_name} has been added to your batch {batch.name}.",
                    notification_type='BATCH',
                    target_url=f"/mentor"
                )
            
            return Response({'status': 'student added'})
        except Student.DoesNotExist:
            return Response({'error': 'Student not found'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'])
    def bulk_add_students(self, request, pk=None):
        try:
            batch = self.get_object()
        except:
            return Response({'error': 'Batch not found or access denied'}, status=status.HTTP_404_NOT_FOUND)
            
        student_ids = request.data.get('student_ids', [])
        if not student_ids:
            return Response({'error': 'No student IDs provided'}, status=status.HTTP_400_BAD_REQUEST)
            
        students = Student.objects.filter(id__in=student_ids)
        students.update(batch=batch)
        
        from notifications.models import Notification
        if batch.primary_mentor:
            for student in students:
                Notification.objects.create(
                    user=batch.primary_mentor,
                    title="Student Assigned",
                    message=f"Student {student.first_name} has been added to your batch {batch.name}.",
                    notification_type='BATCH',
                    target_url=f"/mentor"
                )
        
        return Response({'status': f'Students added'})

    @action(detail=True, methods=['post'])
    def remove_student(self, request, pk=None):
        try:
            batch = self.get_object()
        except:
            return Response({'error': 'Batch not found or access denied'}, status=status.HTTP_404_NOT_FOUND)

        student_id = request.data.get('student_id')
        try:
            student = Student.objects.get(id=student_id, batch=batch)
            student.batch = None
            student.save()
            return Response({'status': 'student removed'})
        except Student.DoesNotExist:
            return Response({'error': 'Student not found in this batch'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'])
    def reassign(self, request, pk=None):
        try:
            batch = self.get_object()
        except:
            return Response({'error': 'Batch not found or access denied'}, status=status.HTTP_404_NOT_FOUND)
            
        new_mentor_id = request.data.get('new_mentor_id')
        reason = request.data.get('reason', '')
        
        if not new_mentor_id:
            return Response({'error': 'new_mentor_id is required'}, status=status.HTTP_400_BAD_REQUEST)
            
        User = get_user_model()
        try:
            new_mentor = User.objects.get(id=new_mentor_id)
        except User.DoesNotExist:
            return Response({'error': 'New mentor not found'}, status=status.HTTP_404_NOT_FOUND)
            
        previous_mentor = batch.primary_mentor
        
        if previous_mentor and previous_mentor.id == new_mentor.id:
            return Response({'error': 'Mentor is already assigned to this batch'}, status=status.HTTP_400_BAD_REQUEST)
            
        # Update batch
        batch.primary_mentor = new_mentor
        batch.save()
        
        # Create history record
        from core.models import BatchAssignmentHistory
        BatchAssignmentHistory.objects.create(
            batch=batch,
            previous_mentor=previous_mentor,
            new_mentor=new_mentor,
            assigned_by=request.user,
            reason=reason
        )
        
        from notifications.models import Notification
        Notification.objects.create(
            user=new_mentor,
            title="Batch Reassigned",
            message=f"You have been assigned to batch {batch.name}.",
            notification_type='BATCH',
            target_url=f"/mentor"
        )
        
        return Response({'status': 'Batch reassigned successfully'})

    @action(detail=True, methods=['get'])
    def assignment_history(self, request, pk=None):
        try:
            batch = self.get_object()
        except:
            return Response({'error': 'Batch not found or access denied'}, status=status.HTTP_404_NOT_FOUND)
            
        from core.models import BatchAssignmentHistory
        from core.serializers import BatchAssignmentHistorySerializer
        
        history = BatchAssignmentHistory.objects.filter(batch=batch).order_by('-assigned_at')
        serializer = BatchAssignmentHistorySerializer(history, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def log_session(self, request, pk=None):
        batch = self.get_object()
        date = request.data.get('date')
        summary = request.data.get('teacher_summary')
        completed_parts = request.data.get('completed_parts', [])
        attendance_data = request.data.get('attendance', {})
        
        if not date:
            return Response({'error': 'Date is required'}, status=status.HTTP_400_BAD_REQUEST)
            
        session = ClassSession.objects.create(batch=batch, date=date, teacher_summary=summary)
        
        if completed_parts:
            SyllabusPart.objects.filter(id__in=completed_parts, batch=batch).update(is_completed=True)
            
        for student_id, is_present in attendance_data.items():
            try:
                Attendance.objects.create(session=session, student_id=student_id, is_present=bool(is_present))
            except:
                pass
                
        return Response({'status': 'Session logged successfully'})

class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.all()
    serializer_class = StudentSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['first_name', 'last_name', 'crm_student_id', 'mobile', 'email']
    ordering_fields = ['created_at', 'id']
    permission_classes = [DynamicRolePermission]
    module_name = 'SALES'

    def filter_queryset(self, queryset):
        ordering = self.request.query_params.get('ordering')
        if ordering == 'created_at':
            self.request.query_params._mutable = True
            self.request.query_params['ordering'] = 'id'
            self.request.query_params._mutable = False
        elif ordering == '-created_at':
            self.request.query_params._mutable = True
            self.request.query_params['ordering'] = '-id'
            self.request.query_params._mutable = False
        return super().filter_queryset(queryset)
    
    def get_permissions(self):
        if self.action in ['create', 'public_lookup', 'partial_update']:
            return [permissions.AllowAny()]
        # Allow students, mentors, teachers, and academic staff to view relevant profiles/lists
        if self.request.user.is_authenticated and self.action in ['list', 'retrieve', 'fee_defaulters', 'collected_fees', 'break_metrics']:
            if self.request.user.role in ['STUDENT', 'MENTOR', 'TEACHER', 'ACADEMIC', 'ACADEMIC_COORDINATOR']:
                return [permissions.IsAuthenticated()]
        return super().get_permissions()

    @action(detail=False, methods=['get'], permission_classes=[permissions.AllowAny])
    def public_lookup(self, request):
        mobile = request.query_params.get('mobile')
        sid = request.query_params.get('sid')
        
        student = None
        if sid:
            student = Student.objects.filter(id=sid, is_active=True).first()
        elif mobile:
            student = Student.objects.filter(mobile=mobile, is_active=True).first()
            
        if not student:
            return Response({'error': 'No active student found matching these details.'}, status=status.HTTP_404_NOT_FOUND)
        
        # Return summary info to confirm
        return Response({
            'id': student.id,
            'name': f"{student.first_name} {student.last_name}",
            'program': student.program_type.name,
            'course': student.course.name if student.course else 'N/A',
            'mobile': student.mobile,
            'first_name': student.first_name,
            'last_name': student.last_name,
            'email': student.email
        })

    def perform_create(self, serializer):
        student = serializer.save()
        from notifications.models import Notification
        User = get_user_model()
        staff_users = User.objects.filter(role__in=['ADMIN', 'SUPER_ADMIN', 'SALES'])
        for user in staff_users:
            Notification.objects.create(
                user=user,
                title="New Application Received",
                message=f"Student {student.first_name} {student.last_name} has applied for {student.program_type.name}.",
                notification_type='APPLICATION',
                target_url=f"/sales?student={student.id}"
            )

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            # Allow public submissions (PATCH) for active student profiles via deep links
            return Student.objects.filter(is_active=True)
        
        # Staff/Internal View
        qs = Student.objects.select_related(
            'user', 'program_type', 'sub_program', 'course', 'batch'
        ).prefetch_related('dynamic_values__field', 'documents', 'transactions', 'monthly_payments').all()
            
        # Resolve 'CONVERTED' to its ID
        converted_stage_id = 'CONVERTED'
        try:
            from crm.models import PipelineStage
            stage = PipelineStage.objects.filter(name__iexact='CONVERTED').first()
            if stage:
                converted_stage_id = str(stage.id)
        except Exception:
            pass

        if user.role in ['ADMIN', 'SUPER_ADMIN']:
            pass 
        elif user.role == 'SALES':
            is_sales_manager = False
            if hasattr(user, 'hrms_profile'):
                profile = user.hrms_profile
                if profile.subordinates.exists():
                    is_sales_manager = True
                elif profile.designation and any(kw in profile.designation.name.lower() for kw in ['lead', 'manager', 'vp', 'head', 'director']):
                    is_sales_manager = True
            
            if not is_sales_manager:
                qs = qs.filter(assigned_to=user)
        elif user.role in ['ACADEMIC', 'ACADEMIC_COORDINATOR']:
            qs = qs.filter(lead_status=converted_stage_id)
        elif user.role in ['MENTOR', 'TEACHER']:
            subordinates = user.get_all_subordinates()
            if subordinates:
                users_to_check = [user] + subordinates
                qs = qs.filter(
                    Q(batch__primary_mentor__in=users_to_check) | 
                    Q(batch__secondary_mentors__in=users_to_check) |
                    Q(batch__teacher__in=users_to_check)
                ).filter(lead_status=converted_stage_id).distinct()
            else:
                qs = qs.filter(
                    Q(batch__primary_mentor=user) | 
                    Q(batch__secondary_mentors=user) |
                    Q(batch__teacher=user)
                ).filter(lead_status=converted_stage_id).distinct()
        elif user.role == 'STUDENT':
            qs = Student.objects.filter(user=user)
        
        # Apply Filters
        is_active = self.request.query_params.get('is_active', 'true').lower() == 'true'
        qs = qs.filter(is_active=is_active)

        batch_id = self.request.query_params.get('batch')
        if batch_id:
            qs = qs.filter(batch_id=batch_id)
        
        unassigned = self.request.query_params.get('unassigned')
        if unassigned == 'true':
            qs = qs.filter(batch__isnull=True)
            
        assigned_to = self.request.query_params.get('assigned_to')
        if assigned_to:
            if assigned_to == 'unassigned':
                qs = qs.filter(assigned_to__isnull=True)
            else:
                qs = qs.filter(assigned_to_id=assigned_to)
            
        assigned_only = self.request.query_params.get('assigned_only')
        if assigned_only == 'true':
            qs = qs.filter(assigned_to=user)
            
        upcoming_followups = self.request.query_params.get('upcoming_followups')
        if upcoming_followups == 'true':
            from django.utils import timezone
            from crm.models import Task
            # Students that have an open follow-up task with a due_date in the future
            student_ids_with_followup = Task.objects.filter(
                due_date__gte=timezone.now(),
                status__in=['PENDING', 'IN_PROGRESS', 'TODO'],
            ).values_list('student_id', flat=True).distinct()
            qs = qs.filter(id__in=student_ids_with_followup)
            
        program = self.request.query_params.get('program')
        if program:
            qs = qs.filter(program_type_id=program)

        mentor_id = self.request.query_params.get('mentor_id')
        if mentor_id:
            if user.role in ['SUPER_ADMIN', 'ADMIN', 'ACADEMIC', 'ACADEMIC_COORDINATOR']:
                qs = qs.filter(batch__primary_mentor_id=mentor_id)
            elif user.role in ['MENTOR', 'TEACHER'] and hasattr(user, 'get_all_subordinates'):
                subordinates = user.get_all_subordinates()
                if str(mentor_id) == str(user.id) or any(str(sub.id) == str(mentor_id) for sub in subordinates):
                    qs = qs.filter(batch__primary_mentor_id=mentor_id)

        lead_status = self.request.query_params.get('lead_status')
        if lead_status:
            if lead_status.upper() == 'CONVERTED':
                qs = qs.filter(lead_status=converted_stage_id)
            else:
                qs = qs.filter(lead_status__iexact=lead_status)

        sub_program = self.request.query_params.get('sub_program')
        if sub_program:
            qs = qs.filter(sub_program_id=sub_program)

        course = self.request.query_params.get('course')
        if course:
            qs = qs.filter(course_id=course)

        academic_status = self.request.query_params.get('academic_status')
        if academic_status:
            qs = qs.filter(academic_status=academic_status)

        campaign_only = self.request.query_params.get('campaign_only')
        if campaign_only == 'true':
            qs = qs.filter(campaign__isnull=False)

        start_date_str = self.request.query_params.get('start_date')
        if start_date_str:
            from django.utils.dateparse import parse_date
            start_date = parse_date(start_date_str)
            if start_date:
                qs = qs.filter(created_at__date__gte=start_date)

        end_date_str = self.request.query_params.get('end_date')
        if end_date_str:
            from django.utils.dateparse import parse_date
            end_date = parse_date(end_date_str)
            if end_date:
                qs = qs.filter(created_at__date__lte=end_date)

        return qs

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save()

    @action(detail=False, methods=['get'])
    def export_csv(self, request):
        qs = self.filter_queryset(self.get_queryset())
        data = []
        for s in qs:
            total_paid = s.transactions.aggregate(total=Sum('amount'))['total'] or 0
            
            # Map dynamic values list to a dictionary for simple lookup
            dyn_values = {val.field.label: val.value for val in s.dynamic_values.all()}
            
            row = {
                'CRM Student ID': s.crm_student_id,
                'First Name': s.first_name,
                'Last Name': s.last_name,
                'Mobile': s.mobile,
                'Email': s.email,
                'Program': s.program_type.name if s.program_type else 'N/A',
                'Sub Program': s.sub_program.name if s.sub_program else 'N/A',
                'Course': s.course.name if s.course else 'N/A',
                'Batch': s.batch.name if s.batch else 'N/A',
                'Lead Status': s.lead_status,
                'Academic Status': s.academic_status,
                'Assigned To': f"{s.assigned_to.first_name} {s.assigned_to.last_name}".strip() or s.assigned_to.username if s.assigned_to else 'Unassigned',
                'Campaign': s.campaign.name if s.campaign else 'N/A',
                'Father/Husband Name': s.father_husband_name or '',
                'Mother Name': s.mother_name or '',
                'Date of Birth': s.dob or '',
                'Gender': s.gender or '',
                'Marital Status': s.marital_status or '',
                'Permanent Address': s.perm_address or '',
                'Correspondence Address': s.corr_address or '',
                'Total Paid (CRM)': total_paid,
                'Total Fee (Synced)': s.total_fee,
                'Paid Fee (Synced)': s.paid_fee,
                'Fee Due Date': s.fee_due_date or '',
                'Monthly Payments (Paid Months)': ", ".join([p.month.strftime('%Y-%m-%d') for p in s.monthly_payments.all()]),
            }
            
            # Add dynamic field values as additional columns
            for label, value in dyn_values.items():
                row[label] = value
                
            data.append(row)
            
        if data:
            df = pd.DataFrame(data)
        else:
            # Empty fallback dataframe with basic headers
            df = pd.DataFrame(columns=[
                'CRM Student ID', 'First Name', 'Last Name', 'Mobile', 'Email', 
                'Program', 'Sub Program', 'Course', 'Batch', 'Lead Status', 
                'Academic Status', 'Assigned To', 'Campaign', 'Father/Husband Name', 
                'Mother Name', 'Date of Birth', 'Gender', 'Marital Status', 
                'Permanent Address', 'Correspondence Address', 'Total Paid (CRM)', 
                'Total Fee (Synced)', 'Paid Fee (Synced)', 'Fee Due Date', 'Monthly Payments (Paid Months)'
            ])
            
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="students.csv"'
        df.to_csv(path_or_buf=response, index=False)
        return response

    @action(detail=False, methods=['get'])
    def due_students(self, request):
        students = self.get_queryset().filter(course__isnull=False)
        due_list = []
        for s in students:
            total_paid = s.transactions.aggregate(total=Sum('amount'))['total'] or 0
            fee = s.course.fee_amount
            if total_paid < fee:
                due_list.append(s)
        serializer = self.get_serializer(due_list, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        student = self.get_object()
        student.is_active = True
        student.save()
        return Response({'status': 'student restored'})

    @action(detail=True, methods=['post'])
    def set_credentials(self, request, pk=None):
        student = self.get_object()
        user = student.user
        username = request.data.get('username')
        password = request.data.get('password')
        
        if not username or not password:
            return Response({'error': 'Username and password are required'}, status=status.HTTP_400_BAD_REQUEST)
        
        if request.user.role == 'MENTOR':
            if not student.batch or (student.batch.primary_mentor != request.user and not student.batch.secondary_mentors.filter(id=request.user.id).exists()):
                 return Response({'error': 'Permission denied: You do not mentor this student'}, status=status.HTTP_403_FORBIDDEN)

        User = get_user_model()
        if User.objects.filter(username=username).exclude(id=user.id).exists():
            return Response({'error': 'Username already taken'}, status=status.HTTP_400_BAD_REQUEST)
            
        user.username = username
        user.set_password(password)
        user.role = 'STUDENT'
        user.is_active = True
        user.save()
        
        return Response({'status': 'Credentials updated successfully'})

    @action(detail=True, methods=['post'])
    def permanent_delete(self, request, pk=None):
        student = self.get_object()
        student.delete()
        return Response({'status': 'student permanently deleted'})

    @action(detail=False, methods=['post'])
    def bulk_assign(self, request):
        student_ids = request.data.get('student_ids', [])
        user_id = request.data.get('user_id')
        
        if not student_ids:
            return Response({'error': 'No student IDs provided'}, status=status.HTTP_400_BAD_REQUEST)
            
        students = Student.objects.filter(id__in=student_ids)
        
        if user_id:
            try:
                assigned_user = get_user_model().objects.get(id=user_id)
                students.update(assigned_to=assigned_user)
                return Response({'status': f'Leads assigned to {assigned_user.first_name or assigned_user.username}'})
            except get_user_model().DoesNotExist:
                return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        else:
            # Unassign
            students.update(assigned_to=None)
            return Response({'status': 'Leads unassigned'})

    @action(detail=True, methods=['post'])
    def take_break(self, request, pk=None):
        student = self.get_object()
        reason = request.data.get('reason', '')
        break_date = request.data.get('date')
        
        if student.academic_status == 'ON_BREAK':
            return Response({'error': 'Student is already on break'}, status=status.HTTP_400_BAD_REQUEST)
            
        student.academic_status = 'ON_BREAK'
        student.save()
        
        from core.models import StudentBreakHistory
        import datetime
        
        try:
            break_date_obj = datetime.date.fromisoformat(break_date) if break_date else datetime.date.today()
        except ValueError:
            break_date_obj = datetime.date.today()

        StudentBreakHistory.objects.create(
            student=student,
            break_start_date=break_date_obj,
            reason=reason,
            is_active_break=True
        )
        return Response({'status': 'Student placed on break'})

    @action(detail=True, methods=['post'])
    def rejoin(self, request, pk=None):
        student = self.get_object()
        rejoin_date = request.data.get('date')
        
        if student.academic_status != 'ON_BREAK':
            return Response({'error': 'Student is not currently on break'}, status=status.HTTP_400_BAD_REQUEST)
            
        student.academic_status = 'ACTIVE'
        student.save()
        
        from core.models import StudentBreakHistory
        import datetime
        
        try:
            rejoin_date_obj = datetime.date.fromisoformat(rejoin_date) if rejoin_date else datetime.date.today()
        except ValueError:
            rejoin_date_obj = datetime.date.today()

        active_break = StudentBreakHistory.objects.filter(student=student, is_active_break=True).first()
        if active_break:
            active_break.is_active_break = False
            active_break.rejoin_date = rejoin_date_obj
            active_break.save()
            
        return Response({'status': 'Student rejoined successfully'})

    @action(detail=True, methods=['post'])
    def discontinue(self, request, pk=None):
        student = self.get_object()
        reason = request.data.get('reason', '')
        discontinue_date = request.data.get('date')
        
        if student.academic_status == 'DISCONTINUED':
            return Response({'error': 'Student is already discontinued'}, status=status.HTTP_400_BAD_REQUEST)
            
        student.academic_status = 'DISCONTINUED'
        # Optional: You might want to update lead_status to 'DROPPED' as well
        student.lead_status = 'DROPPED'
        
        import datetime
        try:
            discontinue_date_obj = datetime.date.fromisoformat(discontinue_date) if discontinue_date else datetime.date.today()
        except ValueError:
            discontinue_date_obj = datetime.date.today()
            
        student.discontinued_date = discontinue_date_obj
        student.save()
        
        # We can also save the reason in a log/history if we want, but for now we just change status.
        return Response({'status': 'Student marked as discontinued'})

    @action(detail=False, methods=['get'])
    def break_metrics(self, request):
        from core.models import StudentBreakHistory
        from datetime import datetime, date
        
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        
        qs = self.get_queryset()
        
        # Parse dates if provided
        start_date = None
        end_date = None
        try:
            if start_date_str:
                start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
            if end_date_str:
                end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
        except ValueError:
            pass
        # Students on break filtering
        on_break_qs = qs.filter(academic_status='ON_BREAK')
        # To filter by when they took the break, we can look at the StudentBreakHistory
        
        # Rejoined filtering
        rejoined_qs = StudentBreakHistory.objects.filter(
            student__in=qs,
            is_active_break=False
        )
        
        # Discontinued filtering
        discontinued_qs = qs.filter(academic_status='DISCONTINUED')
        
        if start_date and end_date:
            on_break_qs = on_break_qs.filter(
                studentbreakhistory__break_start_date__gte=start_date,
                studentbreakhistory__break_start_date__lte=end_date,
                studentbreakhistory__is_active_break=True
            ).distinct()
            
            rejoined_qs = rejoined_qs.filter(
                rejoin_date__gte=start_date,
                rejoin_date__lte=end_date
            )
        else:
            # Default behavior if no dates: Rejoined this month
            today = date.today()
            rejoined_qs = rejoined_qs.filter(
                rejoin_date__year=today.year,
                rejoin_date__month=today.month
            )

        # Build responses
        on_break_data = []
        for s in on_break_qs:
            history = StudentBreakHistory.objects.filter(student=s, is_active_break=True).first()
            on_break_data.append({
                'id': s.id,
                'name': f"{s.first_name} {s.last_name}",
                'crm_student_id': s.crm_student_id,
                'mobile': s.mobile,
                'email': s.email,
                'reason': history.reason if history else '',
                'date': history.break_start_date.strftime('%Y-%m-%d') if history and history.break_start_date else ''
            })
            
        rejoined_data = []
        for history in rejoined_qs:
            s = history.student
            rejoined_data.append({
                'id': s.id,
                'name': f"{s.first_name} {s.last_name}",
                'crm_student_id': s.crm_student_id,
                'mobile': s.mobile,
                'email': s.email,
                'reason': history.reason,
                'break_date': history.break_start_date.strftime('%Y-%m-%d') if history.break_start_date else '',
                'rejoin_date': history.rejoin_date.strftime('%Y-%m-%d') if history.rejoin_date else ''
            })
            
        discontinued_data = []
        for s in discontinued_qs:
            discontinued_data.append({
                'id': s.id,
                'name': f"{s.first_name} {s.last_name}",
                'crm_student_id': s.crm_student_id,
                'mobile': s.mobile,
                'email': s.email,
                'reason': 'Discontinued',
                'date': s.discontinued_date.strftime('%Y-%m-%d') if s.discontinued_date else ''
            })
            
        return Response({
            'on_break': on_break_data,
            'rejoined': rejoined_data,
            'discontinued': discontinued_data,
            'on_break_count': len(on_break_data),
            'rejoined_count': len(rejoined_data),
            'discontinued_count': len(discontinued_data)
        })

    @action(detail=False, methods=['get'])
    def fee_defaulters(self, request):
        from django.db.models import F
        # Students where paid_fee < total_fee
        qs = self.get_queryset().filter(paid_fee__lt=F('total_fee'))
        
        # Support optional date range filtering on fee_due_date
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        if start_date:
            qs = qs.filter(fee_due_date__gte=start_date)
        if end_date:
            qs = qs.filter(fee_due_date__lte=end_date)
        
        data = []
        for s in qs:
            mentor_name = 'Not Assigned'
            if s.batch and s.batch.primary_mentor:
                mentor_name = f"{s.batch.primary_mentor.first_name} {s.batch.primary_mentor.last_name}".strip() or s.batch.primary_mentor.username
                
            data.append({
                'id': s.id,
                'name': f"{s.first_name} {s.last_name}",
                'crm_student_id': s.crm_student_id,
                'mobile': s.mobile,
                'email': s.email,
                'total_fee': s.total_fee,
                'paid_fee': s.paid_fee,
                'due_amount': s.total_fee - s.paid_fee,
                'fee_due_date': s.fee_due_date.strftime('%Y-%m-%d') if s.fee_due_date else '',
                'is_wise_integrated': bool(s.lms_student_id),
                'batch_name': s.batch.name if s.batch else 'Unassigned',
                'mentor_name': mentor_name
            })
            
        return Response(data)

    @action(detail=False, methods=['get'])
    def collected_fees(self, request):
        from django.db.models import Q
        from core.models import Transaction, MonthlyPayment, Student
        from integrations.utils import WiseService
        user = request.user
        
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        # Default to current month if no dates are provided
        if not start_date or start_date == '':
            import datetime
            start_date = datetime.date.today().replace(day=1).strftime('%Y-%m-%d')
        if not end_date or end_date == '':
            import datetime
            end_date = datetime.date.today().strftime('%Y-%m-%d')
        
        # 1. Query Transactions
        tx_qs = Transaction.objects.all().select_related('student', 'student__batch', 'student__batch__primary_mentor')
        if user.role in ['MENTOR', 'TEACHER']:
            tx_qs = tx_qs.filter(
                Q(student__batch__primary_mentor=user) | 
                Q(student__batch__secondary_mentors=user) | 
                Q(student__batch__teacher=user)
            ).distinct()
            
        if start_date:
            tx_qs = tx_qs.filter(date__date__gte=start_date)
        if end_date:
            tx_qs = tx_qs.filter(date__date__lte=end_date)
            
        # 2. Query MonthlyPayments
        mp_qs = MonthlyPayment.objects.all().select_related('student', 'student__batch', 'student__batch__primary_mentor')
        if user.role in ['MENTOR', 'TEACHER']:
            mp_qs = mp_qs.filter(
                Q(student__batch__primary_mentor=user) | 
                Q(student__batch__secondary_mentors=user) | 
                Q(student__batch__teacher=user)
            ).distinct()
            
        if start_date:
            mp_qs = mp_qs.filter(paid_date__gte=start_date)
        if end_date:
            mp_qs = mp_qs.filter(paid_date__lte=end_date)
            
        # 3. Query Wise LMS Live Transactions
        wise = WiseService()
        wise_txs = []
        try:
            if wise.api_key:
                wise_tx_data = wise.get_institute_transactions(start_date=start_date, end_date=end_date)
                if wise_tx_data and isinstance(wise_tx_data, dict):
                    wise_txs = wise_tx_data.get('transactions') or []
        except Exception as e:
            print(f"Error fetching live Wise transactions: {e}")

        # Build list of scoped students for matching and role-based filtering
        students_qs = Student.objects.all()
        if user.role in ['MENTOR', 'TEACHER']:
            students_qs = students_qs.filter(
                Q(batch__primary_mentor=user) | 
                Q(batch__secondary_mentors=user) | 
                Q(batch__teacher=user)
            ).distinct()
            
        lms_to_student = {}
        for s in students_qs.select_related('batch', 'batch__primary_mentor'):
            if s.lms_student_id:
                lms_to_student[str(s.lms_student_id)] = s

        # 4. Format & Merge
        data = []
        for t in tx_qs:
            mentor_name = 'Not Assigned'
            if t.student.batch and t.student.batch.primary_mentor:
                mentor_name = f"{t.student.batch.primary_mentor.first_name} {t.student.batch.primary_mentor.last_name}".strip() or t.student.batch.primary_mentor.username
                
            data.append({
                'id': f"tx_{t.id}",
                'student_name': f"{t.student.first_name} {t.student.last_name}",
                'crm_student_id': t.student.crm_student_id,
                'batch_name': t.student.batch.name if t.student.batch else 'Unassigned',
                'mentor_name': mentor_name,
                'amount': float(t.amount),
                'date': t.date.strftime('%Y-%m-%d'),
                'type': 'LMS / Razorpay Sync',
                'ref_id': t.transaction_id
            })
            
        for p in mp_qs:
            mentor_name = 'Not Assigned'
            if p.student.batch and p.student.batch.primary_mentor:
                mentor_name = f"{p.student.batch.primary_mentor.first_name} {p.student.batch.primary_mentor.last_name}".strip() or p.student.batch.primary_mentor.username
                
            data.append({
                'id': f"mp_{p.id}",
                'student_name': f"{p.student.first_name} {p.student.last_name}",
                'crm_student_id': p.student.crm_student_id,
                'batch_name': p.student.batch.name if p.student.batch else 'Unassigned',
                'mentor_name': mentor_name,
                'amount': float(p.amount),
                'date': p.paid_date.strftime('%Y-%m-%d') if p.paid_date else '',
                'type': f"Manual ({p.month.strftime('%b %Y')})",
                'ref_id': p.notes or 'N/A'
            })

        for wtx in wise_txs:
            w_student_id = str(wtx.get('studentId') or '')
            
            # Role-based filtering: if MENTOR/TEACHER, only show if student is in our scoped mapping
            if user.role in ['MENTOR', 'TEACHER'] and w_student_id not in lms_to_student:
                continue
            
            # Resolve student details
            local_student = lms_to_student.get(w_student_id)
            if local_student:
                student_name = f"{local_student.first_name} {local_student.last_name}"
                crm_student_id = local_student.crm_student_id
                batch_name = local_student.batch.name if local_student.batch else 'Unassigned'
                mentor_name = 'Not Assigned'
                if local_student.batch and local_student.batch.primary_mentor:
                    mentor_name = f"{local_student.batch.primary_mentor.first_name} {local_student.batch.primary_mentor.last_name}".strip() or local_student.batch.primary_mentor.username
            else:
                # Fallback to Wise API transaction data if we are an admin and student is not in CRM
                student_name = wtx.get('student', {}).get('name') or 'Unknown Student'
                crm_student_id = 'N/A'
                batch_name = wtx.get('classroom', {}).get('name') or 'Wise Class'
                mentor_name = 'Not Assigned'
            
            amount_obj = wtx.get('amount') or {}
            if isinstance(amount_obj, dict):
                amount_val = float(amount_obj.get('value', 0)) / 100.0
            else:
                amount_val = float(amount_obj) / 100.0
                
            # Format chargedAt
            charged_at_str = wtx.get('chargedAt') or wtx.get('createdAt') or ''
            formatted_date = ''
            if charged_at_str:
                try:
                    formatted_date = charged_at_str.split('T')[0]
                except Exception:
                    formatted_date = charged_at_str
                    
            data.append({
                'id': f"wise_{wtx.get('_id') or wtx.get('id')}",
                'student_name': student_name,
                'crm_student_id': crm_student_id,
                'batch_name': batch_name,
                'mentor_name': mentor_name,
                'amount': amount_val,
                'date': formatted_date,
                'type': 'Wise LMS Sync',
                'ref_id': wtx.get('_id') or wtx.get('id') or 'N/A'
            })
            
        # Sort by date descending
        data.sort(key=lambda x: x.get('date') or '', reverse=True)
        return Response(data)

    @action(detail=True, methods=['post'])
    def mark_as_paid(self, request, pk=None):
        student = self.get_object()
        
        if student.lms_student_id:
            return Response({'error': 'Cannot manually mark Wise LMS integrated student as paid. Please sync from Wise LMS instead.'}, status=400)
            
        student.paid_fee = student.total_fee
        if student.lead_status == 'PAYMENT_PENDING':
            student.lead_status = 'ENROLLED'
        student.save()
        
        return Response({'status': 'Student marked as fully paid'})

    @action(detail=True, methods=['post'], url_path='mark-paid')
    def mark_paid(self, request, pk=None):
        student = self.get_object()
        month_str = request.data.get('month') # expected format YYYY-MM-DD (first day of the month)
        amount_val = request.data.get('amount')
        notes = request.data.get('notes', '')

        if not month_str:
            return Response({'error': 'month is required'}, status=status.HTTP_400_BAD_REQUEST)

        from django.utils.dateparse import parse_date
        month_date = parse_date(month_str)
        if not month_date:
            return Response({'error': 'Invalid date format'}, status=status.HTTP_400_BAD_REQUEST)

        # Force it to be the first of the month
        month_date = month_date.replace(day=1)

        # Determine payment amount
        if amount_val is not None:
            try:
                amount = float(amount_val)
            except ValueError:
                return Response({'error': 'Invalid amount'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            # Fallback to student's course fee or total_fee
            if student.course:
                amount = float(student.course.fee_amount)
            else:
                amount = float(student.total_fee)

        number_of_months_val = request.data.get('number_of_months', 1)
        try:
            number_of_months = int(number_of_months_val)
            if number_of_months < 1:
                number_of_months = 1
        except (ValueError, TypeError):
            number_of_months = 1

        from decimal import Decimal
        amount_per_month = round(Decimal(str(amount)) / Decimal(str(number_of_months)), 2)

        from core.models import MonthlyPayment
        import datetime

        created_payments = []
        for i in range(number_of_months):
            # Calculate target month date
            m = month_date.month - 1 + i
            y = month_date.year + m // 12
            m = m % 12 + 1
            target_month = datetime.date(y, m, 1)

            payment, created = MonthlyPayment.objects.update_or_create(
                student=student,
                month=target_month,
                defaults={
                    'amount': amount_per_month,
                    'marked_by': request.user,
                    'notes': f"{notes} (Part of {number_of_months}-month payment)".strip() if number_of_months > 1 else notes
                }
            )
            created_payments.append(target_month.strftime('%Y-%m-%d'))

        return Response({
            'status': 'Payment marked successfully',
            'months': created_payments,
            'amount_per_month': float(amount_per_month),
            'total_amount': amount
        })

    @action(detail=True, methods=['post'], url_path='unmark-paid')
    def unmark_paid(self, request, pk=None):
        student = self.get_object()
        month_str = request.data.get('month')

        if not month_str:
            return Response({'error': 'month is required'}, status=status.HTTP_400_BAD_REQUEST)

        from django.utils.dateparse import parse_date
        month_date = parse_date(month_str)
        if not month_date:
            return Response({'error': 'Invalid date format'}, status=status.HTTP_400_BAD_REQUEST)

        month_date = month_date.replace(day=1)

        from core.models import MonthlyPayment
        deleted_count, _ = MonthlyPayment.objects.filter(student=student, month=month_date).delete()

        if deleted_count > 0:
            return Response({'status': 'Payment unmarked successfully'})
        else:
            return Response({'error': 'No payment record found for this month'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['get'], url_path='payment-history')
    def payment_history(self, request, pk=None):
        student = self.get_object()
        from core.models import MonthlyPayment
        payments = MonthlyPayment.objects.filter(student=student).order_by('-month')
        
        data = []
        for p in payments:
            data.append({
                'id': p.id,
                'month': p.month.strftime('%Y-%m-%d'),
                'month_name': p.month.strftime('%B %Y'),
                'amount': float(p.amount),
                'paid_date': p.paid_date.strftime('%Y-%m-%d'),
                'marked_by': p.marked_by.get_full_name() or p.marked_by.username if p.marked_by else 'System',
                'notes': p.notes
            })
        return Response(data)

class TransactionViewSet(viewsets.ModelViewSet):
    queryset = Transaction.objects.all()
    serializer_class = TransactionSerializer
    permission_classes = [permissions.IsAuthenticated]

class DocumentViewSet(viewsets.ModelViewSet):
    queryset = Document.objects.all()
    serializer_class = DocumentSerializer
    permission_classes = [permissions.IsAuthenticated]

class SyllabusPartViewSet(viewsets.ModelViewSet):
    queryset = SyllabusPart.objects.all()
    serializer_class = SyllabusPartSerializer
    permission_classes = [DynamicRolePermission, IsMentorOwner]
    
    @property
    def module_name(self):
        if hasattr(self, 'request') and self.request.user.is_authenticated:
            if self.request.user.role == 'TEACHER':
                return 'TEACHER'
        return 'MENTOR'

    def get_queryset(self):
        batch_id = self.request.query_params.get('batch')
        if batch_id:
            return self.queryset.filter(batch_id=batch_id)
        return self.queryset

class ClassSessionViewSet(viewsets.ModelViewSet):
    queryset = ClassSession.objects.all()
    serializer_class = ClassSessionSerializer
    permission_classes = [DynamicRolePermission, IsMentorOwner]
    
    @property
    def module_name(self):
        if hasattr(self, 'request') and self.request.user.is_authenticated:
            if self.request.user.role == 'TEACHER':
                return 'TEACHER'
        return 'MENTOR'
    
    def get_queryset(self):
        batch_id = self.request.query_params.get('batch')
        if batch_id:
            return self.queryset.filter(batch_id=batch_id)
        return self.queryset

class AttendanceViewSet(viewsets.ModelViewSet):
    queryset = Attendance.objects.all()
    serializer_class = AttendanceSerializer
    permission_classes = [DynamicRolePermission, IsMentorOwner]
    
    @property
    def module_name(self):
        if hasattr(self, 'request') and self.request.user.is_authenticated:
            if self.request.user.role == 'TEACHER':
                return 'TEACHER'
        return 'MENTOR'

class BatchResourceViewSet(viewsets.ModelViewSet):
    queryset = BatchResource.objects.all()
    serializer_class = BatchResourceSerializer
    permission_classes = [DynamicRolePermission, IsMentorOwner]
    
    @property
    def module_name(self):
        if hasattr(self, 'request') and self.request.user.is_authenticated:
            if self.request.user.role == 'TEACHER':
                return 'TEACHER'
        return 'MENTOR'

    def get_queryset(self):
        batch_id = self.request.query_params.get('batch')
        if batch_id:
            return self.queryset.filter(batch_id=batch_id)
        return self.queryset


class ExamViewSet(viewsets.ModelViewSet):
    queryset = Exam.objects.all()
    serializer_class = ExamSerializer
    permission_classes = [DynamicRolePermission, IsMentorOwner]
    
    @property
    def module_name(self):
        if hasattr(self, 'request') and self.request.user.is_authenticated:
            if self.request.user.role == 'TEACHER':
                return 'TEACHER'
        return 'MENTOR'

    def get_queryset(self):
        batch_id = self.request.query_params.get('batch')
        if batch_id:
            return self.queryset.filter(batch_id=batch_id)
        return self.queryset

class ExamResultViewSet(viewsets.ModelViewSet):
    queryset = ExamResult.objects.all()
    serializer_class = ExamResultSerializer
    permission_classes = [DynamicRolePermission, IsMentorOwner]
    
    @property
    def module_name(self):
        if hasattr(self, 'request') and self.request.user.is_authenticated:
            if self.request.user.role == 'TEACHER':
                return 'TEACHER'
        return 'MENTOR'

    @action(detail=False, methods=['post'])
    def bulk_submit(self, request):
        exam_id = request.data.get('exam_id')
        results = request.data.get('results', {}) # student_id -> marks
        
        exam = Exam.objects.get(id=exam_id)
        for student_id, data in results.items():
            ExamResult.objects.update_or_create(
                exam=exam,
                student_id=student_id,
                defaults={
                    'marks_obtained': data.get('marks', 0),
                    'remarks': data.get('remarks', ''),
                    'is_present': data.get('is_present', True)
                }
            )
        return Response({'status': 'Marks updated successfully'})


class QuestionViewSet(viewsets.ModelViewSet):
    queryset = Question.objects.all()
    serializer_class = QuestionSerializer
    permission_classes = [DynamicRolePermission]
    
    @property
    def module_name(self):
        return 'TEACHER'

    def get_queryset(self):
        exam_id = self.request.query_params.get('exam')
        if exam_id:
            return self.queryset.filter(exam_id=exam_id)
        return self.queryset

class StudentSubmissionViewSet(viewsets.ModelViewSet):
    queryset = StudentSubmission.objects.all()
    serializer_class = StudentSubmissionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        # Auto-grade MCQs upon submission
        instance = serializer.save()
        if instance.is_submitted:
            self.calculate_score(instance)

    def calculate_score(self, submission):
        exam = submission.exam
        questions = exam.questions.all()
        total_score = 0
        
        for q in questions:
            user_ans = submission.answers_json.get(str(q.id))
            if q.question_type == 'MCQ' and user_ans:
                # user_ans is the option_id for MCQs
                correct_opt = q.options.filter(is_correct=True).first()
                if correct_opt and str(correct_opt.id) == str(user_ans):
                    total_score += q.marks
            # Theory questions remain for manual grading later
        
        submission.score = total_score
        submission.save()

class DashboardStatsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        # Use Q for complex lookups if needed
        from django.db.models import Q, OuterRef, Subquery, Case, When
        from django.db.models.functions import Coalesce
        from django.db import models
        from decimal import Decimal
        
        # Base querysets
        student_qs = Student.objects.filter(is_active=True)
        batch_qs = Batch.objects.all()
        trans_qs = Transaction.objects.all()
        
        # Import RolePermission to check for ANALYTICS access for revenue
        from users.models import RolePermission
        has_analytics = user.role == 'SUPER_ADMIN' or user.is_superuser or \
                        RolePermission.objects.filter(role=user.role, module='ANALYTICS', can_view=True).exists()
        
        if user.role in ['MENTOR', 'TEACHER']:
            # Include subordinates if any
            subordinates = user.get_all_subordinates()
            if subordinates:
                users_to_check = [user] + subordinates
                student_qs = student_qs.filter(Q(batch__primary_mentor__in=users_to_check) | Q(batch__secondary_mentors__in=users_to_check) | Q(batch__teacher__in=users_to_check)).distinct()
                batch_qs = batch_qs.filter(Q(primary_mentor__in=users_to_check) | Q(secondary_mentors__in=users_to_check) | Q(teacher__in=users_to_check)).distinct()
            else:
                student_qs = student_qs.filter(Q(batch__primary_mentor=user) | Q(batch__secondary_mentors=user) | Q(batch__teacher=user)).distinct()
                batch_qs = batch_qs.filter(Q(primary_mentor=user) | Q(secondary_mentors=user) | Q(teacher=user)).distinct()
            # Mentors generally don't see revenue unless they have explicit analytical perms
            if not has_analytics:
                trans_qs = Transaction.objects.none()
        
        elif user.role == 'SALES':
            # Sales may see all active leads/students, but revenue might be restricted
            if not has_analytics:
                trans_qs = Transaction.objects.none()
        
        elif user.role == 'STUDENT':
            # Students are redirected, but for safety: 
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)
            
        # Optional filter by specific mentor
        mentor_id = request.query_params.get('mentor_id')
        if mentor_id:
            if user.role in ['SUPER_ADMIN', 'ADMIN', 'ACADEMIC', 'ACADEMIC_COORDINATOR']:
                # Admins can filter by any mentor
                student_qs = Student.objects.filter(is_active=True, batch__primary_mentor_id=mentor_id).distinct()
                batch_qs = Batch.objects.filter(primary_mentor_id=mentor_id).distinct()
            elif user.role in ['MENTOR', 'TEACHER'] and hasattr(user, 'get_all_subordinates'):
                subordinates = user.get_all_subordinates()
                # Verify requested mentor is a subordinate or self
                if str(mentor_id) == str(user.id) or any(str(sub.id) == str(mentor_id) for sub in subordinates):
                    student_qs = Student.objects.filter(is_active=True, batch__primary_mentor_id=mentor_id).distinct()
                    batch_qs = Batch.objects.filter(primary_mentor_id=mentor_id).distinct()

        # Finance Integration
        from finance.models import Expense
        from datetime import datetime
        today = datetime.now()
        first_day = today.replace(day=1)
        
        monthly_expenses = Expense.objects.filter(date__gte=first_day).aggregate(total=Sum('amount'))['total'] or 0
        total_expenses = Expense.objects.aggregate(total=Sum('amount'))['total'] or 0

        # Calculate monthly expected, collected, due fee metrics
        from core.models import MonthlyPayment
        
        first_day_date = today.date().replace(day=1)
        
        # Subquery to calculate MonthlyPayment sum for current month for each student
        monthly_pay_subquery = MonthlyPayment.objects.filter(
            student=OuterRef('pk'),
            month=first_day_date
        ).values('student').annotate(
            total=Sum('amount')
        ).values('total')
        
        # Annotate student_qs with fallback calculations
        student_fees_qs = student_qs.annotate(
            current_month_collected=Coalesce(
                Subquery(monthly_pay_subquery),
                Decimal('0.00'),
                output_field=models.DecimalField(max_digits=10, decimal_places=2)
            ),
            expected_fee=Case(
                When(course__fee_amount__gt=0, then=F('course__fee_amount')),
                default=F('total_fee'),
                output_field=models.DecimalField(max_digits=10, decimal_places=2)
            ),
            collected_fee=Case(
                When(course__fee_amount__gt=0, then=F('current_month_collected')),
                default=F('paid_fee'),
                output_field=models.DecimalField(max_digits=10, decimal_places=2)
            )
        )
        
        expected_monthly_revenue = student_fees_qs.aggregate(total=Sum('expected_fee'))['total'] or Decimal('0.00')
        collected_monthly_revenue = student_fees_qs.aggregate(total=Sum('collected_fee'))['total'] or Decimal('0.00')
        due_monthly_revenue = max(Decimal('0.00'), expected_monthly_revenue - collected_monthly_revenue)

        # Batch fees breakdown
        batch_fees = []
        for b in batch_qs:
            batch_students = student_fees_qs.filter(batch=b)
            b_expected = batch_students.aggregate(total=Sum('expected_fee'))['total'] or Decimal('0.00')
            b_collected = batch_students.aggregate(total=Sum('collected_fee'))['total'] or Decimal('0.00')
            b_due = max(Decimal('0.00'), b_expected - b_collected)
            
            batch_fees.append({
                "id": b.id,
                "name": b.name,
                "student_count": batch_students.count(),
                "expected": float(b_expected),
                "collected": float(b_collected),
                "due": float(b_due)
            })

        stats = {
            "students": student_qs.count(),
            "batches": batch_qs.count(),
            "revenue": trans_qs.aggregate(total=Sum('amount'))['total'] or 0,
            "leads": Student.objects.filter(is_active=True, batch__isnull=True).count(),
            "distribution": list(student_qs.values(name=F('program_type__name')).annotate(value=Count('id'))),
            "revenue_distribution": list(trans_qs.values(name=F('student__program_type__name')).annotate(value=Sum('amount'))),
            "expenses": float(monthly_expenses),
            "total_expenses": float(total_expenses),
            "this_month_expected": float(expected_monthly_revenue),
            "this_month_collected": float(collected_monthly_revenue),
            "this_month_due": float(due_monthly_revenue),
            "batch_fees": batch_fees
        }
        
        # Include team information
        team_data = []
        has_team = False
        if user.role in ['SUPER_ADMIN', 'ADMIN', 'ACADEMIC', 'ACADEMIC_COORDINATOR']:
            has_team = True
            from django.contrib.auth import get_user_model
            User = get_user_model()
            all_mentors = User.objects.filter(role='MENTOR', is_active=True)
            team_data.append({'id': '', 'name': 'All Mentors'})
            for m in all_mentors:
                team_data.append({'id': m.id, 'name': f"{m.first_name} {m.last_name}"})
        elif user.role in ['MENTOR', 'TEACHER'] and hasattr(user, 'get_all_subordinates'):
            subordinates = user.get_all_subordinates()
            if subordinates:
                has_team = True
                team_data.append({'id': user.id, 'name': 'My Work'})
                for sub in subordinates:
                    team_data.append({'id': sub.id, 'name': f"{sub.first_name} {sub.last_name}"})
        
        stats["has_team"] = has_team
        stats["team_members"] = team_data
        
        return Response(stats)

class AnalyticsDetailView(APIView):
    permission_classes = [DynamicRolePermission]
    module_name = 'ANALYTICS'

    def get(self, request):
        User = get_user_model()
        teachers = User.objects.filter(role__in=['TEACHER', 'MENTOR'])
        
        batches = Batch.objects.annotate(student_count=Count('students'))
        batch_stats = batches.values('id', 'name', 'course__name', 'student_count')
        
        total_potential = Student.objects.filter(is_active=True).aggregate(sum=Sum('course__fee_amount'))['sum'] or 0
        total_collected = Transaction.objects.all().aggregate(sum=Sum('amount'))['sum'] or 0
        total_due = total_potential - total_collected

        from core.models import ClassSession
        import re
        
        month = request.query_params.get('month')
        year = request.query_params.get('year')
        
        # Annotate teachers with their session counts, batch counts, and calculated hours
        teacher_stats = []
        for teacher in teachers:
            b_count = Batch.objects.filter(Q(teacher=teacher) | Q(primary_mentor=teacher)).distinct().count()
            
            sessions = ClassSession.objects.filter(teacher=teacher)
            if month and year:
                sessions = sessions.filter(date__month=month, date__year=year)
                
            s_count = sessions.count()
            
            total_milliseconds = 0
            batch_breakdown = {}
            for session in sessions:
                if session.teacher_summary:
                    match = re.search(r'Duration:\s*(\d+)', session.teacher_summary)
                    if match:
                        ms = int(match.group(1))
                        total_milliseconds += ms
                        
                        # Add to batch breakdown
                        b_id = session.batch.id
                        if b_id not in batch_breakdown:
                            batch_breakdown[b_id] = {
                                'batch_name': session.batch.name,
                                'sessions': 0,
                                'ms': 0,
                                'dates': []
                            }
                        batch_breakdown[b_id]['sessions'] += 1
                        batch_breakdown[b_id]['ms'] += ms
                        
                        s_mins = round(ms / (1000 * 60))
                        s_h = s_mins // 60
                        s_m = s_mins % 60
                        s_duration = f"{s_h}h {s_m}m" if s_h > 0 else f"{s_m}m"
                        
                        attendances = session.attendances.select_related('student').all()
                        present_students = []
                        absent_students = []
                        for a in attendances:
                            name = f"{a.student.first_name} {a.student.last_name}".strip()
                            if not name: name = a.student.username
                            if a.is_present:
                                present_students.append(name)
                            else:
                                absent_students.append(name)
                        
                        batch_breakdown[b_id]['dates'].append({
                            'date': session.date.strftime("%d %b %Y"),
                            'duration': s_duration,
                            'present_count': len(present_students),
                            'absent_count': len(absent_students),
                            'present_students': present_students,
                            'absent_students': absent_students
                        })

            
            # format batch breakdown
            classes_breakdown = []
            for b_id, b_data in batch_breakdown.items():
                b_mins = round(b_data['ms'] / (1000 * 60))
                b_h = b_mins // 60
                b_m = b_mins % 60
                classes_breakdown.append({
                    'batch_name': b_data['batch_name'],
                    'sessions': b_data['sessions'],
                    'formatted_time': f"{b_h}h {b_m}m",
                    'dates': b_data['dates']
                })
            
            # sort breakdown by sessions descending
            classes_breakdown.sort(key=lambda x: x['sessions'], reverse=True)
            
            # The Wise LMS API returned duration in milliseconds
            total_minutes = round(total_milliseconds / (1000 * 60))
            full_hours = int(total_minutes // 60)
            rem_minutes = int(total_minutes % 60)
            
            if b_count > 0 or s_count > 0:
                teacher_stats.append({
                    'id': teacher.id,
                    'name': f"{teacher.first_name} {teacher.last_name}".strip() or teacher.username,
                    'courses': b_count,
                    'sessions': s_count,
                    'hours': round(total_minutes / 60, 2), # Keep for sorting
                    'formatted_time': f"{full_hours}h {rem_minutes}m",
                    'classes': classes_breakdown
                })

        # sort by hours
        teacher_stats = sorted(teacher_stats, key=lambda x: x['hours'], reverse=True)

        # Advanced Charting Data
        from django.db.models.functions import TruncMonth
        
        program_dist = list(Student.objects.values(name=F('program_type__name')).annotate(value=Count('id')))
        
        # Lead statuses are enum codes like 'NEW', map them for UI if needed, but UI can handle it.
        lead_dist = list(Student.objects.values(name=F('lead_status')).annotate(value=Count('id')))
        
        revenue_time = list(Transaction.objects.annotate(month_trunc=TruncMonth('date')).values('month_trunc').annotate(total=Sum('amount')).order_by('month_trunc'))
        revenue_timeline = [{'name': rt['month_trunc'].strftime('%b %Y') if rt['month_trunc'] else 'Unknown', 'revenue': rt['total']} for rt in revenue_time]

        return Response({
            'teachers_count': teachers.count(),
            'students_count': Student.objects.count(),
            'batches_count': Batch.objects.count(),
            'batch_details': batch_stats,
            'teacher_performance': teacher_stats,
            'revenue_metrics': {
                'potential': total_potential,
                'collected': total_collected,
                'due': total_due
            },
            'program_distribution': program_dist,
            'lead_funnel': lead_dist,
            'revenue_timeline': revenue_timeline
        })

class CalendarEventsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from core.models import Exam, ClassSession
        
        events = []
        
        # Exams
        exams = Exam.objects.all().select_related('batch')
        for exam in exams:
            events.append({
                'id': f"exam_{exam.id}",
                'title': f"{exam.batch.name} - {exam.title} ({exam.get_exam_type_display()})",
                'start': exam.date.isoformat(),
                'end': exam.date.isoformat(),
                'allDay': True,
                'type': 'exam',
                'resourceId': exam.batch.id
            })
            
        # Class Sessions
        sessions = ClassSession.objects.all().select_related('batch', 'teacher')
        for session in sessions:
            teacher_name = f"{session.teacher.first_name} {session.teacher.last_name}".strip() if session.teacher else "Unknown Teacher"
            events.append({
                'id': f"class_{session.id}",
                'title': f"{session.batch.name} - Class ({teacher_name})",
                'start': session.date.isoformat(),
                'end': session.date.isoformat(),
                'allDay': True,
                'type': 'class',
                'resourceId': session.batch.id
            })
            
        return Response(events)
