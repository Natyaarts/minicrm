import json
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework import status
from core.models import Program, Student
from forms_builder.models import DynamicField, StudentDynamicValue
from notifications.models import Notification

User = get_user_model()

class NSDCRegistrationFlowTests(APITestCase):
    def setUp(self):
        # 1. Create NSDC Program
        self.nsdc_program = Program.objects.create(
            name="National Skill Development Corporation (NSDC)",
            description="Auto-generated NSDC Registration Form",
            slug="nsdc"
        )

        # 2. Create Dynamic Fields for NSDC Program
        self.field_salutation = DynamicField.objects.create(
            program=self.nsdc_program,
            label="Salutation",
            field_type="dropdown",
            options=["Mr.", "Ms.", "Mrs."],
            is_required=True,
            order=0,
            field_group='INITIAL'
        )
        self.field_full_name = DynamicField.objects.create(
            program=self.nsdc_program,
            label="Full Name",
            field_type="text",
            is_required=True,
            order=1,
            field_group='INITIAL'
        )
        self.field_dob = DynamicField.objects.create(
            program=self.nsdc_program,
            label="Date Of Birth",
            field_type="date",
            is_required=True,
            order=2,
            field_group='INITIAL'
        )
        self.field_gender = DynamicField.objects.create(
            program=self.nsdc_program,
            label="Gender",
            field_type="dropdown",
            options=["Male", "Female", "Other"],
            is_required=True,
            order=3,
            field_group='INITIAL'
        )
        self.field_mobile = DynamicField.objects.create(
            program=self.nsdc_program,
            label="Contact Number",
            field_type="text",
            is_required=True,
            order=4,
            field_group='INITIAL'
        )
        self.field_email = DynamicField.objects.create(
            program=self.nsdc_program,
            label="Email Id",
            field_type="text",
            is_required=True,
            order=5,
            field_group='INITIAL'
        )
        self.field_address = DynamicField.objects.create(
            program=self.nsdc_program,
            label="Permanent Address",
            field_type="text",
            is_required=True,
            order=6,
            field_group='INITIAL'
        )

        # 3. Create Admin & Super Admin users
        self.admin_user = User.objects.create_user(
            username="admin_user",
            email="admin@example.com",
            password="adminpassword123",
            role="ADMIN",
            first_name="Admin",
            last_name="Staff"
        )
        self.super_admin_user = User.objects.create_user(
            username="super_admin_user",
            email="superadmin@example.com",
            password="superpassword123",
            role="SUPER_ADMIN",
            first_name="Super",
            last_name="Admin"
        )

    def test_student_submits_nsdc_registration_end_to_end(self):
        """
        End-to-End Test:
        1. Student submits NSDC registration form with NO assignment (assigned_to is None).
        2. Registration is persisted in database with correct Program and Dynamic values.
        3. Notification is created referencing the exact student ID.
        4. Admin and Super Admin can retrieve the application by ID and via search without assignment.
        """
        payload = {
            "program_type": self.nsdc_program.id,
            "first_name": "Priya",
            "last_name": "Sharma",
            "email": "priya.sharma@example.com",
            "mobile": "9876543210",
            "is_active": "true",
            "dynamic_values": json.dumps({
                str(self.field_salutation.id): "Ms.",
                str(self.field_full_name.id): "Priya Sharma",
                str(self.field_dob.id): "2000-05-15",
                str(self.field_gender.id): "Female",
                str(self.field_mobile.id): "9876543210",
                str(self.field_email.id): "priya.sharma@example.com",
                str(self.field_address.id): "123 Green Valley, Bangalore"
            })
        }

        # Public submission (unauthenticated student)
        response = self.client.post("/api/students/", payload, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        student_id = response.data["id"]

        # 1. Verify Student persistence
        student = Student.objects.get(id=student_id)
        self.assertEqual(student.first_name, "Priya")
        self.assertEqual(student.last_name, "Sharma")
        self.assertEqual(student.program_type, self.nsdc_program)
        self.assertIsNone(student.assigned_to, "NSDC applications should not have an assigned user")
        self.assertTrue(student.crm_student_id.startswith("NATYA-"))

        # 2. Verify Dynamic Values persistence
        dynamic_values = StudentDynamicValue.objects.filter(student=student)
        self.assertEqual(dynamic_values.count(), 7)
        name_val = dynamic_values.get(field=self.field_full_name)
        self.assertEqual(name_val.value, "Priya Sharma")

        # 3. Verify Notification creation
        admin_notifs = Notification.objects.filter(user=self.admin_user, notification_type="APPLICATION")
        self.assertTrue(admin_notifs.exists())
        notif = admin_notifs.first()
        self.assertEqual(notif.target_url, f"/sales?student={student.id}")
        self.assertIn("Priya", notif.message)
        self.assertIn("National Skill Development", notif.message)

        # 4. Verify Admin can retrieve this unassigned NSDC application by ID
        self.client.force_authenticate(user=self.admin_user)
        get_res = self.client.get(f"/api/students/{student.id}/")
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertEqual(get_res.data["id"], student.id)
        self.assertEqual(get_res.data["crm_student_id"], student.crm_student_id)
        self.assertEqual(get_res.data["program_name"], self.nsdc_program.name)

        # 5. Verify Admin can find student via search
        search_res = self.client.get("/api/students/?search=Priya")
        self.assertEqual(search_res.status_code, status.HTTP_200_OK)
        results = search_res.data.get("results", search_res.data)
        self.assertTrue(any(s["id"] == student.id for s in results))

        # 6. Verify Super Admin can retrieve student
        self.client.force_authenticate(user=self.super_admin_user)
        super_get_res = self.client.get(f"/api/students/{student.id}/")
        self.assertEqual(super_get_res.status_code, status.HTTP_200_OK)
        self.assertEqual(super_get_res.data["id"], student.id)

    def test_duplicate_lead_can_be_retrieved_by_admin_on_notification_click(self):
        """
        Verify that if an applicant submits duplicate details (flagged as DUPLICATE),
        an Admin clicking the notification (/sales?student=<id>) can still retrieve the record.
        """
        # First student
        s1 = Student.objects.create(
            user=User.objects.create_user(username="user1", email="dup@example.com"),
            crm_student_id="NATYA-9001",
            first_name="First",
            last_name="Applicant",
            email="dup@example.com",
            mobile="+919999999999",
            program_type=self.nsdc_program
        )

        # Second student with same email/mobile (creates duplicate)
        payload = {
            "program_type": self.nsdc_program.id,
            "first_name": "Second",
            "last_name": "Applicant",
            "email": "dup@example.com",
            "mobile": "9999999999",
            "is_active": "true"
        }
        res = self.client.post("/api/students/", payload, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        dup_student_id = res.data["id"]

        dup_student = Student.objects.get(id=dup_student_id)
        self.assertEqual(dup_student.lead_status, "DUPLICATE")

        # Admin retrieving by ID (simulating notification click)
        self.client.force_authenticate(user=self.admin_user)
        retrieve_res = self.client.get(f"/api/students/{dup_student_id}/")
        self.assertEqual(retrieve_res.status_code, status.HTTP_200_OK)
        self.assertEqual(retrieve_res.data["id"], dup_student_id)

    def test_program_slug_auto_generated(self):
        """Verify that program slug is properly generated automatically."""
        prog = Program.objects.create(name="Skill India Mission")
        self.assertEqual(prog.slug, "skill-india-mission")
        prog2 = Program.objects.create(name="Skill India Mission")
        self.assertEqual(prog2.slug, "skill-india-mission-1")
