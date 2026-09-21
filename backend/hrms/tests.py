import datetime
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework import status

from hrms.models import Department, Designation, Attendance, ShiftSetting
from leaves.models import LeaveType, LeaveRequest

User = get_user_model()


class AttendanceComprehensiveTests(APITestCase):
    def setUp(self):
        # Create Department and Designations
        self.dept = Department.objects.create(name="Engineering")
        self.admin_desig = Designation.objects.create(
            name="HR Admin", department=self.dept, permission_role="ADMIN"
        )
        self.superadmin_desig = Designation.objects.create(
            name="CTO", department=self.dept, permission_role="SUPER_ADMIN"
        )
        self.emp_desig = Designation.objects.create(
            name="Software Engineer", department=self.dept, permission_role="EMPLOYEE"
        )

        # Create Shift Setting with full-day grace period for testing predictable PRESENT status
        self.shift = ShiftSetting.objects.create(
            name="General Shift",
            start_time="00:00:00",
            end_time="23:59:59",
            grace_period_minutes=1440,
            office_latitude=10.000000,
            office_longitude=76.000000,
            allowed_radius_meters=500,
            is_active=True
        )

        # Create Admin User & Profile
        self.admin_user = User.objects.create_user(
            username="admin_user", email="admin@example.com", password="password123", role="ADMIN"
        )
        self.admin_profile = self.admin_user.hrms_profile
        self.admin_profile.employee_id = "ADM001"
        self.admin_profile.department = self.dept
        self.admin_profile.designation = self.admin_desig
        self.admin_profile.work_location = "OFFICE"
        self.admin_profile.status = "ACTIVE"
        self.admin_profile.save()

        # Create SuperAdmin User & Profile
        self.superadmin_user = User.objects.create_user(
            username="superadmin_user", email="superadmin@example.com", password="password123", role="SUPER_ADMIN"
        )
        self.superadmin_profile = self.superadmin_user.hrms_profile
        self.superadmin_profile.employee_id = "SADM001"
        self.superadmin_profile.department = self.dept
        self.superadmin_profile.designation = self.superadmin_desig
        self.superadmin_profile.work_location = "OFFICE"
        self.superadmin_profile.status = "ACTIVE"
        self.superadmin_profile.save()

        # Create Regular Employee 1 (Office)
        self.emp_user1 = User.objects.create_user(
            username="emp1", email="emp1@example.com", password="password123", role="EMPLOYEE"
        )
        self.emp_profile1 = self.emp_user1.hrms_profile
        self.emp_profile1.employee_id = "EMP001"
        self.emp_profile1.department = self.dept
        self.emp_profile1.designation = self.emp_desig
        self.emp_profile1.work_location = "OFFICE"
        self.emp_profile1.status = "ACTIVE"
        self.emp_profile1.save()

        # Create Regular Employee 2 (Remote)
        self.emp_user2 = User.objects.create_user(
            username="emp2", email="emp2@example.com", password="password123", role="EMPLOYEE"
        )
        self.emp_profile2 = self.emp_user2.hrms_profile
        self.emp_profile2.employee_id = "EMP002"
        self.emp_profile2.department = self.dept
        self.emp_profile2.designation = self.emp_desig
        self.emp_profile2.work_location = "REMOTE"
        self.emp_profile2.status = "ACTIVE"
        self.emp_profile2.save()

        # Create Leave Type
        self.leave_type = LeaveType.objects.create(
            name="Casual Leave",
            code="CL",
            is_paid=True,
            max_days_per_year=12
        )

    def test_employee_clock_in_and_out(self):
        """Test standard employee clock in (with coordinates) and clock out."""
        self.client.force_authenticate(user=self.emp_user1)
        today_str = timezone.localdate().strftime('%Y-%m-%d')

        # Clock in within grace period with coordinates matching shift office
        res = self.client.post('/api/hrms/attendance/clock_in/', {
            'latitude': 10.000000,
            'longitude': 76.000000,
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'PRESENT')
        
        att = Attendance.objects.get(employee=self.emp_profile1, date=today_str)
        self.assertIsNotNone(att.clock_in)
        self.assertIsNone(att.clock_out)

        # Clock out
        res_out = self.client.post('/api/hrms/attendance/clock_out/', {})
        self.assertEqual(res_out.status_code, status.HTTP_200_OK)
        
        att.refresh_from_db()
        self.assertIsNotNone(att.clock_out)

    def test_duplicate_clock_in_prevented(self):
        """Test duplicate clock in returns 400."""
        self.client.force_authenticate(user=self.emp_user1)
        # First clock in
        res1 = self.client.post('/api/hrms/attendance/clock_in/', {
            'latitude': 10.0,
            'longitude': 76.0
        })
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Second clock in
        res2 = self.client.post('/api/hrms/attendance/clock_in/', {
            'latitude': 10.0,
            'longitude': 76.0
        })
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Already clocked in today", res2.data['error'])

    def test_duplicate_clock_out_prevented(self):
        """Test duplicate clock out returns 400."""
        self.client.force_authenticate(user=self.emp_user1)
        self.client.post('/api/hrms/attendance/clock_in/', {
            'latitude': 10.0,
            'longitude': 76.0
        })
        # First clock out
        res1 = self.client.post('/api/hrms/attendance/clock_out/', {})
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Second clock out
        res2 = self.client.post('/api/hrms/attendance/clock_out/', {})
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Already clocked out", res2.data['error'])

    def test_geofence_missing_coordinates_rejected_for_office(self):
        """Test that office employees without coordinates are rejected."""
        self.client.force_authenticate(user=self.emp_user1)
        res = self.client.post('/api/hrms/attendance/clock_in/', {})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Location coordinates are required", res.data['error'])

    def test_geofence_remote_allowed_without_coordinates(self):
        """Test that remote employees can clock in without coordinates."""
        self.client.force_authenticate(user=self.emp_user2)
        res = self.client.post('/api/hrms/attendance/clock_in/', {})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_employee_permission_restrictions(self):
        """Test regular employees cannot perform direct CRUD on Attendance or ShiftSetting."""
        self.client.force_authenticate(user=self.emp_user1)

        # Direct POST /api/hrms/attendance/
        res = self.client.post('/api/hrms/attendance/', {
            'employee': self.emp_profile2.id,
            'date': '2026-09-17',
            'status': 'PRESENT'
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # ShiftSetting POST
        res_shift = self.client.post('/api/hrms/shifts/', {
            'name': 'Hacked Shift',
            'start_time': '10:00:00',
            'end_time': '19:00:00'
        })
        self.assertEqual(res_shift.status_code, status.HTTP_403_FORBIDDEN)

    def test_midnight_shift_clock_out(self):
        """Test clocking out closes yesterday's unclosed attendance if employee worked overnight."""
        yesterday = timezone.localdate() - datetime.timedelta(days=1)
        att_yesterday = Attendance.objects.create(
            employee=self.emp_profile1,
            date=yesterday,
            clock_in=datetime.time(22, 0, 0),
            clock_out=None,
            status='PRESENT'
        )

        self.client.force_authenticate(user=self.emp_user1)
        res = self.client.post('/api/hrms/attendance/clock_out/', {})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        att_yesterday.refresh_from_db()
        self.assertIsNotNone(att_yesterday.clock_out)
        # Check that no spurious attendance record was created for today
        today = timezone.localdate()
        self.assertFalse(Attendance.objects.filter(employee=self.emp_profile1, date=today).exists())

    def test_present_dashboard_classification_and_over_20_employees(self):
        """
        Verify that:
        1. When an employee clocks in and is PRESENT, daily_summary immediately classifies them as Present.
        2. With >20 active employees, statistics are calculated across all active employees without pagination cutoff.
        """
        # Create 25 total active employees
        extra_employees = []
        for i in range(3, 26):
            u = User.objects.create_user(
                username=f"emp{i}", email=f"emp{i}@example.com", password="password123", role="EMPLOYEE"
            )
            ep = u.hrms_profile
            ep.employee_id = f"EMP{i:03d}"
            ep.department = self.dept
            ep.designation = self.emp_desig
            ep.work_location = "OFFICE"
            ep.status = "ACTIVE"
            ep.save()
            extra_employees.append(ep)

        # Total active employees = admin_profile (1) + superadmin_profile (1) + emp_profile1 (1) + emp_profile2 (1) + 23 extra = 27 active employees.
        today = timezone.localdate()
        today_str = today.strftime('%Y-%m-%d')

        # Have 10 employees clock in (including emp1)
        Attendance.objects.create(
            employee=self.emp_profile1,
            date=today,
            clock_in=datetime.time(9, 5, 0),
            status='PRESENT'
        )
        for ep in extra_employees[:9]:
            Attendance.objects.create(
                employee=ep,
                date=today,
                clock_in=datetime.time(9, 10, 0),
                status='PRESENT'
            )

        # Have 5 employees on approved leave (LeaveRequest)
        for ep in extra_employees[9:14]:
            LeaveRequest.objects.create(
                employee=ep,
                leave_type=self.leave_type,
                start_date=today,
                end_date=today,
                reason="Medical",
                status="APPROVED"
            )

        # Authenticate as Admin and call daily_summary
        self.client.force_authenticate(user=self.admin_user)
        res = self.client.get(f'/api/hrms/attendance/daily_summary/?date={today_str}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data

        # Total active employees = 27 (26 OFFICE, 1 REMOTE)
        self.assertEqual(data['total_active_employees'], 27)
        # Present count = 10
        self.assertEqual(data['present_count'], 10)
        # On leave count = 5
        self.assertEqual(data['on_leave_count'], 5)
        # Absent count = 26 office - 10 present - 5 leave = 11 (emp_profile2 is REMOTE and excluded from absent)
        self.assertEqual(data['absent_count'], 11)
        self.assertEqual(data['wfh_count'], 1)

        # Verify emp_profile1 is in present_list and NOT in absent_list
        present_emp_ids = [p['employee_id'] for p in data['present_list']]
        absent_emp_ids = [a['employee_id'] for a in data['absent_list']]
        leave_emp_ids = [l['employee_id'] for l in data['on_leave_list']]
        wfh_emp_ids = [w['employee_id'] for w in data['wfh_list']]

        self.assertIn("EMP001", present_emp_ids)
        self.assertNotIn("EMP001", absent_emp_ids)
        self.assertIn(extra_employees[9].employee_id, leave_emp_ids)
        self.assertNotIn(extra_employees[9].employee_id, absent_emp_ids)
        # emp2 is REMOTE -> in wfh_list, NOT in absent_list
        self.assertIn("EMP002", wfh_emp_ids)
        self.assertNotIn("EMP002", absent_emp_ids)

    def test_approved_leave_source_of_truth_reconciliation(self):
        """
        Verify that an approved LeaveRequest is the source of truth:
        Even if there is no Attendance row, or even if an Attendance row was marked ABSENT before,
        daily_summary prioritizes the approved leave and classifies as ON_LEAVE.
        """
        today = timezone.localdate()
        today_str = today.strftime('%Y-%m-%d')

        LeaveRequest.objects.create(
            employee=self.emp_profile1,
            leave_type=self.leave_type,
            start_date=today,
            end_date=today,
            reason="Personal work",
            status="APPROVED"
        )

        self.client.force_authenticate(user=self.admin_user)
        res = self.client.get(f'/api/hrms/attendance/daily_summary/?date={today_str}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        on_leave_ids = [e['employee_id'] for e in res.data['on_leave_list']]
        absent_ids = [e['employee_id'] for e in res.data['absent_list']]

        self.assertIn("EMP001", on_leave_ids)
        self.assertNotIn("EMP001", absent_ids)

    def test_permanent_wfh_attendance_and_absentee_logic(self):
        """
        Verify Permanent WFH Attendance Logic:
        1. Permanent WFH + no attendance -> NOT in absent_list, has status 'WFH', in wfh_list.
        2. Normal employee + no attendance -> shown in absent_list with status 'ABSENT'.
        3. Permanent WFH + attendance -> works normally (status 'PRESENT', in present_list, not in absent_list).
        4. Permanent WFH + approved leave -> works normally (status 'ON_LEAVE', in on_leave_list, not in absent_list).
        """
        today = timezone.localdate()
        today_str = today.strftime('%Y-%m-%d')

        # Create another WFH employee
        wfh_user2 = User.objects.create_user(
            username="wfh_emp2", email="wfh2@example.com", password="password123", role="EMPLOYEE"
        )
        wfh_profile2 = wfh_user2.hrms_profile
        wfh_profile2.employee_id = "WFH002"
        wfh_profile2.department = self.dept
        wfh_profile2.designation = self.emp_desig
        wfh_profile2.work_location = "REMOTE"
        wfh_profile2.status = "ACTIVE"
        wfh_profile2.save()

        # Create another WFH employee on leave
        wfh_user3 = User.objects.create_user(
            username="wfh_emp3", email="wfh3@example.com", password="password123", role="EMPLOYEE"
        )
        wfh_profile3 = wfh_user3.hrms_profile
        wfh_profile3.employee_id = "WFH003"
        wfh_profile3.department = self.dept
        wfh_profile3.designation = self.emp_desig
        wfh_profile3.work_location = "REMOTE"
        wfh_profile3.status = "ACTIVE"
        wfh_profile3.save()

        # Case 3: wfh_profile2 clocks in (PRESENT)
        Attendance.objects.create(
            employee=wfh_profile2,
            date=today,
            clock_in=datetime.time(9, 30, 0),
            clock_out=datetime.time(18, 30, 0),
            status='PRESENT'
        )

        # Case 4: wfh_profile3 has approved leave (ON_LEAVE)
        LeaveRequest.objects.create(
            employee=wfh_profile3,
            leave_type=self.leave_type,
            start_date=today,
            end_date=today,
            reason="Medical emergency",
            status="APPROVED"
        )

        # Case 1: self.emp_profile2 is REMOTE with NO attendance and NO leave.
        # Case 2: self.emp_profile1 is OFFICE with NO attendance and NO leave.

        self.client.force_authenticate(user=self.admin_user)
        res = self.client.get(f'/api/hrms/attendance/daily_summary/?date={today_str}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data

        absent_emp_ids = [a['employee_id'] for a in data['absent_list']]
        present_emp_ids = [p['employee_id'] for p in data['present_list']]
        leave_emp_ids = [l['employee_id'] for l in data['on_leave_list']]
        wfh_emp_ids = [w['employee_id'] for w in data['wfh_list']]

        # 1. Permanent WFH with no attendance (emp_profile2) is NOT in absent_list
        self.assertNotIn("EMP002", absent_emp_ids)
        self.assertIn("EMP002", wfh_emp_ids)
        wfh_emp2_data = next(w for w in data['wfh_list'] if w['employee_id'] == "EMP002")
        self.assertEqual(wfh_emp2_data['status'], "WFH")

        # 2. Normal employee with no attendance (emp_profile1) is in absent_list
        self.assertIn("EMP001", absent_emp_ids)

        # 3. Permanent WFH with attendance (wfh_profile2) is PRESENT and NOT in absent_list
        self.assertIn("WFH002", present_emp_ids)
        self.assertNotIn("WFH002", absent_emp_ids)

        # 4. Permanent WFH with approved leave (wfh_profile3) is ON_LEAVE and NOT in absent_list
        self.assertIn("WFH003", leave_emp_ids)
        self.assertNotIn("WFH003", absent_emp_ids)

    def test_date_range_report_complete_matrix(self):
        """
        Verify that date_range_report produces a complete Employee x Date matrix
        without omitting absent days and without pagination cutoff.
        """
        start_date = timezone.localdate()
        end_date = start_date + datetime.timedelta(days=2) # 3 calendar days

        # Employee 1 (OFFICE) is PRESENT on day 1
        Attendance.objects.create(
            employee=self.emp_profile1,
            date=start_date,
            clock_in=datetime.time(9, 0, 0),
            clock_out=datetime.time(18, 0, 0),
            status='PRESENT'
        )

        # Employee 2 (REMOTE) is ON_LEAVE on day 2
        LeaveRequest.objects.create(
            employee=self.emp_profile2,
            leave_type=self.leave_type,
            start_date=start_date + datetime.timedelta(days=1),
            end_date=start_date + datetime.timedelta(days=1),
            reason="Vacation",
            status="APPROVED"
        )

        self.client.force_authenticate(user=self.admin_user)
        res = self.client.get(f'/api/hrms/attendance/date_range_report/?start_date={start_date}&end_date={end_date}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        report = res.data['results']

        # Total active employees in setUp = 4 (admin, superadmin, emp1, emp2)
        # Total dates = 3
        # Expected rows = 4 * 3 = 12
        self.assertEqual(len(report), 12)

        # Check statuses
        emp1_day1 = next(r for r in report if r['employee_id_display'] == 'EMP001' and r['date'] == start_date.strftime('%Y-%m-%d'))
        self.assertEqual(emp1_day1['status'], 'PRESENT')

        emp1_day2 = next(r for r in report if r['employee_id_display'] == 'EMP001' and r['date'] == (start_date + datetime.timedelta(days=1)).strftime('%Y-%m-%d'))
        self.assertEqual(emp1_day2['status'], 'ABSENT')

        emp2_day2 = next(r for r in report if r['employee_id_display'] == 'EMP002' and r['date'] == (start_date + datetime.timedelta(days=1)).strftime('%Y-%m-%d'))
        self.assertEqual(emp2_day2['status'], 'ON_LEAVE')

        emp2_day1 = next(r for r in report if r['employee_id_display'] == 'EMP002' and r['date'] == start_date.strftime('%Y-%m-%d'))
        self.assertEqual(emp2_day1['status'], 'WFH')

    def test_missed_clock_out(self):
        """
        Verify missed clock-out:
        clock_in IS NOT NULL and clock_out IS NULL.
        """
        today = timezone.localdate()
        Attendance.objects.create(
            employee=self.emp_profile1,
            date=today,
            clock_in=datetime.time(9, 0, 0),
            clock_out=None,
            status='PRESENT'
        )

        self.client.force_authenticate(user=self.admin_user)

        # 1. Filter via attendance queryset
        res_filter = self.client.get('/api/hrms/attendance/?missed_clock_out=true')
        self.assertEqual(res_filter.status_code, status.HTTP_200_OK)
        results = res_filter.data.get('results', res_filter.data)
        self.assertTrue(any(r['employee'] == self.emp_profile1.id for r in results))

        # 2. Daily summary missed clock out
        res_summary = self.client.get(f'/api/hrms/attendance/daily_summary/?date={today.strftime("%Y-%m-%d")}')
        self.assertEqual(res_summary.status_code, status.HTTP_200_OK)
        self.assertEqual(res_summary.data['missed_clock_out_count'], 1)
        self.assertEqual(res_summary.data['missed_clock_out_list'][0]['employee_id'], 'EMP001')

    def test_manual_entry_and_override_status(self):
        """Verify Admin manual entry and override status capabilities."""
        self.client.force_authenticate(user=self.admin_user)
        target_date = (timezone.localdate() - datetime.timedelta(days=3)).strftime('%Y-%m-%d')

        # Manual Entry
        res = self.client.post('/api/hrms/attendance/manual_entry/', {
            'employee_id': self.emp_profile1.id,
            'date': target_date,
            'clock_in': '09:00:00',
            'clock_out': '17:30:00',
            'status': 'PRESENT',
            'notes': 'Approved by manager'
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        att_id = res.data['id']

        # Override Status
        res_override = self.client.post(f'/api/hrms/attendance/{att_id}/override_status/', {
            'status': 'HALF_DAY',
            'notes': 'Left early for personal reasons'
        })
        self.assertEqual(res_override.status_code, status.HTTP_200_OK)
        
        att = Attendance.objects.get(id=att_id)
        self.assertEqual(att.status, 'HALF_DAY')
        self.assertIn('Left early', att.notes)

    def test_employee_search_returns_all_records_in_date_range_sorted_descending(self):
        """
        Verify that:
        1. Searching for an employee (e.g. 'Sanidhya') across a date range (e.g. 19 days)
           returns ALL attendance records for that employee together in a single result list.
        2. Records are sorted newest date first (descending).
        3. General unfiltered list still preserves standard pagination.
        """
        self.client.force_authenticate(user=self.admin_user)

        # Create a specific employee named Sanidhya
        sanidhya_user = User.objects.create_user(
            username="sanidhya", first_name="Sanidhya", last_name="Sharma",
            email="sanidhya@example.com", password="password123", role="EMPLOYEE"
        )
        sanidhya_profile = sanidhya_user.hrms_profile
        sanidhya_profile.employee_id = "EMP-SAN-001"
        sanidhya_profile.department = self.dept
        sanidhya_profile.designation = self.emp_desig
        sanidhya_profile.status = "ACTIVE"
        sanidhya_profile.save()

        # Create another employee Rahul
        rahul_user = User.objects.create_user(
            username="rahul", first_name="Rahul", last_name="Verma",
            email="rahul@example.com", password="password123", role="EMPLOYEE"
        )
        rahul_profile = rahul_user.hrms_profile
        rahul_profile.employee_id = "EMP-RAH-002"
        rahul_profile.department = self.dept
        rahul_profile.designation = self.emp_desig
        rahul_profile.status = "ACTIVE"
        rahul_profile.save()

        start_date = datetime.date(2026, 9, 1)
        end_date = datetime.date(2026, 9, 19)

        # Create attendance records for Sanidhya and Rahul from 2026-09-01 to 2026-09-19 (19 days)
        cur = start_date
        while cur <= end_date:
            Attendance.objects.create(
                employee=sanidhya_profile,
                date=cur,
                clock_in=datetime.time(9, 30, 0),
                clock_out=datetime.time(18, 30, 0),
                status='PRESENT'
            )
            Attendance.objects.create(
                employee=rahul_profile,
                date=cur,
                clock_in=datetime.time(9, 15, 0),
                clock_out=datetime.time(18, 15, 0),
                status='PRESENT'
            )
            cur += datetime.timedelta(days=1)

        # 1. Search for Sanidhya within date range
        res = self.client.get(f'/api/hrms/attendance/?start_date=2026-09-01&end_date=2026-09-19&search=Sanidhya')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        results = res.data.get('results', res.data)
        # Should return ALL 19 records for Sanidhya in the single page
        self.assertEqual(len(results), 19)
        self.assertEqual(res.data.get('count'), 19)
        self.assertIsNone(res.data.get('next'))
        self.assertIsNone(res.data.get('previous'))

        # Verify all records belong to Sanidhya
        for r in results:
            self.assertEqual(r['employee_name'], 'Sanidhya Sharma')
            self.assertEqual(r['employee_id_display'], 'EMP-SAN-001')

        # Verify records are sorted newest date first (descending)
        dates = [r['date'] for r in results]
        expected_dates = [(start_date + datetime.timedelta(days=i)).strftime('%Y-%m-%d') for i in range(19)]
        expected_dates.reverse() # Newest first: 2026-09-19, 2026-09-18, ..., 2026-09-01
        self.assertEqual(dates, expected_dates)

        # 2. General unfiltered list should have standard pagination (page_size = 20)
        res_unfiltered = self.client.get(f'/api/hrms/attendance/?start_date=2026-09-01&end_date=2026-09-19')
        self.assertEqual(res_unfiltered.status_code, status.HTTP_200_OK)
        # Total records = 19 (Sanidhya) + 19 (Rahul) = 38
        self.assertEqual(res_unfiltered.data.get('count'), 38)
        self.assertEqual(len(res_unfiltered.data.get('results')), 20)
        self.assertIsNotNone(res_unfiltered.data.get('next'))
