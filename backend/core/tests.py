import json
from django.test import TestCase
from django.db import IntegrityError, transaction
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework import status
from core.models import Program, SubProgram, Student
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
        """Verify that program slug is properly generated automatically without duplicate Program names."""
        prog = Program.objects.create(name="Skill India Mission")
        self.assertEqual(prog.slug, "skill-india-mission")

        # Distinct Program name that slugifies to the same base slug receives '-1' suffix
        prog2 = Program.objects.create(name="Skill India - Mission!")
        self.assertEqual(prog2.slug, "skill-india-mission-1")

        # Distinct Program name generates its own expected slug
        prog3 = Program.objects.create(name="Classical Dance Academy")
        self.assertEqual(prog3.slug, "classical-dance-academy")


class ProgramAndSubProgramUniquenessTests(TestCase):
    def test_program_name_must_be_unique(self):
        """Program names must be unique (exact match rejected)."""
        Program.objects.create(name="Kathak Mastery")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Program.objects.create(name="Kathak Mastery")

    def test_program_name_must_be_unique_case_insensitive(self):
        """Program names must be unique regardless of letter casing (uniq_program_name_ci)."""
        Program.objects.create(name="Bharatanatyam Conservatory")
        for variant in ["bharatanatyam conservatory", "BHARATANATYAM CONSERVATORY", "BhArAtAnAtYaM cOnSeRvAtOrY"]:
            with self.assertRaises(IntegrityError):
                with transaction.atomic():
                    Program.objects.create(name=variant)

    def test_different_program_names_generate_expected_slugs(self):
        """Different Program names generate the expected slugs and handle NSDC base slug collision."""
        p1 = Program.objects.create(name="Carnatic Vocal Foundation")
        p2 = Program.objects.create(name="Hindustani Instrumental")
        p3 = Program.objects.create(name="NSDC Vocational Arts")
        p4 = Program.objects.create(name="NSDC Advanced Performing Arts")

        self.assertEqual(p1.slug, "carnatic-vocal-foundation")
        self.assertEqual(p2.slug, "hindustani-instrumental")
        self.assertEqual(p3.slug, "nsdc")
        self.assertEqual(p4.slug, "nsdc-1")

    def test_subprogram_names_unique_within_same_program(self):
        """SubProgram names must be unique within the same Program."""
        prog = Program.objects.create(name="Natya Regular")
        SubProgram.objects.create(program=prog, name="STED")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                SubProgram.objects.create(program=prog, name="STED")

    def test_identical_subprogram_names_allowed_under_different_programs(self):
        """Identical SubProgram names are allowed under different Programs."""
        prog_a = Program.objects.create(name="Natya Regular Program")
        prog_b = Program.objects.create(name="Natya Career Academy")

        sub_a = SubProgram.objects.create(program=prog_a, name="STED")
        sub_b = SubProgram.objects.create(program=prog_b, name="STED")

        self.assertEqual(sub_a.name, "STED")
        self.assertEqual(sub_b.name, "STED")
        self.assertNotEqual(sub_a.program_id, sub_b.program_id)

    def test_migration_0045_precheck_fails_with_clear_explanation_on_duplicates(self):
        """Migration 0045 pre-check uses database-side Lower('name') and fails clearly on duplicates."""
        import importlib
        from types import SimpleNamespace
        from django.apps import apps
        from django.db import connection

        mod_0045 = importlib.import_module("core.migrations.0045_alter_program_name_program_uniq_program_name_ci")
        dummy_schema_editor = SimpleNamespace(connection=connection)

        # 1. Passes when all Program names are unique
        Program.objects.create(name="Distinct Program Alpha", slug="distinct-alpha")
        mod_0045.verify_no_duplicate_programs(apps, dummy_schema_editor)

        # 2. Drop the case-insensitive expression index within the test transaction so we can insert
        #    'Test' (ID=4) and 'test' (ID=12) into the real core_program table and verify that
        #    verify_no_duplicate_programs detects them via database-side Lower('name') aggregation.
        with connection.cursor() as cursor:
            cursor.execute('DROP INDEX IF EXISTS "uniq_program_name_ci"')

        try:
            p4 = Program(id=4, name="Test", slug=None)
            super(Program, p4).save(force_insert=True)
            p12 = Program(id=12, name="test", slug="test")
            super(Program, p12).save(force_insert=True)

            u = User.objects.create_user(username="dup_prog_stud", email="dup_prog@example.com")
            Student.objects.create(
                user=u,
                crm_student_id="NATYA-DUP-4",
                first_name="Student",
                last_name="One",
                mobile="+919800009999",
                program_type=p4,
            )

            with self.assertRaises(RuntimeError) as ctx:
                mod_0045.verify_no_duplicate_programs(apps, dummy_schema_editor)

            err_msg = str(ctx.exception)
            self.assertIn("Normalized name 'test'", err_msg)
            self.assertIn("ID=4 (name='Test', slug=None, students=1, subprograms=0)", err_msg)
            self.assertIn("ID=12 (name='test', slug='test', students=0, subprograms=0)", err_msg)
            self.assertIn("Disambiguate duplicate Program.name values", err_msg)
        finally:
            Student.objects.filter(crm_student_id="NATYA-DUP-4").delete()
            Program.objects.filter(id__in=[4, 12]).delete()
            with connection.cursor() as cursor:
                cursor.execute('CREATE UNIQUE INDEX IF NOT EXISTS "uniq_program_name_ci" ON "core_program" (LOWER("name"))')


class ProgramSerializerAPITests(APITestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.super_admin = User.objects.create_superuser(
            username="prog_api_admin",
            email="prog_api_admin@example.com",
            password="password123",
            role="SUPER_ADMIN",
        )
        self.client.force_authenticate(user=self.super_admin)
        self.prog_a = Program.objects.create(
            name="Kathak Diploma",
            description="Classical Kathak Diploma",
            slug="kathak-diploma",
        )
        self.prog_b = Program.objects.create(
            name="Bharatanatyam Certificate",
            description="Classical Bharatanatyam Certificate",
            slug="bharatanatyam-certificate",
        )

    def test_create_duplicate_exact_name_returns_400(self):
        """Duplicate exact Program name on create returns HTTP 400."""
        res = self.client.post("/api/programs/", {"name": "Kathak Diploma"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", res.data)

    def test_create_case_insensitive_duplicate_name_returns_400(self):
        """Case-insensitive duplicate Program name on create returns HTTP 400."""
        for variant in ["kathak diploma", "KATHAK DIPLOMA", "KaThAk DiPlOmA"]:
            res = self.client.post("/api/programs/", {"name": variant}, format="json")
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn("name", res.data)

    def test_update_program_without_changing_name_succeeds(self):
        """Updating a Program without changing its name (or changing only its own casing) succeeds."""
        res_patch = self.client.patch(
            f"/api/programs/{self.prog_a.id}/",
            {"name": "Kathak Diploma", "description": "Updated description"},
            format="json",
        )
        self.assertEqual(res_patch.status_code, status.HTTP_200_OK)
        self.prog_a.refresh_from_db()
        self.assertEqual(self.prog_a.description, "Updated description")

        res_put = self.client.put(
            f"/api/programs/{self.prog_a.id}/",
            {
                "name": "Kathak Diploma",
                "description": "Full PUT update",
                "require_payment": True,
                "registration_fee": "500.00",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(res_put.status_code, status.HTTP_200_OK)

    def test_update_program_to_another_existing_program_name_returns_400(self):
        """Updating a Program to another existing Program's name (exact or case-insensitive) returns HTTP 400."""
        for conflict_name in ["Bharatanatyam Certificate", "bharatanatyam certificate", "BHARATANATYAM CERTIFICATE"]:
            res = self.client.patch(
                f"/api/programs/{self.prog_a.id}/",
                {"name": conflict_name},
                format="json",
            )
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn("name", res.data)

    def test_whitespace_handling_on_create_and_update(self):
        """Leading/trailing whitespace is stripped and blank/whitespace-only or padded duplicates return HTTP 400."""
        # Create with surrounding whitespace -> stripped and saved cleanly
        res_create = self.client.post(
            "/api/programs/",
            {"name": "   Mohiniyattam Foundation   "},
            format="json",
        )
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_create.data["name"], "Mohiniyattam Foundation")

        # Padded case-insensitive duplicate on create -> rejected with HTTP 400
        res_dup = self.client.post(
            "/api/programs/",
            {"name": "  mohiniyattam foundation  "},
            format="json",
        )
        self.assertEqual(res_dup.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", res_dup.data)

        # Padded duplicate on update to another Program's name -> rejected with HTTP 400
        res_upd_dup = self.client.patch(
            f"/api/programs/{self.prog_a.id}/",
            {"name": "   bharatanatyam certificate   "},
            format="json",
        )
        self.assertEqual(res_upd_dup.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", res_upd_dup.data)

        # Whitespace-only name -> rejected with HTTP 400
        res_blank = self.client.post(
            "/api/programs/",
            {"name": "     "},
            format="json",
        )
        self.assertEqual(res_blank.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", res_blank.data)




class AnalyticsDetailTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username='admin_analytics',
            password='testpassword123',
            email='admin_analytics@example.com',
            role='SUPER_ADMIN'
        )
        self.client.force_authenticate(user=self.admin)
        self.prog = Program.objects.create(name='Classical Arts', slug='classical-arts')

        from crm.models import PipelineStage
        self.stage_new = PipelineStage.objects.create(name='New Lead', order=1, is_default=True)
        self.stage_conv = PipelineStage.objects.create(name='Converted', order=2)
        self.stage_drop = PipelineStage.objects.create(name='Dropped', order=3)

    def test_analytics_detail_reconciles_enrolled_students_and_funnel(self):
        # 1. Enrolled student
        u1 = User.objects.create_user(username='enrolled_stud', password='password123', role='STUDENT')
        Student.objects.create(
            user=u1,
            crm_student_id='CRM-TEST-AN-1',
            first_name='Enrolled',
            last_name='Student',
            mobile='+919800000001',
            program_type=self.prog,
            lead_status=str(self.stage_conv.id),
            is_active=True
        )

        # 2. Raw unconverted lead
        u2 = User.objects.create_user(username='raw_lead', password='password123', role='STUDENT')
        Student.objects.create(
            user=u2,
            crm_student_id='CRM-TEST-AN-2',
            first_name='Raw',
            last_name='Lead',
            mobile='+919800000002',
            program_type=self.prog,
            lead_status=str(self.stage_new.id),
            is_active=True
        )

        # 3. Dropped lead
        u3 = User.objects.create_user(username='drop_lead', password='password123', role='STUDENT')
        Student.objects.create(
            user=u3,
            crm_student_id='CRM-TEST-AN-3',
            first_name='Drop',
            last_name='Lead',
            mobile='+919800000003',
            program_type=self.prog,
            lead_status=str(self.stage_drop.id),
            is_active=True
        )

        res = self.client.get('/api/analytics-details/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # students_count must be 1 (only genuinely enrolled converted students)
        self.assertEqual(res.data['students_count'], 1)

        # program_distribution must only count enrolled students
        self.assertEqual(len(res.data['program_distribution']), 1)
        self.assertEqual(res.data['program_distribution'][0]['name'], 'Classical Arts')
        self.assertEqual(res.data['program_distribution'][0]['value'], 1)

        # lead_funnel must use human-readable stage names
        funnel_names = [item['name'] for item in res.data['lead_funnel']]
        self.assertIn('New Lead', funnel_names)
        self.assertIn('Converted', funnel_names)
        self.assertIn('Dropped', funnel_names)
        self.assertNotIn(str(self.stage_new.id), funnel_names)
        self.assertNotIn(str(self.stage_conv.id), funnel_names)
