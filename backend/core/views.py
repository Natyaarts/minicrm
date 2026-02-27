
from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q
from .models import Program, SubProgram, Course, Batch, Student, Transaction, Document
from .serializers import (
    ProgramSerializer, SubProgramSerializer, CourseSerializer, 
    BatchSerializer, StudentSerializer, TransactionSerializer, DocumentSerializer
)
from rest_framework.views import APIView
from django.db.models import Sum, Count
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

class SubProgramViewSet(viewsets.ModelViewSet):
    queryset = SubProgram.objects.all()
    serializer_class = SubProgramSerializer
    permission_classes = [DynamicRolePermission]
    module_name = 'ACADEMIC'
    pagination_class = None

class CourseViewSet(viewsets.ModelViewSet):
    queryset = Course.objects.all()
    serializer_class = CourseSerializer
    permission_classes = [DynamicRolePermission]
    module_name = 'ACADEMIC'
    pagination_class = None

class BatchViewSet(viewsets.ModelViewSet):
    serializer_class = BatchSerializer
    queryset = Batch.objects.all()
    permission_classes = [DynamicRolePermission, IsMentorOwner]
    module_name = 'MENTOR'

    def get_queryset(self):
        user = self.request.user
        from django.db.models import Count
        qs = Batch.objects.select_related('primary_mentor', 'course').prefetch_related('secondary_mentors')
        qs = qs.annotate(student_count_annotated=Count('students'))
        
        if user.role in ['ADMIN', 'SUPER_ADMIN', 'ACADEMIC']:
            pass
        elif user.role == 'MENTOR':
            qs = qs.filter(Q(primary_mentor=user) | Q(secondary_mentors=user)).distinct()
        elif user.role == 'STUDENT':
            # Students usually see their own batch via Student profile, but if they need to list:
            qs = qs.filter(students__user=user).distinct()
        else:
            return Batch.objects.none()
            
        return qs

    def perform_create(self, serializer):
        # If mentor creates, default them as primary if not set?
        # But serializer might expect ID.
        serializer.save()
        
    @action(detail=True, methods=['post'])
    def add_student(self, request, pk=None):
        try:
            batch = self.get_object()
        except:
            return Response({'error': 'Batch not found or access denied'}, status=status.HTTP_404_NOT_FOUND)
            
        student_id = request.data.get('student_id')
        try:
            student = Student.objects.get(id=student_id)
            # Only allow adding if student is unassigned or re-assigning?
            # BRD doesn't strict re-assignment policies but generally mentors claim unassigned.
            student.batch = batch
            student.save()
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
        return super().get_permissions()

    def get_queryset(self):
        user = self.request.user
        qs = Student.objects.select_related(
            'user', 'program_type', 'sub_program', 'course', 'batch'
        ).prefetch_related('dynamic_values__field', 'documents', 'transactions').all()

        if not user.is_authenticated:
            return Student.objects.none()
            
        if user.role in ['ADMIN', 'SUPER_ADMIN', 'ACADEMIC', 'SALES']:
            # Base QS is already all() but let's re-ensure select_related
            pass 
        elif user.role == 'MENTOR':
            # See students in their batches OR unassigned students
            qs = qs.filter(
                Q(batch__primary_mentor=user) | 
                Q(batch__secondary_mentors=user) |
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
            qs = qs.filter(program_id=program)

        return qs

    def perform_destroy(self, instance):
        # Soft delete
        instance.is_active = False
        instance.save()

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
        
        # Security check: If requester is MENTOR, ensure they own the batch
        if request.user.role == 'MENTOR':
            if not student.batch or (student.batch.primary_mentor != request.user and not student.batch.secondary_mentors.filter(id=request.user.id).exists()):
                 return Response({'error': 'Permission denied: You do not mentor this student'}, status=status.HTTP_403_FORBIDDEN)

        # Check if username is already taken by another user
        from django.contrib.auth import get_user_model
        User = get_user_model()
        if User.objects.filter(username=username).exclude(id=user.id).exists():
            return Response({'error': 'Username already taken'}, status=status.HTTP_400_BAD_REQUEST)
            
        user.username = username
        user.set_password(password)
        # Ensure role is STUDENT and user is active
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

class DashboardStatsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        from django.db import models
        
        # Base Querysets
        student_qs = Student.objects.filter(is_active=True)
        batch_qs = Batch.objects.all()
        trans_qs = Transaction.objects.all()

        if user.role == 'MENTOR':
            student_qs = student_qs.filter(Q(batch__primary_mentor=user) | Q(batch__secondary_mentors=user))
            batch_qs = batch_qs.filter(Q(primary_mentor=user) | Q(secondary_mentors=user))
            trans_qs = Transaction.objects.none()

        stats = {
            "students": student_qs.count(),
            "batches": batch_qs.count(),
            "revenue": trans_qs.aggregate(total=Sum('amount'))['total'] or 0,
            "distribution": list(student_qs.values(name=models.F('program_type__name')).annotate(value=Count('id')))
        }
        return Response(stats)
