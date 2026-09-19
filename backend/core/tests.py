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

    def test_new_student_nsdc_application_succeeds(self):
        """Case 1: New student not in CRM submits NSDC form -> submission succeeds."""
        payload = {
            "program_type": self.nsdc_program.id,
            "first_name": "Rohan",
            "last_name": "Verma",
            "email": "rohan.verma@example.com",
            "mobile": "9811122233",
            "is_active": "true",
            "dynamic_values": json.dumps({
                str(self.field_salutation.id): "Mr.",
                str(self.field_full_name.id): "Rohan Verma",
                str(self.field_mobile.id): "9811122233",
                str(self.field_email.id): "rohan.verma@example.com",
            })
        }
        res = self.client.post("/api/students/", payload, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        created_app = Student.objects.get(id=res.data["id"])
        self.assertEqual(created_app.first_name, "Rohan")
        self.assertEqual(created_app.program_type, self.nsdc_program)

    def test_existing_crm_student_nsdc_application_succeeds(self):
        """Case 2: Existing CRM student submits NSDC form -> submission succeeds (NOT blocked as duplicate)."""
        regular_prog = Program.objects.create(name="Regular Kathak Program", slug="regular-kathak")
        existing_user = User.objects.create_user(username="sanidhya_crm", email="sanidhya@example.com")
        existing_student = Student.objects.create(
            user=existing_user,
            crm_student_id="NATYA-1001",
            first_name="Sanidhya",
            last_name="Gupta",
            email="sanidhya@example.com",
            mobile="+919876543210",
            program_type=regular_prog
        )

        payload = {
            "program_type": self.nsdc_program.id,
            "first_name": "Sanidhya",
            "last_name": "Gupta",
            "email": "sanidhya@example.com",
            "mobile": "9876543210",
            "is_active": "true",
            "dynamic_values": json.dumps({
                str(self.field_salutation.id): "Ms.",
                str(self.field_full_name.id): "Sanidhya Gupta",
                str(self.field_mobile.id): "9876543210",
                str(self.field_email.id): "sanidhya@example.com",
            })
        }

        res = self.client.post("/api/students/", payload, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertNotEqual(res.data["id"], existing_student.id)

        nsdc_app = Student.objects.get(id=res.data["id"])
        self.assertEqual(nsdc_app.program_type, self.nsdc_program)
        self.assertEqual(nsdc_app.email, "sanidhya@example.com")
        self.assertEqual(nsdc_app.mobile, "+919876543210")

    def test_existing_crm_student_is_not_duplicated_when_submitting_nsdc(self):
        """Existing CRM student record is preserved and not duplicated in their original CRM program."""
        regular_prog = Program.objects.create(name="Career Academy Acting", slug="career-acting")
        existing_user = User.objects.create_user(username="sanidhya_act", email="sanidhya.act@example.com")
        existing_student = Student.objects.create(
            user=existing_user,
            crm_student_id="NATYA-2001",
            first_name="Sanidhya",
            last_name="Kapoor",
            email="sanidhya.act@example.com",
            mobile="+919123456780",
            program_type=regular_prog
        )

        initial_regular_count = Student.objects.filter(program_type=regular_prog).count()
        self.assertEqual(initial_regular_count, 1)

        # Submit NSDC application
        payload = {
            "program_type": self.nsdc_program.id,
            "first_name": "Sanidhya",
            "last_name": "Kapoor",
            "email": "sanidhya.act@example.com",
            "mobile": "9123456780",
            "is_active": "true"
        }
        res = self.client.post("/api/students/", payload, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # Regular program student count should remain exactly 1
        self.assertEqual(Student.objects.filter(program_type=regular_prog).count(), 1)

        # Existing student record retains its original fields
        existing_student.refresh_from_db()
        self.assertEqual(existing_student.program_type, regular_prog)
        self.assertEqual(existing_student.crm_student_id, "NATYA-2001")

        # Existing student has an interaction noting the NSDC submission
        from crm.models import LeadInteraction
        interactions = LeadInteraction.objects.filter(student=existing_student)
        self.assertTrue(interactions.filter(notes__contains="NSDC Application").exists())

    def test_existing_crm_duplicate_protection_unchanged_for_non_nsdc_flows(self):
        """Duplicate registration attempts for NON-NSDC programs are still blocked with HTTP 400."""
        regular_prog = Program.objects.create(name="Regular Dance Program", slug="regular-dance")
        existing_user = User.objects.create_user(username="lead_user", email="lead@example.com")
        existing_student = Student.objects.create(
            user=existing_user,
            crm_student_id="NATYA-3001",
            first_name="First",
            last_name="Applicant",
            email="lead@example.com",
            mobile="+919999999999",
            program_type=regular_prog
        )

        initial_count = Student.objects.count()

        # Non-NSDC submission attempt with duplicate contact details
        payload = {
            "program_type": regular_prog.id,
            "first_name": "Second",
            "last_name": "Applicant",
            "email": "lead@example.com",
            "mobile": "9999999999",
            "is_active": "true"
        }
        res = self.client.post("/api/students/", payload, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Student.objects.count(), initial_count)

    def test_nsdc_application_stores_data_submitted_through_nsdc_form(self):
        """NSDC application stores dynamic field values and submitted details independently."""
        regular_prog = Program.objects.create(name="Kathak Diploma", slug="kathak-diploma")
        existing_user = User.objects.create_user(username="ananya_user", email="ananya@example.com")
        existing_student = Student.objects.create(
            user=existing_user,
            crm_student_id="NATYA-4001",
            first_name="Ananya",
            last_name="OldLastName",
            email="ananya@example.com",
            mobile="+919876500000",
            perm_address="Old Address In CRM",
            program_type=regular_prog
        )

        payload = {
            "program_type": self.nsdc_program.id,
            "first_name": "Ananya",
            "last_name": "NewLastName",
            "email": "ananya@example.com",
            "mobile": "9876500000",
            "perm_address": "New NSDC Permanent Address",
            "is_active": "true",
            "dynamic_values": json.dumps({
                str(self.field_salutation.id): "Ms.",
                str(self.field_full_name.id): "Ananya NewLastName",
                str(self.field_dob.id): "1998-11-20",
                str(self.field_gender.id): "Female",
                str(self.field_address.id): "New NSDC Permanent Address",
                str(self.field_mobile.id): "9876500000",
                str(self.field_email.id): "ananya@example.com"
            })
        }

        res = self.client.post("/api/students/", payload, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        nsdc_app = Student.objects.get(id=res.data["id"])
        self.assertEqual(nsdc_app.last_name, "NewLastName")
        self.assertEqual(nsdc_app.perm_address, "New NSDC Permanent Address")

        # Verify dynamic values on NSDC application
        nsdc_dyn_values = StudentDynamicValue.objects.filter(student=nsdc_app)
        self.assertEqual(nsdc_dyn_values.count(), 7)
        self.assertEqual(nsdc_dyn_values.get(field=self.field_address).value, "New NSDC Permanent Address")

        # Existing student record remains untouched
        existing_student.refresh_from_db()
        self.assertEqual(existing_student.last_name, "OldLastName")
        self.assertEqual(existing_student.perm_address, "Old Address In CRM")

    def test_program_slug_auto_generated(self):
        """Verify that program slug is properly generated automatically."""
        prog = Program.objects.create(name="Skill India Mission")
        self.assertEqual(prog.slug, "skill-india-mission")
        prog2 = Program.objects.create(name="Skill India Mission")
        self.assertEqual(prog2.slug, "skill-india-mission-1")
