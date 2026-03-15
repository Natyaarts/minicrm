
from rest_framework import viewsets, permissions
from .models import DynamicField, StudentDynamicValue
from .serializers import DynamicFieldSerializer, StudentDynamicValueSerializer

class DynamicFieldViewSet(viewsets.ModelViewSet):
    queryset = DynamicField.objects.all()
    serializer_class = DynamicFieldSerializer
    permission_classes = [permissions.IsAuthenticated] # Or IsAdminUser for mutations

    def get_queryset(self):
        queryset = DynamicField.objects.all()
        program_id = self.request.query_params.get('program')
        sub_program_id = self.request.query_params.get('sub_program')
        course_id = self.request.query_params.get('course')
        
        print(f"DEBUG: fetchFields params - program:{program_id}, subprogram:{sub_program_id}, course:{course_id}")

        if course_id:
            # If course is specified, we want fields for this course, its subprogram, AND its program
            try:
                from core.models import Course
                course_obj = Course.objects.get(id=course_id)
                from django.db.models import Q
                queryset = queryset.filter(
                    Q(course_id=course_id) | 
                    Q(sub_program_id=course_obj.sub_program_id) |
                    Q(program_id=course_obj.sub_program.program_id)
                )
            except:
                queryset = queryset.filter(course_id=course_id)
        elif sub_program_id:
            # If sub_program is specified, we want fields for this sub_program AND its program
            try:
                from core.models import SubProgram
                sp_obj = SubProgram.objects.get(id=sub_program_id)
                from django.db.models import Q
                queryset = queryset.filter(
                    Q(sub_program_id=sub_program_id) | 
                    Q(program_id=sp_obj.program_id)
                )
            except:
                queryset = queryset.filter(sub_program_id=sub_program_id)
        elif program_id:
            queryset = queryset.filter(program_id=program_id)
        
        field_group = self.request.query_params.get('field_group')
        if field_group:
            queryset = queryset.filter(field_group=field_group)
        
        print(f"DEBUG: Returning {queryset.count()} fields")
        return queryset

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [permissions.IsAdminUser()]
        return [permissions.AllowAny()] # Allow fetching fields for forms publicly/authenticated
