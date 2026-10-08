from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from users.permissions import IsAdminOrSuperAdmin, IsAdminOrReadOnly
from .models import LeaveType, LeaveBalance, LeaveRequest, Holiday
from .serializers import LeaveTypeSerializer, LeaveBalanceSerializer, LeaveRequestSerializer, HolidaySerializer
from hrms.models import EmployeeProfile

class HolidayViewSet(viewsets.ModelViewSet):
    queryset = Holiday.objects.all()
    serializer_class = HolidaySerializer
    permission_classes = [IsAdminOrReadOnly]

class LeaveTypeViewSet(viewsets.ModelViewSet):
    queryset = LeaveType.objects.all()
    serializer_class = LeaveTypeSerializer
    permission_classes = [IsAdminOrReadOnly]

class LeaveBalanceViewSet(viewsets.ModelViewSet):
    serializer_class = LeaveBalanceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return LeaveBalance.objects.none()
        if user.role in ['SUPER_ADMIN', 'ADMIN'] or user.is_superuser:
            return LeaveBalance.objects.all()
        return LeaveBalance.objects.filter(employee__user=user)

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdminOrSuperAdmin()]
        return [permissions.IsAuthenticated()]

class LeaveRequestViewSet(viewsets.ModelViewSet):
    serializer_class = LeaveRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        from django.db.models import Q
        user = self.request.user
        if not user.is_authenticated:
            return LeaveRequest.objects.none()
        if user.role in ['SUPER_ADMIN', 'ADMIN'] or user.is_superuser:
            return LeaveRequest.objects.all().order_by('-applied_at')
        return LeaveRequest.objects.filter(
            Q(employee__user=user) | Q(employee__reporting_to__user=user)
        ).distinct().order_by('-applied_at')

    def perform_create(self, serializer):
        try:
            employee = EmployeeProfile.objects.get(user=self.request.user)
            initial_status = 'PENDING_MANAGER' if employee.reporting_to else 'PENDING_HR'
            serializer.save(employee=employee, status=initial_status)
        except EmployeeProfile.DoesNotExist:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"error": "Your user account is not linked to an Employee Profile. Please contact HR."})

    def _apply_final_approval(self, leave, user):
        """Helper to apply final approval, deduct balance if paid, and sync attendance."""
        if leave.leave_type.is_paid:
            balance, created = LeaveBalance.objects.get_or_create(
                employee=leave.employee,
                leave_type=leave.leave_type,
                defaults={'total_days': leave.leave_type.max_days_per_year}
            )
            duration = leave.duration
            balance.used_days += duration
            balance.save()

        leave.status = 'APPROVED'
        leave.approved_by = EmployeeProfile.objects.filter(user=user).first()
        leave.save()

        # Synchronize with Attendance records
        from hrms.models import Attendance
        import datetime as dt
        cur_d = leave.start_date
        while cur_d <= leave.end_date:
            Attendance.objects.update_or_create(
                employee=leave.employee,
                date=cur_d,
                defaults={
                    'status': 'ON_LEAVE',
                    'notes': f"Approved Leave ({leave.leave_type.name}): {leave.reason}"
                }
            )
            cur_d += dt.timedelta(days=1)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        leave = self.get_object()
        user = request.user
        
        is_manager = bool(leave.employee.reporting_to and leave.employee.reporting_to.user == user)
        is_super_admin = bool(user.role == 'SUPER_ADMIN' or user.is_superuser)
        is_hr = bool(user.role in ['SUPER_ADMIN', 'ADMIN'] or user.is_superuser)
        
        if not (is_manager or is_hr):
            return Response({"error": "You do not have permission to approve this leave."}, status=status.HTTP_403_FORBIDDEN)

        # Stage 1: PENDING_MANAGER
        if leave.status == 'PENDING_MANAGER':
            if is_super_admin:
                self._apply_final_approval(leave, user)
                return Response({"status": "Leave approved by Super Admin."})
            elif is_manager:
                leave.status = 'PENDING_HR'
                leave.manager_approved_by = EmployeeProfile.objects.filter(user=user).first()
                leave.save()
                return Response({"status": "Leave approved by Manager. Pending HR approval."})
            else:
                return Response({"error": "This leave request is currently awaiting direct manager approval."}, status=status.HTTP_403_FORBIDDEN)

        # Stage 2: PENDING_HR
        if leave.status == 'PENDING_HR':
            if is_hr:
                self._apply_final_approval(leave, user)
                return Response({"status": "Leave approved by HR."})
            else:
                return Response({"error": "You do not have permission to give final HR approval for this leave."}, status=status.HTTP_403_FORBIDDEN)
            
        return Response({"error": f"Cannot approve leave from current status: {leave.status}"}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        leave = self.get_object()
        user = request.user
        
        is_manager = bool(leave.employee.reporting_to and leave.employee.reporting_to.user == user)
        is_super_admin = bool(user.role == 'SUPER_ADMIN' or user.is_superuser)
        is_hr = bool(user.role in ['SUPER_ADMIN', 'ADMIN'] or user.is_superuser)
        
        if not (is_manager or is_hr):
            return Response({"error": "You do not have permission to reject this leave."}, status=status.HTTP_403_FORBIDDEN)
            
        if leave.status not in ['PENDING_MANAGER', 'PENDING_HR']:
            return Response({"error": "Only pending leaves can be rejected."}, status=status.HTTP_400_BAD_REQUEST)

        if leave.status == 'PENDING_MANAGER' and not (is_manager or is_super_admin):
            return Response({"error": "This leave request is currently awaiting direct manager approval."}, status=status.HTTP_403_FORBIDDEN)

        if leave.status == 'PENDING_HR' and not is_hr:
            return Response({"error": "You do not have permission to reject this leave at HR stage."}, status=status.HTTP_403_FORBIDDEN)
            
        reason = request.data.get('rejection_reason', 'No reason provided')
        leave.status = 'REJECTED'
        leave.rejection_reason = reason
        if is_manager and not leave.manager_approved_by:
            leave.manager_approved_by = EmployeeProfile.objects.filter(user=user).first()
        if is_hr:
            leave.approved_by = EmployeeProfile.objects.filter(user=user).first()
        leave.save()
        return Response({"status": "Leave rejected"})

