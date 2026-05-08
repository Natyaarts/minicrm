
from rest_framework import viewsets, permissions
from .models import DynamicField, StudentDynamicValue
from .serializers import DynamicFieldSerializer, StudentDynamicValueSerializer

class DynamicFieldViewSet(viewsets.ModelViewSet):
    queryset = DynamicField.objects.all()
    serializer_class = DynamicFieldSerializer
    permission_classes = [permissions.IsAuthenticated] # Or IsAdminUser for mutations

    def get_queryset(self):
        from django.db.models import Q
        queryset = DynamicField.objects.all()
        program_id = self.request.query_params.get('program')
        sub_program_id = self.request.query_params.get('sub_program')
        course_id = self.request.query_params.get('course')
        field_group = self.request.query_params.get('field_group')
        
        filter_q = Q()
        
        # 1. Base Program Filter (from URL param)
        if program_id:
            filter_q |= Q(program_id=program_id, sub_program__isnull=True, course__isnull=True)
            
        # 2. Course Hierarchy Filter
        if course_id:
            filter_q |= Q(course_id=course_id)
            try:
                from core.models import Course
                course_obj = Course.objects.get(id=course_id)
                # Include fields for this course's parents
                if course_obj.sub_program_id:
                    filter_q |= Q(sub_program_id=course_obj.sub_program_id, course__isnull=True)
                    if course_obj.sub_program.program_id:
                        filter_q |= Q(program_id=course_obj.sub_program.program_id, sub_program__isnull=True, course__isnull=True)
            except Exception as e:
                print(f"Error resolving course hierarchy: {e}")

        # 3. Sub-Program Hierarchy Filter
        if sub_program_id:
            filter_q |= Q(sub_program_id=sub_program_id, course__isnull=True)
            try:
                from core.models import SubProgram
                sp_obj = SubProgram.objects.get(id=sub_program_id)
                if sp_obj.program_id:
                    filter_q |= Q(program_id=sp_obj.program_id, sub_program__isnull=True, course__isnull=True)
            except Exception as e:
                print(f"Error resolving sub-program hierarchy: {e}")

        if filter_q:
            queryset = queryset.filter(filter_q)
            
        if field_group:
            queryset = queryset.filter(field_group=field_group)
        
        return queryset.distinct()

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [permissions.IsAdminUser()]
        return [permissions.AllowAny()] # Allow fetching fields for forms publicly/authenticated
