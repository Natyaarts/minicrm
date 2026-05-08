from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import LeaveType, LeaveBalance, LeaveRequest, Holiday
from .serializers import LeaveTypeSerializer, LeaveBalanceSerializer, LeaveRequestSerializer, HolidaySerializer
from hrms.models import EmployeeProfile

class HolidayViewSet(viewsets.ModelViewSet):
    queryset = Holiday.objects.all()
    serializer_class = HolidaySerializer
    permission_classes = [permissions.IsAuthenticated]

class LeaveTypeViewSet(viewsets.ModelViewSet):
    queryset = LeaveType.objects.all()
    serializer_class = LeaveTypeSerializer
    permission_classes = [permissions.IsAuthenticated]

class LeaveBalanceViewSet(viewsets.ModelViewSet):
    serializer_class = LeaveBalanceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'SUPER_ADMIN':
            return LeaveBalance.objects.all()
        return LeaveBalance.objects.filter(employee__user=user)

class LeaveRequestViewSet(viewsets.ModelViewSet):
    serializer_class = LeaveRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'SUPER_ADMIN':
            return LeaveRequest.objects.all()
        return LeaveRequest.objects.filter(employee__user=user)

    def perform_create(self, serializer):
        try:
            employee = EmployeeProfile.objects.get(user=self.request.user)
            serializer.save(employee=employee)
        except EmployeeProfile.DoesNotExist:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"error": "Your user account is not linked to an Employee Profile. Please contact HR."})

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        if request.user.role != 'SUPER_ADMIN':
            return Response({"error": "Only admins can approve leaves"}, status=status.HTTP_403_FORBIDDEN)
            
        leave = self.get_object()
        if leave.status != 'PENDING':
            return Response({"error": "Only pending leaves can be approved"}, status=status.HTTP_400_BAD_REQUEST)
            
        # Business Logic: Deduct balance if paid leave
        if leave.leave_type.is_paid:
            balance, created = LeaveBalance.objects.get_or_create(
                employee=leave.employee,
                leave_type=leave.leave_type,
                defaults={'total_days': leave.leave_type.max_days_per_year}
            )
            
            duration = leave.duration
            if balance.remaining_days >= duration:
                balance.used_days += duration
                balance.save()
            else:
                # If balance not enough, you can either reject or 
                # still approve but it might be partially LOP.
                # For now, let's just allow it but warn or handle in payroll.
                pass

        leave.status = 'APPROVED'
        leave.approved_by = EmployeeProfile.objects.get(user=request.user)
        leave.save()
        return Response({"status": "Leave approved"})

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        if request.user.role != 'SUPER_ADMIN':
            return Response({"error": "Only admins can reject leaves"}, status=status.HTTP_403_FORBIDDEN)
            
        leave = self.get_object()
        reason = request.data.get('rejection_reason', 'No reason provided')
        leave.status = 'REJECTED'
        leave.rejection_reason = reason
        leave.save()
        return Response({"status": "Leave rejected"})
