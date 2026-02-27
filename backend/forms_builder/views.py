
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

        if program_id:
            queryset = queryset.filter(program_id=program_id)
        if sub_program_id:
            queryset = queryset.filter(sub_program_id=sub_program_id)
        if course_id:
            queryset = queryset.filter(course_id=course_id)
        
        return queryset

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [permissions.IsAdminUser()]
        return [permissions.AllowAny()] # Allow fetching fields for forms publicly/authenticated
