import datetime
from decimal import Decimal
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework import status

from hrms.models import Department, Designation, EmployeeProfile, Attendance
from leaves.models import LeaveType, LeaveRequest
from payroll.models import SalaryStructure, Payslip

User = get_user_model()


class PayrollReconciliationTests(APITestCase):
    def setUp(self):
        self.dept = Department.objects.create(name="Finance")
        self.admin_desig = Designation.objects.create(
            name="HR Admin", department=self.dept, permission_role="ADMIN"
        )
        self.emp_desig = Designation.objects.create(
            name="Accountant", department=self.dept, permission_role="EMPLOYEE"
        )

        self.super_user = User.objects.create_user(
            username="payrolladmin", email="payrolladmin@example.com", password="password123", role="SUPER_ADMIN"
        )
        self.super_profile = self.super_user.hrms_profile
        self.super_profile.employee_id = "PAY001"
        self.super_profile.department = self.dept
        self.super_profile.designation = self.admin_desig
        self.super_profile.save()

        self.emp_user = User.objects.create_user(
            username="payrollemp", email="payrollemp@example.com", password="password123", role="EMPLOYEE"
        )
        self.emp_profile = self.emp_user.hrms_profile
        self.emp_profile.employee_id = "EMP901"
        self.emp_profile.department = self.dept
        self.emp_profile.designation = self.emp_desig
        self.emp_profile.status = "ACTIVE"
        self.emp_profile.save()

        # Salary Structure: Base 30000, HRA 5000 = 35000 Gross
        self.salary_struct = SalaryStructure.objects.create(
            employee=self.emp_profile,
            base_salary=Decimal("30000.00"),
            hra=Decimal("5000.00"),
            conveyance=Decimal("0.00"),
            medical=Decimal("0.00"),
            special_allowance=Decimal("0.00"),
            provident_fund=Decimal("0.00"),
            professional_tax=Decimal("0.00")
        )

        self.paid_leave_type = LeaveType.objects.create(
            name="Earned Leave", code="EL", is_paid=True, max_days_per_year=15
        )

    def test_payslip_generation_with_approved_leave_reconciliation(self):
        """
        Verify that payslip generation reconciles approved LeaveRequest records
        so that marked absences covered by approved leave do not trigger LOP deductions.
        """
        # Employee was marked ABSENT on Sep 11
        Attendance.objects.create(
            employee=self.emp_profile,
            date=datetime.date(2026, 9, 11),
            status="ABSENT"
        )

        # But employee has an APPROVED leave covering Sep 11 to Sep 13
        LeaveRequest.objects.create(
            employee=self.emp_profile,
            leave_type=self.paid_leave_type,
            start_date=datetime.date(2026, 9, 11),
            end_date=datetime.date(2026, 9, 13),
            reason="Family function",
            status="APPROVED"
        )

        self.client.force_authenticate(user=self.super_user)
        res = self.client.post('/api/payroll/payslips/generate_all/', {
            'month': 9,
            'year': 2026
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        payslip = Payslip.objects.get(employee=self.emp_profile, month=9, year=2026)
        # Because the absence on Sep 11 is covered by approved leave, LOP deduction is 0.00
        self.assertEqual(payslip.lop_deduction, Decimal("0.00"))
        self.assertEqual(payslip.paid_days, Decimal("30.0"))
