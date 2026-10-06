from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from django.utils import timezone
from users.models import RolePermission
from hrms.models import EmployeeProfile, Department, Designation, ShiftSetting
from payroll.models import SalaryStructure, Payslip
from leaves.models import Holiday, LeaveType, LeaveBalance
from forms_builder.models import DynamicField

User = get_user_model()

class VA009PrivilegeEscalationSecurityTests(TestCase):
    """
    Security Test Suite for VAPT Finding VA-009:
    Privilege Escalation Through Response Manipulation & Parameter Tampering.
    
    Validates that:
    1. Client-side role manipulation (localStorage/React/response interception) does NOT grant backend access.
    2. Server-side database identity is the sole source of truth for authorization.
    3. Direct API requests bypassing the frontend fail with HTTP 403 / 401.
    4. Object-level tampering (IDOR) fails server-side.
    5. Role elevation in request body is strictly blocked.
    """

    def setUp(self):
        self.client = APIClient()

        # 1. Super Admin Account
        self.super_admin = User.objects.create_user(
            username='superadmin_va009',
            email='superadmin_va009@natyaarts.com',
            password='Password123!',
            role='SUPER_ADMIN',
            is_superuser=True,
            is_staff=True
        )

        # 2. Admin Account
        self.admin = User.objects.create_user(
            username='admin_va009',
            email='admin_va009@natyaarts.com',
            password='Password123!',
            role='ADMIN',
            is_staff=True
        )

        # 3. Regular Employee Account
        self.employee = User.objects.create_user(
            username='employee_va009',
            email='employee_va009@natyaarts.com',
            password='Password123!',
            role='EMPLOYEE'
        )
        self.employee_profile = getattr(self.employee, 'hrms_profile', None)
        if not self.employee_profile:
            self.employee_profile = EmployeeProfile.objects.filter(user=self.employee).first()
        self.employee_profile.base_salary = 45000.00
        self.employee_profile.save()

        # 4. Target Victim Account (another employee)
        self.victim = User.objects.create_user(
            username='victim_va009',
            email='victim_va009@natyaarts.com',
            password='Password123!',
            role='EMPLOYEE'
        )
        self.victim_profile = getattr(self.victim, 'hrms_profile', None)
        if not self.victim_profile:
            self.victim_profile = EmployeeProfile.objects.filter(user=self.victim).first()
        self.victim_profile.base_salary = 55000.00
        self.victim_profile.save()

    # ----------------------------------------------------------------------
    # Test L: Unauthenticated request -> HTTP 401
    # ----------------------------------------------------------------------
    def test_unauthenticated_requests_rejected(self):
        """Any unauthenticated direct API request must return HTTP 401."""
        endpoints = [
            ('/api/auth/management/users/', 'get'),
            ('/api/auth/management/permissions/', 'get'),
            ('/api/hrms/shifts/', 'post'),
            ('/api/payroll/salary-structures/', 'get'),
            ('/api/leaves/balances/', 'get'),
        ]
        for url, method in endpoints:
            if method == 'get':
                res = self.client.get(url)
            else:
                res = self.client.post(url, {})
            self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED, f"Failed at {url}")

    # ----------------------------------------------------------------------
    # Test A & B & M & N: Direct API Calls with Manipulated Frontend Context
    # ----------------------------------------------------------------------
    def test_employee_direct_api_calls_receive_403(self):
        """
        Even if the client-side manipulated its local state to 'ADMIN',
        the backend receives the Employee's token and must return HTTP 403 Forbidden.
        """
        self.client.force_authenticate(user=self.employee)

        # 1. User Management List
        res = self.client.get('/api/auth/management/users/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Permission Management List
        res = self.client.get('/api/auth/management/permissions/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Create Shift Settings (Admin only)
        res = self.client.post('/api/hrms/shifts/', {
            'shift_name': 'Hacked Shift',
            'start_time': '09:00:00',
            'end_time': '18:00:00'
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Form Builder - Create Dynamic Field (Admin only)
        res = self.client.post('/api/forms/fields/', {
            'label': 'Hacked Field',
            'field_type': 'text'
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # 5. Payroll - Generate All Payslips (Admin only)
        res = self.client.post('/api/payroll/payslips/generate_all/', {
            'month': 10,
            'year': 2026
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # ----------------------------------------------------------------------
    # Test C & D & E: Request Body Privilege Escalation Attempts
    # ----------------------------------------------------------------------
    def test_employee_cannot_escalate_role_via_body(self):
        """Employee cannot send role=ADMIN or role=SUPER_ADMIN in POST or PATCH."""
        self.client.force_authenticate(user=self.employee)

        # Attempt to create an ADMIN user
        res = self.client.post('/api/auth/management/users/', {
            'username': 'escalated_admin',
            'password': 'Password123!',
            'role': 'ADMIN'
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Attempt to create a SUPER_ADMIN user
        res = self.client.post('/api/auth/management/users/', {
            'username': 'escalated_superadmin',
            'password': 'Password123!',
            'role': 'SUPER_ADMIN'
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Attempt to elevate self to is_staff or is_superuser
        res = self.client.patch(f'/api/auth/management/users/{self.employee.id}/', {
            'role': 'ADMIN',
            'is_staff': True,
            'is_superuser': True
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.role, 'EMPLOYEE')
        self.assertFalse(self.employee.is_superuser)
        self.assertFalse(self.employee.is_staff)

    # ----------------------------------------------------------------------
    # Test F: Object-Level Authorization (IDOR / Horizontal Privilege Escalation)
    # ----------------------------------------------------------------------
    def test_employee_cannot_access_or_modify_other_user_data(self):
        """An employee cannot access or modify another employee's records by tampering with IDs."""
        self.client.force_authenticate(user=self.employee)

        # 1. Management API - modify victim
        res = self.client.patch(f'/api/auth/management/users/{self.victim.id}/', {
            'first_name': 'HackedVictim'
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # 2. HRMS Profile API - modify victim's profile
        res = self.client.patch(f'/api/hrms/employees/{self.victim_profile.id}/', {
            'base_salary': 999999.00
        })
        self.assertIn(res.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])
        self.victim_profile.refresh_from_db()
        self.assertEqual(float(self.victim_profile.base_salary), 55000.00)

        # 3. Payroll Salary Structure - modify victim's salary structure
        victim_struct, _ = SalaryStructure.objects.get_or_create(
            employee=self.victim_profile,
            defaults={'base_salary': 55000.00}
        )
        res = self.client.patch(f'/api/payroll/salary-structures/{victim_struct.id}/', {
            'base_salary': 999999.00
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        victim_struct.refresh_from_db()
        self.assertEqual(float(victim_struct.base_salary), 55000.00)

    # ----------------------------------------------------------------------
    # Test G & H: Permission and Admin-Only CRUD APIs
    # ----------------------------------------------------------------------
    def test_employee_cannot_mutate_permissions_or_system_configs(self):
        """Employee cannot create/edit permissions, departments, designations, or holidays."""
        self.client.force_authenticate(user=self.employee)

        # Department creation attempt
        res = self.client.post('/api/hrms/departments/', {'name': 'Fake Department'})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Designation creation attempt
        res = self.client.post('/api/hrms/designations/', {'name': 'Fake Designation'})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Holiday creation attempt
        res = self.client.post('/api/leaves/holidays/', {
            'name': 'Fake Holiday',
            'date': '2026-12-25'
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Leave Type creation attempt
        res = self.client.post('/api/leaves/types/', {
            'name': 'Unlimited Leave',
            'days_allowed': 999
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # ----------------------------------------------------------------------
    # Test I & J: Legitimate Admin and Super Admin Operations
    # ----------------------------------------------------------------------
    def test_admin_and_superadmin_legitimate_operations(self):
        """Legitimate Admins and Super Admins can access and perform management actions."""
        # 1. Admin creates an Employee
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/auth/management/users/', {
            'username': 'legit_emp_va009',
            'password': 'Password123!',
            'role': 'EMPLOYEE',
            'email': 'legit_emp@natyaarts.com'
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        new_emp_id = res.data['id']

        # 2. Super Admin manages system
        self.client.force_authenticate(user=self.super_admin)
        res = self.client.get('/api/auth/management/users/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Clean up
        User.objects.filter(id=new_emp_id).delete()

    # ----------------------------------------------------------------------
    # Test K: Admin Attempts Operations Reserved for Super Admin
    # ----------------------------------------------------------------------
    def test_admin_cannot_escalate_to_superadmin(self):
        """An ADMIN cannot create a SUPER_ADMIN, promote to SUPER_ADMIN, or modify a SUPER_ADMIN."""
        self.client.force_authenticate(user=self.admin)

        # 1. Admin creates SUPER_ADMIN -> rejected
        res = self.client.post('/api/auth/management/users/', {
            'username': 'super_admin_attempt',
            'password': 'Password123!',
            'role': 'SUPER_ADMIN'
        })
        self.assertIn(res.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_400_BAD_REQUEST])

        # 2. Admin promotes victim to SUPER_ADMIN -> rejected
        res = self.client.patch(f'/api/auth/management/users/{self.victim.id}/', {
            'role': 'SUPER_ADMIN'
        })
        self.assertIn(res.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_400_BAD_REQUEST])

        # 3. Admin modifies Super Admin account -> rejected
        res = self.client.patch(f'/api/auth/management/users/{self.super_admin.id}/', {
            'first_name': 'Tampered'
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
