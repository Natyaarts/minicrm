
from rest_framework import viewsets, permissions, status, filters
from rest_framework.filters import SearchFilter
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q, Sum, Count, F
from django.http import HttpResponse
from django.contrib.auth import get_user_model
import pandas as pd

from .models import Program, SubProgram, Course, Batch, Student, Transaction, Document, SyllabusPart, ClassSession, Attendance
from .serializers import (
    ProgramSerializer, SubProgramSerializer, CourseSerializer, 
    BatchSerializer, StudentSerializer, TransactionSerializer, DocumentSerializer,
    ProgramHierarchySerializer, SyllabusPartSerializer, ClassSessionSerializer, AttendanceSerializer
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

class CourseViewSet(viewsets.ModelViewSet):
    queryset = Course.objects.all()
    serializer_class = CourseSerializer
    permission_classes = [DynamicRolePermission]
    module_name = 'ACADEMIC'
    pagination_class = None
    filter_backends = [SearchFilter]
    search_fields = ['name']

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

    def get_queryset(self):
        user = self.request.user
        qs = Batch.objects.select_related('primary_mentor', 'course').prefetch_related('secondary_mentors')
        qs = qs.annotate(student_count_annotated=Count('students'))
        
        if user.role in ['ADMIN', 'SUPER_ADMIN', 'ACADEMIC']:
            pass
        elif user.role in ['MENTOR', 'TEACHER']:
            qs = qs.filter(Q(primary_mentor=user) | Q(secondary_mentors=user) | Q(teacher=user)).distinct()
        elif user.role == 'STUDENT':
            qs = qs.filter(students__user=user).distinct()
        else:
            return Batch.objects.none()
            
        return qs

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
        if self.action == 'create':
            return [permissions.AllowAny()]
        # Allow students, mentors, and teachers to view relevant profiles/lists
        if self.request.user.is_authenticated and self.action in ['list', 'retrieve']:
            if self.request.user.role in ['STUDENT', 'MENTOR', 'TEACHER']:
                return [permissions.IsAuthenticated()]
        return super().get_permissions()

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
        qs = Student.objects.select_related(
            'user', 'program_type', 'sub_program', 'course', 'batch'
        ).prefetch_related('dynamic_values__field', 'documents', 'transactions').all()

        if not user.is_authenticated:
            return Student.objects.none()
            
        if user.role in ['ADMIN', 'SUPER_ADMIN', 'ACADEMIC', 'SALES']:
            pass 
        elif user.role in ['MENTOR', 'TEACHER']:
            qs = qs.filter(
                Q(batch__primary_mentor=user) | 
                Q(batch__secondary_mentors=user) |
                Q(batch__teacher=user) |
                Q(batch__isnull=True)
            ).distinct()
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
            
        program = self.request.query_params.get('program')
        if program:
            qs = qs.filter(program_type_id=program)

        sub_program = self.request.query_params.get('sub_program')
        if sub_program:
            qs = qs.filter(sub_program_id=sub_program)

        course = self.request.query_params.get('course')
        if course:
            qs = qs.filter(course_id=course)

        return qs.order_by('-id')

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save()

    @action(detail=False, methods=['get'])
    def export_csv(self, request):
        qs = self.get_queryset()
        data = []
        for s in qs:
            total_paid = s.transactions.aggregate(total=Sum('amount'))['total'] or 0
            data.append({
                'ID': s.crm_student_id,
                'First Name': s.first_name,
                'Last Name': s.last_name,
                'Mobile': s.mobile,
                'Email': s.email,
                'Program': s.program_type.name,
                'Course': s.course.name if s.course else 'N/A',
                'Batch': s.batch.name if s.batch else 'N/A',
                'Status': 'Active' if s.is_active else 'Inactive',
                'Total Paid': total_paid,
            })
        
        df = pd.DataFrame(data)
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

        stats = {
            "students": student_qs.count(),
            "batches": batch_qs.count(),
            "revenue": trans_qs.aggregate(total=Sum('amount'))['total'] or 0,
            "leads": Student.objects.filter(is_active=True, batch__isnull=True).count(),
            "distribution": list(student_qs.values(name=F('program_type__name')).annotate(value=Count('id'))),
            "revenue_distribution": list(trans_qs.values(name=F('student__program_type__name')).annotate(value=Sum('amount')))
        }
        return Response(stats)

class AnalyticsDetailView(APIView):
    permission_classes = [DynamicRolePermission]
    module_name = 'ANALYTICS'

    def get(self, request):
        User = get_user_model()
        teachers = User.objects.filter(role='MENTOR').count()
        
        batches = Batch.objects.annotate(student_count=Count('students'))
        batch_stats = batches.values('id', 'name', 'course__name', 'student_count')
        
        total_potential = Student.objects.filter(is_active=True).aggregate(sum=Sum('course__fee_amount'))['sum'] or 0
        total_collected = Transaction.objects.all().aggregate(sum=Sum('amount'))['sum'] or 0
        total_due = total_potential - total_collected

        return Response({
            'teachers_count': teachers,
            'students_count': Student.objects.count(),
            'batches_count': Batch.objects.count(),
            'batch_details': batch_stats,
            'revenue_metrics': {
                'potential': total_potential,
                'collected': total_collected,
                'due': total_due
            }
        })

