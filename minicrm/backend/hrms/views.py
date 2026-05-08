from rest_framework import viewsets, permissions
from .models import Department, Designation, EmployeeProfile, CustomField, Attendance, ShiftSetting, Task, TaskComment
from .serializers import (
    DepartmentSerializer, DesignationSerializer, EmployeeProfileSerializer, 
    CustomFieldSerializer, AttendanceSerializer, ShiftSettingSerializer, TaskSerializer,
    TaskCommentSerializer
)
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from datetime import datetime

class ShiftSettingViewSet(viewsets.ModelViewSet):
    queryset = ShiftSetting.objects.all()
    serializer_class = ShiftSettingSerializer
    permission_classes = [permissions.IsAuthenticated]

class AttendanceViewSet(viewsets.ModelViewSet):
    serializer_class = AttendanceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'SUPER_ADMIN' or user.is_superuser:
            return Attendance.objects.all()
        # Non-admins can only see their own attendance
        return Attendance.objects.filter(employee__user=user)

    @action(detail=False, methods=['post'])
    def clock_in(self, request):
        user = request.user
        try:
            profile = user.hrms_profile
        except EmployeeProfile.DoesNotExist:
            return Response({"error": "Employee profile not found"}, status=404)

        today = timezone.now().date()
        attendance, created = Attendance.objects.get_or_create(employee=profile, date=today)
        
        if not created and attendance.clock_in:
            return Response({"error": "Already clocked in today"}, status=400)

        now = timezone.now()
        attendance.clock_in = now.time()
        
        # Geofencing Validation
        lat1 = request.data.get('latitude')
        lon1 = request.data.get('longitude')
        
        attendance.clock_in_latitude = lat1
        attendance.clock_in_longitude = lon1
        
        shift = ShiftSetting.objects.filter(is_active=True).first()
        if shift and shift.office_latitude != 0:
            from math import radians, cos, sin, asin, sqrt
            def haversine(lat1, lon1, lat2, lon2):
                # convert decimal degrees to radians 
                lon1, lat1, lon2, lat2 = map(radians, [float(lon1), float(lat1), float(lon2), float(lat2)])
                # haversine formula 
                dlon = lon2 - lon1 
                dlat = lat2 - lat1 
                a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
                c = 2 * asin(sqrt(a)) 
                r = 6371 # Radius of earth in kilometers. Use 3956 for miles
                return c * r * 1000 # returns meters

            distance = haversine(lat1, lon1, shift.office_latitude, shift.office_longitude)
            if distance > shift.allowed_radius_meters:
                return Response({
                    "error": f"Out of bounds. You are {int(distance)}m away from the office. Allowed radius: {shift.allowed_radius_meters}m"
                }, status=400)

        # Auto-calculate status (LATE check)
        if shift:
            # Combine today's date with shift start time for comparison
            shift_start = datetime.combine(today, shift.start_time)
            # Add grace period
            allowed_time = shift_start + timezone.timedelta(minutes=shift.grace_period_minutes)
            
            # Make sure both are aware or naive (Django timezone.now() is aware)
            allowed_time = timezone.make_aware(allowed_time)
            
            if now > allowed_time:
                attendance.status = 'LATE'
            else:
                attendance.status = 'PRESENT'
        
        attendance.save()
        return Response(AttendanceSerializer(attendance).data)

    @action(detail=False, methods=['post'])
    def clock_out(self, request):
        user = request.user
        try:
            profile = user.hrms_profile
        except EmployeeProfile.DoesNotExist:
            return Response({"error": "Employee profile not found"}, status=404)

        today = timezone.now().date()
        try:
            attendance = Attendance.objects.get(employee=profile, date=today)
        except Attendance.DoesNotExist:
            return Response({"error": "No clock-in record found for today"}, status=400)

        if attendance.clock_out:
            return Response({"error": "Already clocked out today"}, status=400)

        attendance.clock_out = timezone.now().time()
        attendance.clock_out_latitude = request.data.get('latitude')
        attendance.clock_out_longitude = request.data.get('longitude')
        attendance.save()
        
        return Response(AttendanceSerializer(attendance).data)

class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = [permissions.IsAuthenticated]

class CustomFieldViewSet(viewsets.ModelViewSet):
    queryset = CustomField.objects.all()
    serializer_class = CustomFieldSerializer
    permission_classes = [permissions.IsAuthenticated]

class DesignationViewSet(viewsets.ModelViewSet):
    queryset = Designation.objects.all()
    serializer_class = DesignationSerializer
    permission_classes = [permissions.IsAuthenticated]

class EmployeeProfileViewSet(viewsets.ModelViewSet):
    serializer_class = EmployeeProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'SUPER_ADMIN' or user.is_superuser:
            return EmployeeProfile.objects.all()
        # Non-admins can only see their own profile
        return EmployeeProfile.objects.filter(user=user)

class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'SUPER_ADMIN' or user.is_superuser:
            return Task.objects.all()
        # Employees see tasks assigned to them, or tasks they assigned to others
        from django.db.models import Q
        return Task.objects.filter(Q(assignee__user=user) | Q(assigned_by__user=user))

    def perform_create(self, serializer):
        try:
            profile = self.request.user.hrms_profile
            serializer.save(assigned_by=profile)
        except EmployeeProfile.DoesNotExist:
            serializer.save()

class TaskCommentViewSet(viewsets.ModelViewSet):
    queryset = TaskComment.objects.all()
    serializer_class = TaskCommentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)
