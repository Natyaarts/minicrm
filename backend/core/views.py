
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
            qs = qs.filter(Q(primary_mentor=user) | Q(secondary_mentors=user) | Q(teacher=user)).distinct()
        elif user.role == 'STUDENT':
            qs = qs.filter(students__user=user).distinct()
        else:
            return Batch.objects.none()
            
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
    filter_backends = [filters.SearchFilter]
    search_fields = ['first_name', 'last_name', 'crm_student_id', 'mobile', 'email']
    permission_classes = [DynamicRolePermission]
    module_name = 'SALES'
    
    def get_permissions(self):
        if self.action in ['create', 'public_lookup', 'partial_update']:
            return [permissions.AllowAny()]
        # Allow students, mentors, teachers, and academic staff to view relevant profiles/lists
        if self.request.user.is_authenticated and self.action in ['list', 'retrieve']:
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
        ).prefetch_related('dynamic_values__field', 'documents', 'transactions').all()
            
        # Resolve 'CONVERTED' to its ID
        converted_stage_id = 'CONVERTED'
        try:
            from crm.models import PipelineStage
            stage = PipelineStage.objects.filter(name__iexact='CONVERTED').first()
            if stage:
                converted_stage_id = str(stage.id)
        except Exception:
            pass

        if user.role in ['ADMIN', 'SUPER_ADMIN', 'SALES']:
            pass 
        elif user.role in ['ACADEMIC', 'ACADEMIC_COORDINATOR']:
            qs = qs.filter(lead_status=converted_stage_id)
        elif user.role in ['MENTOR', 'TEACHER']:
            qs = qs.filter(
                Q(batch__primary_mentor=user) | 
                Q(batch__secondary_mentors=user) |
                Q(batch__teacher=user) |
                Q(batch__isnull=True)
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
            
        program = self.request.query_params.get('program')
        if program:
            qs = qs.filter(program_type_id=program)

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

        return qs.order_by('-id')

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
                'Total Fee (Synced)', 'Paid Fee (Synced)', 'Fee Due Date'
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
        
        data = []
        for s in qs:
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
                'is_wise_integrated': bool(s.lms_student_id)
            })
            
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
        from django.db.models import Q
        
        # Base querysets
        student_qs = Student.objects.filter(is_active=True)
        batch_qs = Batch.objects.all()
        trans_qs = Transaction.objects.all()
        
        # Import RolePermission to check for ANALYTICS access for revenue
        from users.models import RolePermission
        has_analytics = user.role == 'SUPER_ADMIN' or user.is_superuser or \
                        RolePermission.objects.filter(role=user.role, module='ANALYTICS', can_view=True).exists()
        
        if user.role in ['MENTOR', 'TEACHER']:
            # Mentors/Teachers only see stats for their own assigned batches/students
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

        # Finance Integration
        from finance.models import Expense
        from datetime import datetime
        today = datetime.now()
        first_day = today.replace(day=1)
        
        monthly_expenses = Expense.objects.filter(date__gte=first_day).aggregate(total=Sum('amount'))['total'] or 0
        total_expenses = Expense.objects.aggregate(total=Sum('amount'))['total'] or 0

        stats = {
            "students": student_qs.count(),
            "batches": batch_qs.count(),
            "revenue": trans_qs.aggregate(total=Sum('amount'))['total'] or 0,
            "leads": Student.objects.filter(is_active=True, batch__isnull=True).count(),
            "distribution": list(student_qs.values(name=F('program_type__name')).annotate(value=Count('id'))),
            "revenue_distribution": list(trans_qs.values(name=F('student__program_type__name')).annotate(value=Sum('amount'))),
            "expenses": float(monthly_expenses),
            "total_expenses": float(total_expenses),
        }
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
    permission_classes = [DynamicRolePermission]
    module_name = 'CORE'

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
