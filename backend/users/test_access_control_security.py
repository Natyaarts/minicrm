import json
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from users.models import RolePermission
from hrms.models import EmployeeProfile, Department, Designation

from django.utils import timezone

User = get_user_model()

class AccessControlSecurityTests(TestCase):
    """
    Comprehensive Security Test Suite for VAPT Finding VA-001:
    Broken Access Control - Unauthorized Access to Privileged Functionality.
    """

    def setUp(self):
        self.client = APIClient()

        # 1. Super Admin User
        self.super_admin = User.objects.create_user(
            username='superadmin_sec',
            email='superadmin@natyaarts.com',
            password='Password123!',
            role='SUPER_ADMIN',
            is_superuser=True,
            is_staff=True
        )

        # 2. Admin User
        self.admin = User.objects.create_user(
            username='admin_sec',
            email='admin@natyaarts.com',
            password='Password123!',
            role='ADMIN',
            is_staff=True
        )

        # 3. Regular Employee User
        self.employee = User.objects.create_user(
            username='employee_sec',
            email='employee@natyaarts.com',
            password='Password123!',
            role='EMPLOYEE'
        )
        self.employee_profile = getattr(self.employee, 'hrms_profile', None)
        if not self.employee_profile:
            self.employee_profile = EmployeeProfile.objects.filter(user=self.employee).first()
        self.employee_profile.base_salary = 50000.00
        self.employee_profile.save()

        # 4. Target Victim User (another employee)
        self.victim = User.objects.create_user(
            username='victim_sec',
            email='victim@natyaarts.com',
            password='Password123!',
            role='EMPLOYEE'
        )
        self.victim_profile = getattr(self.victim, 'hrms_profile', None)
        if not self.victim_profile:
            self.victim_profile = EmployeeProfile.objects.filter(user=self.victim).first()
        self.victim_profile.base_salary = 60000.00
        self.victim_profile.save()

        # 5. Sales User
        self.sales_user = User.objects.create_user(
            username='sales_sec',
            email='sales@natyaarts.com',
            password='Password123!',
            role='SALES'
        )

    # ----------------------------------------------------------------------
    # Requirement H: Unauthenticated user attempts privileged API -> HTTP 401
    # ----------------------------------------------------------------------
    def test_unauthenticated_user_access_user_management_rejected(self):
        """Unauthenticated requests to privileged user management endpoints must return HTTP 401."""
        response = self.client.get('/api/auth/management/users/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        response = self.client.post('/api/auth/management/users/', {
            'username': 'hacker',
            'password': 'Password123!',
            'role': 'ADMIN'
        })
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        response = self.client.patch(f'/api/auth/management/users/{self.victim.id}/', {
            'first_name': 'Hacked'
        })
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        response = self.client.delete(f'/api/auth/management/users/{self.victim.id}/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # ----------------------------------------------------------------------
    # Requirement A: Employee requests Admin user list -> HTTP 403
    # ----------------------------------------------------------------------
    def test_employee_requests_admin_user_list_rejected(self):
        """A regular Employee attempting to list users via management API must receive HTTP 403."""
        self.client.force_authenticate(user=self.employee)
        response = self.client.get('/api/auth/management/users/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Sales and other non-admin roles must also be rejected
        self.client.force_authenticate(user=self.sales_user)
        response = self.client.get('/api/auth/management/users/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ----------------------------------------------------------------------
    # Requirement B: Employee attempts to create user -> HTTP 403
    # ----------------------------------------------------------------------
    def test_employee_create_user_rejected(self):
        """A regular Employee attempting to create any user (Admin or otherwise) must receive HTTP 403."""
        self.client.force_authenticate(user=self.employee)
        response = self.client.post('/api/auth/management/users/', {
            'username': 'new_admin_attempt',
            'email': 'newadmin@test.com',
            'password': 'Password123!',
            'role': 'ADMIN'
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(User.objects.filter(username='new_admin_attempt').exists())

    # ----------------------------------------------------------------------
    # Requirement C: Employee attempts to change another user's role -> HTTP 403
    # ----------------------------------------------------------------------
    def test_employee_promote_other_user_to_admin_rejected(self):
        """A regular Employee attempting to elevate another user to ADMIN must receive HTTP 403."""
        self.client.force_authenticate(user=self.employee)
        response = self.client.patch(f'/api/auth/management/users/{self.victim.id}/', {
            'role': 'ADMIN'
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.victim.refresh_from_db()
        self.assertEqual(self.victim.role, 'EMPLOYEE')

    # ----------------------------------------------------------------------
    # Requirement D: Employee attempts to modify another user -> HTTP 403
    # ----------------------------------------------------------------------
    def test_employee_modify_another_user_record_rejected(self):
        """A regular Employee attempting to modify another user's record via management API must receive HTTP 403."""
        self.client.force_authenticate(user=self.employee)
        response = self.client.patch(f'/api/auth/management/users/{self.victim.id}/', {
            'first_name': 'TamperedName',
            'email': 'tampered@victim.com'
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.victim.refresh_from_db()
        self.assertNotEqual(self.victim.first_name, 'TamperedName')

    # ----------------------------------------------------------------------
    # Requirement E: Employee attempts to delete/deactivate another user -> HTTP 403
    # ----------------------------------------------------------------------
    def test_employee_delete_user_rejected(self):
        """A regular Employee attempting to delete another user must receive HTTP 403."""
        self.client.force_authenticate(user=self.employee)
        response = self.client.delete(f'/api/auth/management/users/{self.victim.id}/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(User.objects.filter(id=self.victim.id).exists())

    # ----------------------------------------------------------------------
    # Requirement F: Admin performs legitimate operations -> succeeds
    # ----------------------------------------------------------------------
    def test_admin_legitimate_operations_succeed(self):
        """An authorized Admin can list, create, update, and delete non-superadmin users."""
        self.client.force_authenticate(user=self.admin)

        # 1. Admin lists users
        response = self.client.get('/api/auth/management/users/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # 2. Admin creates a user
        create_res = self.client.post('/api/auth/management/users/', {
            'username': 'legit_sales_user',
            'email': 'sales_legit@test.com',
            'password': 'Password123!',
            'role': 'SALES',
            'first_name': 'Legit',
            'last_name': 'Sales'
        })
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        new_user_id = create_res.data['id']

        # 3. Admin updates the user
        update_res = self.client.patch(f'/api/auth/management/users/{new_user_id}/', {
            'first_name': 'UpdatedLegit'
        })
        self.assertEqual(update_res.status_code, status.HTTP_200_OK)

        # 4. Admin deletes the user
        delete_res = self.client.delete(f'/api/auth/management/users/{new_user_id}/')
        self.assertEqual(delete_res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(id=new_user_id).exists())

    # ----------------------------------------------------------------------
    # Requirement G: Super Admin performs legitimate operations -> succeeds
    # ----------------------------------------------------------------------
    def test_super_admin_operations_succeed(self):
        """A Super Admin has full permissions across user management."""
        self.client.force_authenticate(user=self.super_admin)

        response = self.client.get('/api/auth/management/users/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        create_res = self.client.post('/api/auth/management/users/', {
            'username': 'new_admin_by_super',
            'email': 'adminbysuper@test.com',
            'password': 'Password123!',
            'role': 'ADMIN'
        })
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)

    # ----------------------------------------------------------------------
    # Requirement I: Privilege Escalation Prevention
    # ----------------------------------------------------------------------
    def test_employee_cannot_escalate_own_role_via_body(self):
        """Employee cannot escalate own role to ADMIN or SUPER_ADMIN."""
        self.client.force_authenticate(user=self.employee)

        # Attempt to call management endpoint with own ID
        response = self.client.patch(f'/api/auth/management/users/{self.employee.id}/', {
            'role': 'ADMIN',
            'is_superuser': True,
            'is_staff': True
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.role, 'EMPLOYEE')
        self.assertFalse(self.employee.is_superuser)
        self.assertFalse(self.employee.is_staff)

    def test_admin_cannot_create_super_admin(self):
        """An ADMIN role user cannot create a SUPER_ADMIN or superuser account."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.post('/api/auth/management/users/', {
            'username': 'rogue_super_admin',
            'email': 'rogue@test.com',
            'password': 'Password123!',
            'role': 'SUPER_ADMIN'
        })
        self.assertIn(response.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_400_BAD_REQUEST])
        self.assertFalse(User.objects.filter(username='rogue_super_admin').exists())

    def test_admin_cannot_promote_user_to_super_admin(self):
        """An ADMIN role user cannot elevate another user to SUPER_ADMIN."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(f'/api/auth/management/users/{self.victim.id}/', {
            'role': 'SUPER_ADMIN'
        })
        self.assertIn(response.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_400_BAD_REQUEST])
        self.victim.refresh_from_db()
        self.assertNotEqual(self.victim.role, 'SUPER_ADMIN')

    def test_admin_cannot_modify_super_admin_account(self):
        """An ADMIN role user cannot modify a SUPER_ADMIN account."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(f'/api/auth/management/users/{self.super_admin.id}/', {
            'first_name': 'HackedSuperAdmin'
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.super_admin.refresh_from_db()
        self.assertNotEqual(self.super_admin.first_name, 'HackedSuperAdmin')

    # ----------------------------------------------------------------------
    # Role Permissions Endpoint Protection
    # ----------------------------------------------------------------------
    def test_role_permission_management_protected(self):
        """RolePermission endpoints must be restricted to Admin and Super Admin."""
        # Unauthenticated -> 401
        self.client.logout()
        res = self.client.get('/api/auth/management/permissions/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

        # Employee -> 403
        self.client.force_authenticate(user=self.employee)
        res = self.client.get('/api/auth/management/permissions/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        res = self.client.post('/api/auth/management/permissions/', {
            'role': 'EMPLOYEE',
            'module': 'ADMIN',
            'can_view': True,
            'can_add': True,
            'can_edit': True,
            'can_delete': True
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Admin -> 200/201
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/auth/management/permissions/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    # ----------------------------------------------------------------------
    # HRMS Employee Profiles Access Control
    # ----------------------------------------------------------------------
    def test_employee_cannot_create_or_delete_employee_profiles(self):
        """Non-admin employees cannot create or delete employee profiles."""
        self.client.force_authenticate(user=self.employee)

        # Create attempt
        res = self.client.post('/api/hrms/employees/', {
            'username': 'newemp',
            'email': 'newemp@test.com',
            'password': 'Password123!',
            'first_name': 'New',
            'last_name': 'Emp'
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Delete attempt
        res = self.client.delete(f'/api/hrms/employees/{self.victim_profile.id}/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(EmployeeProfile.objects.filter(id=self.victim_profile.id).exists())

    def test_employee_cannot_access_or_modify_other_employee_profile(self):
        """Employee cannot view or modify another employee's profile by ID manipulation."""
        self.client.force_authenticate(user=self.employee)

        # Attempt to GET victim's profile
        res = self.client.get(f'/api/hrms/employees/{self.victim_profile.id}/')
        self.assertIn(res.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])

        # Attempt to PATCH victim's profile
        res = self.client.patch(f'/api/hrms/employees/{self.victim_profile.id}/', {
            'base_salary': 100000.00
        })
        self.assertIn(res.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])
        self.victim_profile.refresh_from_db()
        self.assertEqual(float(self.victim_profile.base_salary), 60000.00)

    def test_employee_cannot_modify_own_salary(self):
        """Employee updating their own profile cannot change privileged fields like base_salary."""
        self.client.force_authenticate(user=self.employee)
        res = self.client.patch(f'/api/hrms/employees/{self.employee_profile.id}/', {
            'base_salary': 999999.00,
            'first_name': 'UpdatedSelf'
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.employee_profile.refresh_from_db()
        self.assertEqual(float(self.employee_profile.base_salary), 50000.00) # Unchanged

    # ----------------------------------------------------------------------
    # HRMS Department and Designation Read-Only for Employees
    # ----------------------------------------------------------------------
    def test_employee_cannot_modify_departments_or_designations(self):
        """Non-admin employees can read departments/designations but cannot create, update, or delete."""
        dept = Department.objects.create(name='Engineering', description='Tech')
        
        self.client.force_authenticate(user=self.employee)

        # GET is allowed
        res = self.client.get(f'/api/hrms/departments/{dept.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # POST is rejected
        res = self.client.post('/api/hrms/departments/', {'name': 'Hacked Dept'})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # DELETE is rejected
        res = self.client.delete(f'/api/hrms/departments/{dept.id}/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
