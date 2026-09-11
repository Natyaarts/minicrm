from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework import status
from datetime import date, timedelta
from users.models import User
from hrms.models import EmployeeProfile, Department, Designation
from leaves.models import LeaveType, LeaveBalance, LeaveRequest
from notifications.models import Notification

class LeaveManagementFlowTests(APITestCase):
    def setUp(self):
        # Create departments and designations
        self.dept = Department.objects.create(name="Engineering")
        self.emp_desig = Designation.objects.create(name="Software Engineer", department=self.dept, permission_role="EMPLOYEE")
        self.mgr_desig = Designation.objects.create(name="Engineering Lead", department=self.dept, permission_role="EMPLOYEE")
        self.admin_desig = Designation.objects.create(name="HR Manager", department=self.dept, permission_role="ADMIN")

        # 1. Super Admin user
        self.super_admin_user = User.objects.create_user(
            username="superadmin", email="superadmin@example.com", password="password123",
            role="SUPER_ADMIN", first_name="Super", last_name="Admin"
        )
        self.super_admin_profile = self.super_admin_user.hrms_profile
        self.super_admin_profile.employee_id = "EMP-001"
        self.super_admin_profile.department = self.dept
        self.super_admin_profile.designation = self.admin_desig
        self.super_admin_profile.save()

        # 2. Admin (HR) user
        self.admin_user = User.objects.create_user(
            username="hradmin", email="hradmin@example.com", password="password123",
            role="ADMIN", first_name="HR", last_name="Admin"
        )
        self.admin_profile = self.admin_user.hrms_profile
        self.admin_profile.employee_id = "EMP-002"
        self.admin_profile.department = self.dept
        self.admin_profile.designation = self.admin_desig
        self.admin_profile.save()

        # 3. Superuser (Django is_superuser)
        self.superuser_user = User.objects.create_superuser(
            username="rootuser", email="root@example.com", password="password123",
            role="EMPLOYEE", first_name="Root", last_name="User"
        )
        self.superuser_profile = self.superuser_user.hrms_profile
        self.superuser_profile.employee_id = "EMP-003"
        self.superuser_profile.department = self.dept
        self.superuser_profile.designation = self.admin_desig
        self.superuser_profile.save()

        # 4. Manager user
        self.manager_user = User.objects.create_user(
            username="manager1", email="manager1@example.com", password="password123",
            role="EMPLOYEE", first_name="Team", last_name="Lead"
        )
        self.manager_profile = self.manager_user.hrms_profile
        self.manager_profile.employee_id = "EMP-004"
        self.manager_profile.department = self.dept
        self.manager_profile.designation = self.mgr_desig
        self.manager_profile.save()

        # 5. Employee 1 (reports to manager1)
        self.emp1_user = User.objects.create_user(
            username="emp1", email="emp1@example.com", password="password123",
            role="EMPLOYEE", first_name="Alice", last_name="Smith"
        )
        self.emp1_profile = self.emp1_user.hrms_profile
        self.emp1_profile.employee_id = "EMP-005"
        self.emp1_profile.department = self.dept
        self.emp1_profile.designation = self.emp_desig
        self.emp1_profile.reporting_to = self.manager_profile
        self.emp1_profile.save()

        # 6. Employee 2 (reports to no manager directly)
        self.emp2_user = User.objects.create_user(
            username="emp2", email="emp2@example.com", password="password123",
            role="EMPLOYEE", first_name="Bob", last_name="Jones"
        )
        self.emp2_profile = self.emp2_user.hrms_profile
        self.emp2_profile.employee_id = "EMP-006"
        self.emp2_profile.department = self.dept
        self.emp2_profile.designation = self.emp_desig
        self.emp2_profile.reporting_to = None
        self.emp2_profile.save()

        # Create leave types
        self.casual_leave = LeaveType.objects.create(name="Casual Leave", code="CL", max_days_per_year=12, is_paid=True)
        self.sick_leave = LeaveType.objects.create(name="Sick Leave", code="SL", max_days_per_year=10, is_paid=True)
        self.unpaid_leave = LeaveType.objects.create(name="Loss of Pay", code="LOP", max_days_per_year=0, is_paid=False)

        # Initialize balances
        self.emp1_cl_balance = LeaveBalance.objects.create(
            employee=self.emp1_profile, leave_type=self.casual_leave, total_days=12, used_days=0
        )
        self.emp2_cl_balance = LeaveBalance.objects.create(
            employee=self.emp2_profile, leave_type=self.casual_leave, total_days=12, used_days=0
        )

    def test_employee_creates_leave_with_manager(self):
        """Employee with manager should have initial status PENDING_MANAGER and notify admins & manager."""
        self.client.force_authenticate(user=self.emp1_user)
        start = date.today() + timedelta(days=5)
        end = date.today() + timedelta(days=6)
        payload = {
            "leave_type": self.casual_leave.id,
            "start_date": str(start),
            "end_date": str(end),
            "reason": "Family function"
        }
        response = self.client.post("/api/leaves/requests/", payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], "PENDING_MANAGER")
        self.assertEqual(response.data["employee"], self.emp1_profile.id)
        self.assertEqual(response.data["employee_name"], "Alice Smith")
        self.assertEqual(response.data["employee_code"], "EMP-005")

        # Verify DB record
        leave_req = LeaveRequest.objects.get(id=response.data["id"])
        self.assertEqual(leave_req.status, "PENDING_MANAGER")

        # Verify notifications created for Admin and Manager
        admin_notifs = Notification.objects.filter(user=self.admin_user, notification_type='LEAVE')
        self.assertTrue(admin_notifs.exists())
        mgr_notifs = Notification.objects.filter(user=self.manager_user, notification_type='LEAVE')
        self.assertTrue(mgr_notifs.exists())

    def test_employee_creates_leave_without_manager(self):
        """Employee without manager should have initial status PENDING_HR."""
        self.client.force_authenticate(user=self.emp2_user)
        start = date.today() + timedelta(days=5)
        end = date.today() + timedelta(days=6)
        payload = {
            "leave_type": self.casual_leave.id,
            "start_date": str(start),
            "end_date": str(end),
            "reason": "Personal work"
        }
        response = self.client.post("/api/leaves/requests/", payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], "PENDING_HR")
        self.assertEqual(response.data["employee_code"], "EMP-006")

    def test_employee_cannot_see_other_employees_requests(self):
        """Regular employee must only see their own leave requests."""
        start = date.today() + timedelta(days=2)
        end = date.today() + timedelta(days=3)
        req1 = LeaveRequest.objects.create(
            employee=self.emp1_profile, leave_type=self.casual_leave,
            start_date=start, end_date=end, reason="Vacation", status="PENDING_MANAGER"
        )
        req2 = LeaveRequest.objects.create(
            employee=self.emp2_profile, leave_type=self.casual_leave,
            start_date=start, end_date=end, reason="Doctor", status="PENDING_HR"
        )

        self.client.force_authenticate(user=self.emp1_user)
        response = self.client.get("/api/leaves/requests/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data)
        req_ids = [r['id'] for r in results]
        self.assertIn(req1.id, req_ids)
        self.assertNotIn(req2.id, req_ids)

    def test_manager_sees_team_requests(self):
        """Manager should see subordinate's requests as well as their own."""
        start = date.today() + timedelta(days=2)
        end = date.today() + timedelta(days=3)
        req1 = LeaveRequest.objects.create(
            employee=self.emp1_profile, leave_type=self.casual_leave,
            start_date=start, end_date=end, reason="Vacation", status="PENDING_MANAGER"
        )
        req2 = LeaveRequest.objects.create(
            employee=self.emp2_profile, leave_type=self.casual_leave,
            start_date=start, end_date=end, reason="Doctor", status="PENDING_HR"
        )

        self.client.force_authenticate(user=self.manager_user)
        response = self.client.get("/api/leaves/requests/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data)
        req_ids = [r['id'] for r in results]
        self.assertIn(req1.id, req_ids)
        self.assertNotIn(req2.id, req_ids)

    def test_manager_approval_transitions_to_pending_hr(self):
        """Manager approval of PENDING_MANAGER should update status to PENDING_HR and set manager_approved_by."""
        start = date.today() + timedelta(days=2)
        end = date.today() + timedelta(days=3)
        req = LeaveRequest.objects.create(
            employee=self.emp1_profile, leave_type=self.casual_leave,
            start_date=start, end_date=end, reason="Vacation", status="PENDING_MANAGER"
        )

        self.client.force_authenticate(user=self.manager_user)
        response = self.client.post(f"/api/leaves/requests/{req.id}/approve/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        req.refresh_from_db()
        self.assertEqual(req.status, "PENDING_HR")
        self.assertEqual(req.manager_approved_by, self.manager_profile)

    def test_admin_and_super_admin_and_superuser_see_all_requests(self):
        """ADMIN, SUPER_ADMIN, and is_superuser should see all leave requests in queryset."""
        start = date.today() + timedelta(days=2)
        end = date.today() + timedelta(days=3)
        req1 = LeaveRequest.objects.create(
            employee=self.emp1_profile, leave_type=self.casual_leave,
            start_date=start, end_date=end, reason="Vacation 1", status="PENDING_MANAGER"
        )
        req2 = LeaveRequest.objects.create(
            employee=self.emp2_profile, leave_type=self.casual_leave,
            start_date=start, end_date=end, reason="Vacation 2", status="PENDING_HR"
        )

        for user in [self.admin_user, self.super_admin_user, self.superuser_user]:
            self.client.force_authenticate(user=user)
            response = self.client.get("/api/leaves/requests/")
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            results = response.data.get('results', response.data)
            req_ids = [r['id'] for r in results]
            self.assertIn(req1.id, req_ids, f"User {user.username} should see req1")
            self.assertIn(req2.id, req_ids, f"User {user.username} should see req2")

    def test_admin_can_approve_pending_hr(self):
        """ADMIN should be able to give final HR approval for PENDING_HR and deduct leave balance."""
        # Choose Mon-Tue (non-Sundays)
        start = date.today() + timedelta(days=(7 - date.today().weekday())) # Next Monday
        end = start + timedelta(days=1) # Next Tuesday
        req = LeaveRequest.objects.create(
            employee=self.emp1_profile, leave_type=self.casual_leave,
            start_date=start, end_date=end, reason="Trip", status="PENDING_HR"
        )

        initial_used = self.emp1_cl_balance.used_days
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(f"/api/leaves/requests/{req.id}/approve/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        req.refresh_from_db()
        self.assertEqual(req.status, "APPROVED")
        self.assertEqual(req.approved_by, self.admin_profile)

        self.emp1_cl_balance.refresh_from_db()
        self.assertEqual(self.emp1_cl_balance.used_days, initial_used + req.duration)

        # Check employee notification
        emp_notifs = Notification.objects.filter(user=self.emp1_user, notification_type='LEAVE')
        self.assertTrue(emp_notifs.exists())

    def test_super_admin_can_approve_pending_hr(self):
        """SUPER_ADMIN should be able to approve PENDING_HR."""
        start = date.today() + timedelta(days=10)
        end = date.today() + timedelta(days=11)
        req = LeaveRequest.objects.create(
            employee=self.emp2_profile, leave_type=self.casual_leave,
            start_date=start, end_date=end, reason="Rest", status="PENDING_HR"
        )

        self.client.force_authenticate(user=self.super_admin_user)
        response = self.client.post(f"/api/leaves/requests/{req.id}/approve/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        req.refresh_from_db()
        self.assertEqual(req.status, "APPROVED")
        self.assertEqual(req.approved_by, self.super_admin_profile)

    def test_superuser_can_approve_pending_hr(self):
        """is_superuser should be able to approve PENDING_HR."""
        start = date.today() + timedelta(days=10)
        end = date.today() + timedelta(days=11)
        req = LeaveRequest.objects.create(
            employee=self.emp2_profile, leave_type=self.casual_leave,
            start_date=start, end_date=end, reason="Rest", status="PENDING_HR"
        )

        self.client.force_authenticate(user=self.superuser_user)
        response = self.client.post(f"/api/leaves/requests/{req.id}/approve/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        req.refresh_from_db()
        self.assertEqual(req.status, "APPROVED")
        self.assertEqual(req.approved_by, self.superuser_profile)

    def test_hr_rejection(self):
        """HR/Admin should be able to reject pending requests with reason."""
        start = date.today() + timedelta(days=10)
        end = date.today() + timedelta(days=11)
        req = LeaveRequest.objects.create(
            employee=self.emp2_profile, leave_type=self.casual_leave,
            start_date=start, end_date=end, reason="Conference", status="PENDING_HR"
        )

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(f"/api/leaves/requests/{req.id}/reject/", {"rejection_reason": "High workload"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        req.refresh_from_db()
        self.assertEqual(req.status, "REJECTED")
        self.assertEqual(req.rejection_reason, "High workload")
        self.assertEqual(req.approved_by, self.admin_profile)

        # Balance should not be deducted
        self.emp2_cl_balance.refresh_from_db()
        self.assertEqual(self.emp2_cl_balance.used_days, 0)
