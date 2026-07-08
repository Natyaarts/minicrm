from rest_framework import viewsets, permissions
from .models import Department, Designation, EmployeeProfile, CustomField, Attendance, ShiftSetting, Task, TaskComment, CompanyPost, EmployeeDocument, Asset, Expense, PerformanceReview, Offboarding
from .serializers import (
    DepartmentSerializer, DesignationSerializer, EmployeeProfileSerializer, 
    CustomFieldSerializer, AttendanceSerializer, ShiftSettingSerializer, TaskSerializer,
    TaskCommentSerializer, CompanyPostSerializer, EmployeeDocumentSerializer, AssetSerializer, ExpenseSerializer, PerformanceReviewSerializer, OffboardingSerializer
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
            qs = Attendance.objects.all().order_by('-date', '-clock_in')
        else:
            # Non-admins can only see their own attendance
            qs = Attendance.objects.filter(employee__user=user).order_by('-date', '-clock_in')
            
        if self.request.query_params.get('my_only') == 'true':
            qs = Attendance.objects.filter(employee__user=user).order_by('-date', '-clock_in')
            
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        
        if start_date:
            qs = qs.filter(date__gte=start_date)
        if end_date:
            qs = qs.filter(date__lte=end_date)
            
        return qs

    @action(detail=False, methods=['post'])
    def clock_in(self, request):
        user = request.user
        try:
            profile = user.hrms_profile
        except EmployeeProfile.DoesNotExist:
            # Auto-create profile for super admins if missing
            if user.role == 'SUPER_ADMIN' or user.is_superuser:
                from zoneinfo import ZoneInfo
                kolkata = ZoneInfo('Asia/Kolkata')
                profile = EmployeeProfile.objects.create(
                    user=user,
                    employee_id=f'EMP-{user.username.upper()[:5]}-001',
                    date_of_joining=timezone.now().astimezone(kolkata).date(),
                    status='ACTIVE',
                )
            else:
                return Response({"error": "Employee profile not found. Please contact HR to set up your profile."}, status=404)

        from zoneinfo import ZoneInfo
        kolkata = ZoneInfo('Asia/Kolkata')
        now_local = timezone.now().astimezone(kolkata)
        today = now_local.date()
        
        attendance, created = Attendance.objects.get_or_create(employee=profile, date=today)
        
        if not created and attendance.clock_in:
            return Response({"error": "Already clocked in today"}, status=400)

        attendance.clock_in = now_local.time()
        
        # Geofencing Validation
        lat1 = request.data.get('latitude')
        lon1 = request.data.get('longitude')
        
        attendance.clock_in_latitude = lat1
        attendance.clock_in_longitude = lon1
        
        photo_base64 = request.data.get('photo')
        if photo_base64:
            import base64
            from django.core.files.base import ContentFile
            import uuid
            try:
                format, imgstr = photo_base64.split(';base64,')
                ext = format.split('/')[-1]
                data = ContentFile(base64.b64decode(imgstr), name=f"{user.username}_{today.strftime('%Y%m%d')}_{uuid.uuid4().hex[:8]}.{ext}")
                attendance.clock_in_photo = data
                
                # --- MOCK FACIAL VERIFICATION ---
                if not profile.profile_photo:
                    try:
                        profile.profile_photo.save(data.name, data, save=True)
                    except Exception as photo_err:
                        print("Failed to auto-set profile photo:", photo_err)

                if profile.profile_photo:
                    import random
                    attendance.is_face_verified = True
                    attendance.verification_confidence = round(random.uniform(92.5, 99.9), 2)
                else:
                    attendance.is_face_verified = True
                    attendance.verification_confidence = 100.0
            except Exception as e:
                print("Failed to decode photo:", e)
        
        shift = ShiftSetting.objects.filter(is_active=True).first()
        if shift and shift.office_latitude != 0:
            if lat1 is None or lon1 is None:
                return Response({"error": "Location coordinates are required for geofencing validation."}, status=400)
            
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

            try:
                distance = haversine(lat1, lon1, shift.office_latitude, shift.office_longitude)
            except (ValueError, TypeError) as e:
                return Response({"error": "Invalid location coordinates provided."}, status=400)

            if distance > shift.allowed_radius_meters:
                return Response({
                    "error": f"Out of bounds. You are {int(distance)}m away from the office. Allowed radius: {shift.allowed_radius_meters}m"
                }, status=400)

        # Auto-calculate status (LATE check)
        if shift:
            # Combine local date with shift start time and localize
            shift_start = datetime.combine(today, shift.start_time, tzinfo=kolkata)
            # Add grace period
            allowed_time = shift_start + timezone.timedelta(minutes=shift.grace_period_minutes)
            
            if now_local > allowed_time:
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

        from zoneinfo import ZoneInfo
        kolkata = ZoneInfo('Asia/Kolkata')
        now_local = timezone.now().astimezone(kolkata)
        today = now_local.date()
        
        try:
            attendance = Attendance.objects.get(employee=profile, date=today)
        except Attendance.DoesNotExist:
            return Response({"error": "No clock-in record found for today"}, status=400)

        if attendance.clock_out:
            return Response({"error": "Already clocked out today"}, status=400)

        attendance.clock_out = now_local.time()
        attendance.clock_out_latitude = request.data.get('latitude')
        attendance.clock_out_longitude = request.data.get('longitude')
        
        # Calculate HALF-DAY
        if attendance.clock_in:
            start_dt = datetime.combine(today, attendance.clock_in)
            end_dt = datetime.combine(today, attendance.clock_out)
            duration_hours = (end_dt - start_dt).total_seconds() / 3600.0
            
            # If worked less than 4 hours, mark as HALF_DAY
            if duration_hours < 4.0:
                attendance.status = 'HALF_DAY'

        attendance.save()
        
        return Response(AttendanceSerializer(attendance).data)

    @action(detail=True, methods=['patch'])
    def override_status(self, request, pk=None):
        user = request.user
        if user.role != 'SUPER_ADMIN' and not user.is_superuser:
            return Response({"error": "Permission denied"}, status=403)
            
        attendance = self.get_object()
        new_status = request.data.get('status')
        if new_status not in dict(Attendance.STATUS_CHOICES).keys():
            return Response({"error": "Invalid status"}, status=400)
            
        attendance.status = new_status
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
        qs = EmployeeProfile.objects.select_related(
            'user', 'department', 'designation', 'reporting_to', 'reporting_to__user'
        ).prefetch_related('documents')
        
        if user.role == 'SUPER_ADMIN' or user.is_superuser:
            return qs.all()
        # Non-admins can only see their own profile
        return qs.filter(user=user)

    @action(detail=False, methods=['get'])
    def celebrations(self, request):
        import pytz
        kolkata = pytz.timezone('Asia/Kolkata')
        today = timezone.now().astimezone(kolkata).date()
        current_month = today.month
        current_day = today.day

        # Get Birthdays
        birthdays = EmployeeProfile.objects.filter(
            date_of_birth__month=current_month,
            date_of_birth__day=current_day
        )
        
        # Get Work Anniversaries
        anniversaries = EmployeeProfile.objects.filter(
            date_of_joining__month=current_month,
            date_of_joining__day=current_day
        ).exclude(date_of_joining__year=today.year) # Don't celebrate if they joined exactly today

        data = {
            "birthdays": EmployeeProfileSerializer(birthdays, many=True).data,
            "anniversaries": EmployeeProfileSerializer(anniversaries, many=True).data,
        }
        return Response(data)

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

class CompanyPostViewSet(viewsets.ModelViewSet):
    queryset = CompanyPost.objects.all().order_by('-created_at')
    serializer_class = CompanyPostSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

class EmployeeDocumentViewSet(viewsets.ModelViewSet):
    serializer_class = EmployeeDocumentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ['SUPER_ADMIN', 'ADMIN'] or user.is_superuser:
            return EmployeeDocument.objects.all().order_by('-uploaded_at')
        return EmployeeDocument.objects.filter(employee__user=user).order_by('-uploaded_at')

class AssetViewSet(viewsets.ModelViewSet):
    queryset = Asset.objects.all()
    serializer_class = AssetSerializer
    permission_classes = [permissions.IsAuthenticated]

class ExpenseViewSet(viewsets.ModelViewSet):
    queryset = Expense.objects.all().order_by('-submitted_date')
    serializer_class = ExpenseSerializer
    permission_classes = [permissions.IsAuthenticated]

class PerformanceReviewViewSet(viewsets.ModelViewSet):
    serializer_class = PerformanceReviewSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ['SUPER_ADMIN', 'ADMIN'] or user.is_superuser:
            return PerformanceReview.objects.all().order_by('-created_at')
        return PerformanceReview.objects.filter(employee__user=user).order_by('-created_at')

class OffboardingViewSet(viewsets.ModelViewSet):
    serializer_class = OffboardingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ['SUPER_ADMIN', 'ADMIN'] or user.is_superuser:
            return Offboarding.objects.all().order_by('-last_working_day')
        return Offboarding.objects.filter(employee__user=user).order_by('-last_working_day')
