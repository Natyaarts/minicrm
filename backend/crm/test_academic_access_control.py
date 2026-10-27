import datetime
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from core.models import Program, SubProgram, Course, Batch, Student
from crm.models import PipelineStage
from crm.utils import (
    get_canonical_new_lead_stage,
    get_canonical_converted_stage,
    get_converted_stage_values,
)

User = get_user_model()


class AcademicAccessControlRegressionTests(TestCase):
    """
    Regression Test Suite for Academic Access Control:
    1. Legitimate ACADEMIC users can fetch students via ?group=ACADEMIC without HTTP 403.
    2. ACADEMIC users only see converted/enrolled students; unconverted sales leads are filtered out.
    3. SALES users cannot bypass object-level assignment restrictions by appending ?group=ACADEMIC.
    4. Unprivileged generic EMPLOYEE role without permissions receives HTTP 403 Forbidden.
    5. ACADEMIC_COORDINATOR role can also access converted academic students.
    6. TEACHER role only sees students enrolled in their assigned batches.
    """

    def setUp(self):
        self.client = APIClient()

        # Dynamic pipeline stages
        self.stage_new = get_canonical_new_lead_stage()
        self.stage_converted = get_canonical_converted_stage()

        # Permissions for SALES
        from users.models import RolePermission
        RolePermission.objects.create(role='SALES', module='SALES', can_view=True)

        # Academic structure
        self.program = Program.objects.create(name='Dance & Music Academy')
        self.sub_program = SubProgram.objects.create(program=self.program, name='Classical Dance')
        self.course = Course.objects.create(sub_program=self.sub_program, name='Bharatanatyam Diploma')
        self.today = datetime.date.today()

        # Users
        self.academic_user = User.objects.create_user(
            username='academic_officer',
            password='Password123!',
            email='acad@example.com',
            role='ACADEMIC'
        )
        self.academic_coord = User.objects.create_user(
            username='academic_coordinator_user',
            password='Password123!',
            email='coord@example.com',
            role='ACADEMIC_COORDINATOR'
        )
        self.teacher_user = User.objects.create_user(
            username='guru_teacher',
            password='Password123!',
            email='teacher@example.com',
            role='TEACHER'
        )
        self.sales_rep1 = User.objects.create_user(
            username='sales_rep_one',
            password='Password123!',
            email='sales1@example.com',
            role='SALES'
        )
        self.sales_rep2 = User.objects.create_user(
            username='sales_rep_two',
            password='Password123!',
            email='sales2@example.com',
            role='SALES'
        )
        self.unprivileged_emp = User.objects.create_user(
            username='general_staff',
            password='Password123!',
            email='staff@example.com',
            role='EMPLOYEE'
        )
        self.admin_user = User.objects.create_user(
            username='admin_officer',
            password='Password123!',
            email='admin_acad@example.com',
            role='ADMIN'
        )

        # Batch for teacher
        self.batch = Batch.objects.create(
            name='Batch A - 2026',
            course=self.course,
            start_date=self.today,
            teacher=self.teacher_user
        )

        # Lead 1: Unconverted lead (status NEW) assigned to sales_rep1
        u1 = User.objects.create_user(username='lead_unconverted_user', password='password123', role='STUDENT')
        self.lead_unconverted = Student.objects.create(
            user=u1,
            crm_student_id='CRM-UNCONV-1',
            first_name='Unconverted',
            last_name='Lead',
            program_type=self.program,
            lead_status=str(self.stage_new.id),
            assigned_to=self.sales_rep1
        )

        # Lead 2: Converted student assigned to sales_rep1 and in teacher's batch
        u2 = User.objects.create_user(username='student_converted_user1', password='password123', role='STUDENT')
        self.student_converted_1 = Student.objects.create(
            user=u2,
            crm_student_id='CRM-CONV-1',
            first_name='Ananya',
            last_name='Patel',
            program_type=self.program,
            course=self.course,
            batch=self.batch,
            lead_status=str(self.stage_converted.id),
            assigned_to=self.sales_rep1
        )

        # Lead 3: Converted student assigned to sales_rep2 and in no batch
        u3 = User.objects.create_user(username='student_converted_user2', password='password123', role='STUDENT')
        self.student_converted_2 = Student.objects.create(
            user=u3,
            crm_student_id='CRM-CONV-2',
            first_name='Rohan',
            last_name='Verma',
            program_type=self.program,
            course=self.course,
            lead_status=str(self.stage_converted.id),
            assigned_to=self.sales_rep2
        )

    def _extract_ids(self, response):
        data = response.data
        results = data['results'] if isinstance(data, dict) and 'results' in data else data
        return [item['id'] for item in results]

    def test_academic_user_can_access_group_academic_without_403(self):
        """ACADEMIC user receives HTTP 200 on ?group=ACADEMIC and only sees converted students."""
        self.client.force_authenticate(user=self.academic_user)
        response = self.client.get('/api/students/?page=1&group=ACADEMIC')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        ids = self._extract_ids(response)
        # Must see both converted students
        self.assertIn(self.student_converted_1.id, ids)
        self.assertIn(self.student_converted_2.id, ids)
        # Must NOT see unconverted sales lead
        self.assertNotIn(self.lead_unconverted.id, ids)

    def test_academic_coordinator_user_can_access_converted_students(self):
        """ACADEMIC_COORDINATOR receives HTTP 200 and only converted students."""
        self.client.force_authenticate(user=self.academic_coord)
        response = self.client.get('/api/students/?page=1&group=ACADEMIC')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        ids = self._extract_ids(response)
        self.assertIn(self.student_converted_1.id, ids)
        self.assertIn(self.student_converted_2.id, ids)
        self.assertNotIn(self.lead_unconverted.id, ids)

    def test_teacher_user_only_sees_students_in_their_batches(self):
        """TEACHER user only sees converted students enrolled in their assigned batches."""
        self.client.force_authenticate(user=self.teacher_user)
        response = self.client.get('/api/students/?page=1&group=ACADEMIC')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        ids = self._extract_ids(response)
        # Student 1 is in teacher's batch
        self.assertIn(self.student_converted_1.id, ids)
        # Student 2 is NOT in teacher's batch
        self.assertNotIn(self.student_converted_2.id, ids)
        # Unconverted lead is NOT in teacher's batch
        self.assertNotIn(self.lead_unconverted.id, ids)

    def test_sales_user_cannot_bypass_assignment_via_group_academic(self):
        """SALES user cannot see leads assigned to other sales reps by supplying ?group=ACADEMIC."""
        self.client.force_authenticate(user=self.sales_rep1)
        response = self.client.get('/api/students/?page=1&group=ACADEMIC')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        ids = self._extract_ids(response)
        # Sales rep 1 sees their assigned student
        self.assertIn(self.student_converted_1.id, ids)
        # Sales rep 1 CANNOT see student assigned to sales_rep2
        self.assertNotIn(self.student_converted_2.id, ids)

    def test_unprivileged_employee_denied_access(self):
        """EMPLOYEE role without role permissions is rejected with HTTP 403 Forbidden."""
        self.client.force_authenticate(user=self.unprivileged_emp)
        response = self.client.get('/api/students/?page=1&group=ACADEMIC')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_user_denied_access(self):
        """Unauthenticated request to ?group=ACADEMIC is rejected with 401 or 403."""
        self.client.logout()
        response = self.client.get('/api/students/?page=1&group=ACADEMIC')
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_admin_user_sees_all_converted_students_in_group_academic(self):
        """ADMIN user querying ?group=ACADEMIC receives all converted students institution-wide and no unconverted leads."""
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get('/api/students/?page=1&group=ACADEMIC')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        ids = self._extract_ids(response)
        self.assertIn(self.student_converted_1.id, ids)
        self.assertIn(self.student_converted_2.id, ids)
        self.assertNotIn(self.lead_unconverted.id, ids)
