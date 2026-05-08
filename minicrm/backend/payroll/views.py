import calendar
from django.http import HttpResponse
from decimal import Decimal
from django.db.models import Q
from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from hrms.models import EmployeeProfile, Attendance
from .models import SalaryStructure, Payslip, BonusDeduction, EmployeeLoan
from .serializers import SalaryStructureSerializer, PayslipSerializer, BonusDeductionSerializer, EmployeeLoanSerializer
from .utils import render_to_pdf, number_to_words

class SalaryStructureViewSet(viewsets.ModelViewSet):
    queryset = SalaryStructure.objects.all()
    serializer_class = SalaryStructureSerializer
    permission_classes = [permissions.IsAuthenticated]

class BonusDeductionViewSet(viewsets.ModelViewSet):
    serializer_class = BonusDeductionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'SUPER_ADMIN' or user.is_superuser:
            return BonusDeduction.objects.all()
        return BonusDeduction.objects.filter(employee__user=user)

class EmployeeLoanViewSet(viewsets.ModelViewSet):
    queryset = EmployeeLoan.objects.all()
    serializer_class = EmployeeLoanSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'SUPER_ADMIN' or user.is_superuser:
            return EmployeeLoan.objects.all()
        return EmployeeLoan.objects.filter(employee__user=user)

class PayslipViewSet(viewsets.ModelViewSet):
    serializer_class = PayslipSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'SUPER_ADMIN' or user.is_superuser:
            return Payslip.objects.all()
        return Payslip.objects.filter(employee__user=user)

    @action(detail=False, methods=['post'])
    def generate_all(self, request):
        month = int(request.data.get('month'))
        year = int(request.data.get('year'))
        
        if not month or not year:
            return Response({"error": "Month and Year are required"}, status=400)
            
        active_employees = EmployeeProfile.objects.filter(status='ACTIVE')
        created_count = 0
        skipped_count = 0
        
        _, days_in_month = calendar.monthrange(year, month)
        
        for emp in active_employees:
            if Payslip.objects.filter(employee=emp, month=month, year=year).exists():
                skipped_count += 1
                continue
                
            try:
                struct = emp.salary_structure
            except SalaryStructure.DoesNotExist:
                continue
            
            # --- PROFESSIONAL ATTENDANCE & LEAVE CALCULATION ---
            # 1. Base Attendance
            attendance = Attendance.objects.filter(
                employee=emp, 
                date__month=month, 
                date__year=year
            )
            
            present_days = attendance.filter(status__in=['PRESENT', 'LATE']).count()
            half_days = attendance.filter(status='HALF_DAY').count()
            paid_leave_days = attendance.filter(status='ON_LEAVE').count()
            absent_records = attendance.filter(status='ABSENT')
            
            # 2. Smart Leave Override
            from leaves.models import LeaveRequest
            from django.db.models import Q
            approved_leaves = LeaveRequest.objects.filter(
                employee=emp, 
                status='APPROVED'
            ).filter(
                Q(start_date__month=month, start_date__year=year) | 
                Q(end_date__month=month, end_date__year=year)
            )
            
            # If marked ABSENT but has an approved leave, forgive the absence
            protected_absences = 0
            for record in absent_records:
                for leave in approved_leaves:
                    if leave.start_date <= record.date <= leave.end_date:
                        protected_absences += 1
                        break
            
            real_absent_days = absent_records.count() - protected_absences
            
            # 3. Calculate LOP from explicitly Unpaid Leaves
            unpaid_leaves = approved_leaves.filter(leave_type__is_paid=False)
            unpaid_leave_days = sum((l.end_date - l.start_date).days + 1 for l in unpaid_leaves)
            
            # 4. Total LOP Calculation
            lop_days = Decimal(str(real_absent_days)) + (Decimal(str(half_days)) * Decimal('0.5')) + Decimal(str(unpaid_leave_days))
            
            # Use Decimal for all money/day math
            total_paid_days = Decimal(str(present_days)) + (Decimal(str(half_days)) * Decimal('0.5')) + Decimal(str(paid_leave_days))
            
            gross_salary = struct.base_salary + struct.total_allowances
            daily_rate = gross_salary / Decimal(str(days_in_month))
            lop_deduction = (daily_rate * lop_days).quantize(Decimal('0.01'))
            
            # Calculate adjustments (Bonuses/Deductions)
            adjustments = BonusDeduction.objects.filter(employee=emp, month=month, year=year, is_applied=False)
            extra_allowances = sum(Decimal(str(adj.amount)) for adj in adjustments if adj.adjustment_type == 'BONUS')
            if not isinstance(extra_allowances, Decimal): extra_allowances = Decimal('0')
            
            extra_deductions = sum(Decimal(str(adj.amount)) for adj in adjustments if adj.adjustment_type == 'DEDUCTION')
            if not isinstance(extra_deductions, Decimal): extra_deductions = Decimal('0')
            
            # --- LOAN REPAYMENT LOGIC ---
            loan_deduction = Decimal('0')
            active_loans = EmployeeLoan.objects.filter(employee=emp, is_active=True, balance_amount__gt=0)
            for loan in active_loans:
                repayment = min(loan.monthly_repayment, loan.balance_amount)
                loan_deduction += repayment
                # We will update the balance ONLY when the payslip is generated
                # But wait, what if generation is re-run?
                # We should only update balance when status becomes PAID or at generation time?
                # Professional ERPs update balance at GENERATION but allow reversal.
                loan.balance_amount -= repayment
                if loan.balance_amount <= 0:
                    loan.is_active = False
                loan.save()

            # Create Payslip
            total_allowances = struct.total_allowances + extra_allowances
            total_deductions = struct.total_deductions + extra_deductions + lop_deduction + loan_deduction
            net_salary = (struct.base_salary + total_allowances) - total_deductions
            
            Payslip.objects.create(
                employee=emp,
                month=month,
                year=year,
                basic_pay=struct.base_salary,
                total_allowances=total_allowances,
                lop_deduction=lop_deduction,
                loan_deduction=loan_deduction,
                total_deductions=total_deductions,
                net_salary=net_salary,
                total_working_days=days_in_month,
                paid_days=Decimal(str(days_in_month)) - lop_days,
                status='PENDING'
            )
            
            adjustments.update(is_applied=True)
            created_count += 1
            
        return Response({
            "message": f"Successfully generated {created_count} payslips. {skipped_count} already existed.",
            "generated": created_count,
            "skipped": skipped_count
        })

    @action(detail=True, methods=['post'])
    def mark_as_paid(self, request, pk=None):
        payslip = self.get_object()
        payslip.status = 'PAID'
        payslip.paid_on = timezone.now()
        payslip.payment_method = request.data.get('payment_method', 'BANK_TRANSFER')
        payslip.save()
        return Response(PayslipSerializer(payslip).data)

    @action(detail=True, methods=['get'])
    def download_pdf(self, request, pk=None):
        payslip = self.get_object()
        
        # Prepare context
        month_name = calendar.month_name[payslip.month]
        gross_salary = payslip.basic_pay + payslip.total_allowances
        other_deductions = payslip.total_deductions - payslip.lop_deduction
        
        context = {
            'payslip': payslip,
            'employee': PayslipSerializer(payslip).data.get('employee_details', {}), # Assuming we have this in serializer
            'month_name': month_name,
            'year': payslip.year,
            'gross_salary': gross_salary,
            'other_deductions': other_deductions,
            'net_in_words': number_to_words(payslip.net_salary),
            'current_date': timezone.now().strftime('%d-%m-%Y %H:%M')
        }
        
        # If employee details not in serializer, fetch manually
        if not context['employee']:
            from hrms.serializers import EmployeeProfileSerializer
            context['employee'] = EmployeeProfileSerializer(payslip.employee).data

        pdf = render_to_pdf('payroll/payslip.html', context)
        if pdf:
            response = HttpResponse(pdf.content, content_type='application/pdf')
            filename = f"Payslip_{payslip.employee.employee_id}_{month_name}_{payslip.year}.pdf"
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response
        return Response({"error": "PDF generation failed"}, status=400)
