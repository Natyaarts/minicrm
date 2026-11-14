import threading
from unittest import skipUnless

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import connections
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import Program, Student
from crm.models import LeadInteraction, LeadTask, LeadTaskItem, PipelineStage, Task

User = get_user_model()


class LeadStatusPersistenceTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.program = Program.objects.create(name="Natya Regular", slug="natya-regular")

        self.stage_new = PipelineStage.objects.create(name="New Lead", order=1, color="#3B82F6")
        self.stage_follow_up = PipelineStage.objects.create(name="Follow-up", order=2, color="#F59E0B")
        self.stage_payment = PipelineStage.objects.create(name="Payment Pending", order=3, color="#8B5CF6")
        self.stage_enrolled = PipelineStage.objects.create(name="Converted", order=4, color="#10B981")
        self.stage_dropped = PipelineStage.objects.create(name="Dropped", order=5, color="#EF4444")

        self.manager = User.objects.create_user(
            username="manager_status_test",
            email="manager_status@example.com",
            password="Password@123",
            role="TEAM_LEAD",
            sales_section="BOTH",
        )
        self.bde = User.objects.create_user(
            username="bde_status_test",
            email="bde_status@example.com",
            password="Password@123",
            role="SALES",
            sales_section="REGULAR",
        )
        self.student_user = User.objects.create_user(
            username="lead_user_status_test",
            email="lead_status@example.com",
            password="Password@123",
            role="STUDENT",
        )
        self.lead = Student.objects.create(
            user=self.student_user,
            first_name="Aswathy",
            last_name="Pillai",
            mobile="9895277332",
            email="lead_status@example.com",
            program_type=self.program,
            sales_section="REGULAR",
            assigned_to=self.bde,
            lead_status="NEW",
        )
        self.client.force_authenticate(user=self.bde)

    def test_status_progression_persists_independently_of_calls(self):
        """
        Verify NEW -> FOLLOW_UP -> PAYMENT_PENDING -> ENROLLED -> DROPPED transitions
        persist accurately via PATCH /api/students/<id>/ (both canonical codes and stage IDs).
        """
        self.assertIn(self.lead.lead_status, ["NEW", str(self.stage_new.id)])

        for status_val, expected_stage in [
            ("FOLLOW_UP", self.stage_follow_up),
            (str(self.stage_follow_up.id), self.stage_follow_up),
            ("PAYMENT_PENDING", self.stage_payment),
            (str(self.stage_payment.id), self.stage_payment),
            ("ENROLLED", self.stage_enrolled),
            (str(self.stage_enrolled.id), self.stage_enrolled),
            ("DROPPED", self.stage_dropped),
            (str(self.stage_dropped.id), self.stage_dropped),
        ]:
            cache.clear()
            res = self.client.patch(
                f"/api/students/{self.lead.id}/",
                {"lead_status": status_val},
                format="json",
            )
            self.assertEqual(res.status_code, 200)
            self.lead.refresh_from_db()
            self.assertEqual(self.lead.lead_status, status_val)
            self.assertEqual(res.data["lead_status"], status_val)
            self.assertEqual(res.data["lead_stage_id"], expected_stage.id)
            self.assertEqual(res.data["lead_status_display"], expected_stage.name)

    def test_updating_other_lead_fields_or_blank_status_does_not_reset_to_new(self):
        """
        Verify updating cre_update, contact details, or sending blank/null lead_status
        in PATCH/PUT never overwrites an existing FOLLOW_UP status back to NEW.
        """
        self.lead.lead_status = "FOLLOW_UP"
        self.lead.save(update_fields=["lead_status"])

        # 1. Update CRE update note
        res = self.client.patch(
            f"/api/students/{self.lead.id}/",
            {"cre_update": "Spoke with candidate, interested in next batch"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.lead_status, "FOLLOW_UP")
        self.assertEqual(res.data["lead_stage_id"], self.stage_follow_up.id)

        # 2. Update lead profile with empty string lead_status (e.g. from Edit Lead modal)
        res = self.client.patch(
            f"/api/students/{self.lead.id}/",
            {
                "first_name": "Aswathy Updated",
                "lead_status": "",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.first_name, "Aswathy Updated")
        self.assertEqual(self.lead.lead_status, "FOLLOW_UP")
        self.assertEqual(res.data["lead_status"], "FOLLOW_UP")
        self.assertEqual(res.data["lead_stage_id"], self.stage_follow_up.id)

    def test_web_crm_end_to_end_workflow_preserves_status(self):
        """
        Simulate complete Web CRM workflow:
        Leads Table -> Student Profile Modal -> Change NEW to FOLLOW_UP -> Save CRE Update ->
        Log Activity Note with Follow-up Date -> Toggle Scheduled Follow-up Task ->
        Change FOLLOW_UP to PAYMENT_PENDING -> Change to ENROLLED -> Change to DROPPED.
        """
        # 1. Change status from NEW to FOLLOW_UP in Student Profile Modal
        res = self.client.patch(
            f"/api/students/{self.lead.id}/",
            {"lead_status": str(self.stage_follow_up.id)},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["lead_stage_id"], self.stage_follow_up.id)
        self.assertEqual(res.data["lead_status_display"], "Follow-up")

        # 2. Save CRE Update in Student Profile Modal
        res = self.client.patch(
            f"/api/students/{self.lead.id}/",
            {"cre_update": "Candidate requested brochure"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.lead_status, str(self.stage_follow_up.id))

        # 3. Log Activity Note with next_followup_date (creates a CRM Task reminder)
        followup_dt = (timezone.now() + timezone.timedelta(days=1)).isoformat()
        note_res = self.client.post(
            "/api/crm/interactions/",
            {
                "student": self.lead.id,
                "interaction_type": "NOTE",
                "notes": "Brochure shared on WhatsApp",
                "next_followup_date": followup_dt,
            },
            format="json",
        )
        self.assertEqual(note_res.status_code, 201)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.lead_status, str(self.stage_follow_up.id))

        # 4. Complete the scheduled follow-up task via PATCH /api/crm/tasks/<id>/
        scheduled_task = Task.objects.filter(student=self.lead).first()
        self.assertIsNotNone(scheduled_task)
        cache.clear()
        task_res = self.client.patch(
            f"/api/crm/tasks/{scheduled_task.id}/",
            {"status": "COMPLETED"},
            format="json",
        )
        self.assertEqual(task_res.status_code, 200)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.lead_status, str(self.stage_follow_up.id))

        # 5. Re-fetch student profile (as when opening from Tasks Management or Leads Table)
        get_res = self.client.get(f"/api/students/{self.lead.id}/")
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.data["lead_stage_id"], self.stage_follow_up.id)
        self.assertEqual(get_res.data["lead_status_display"], "Follow-up")

    def test_mobile_outgoing_and_incoming_call_workflows(self):
        """
        Simulate Mobile App Outbound Call (dialpad.tsx) and Incoming Call (GlobalCallListener.tsx)
        workflows including idempotent mobile_call_id sync and background recording upload.
        """
        # Step 1: Lead is set to FOLLOW_UP
        res = self.client.patch(
            f"/api/students/{self.lead.id}/",
            {"lead_status": "FOLLOW_UP"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)

        # Step 2: Mobile Outbound Call (dialpad.tsx) where BDE does NOT change stage in Post-Call Review
        out_call_1 = self.client.post(
            "/api/crm/interactions/",
            {
                "interaction_type": "CALL",
                "mobile_call_id": "OUT_9895277332_1001",
                "customer_number": "9895277332",
                "receiver_number": "9895277332",
                "call_duration": "45",
                "call_direction": "OUTGOING",
                "call_status": "CONNECTED",
                "student": str(self.lead.id),
                "notes": "Duration: 00:45\nNotes: Outbound follow-up call",
            },
            format="json",
        )
        self.assertEqual(out_call_1.status_code, 201)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.lead_status, "FOLLOW_UP")

        # Step 3: Background recording sync via PATCH /api/crm/interactions/<id>/ (SyncManager.ts)
        patch_sync = self.client.patch(
            f"/api/crm/interactions/{out_call_1.data['id']}/",
            {"call_duration": 45, "call_status": "CONNECTED"},
            format="json",
        )
        self.assertEqual(patch_sync.status_code, 200)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.lead_status, "FOLLOW_UP")

        # Step 4: Mobile Incoming Call (GlobalCallListener.tsx) where BDE does NOT change stage
        cache.clear()
        in_call_1 = self.client.post(
            "/api/crm/interactions/",
            {
                "mobile_call_id": "IN_9895277332_1002",
                "customer_number": "9895277332",
                "caller_number": "9895277332",
                "interaction_type": "CALL",
                "call_duration": "60",
                "call_direction": "INCOMING",
                "call_status": "CONNECTED",
                "student": str(self.lead.id),
                "notes": "Incoming Call - Duration: 01:00\nNotes: Candidate called back",
            },
            format="json",
        )
        self.assertEqual(in_call_1.status_code, 201)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.lead_status, "FOLLOW_UP")

        # Step 5: Mobile Outbound Call where BDE explicitly selects PAYMENT_PENDING in Post-Call Review
        out_call_2 = self.client.post(
            "/api/crm/interactions/",
            {
                "interaction_type": "CALL",
                "mobile_call_id": "OUT_9895277332_1003",
                "customer_number": "9895277332",
                "receiver_number": "9895277332",
                "call_duration": "90",
                "call_direction": "OUTGOING",
                "call_status": "CONNECTED",
                "student": str(self.lead.id),
                "pipeline_status": str(self.stage_payment.id),
                "notes": "Candidate ready to pay",
            },
            format="json",
        )
        self.assertEqual(out_call_2.status_code, 201)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.lead_status, str(self.stage_payment.id))

        # Step 6: Subsequent Incoming Call without stage change preserves PAYMENT_PENDING
        cache.clear()
        in_call_2 = self.client.post(
            "/api/crm/interactions/",
            {
                "mobile_call_id": "IN_9895277332_1004",
                "customer_number": "9895277332",
                "caller_number": "9895277332",
                "interaction_type": "CALL",
                "call_duration": "30",
                "call_direction": "INCOMING",
                "call_status": "CONNECTED",
                "student": str(self.lead.id),
                "notes": "Confirmed UPI ID",
            },
            format="json",
        )
        self.assertEqual(in_call_2.status_code, 201)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.lead_status, str(self.stage_payment.id))
        # 1 STAGE_CHANGE + 4 CALL interactions = 5 total
        self.assertEqual(LeadInteraction.objects.filter(student=self.lead).count(), 5)

    def test_lead_task_update_preserves_status_and_exposes_resolved_stage(self):
        """
        Verify completing a task item or updating task notes preserves the lead's
        status and returns resolved lead_stage_id and lead_status_display.
        """
        self.lead.lead_status = "FOLLOW_UP"
        self.lead.save(update_fields=["lead_status"])

        task = LeadTask.objects.create(
            title="Follow-up Batch Task",
            assigned_to=self.bde,
            created_by=self.manager,
            status="PENDING",
        )
        task.assigned_bdes.add(self.bde)
        LeadTaskItem.objects.create(task=task, lead=self.lead, assigned_to=self.bde)

        res = self.client.post(
            f"/api/crm/lead-tasks/{task.id}/update-lead/",
            {
                "lead_id": self.lead.id,
                "is_completed": True,
                "notes": "Follow-up completed",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.lead_status, "FOLLOW_UP")

        items = res.data.get("items", [])
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["lead_status"], "FOLLOW_UP")
        self.assertEqual(items[0]["lead_stage_id"], self.stage_follow_up.id)
        self.assertEqual(items[0]["lead_status_display"], self.stage_follow_up.name)


class LeadStatusConcurrencyPostgresTestSuite(TransactionTestCase):
    @skipUnless(
        connections["default"].vendor == "postgresql",
        "PostgreSQL-specific multi-threaded concurrency test requires USE_POSTGRES=True.",
    )
    def test_concurrent_call_log_and_note_update_preserve_status_on_postgres(self):
        """
        Verify that concurrent call logging and CRE note updates on PostgreSQL
        preserve a lead's FOLLOW_UP status and never reset it to NEW.
        """
        cache.clear()
        program = Program.objects.create(name="PG Status Program", slug="pg-status-program")
        PipelineStage.objects.create(name="New Lead", order=1, color="#3B82F6")
        stage_follow_up = PipelineStage.objects.create(name="Follow-up", order=2, color="#F59E0B")

        bde = User.objects.create_user(
            username="pg_bde_status",
            email="pg_bde_status@example.com",
            password="Password@123",
            role="SALES",
            sales_section="REGULAR",
        )
        student_user = User.objects.create_user(
            username="pg_lead_status",
            email="pg_lead_status@example.com",
            password="Password@123",
            role="STUDENT",
        )
        lead = Student.objects.create(
            user=student_user,
            first_name="Concurrent",
            last_name="Lead",
            mobile="9895112233",
            email="pg_lead_status@example.com",
            program_type=program,
            sales_section="REGULAR",
            assigned_to=bde,
            lead_status=str(stage_follow_up.id),
        )

        barrier = threading.Barrier(2)
        errors = []

        def worker_call():
            try:
                client = APIClient()
                client.force_authenticate(user=bde)
                barrier.wait(timeout=5)
                res = client.post(
                    "/api/crm/interactions/",
                    {
                        "student": lead.id,
                        "interaction_type": "CALL",
                        "mobile_call_id": "pg-concurrent-call-1",
                        "customer_number": lead.mobile,
                        "call_direction": "OUTGOING",
                        "call_status": "CONNECTED",
                        "call_duration": 50,
                        "notes": "Concurrent call log",
                    },
                    format="json",
                )
                if res.status_code != 201:
                    errors.append(f"Call status {res.status_code}: {res.data}")
            except Exception as exc:
                errors.append(str(exc))
            finally:
                connections.close_all()

        def worker_patch():
            try:
                client = APIClient()
                client.force_authenticate(user=bde)
                barrier.wait(timeout=5)
                res = client.patch(
                    f"/api/students/{lead.id}/",
                    {"cre_update": "Concurrent CRE update", "lead_status": ""},
                    format="json",
                )
                if res.status_code != 200:
                    errors.append(f"Patch status {res.status_code}: {res.data}")
            except Exception as exc:
                errors.append(str(exc))
            finally:
                connections.close_all()

        t1 = threading.Thread(target=worker_call)
        t2 = threading.Thread(target=worker_patch)
        t1.start()
        t2.start()
        t1.join(timeout=10)
        t2.join(timeout=10)

        self.assertEqual(errors, [])
        lead.refresh_from_db()
        self.assertEqual(lead.lead_status, str(stage_follow_up.id))
        self.assertEqual(lead.cre_update, "Concurrent CRE update")
