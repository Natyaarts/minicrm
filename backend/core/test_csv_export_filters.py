import csv
import io
from datetime import date, timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from core.models import Program, Student
from crm.models import PipelineStage, Campaign

User = get_user_model()

class StudentCSVExportFilterTests(TestCase):
    """
    Automated regression tests verifying that /api/students/export_csv/
    and /api/students/export_leads_csv/ respect active filters (sales_section,
    start_date, end_date), exclude non-matching records, and remain backward-compatible.
    """

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username='admin_csv_test',
            password='password123',
            email='admin_csv@example.com',
            role='SUPER_ADMIN'
        )
        self.client.force_authenticate(user=self.admin)

        self.program = Program.objects.create(name='Dance Certification')
        self.campaign_a = Campaign.objects.create(name='Campaign Alpha', section='CAREER_ACADEMY', budget=50000)
        self.campaign_b = Campaign.objects.create(name='Campaign Beta', section='REGULAR', budget=30000)

        self.stage_new = PipelineStage.objects.create(name='New Lead', order=1)

        # 1. Career Academy Lead (Created on 2026-03-05)
        u1 = User.objects.create_user(username='stud_ca_1', password='password123', role='STUDENT')
        self.student_ca = Student.objects.create(
            user=u1,
            crm_student_id='NATYA-CSV-001',
            first_name='Ananya',
            last_name='Nair',
            mobile='+919800001111',
            email='ananya.ca@example.com',
            program_type=self.program,
            sales_section='CAREER_ACADEMY',
            campaign=self.campaign_a,
            lead_status=str(self.stage_new.id),
            is_active=True
        )
        Student.objects.filter(id=self.student_ca.id).update(created_at='2026-03-05 10:00:00+05:30')

        # 2. Regular Lead (Created on 2026-03-05)
        u2 = User.objects.create_user(username='stud_reg_1', password='password123', role='STUDENT')
        self.student_reg = Student.objects.create(
            user=u2,
            crm_student_id='NATYA-CSV-002',
            first_name='Rohan',
            last_name='Mehta',
            mobile='+919800002222',
            email='rohan.reg@example.com',
            program_type=self.program,
            sales_section='REGULAR',
            campaign=self.campaign_b,
            lead_status=str(self.stage_new.id),
            is_active=True
        )
        Student.objects.filter(id=self.student_reg.id).update(created_at='2026-03-05 14:00:00+05:30')

        # 3. Career Academy Lead outside date range (Created on 2026-03-20)
        u3 = User.objects.create_user(username='stud_ca_outside', password='password123', role='STUDENT')
        self.student_ca_late = Student.objects.create(
            user=u3,
            crm_student_id='NATYA-CSV-003',
            first_name='Vikram',
            last_name='Singh',
            mobile='+919800003333',
            email='vikram.late@example.com',
            program_type=self.program,
            sales_section='CAREER_ACADEMY',
            campaign=self.campaign_a,
            lead_status=str(self.stage_new.id),
            is_active=True
        )
        Student.objects.filter(id=self.student_ca_late.id).update(created_at='2026-03-20 09:00:00+05:30')

    def _parse_csv_response(self, response):
        content = response.content.decode('utf-8-sig' if response.content.startswith(b'\xef\xbb\xbf') else 'utf-8')
        reader = csv.reader(io.StringIO(content))
        rows = list(reader)
        header = rows[0] if rows else []
        data_rows = rows[1:] if len(rows) > 1 else []
        return header, data_rows

    def test_export_csv_respects_sales_section_filter(self):
        """Verify export_csv filters strictly by sales_section and excludes non-matching."""
        res = self.client.get('/api/students/export_csv/?sales_section=CAREER_ACADEMY')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res['Content-Type'], 'text/csv')
        self.assertIn('attachment; filename="students.csv"', res['Content-Disposition'])

        header, data_rows = self._parse_csv_response(res)
        self.assertIn('CRM Student ID', header)
        self.assertIn('First Name', header)

        exported_crm_ids = [r[header.index('CRM Student ID')] for r in data_rows]
        self.assertIn('NATYA-CSV-001', exported_crm_ids)
        self.assertIn('NATYA-CSV-003', exported_crm_ids)
        self.assertNotIn('NATYA-CSV-002', exported_crm_ids)

    def test_export_csv_respects_date_range_filter(self):
        """Verify export_csv includes only records within start_date and end_date."""
        res = self.client.get('/api/students/export_csv/?start_date=2026-03-01&end_date=2026-03-10')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        header, data_rows = self._parse_csv_response(res)

        exported_crm_ids = [r[header.index('CRM Student ID')] for r in data_rows]
        self.assertIn('NATYA-CSV-001', exported_crm_ids)
        self.assertIn('NATYA-CSV-002', exported_crm_ids)
        self.assertNotIn('NATYA-CSV-003', exported_crm_ids)  # Created on 2026-03-20

    def test_export_csv_combines_section_and_date_filters(self):
        """Verify combining sales_section and date range produces exact intersection."""
        res = self.client.get('/api/students/export_csv/?sales_section=CAREER_ACADEMY&start_date=2026-03-01&end_date=2026-03-10')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        header, data_rows = self._parse_csv_response(res)

        exported_crm_ids = [r[header.index('CRM Student ID')] for r in data_rows]
        self.assertEqual(len(exported_crm_ids), 1)
        self.assertEqual(exported_crm_ids[0], 'NATYA-CSV-001')

    def test_export_csv_empty_result_returns_headers_only(self):
        """Verify empty-result filter returns valid CSV with header row and zero data rows."""
        res = self.client.get('/api/students/export_csv/?start_date=2020-01-01&end_date=2020-01-02')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        header, data_rows = self._parse_csv_response(res)
        self.assertIn('CRM Student ID', header)
        self.assertEqual(len(data_rows), 0)

    def test_export_leads_csv_respects_active_filters(self):
        """Verify export_leads_csv respects active filters and formats latest notes."""
        res = self.client.get('/api/students/export_leads_csv/?sales_section=REGULAR')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('text/csv', res['Content-Type'])

        header, data_rows = self._parse_csv_response(res)
        self.assertEqual(header, ['Lead ID', 'Lead Name', 'Mobile', 'Email', 'Assigned To', 'Status', 'Date Created', 'Campaign', 'Note'])

        exported_names = [r[header.index('Lead Name')] for r in data_rows]
        self.assertIn('Rohan Mehta', exported_names)
        self.assertNotIn('Ananya Nair', exported_names)
