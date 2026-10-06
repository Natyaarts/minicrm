import io
import os
import zipfile
from PIL import Image
from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APITestCase
from rest_framework import status

from hrms.models import Department, Designation, EmployeeProfile, EmployeeDocument
from core.validators import (
    validate_employee_document_file,
    validate_profile_photo_file,
    validate_student_document_file,
    validate_receipt_file
)

User = get_user_model()


class DocumentSecurityComprehensiveTests(APITestCase):
    def setUp(self):
        self.dept = Department.objects.create(name="Human Resources")
        self.admin_desig = Designation.objects.create(
            name="HR Admin", department=self.dept, permission_role="ADMIN"
        )
        self.emp_desig = Designation.objects.create(
            name="Software Engineer", department=self.dept, permission_role="EMPLOYEE"
        )

        # Admin user
        self.admin_user = User.objects.create_user(
            username="admin_sec", email="admin_sec@example.com", password="password123", role="ADMIN"
        )
        self.admin_profile = self.admin_user.hrms_profile
        self.admin_profile.employee_id = "ADM-SEC-01"
        self.admin_profile.department = self.dept
        self.admin_profile.designation = self.admin_desig
        self.admin_profile.save()

        # Regular employee 1
        self.emp_user1 = User.objects.create_user(
            username="emp_sec1", email="emp_sec1@example.com", password="password123", role="EMPLOYEE"
        )
        self.emp_profile1 = self.emp_user1.hrms_profile
        self.emp_profile1.employee_id = "EMP-SEC-01"
        self.emp_profile1.department = self.dept
        self.emp_profile1.designation = self.emp_desig
        self.emp_profile1.save()

        # Regular employee 2
        self.emp_user2 = User.objects.create_user(
            username="emp_sec2", email="emp_sec2@example.com", password="password123", role="EMPLOYEE"
        )
        self.emp_profile2 = self.emp_user2.hrms_profile
        self.emp_profile2.employee_id = "EMP-SEC-02"
        self.emp_profile2.department = self.dept
        self.emp_profile2.designation = self.emp_desig
        self.emp_profile2.save()

    def _create_valid_png(self):
        img_io = io.BytesIO()
        im = Image.new('RGB', (50, 50), color='green')
        im.save(img_io, format='PNG')
        return SimpleUploadedFile("valid_document.png", img_io.getvalue(), content_type="image/png")

    def _create_valid_jpeg(self):
        img_io = io.BytesIO()
        im = Image.new('RGB', (50, 50), color='blue')
        im.save(img_io, format='JPEG')
        return SimpleUploadedFile("valid_photo.jpg", img_io.getvalue(), content_type="image/jpeg")

    def _create_valid_pdf(self):
        pdf_data = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
        return SimpleUploadedFile("legitimate_resume.pdf", pdf_data, content_type="application/pdf")

    def _create_valid_docx(self):
        docx_io = io.BytesIO()
        with zipfile.ZipFile(docx_io, 'w') as zf:
            zf.writestr('[Content_Types].xml', '<Types></Types>')
            zf.writestr('word/document.xml', '<document>Legitimate text</document>')
        return SimpleUploadedFile(
            "contract.docx",
            docx_io.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )

    # -------------------------------------------------------------
    # TEST A: Valid allowed document upload -> succeeds
    # -------------------------------------------------------------
    def test_valid_pdf_upload_succeeds(self):
        self.client.force_authenticate(user=self.admin_user)
        pdf_file = self._create_valid_pdf()
        res = self.client.post('/api/hrms/documents/', {
            'employee': self.emp_profile1.id,
            'document_type': 'Resume',
            'file': pdf_file
        }, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(EmployeeDocument.objects.filter(employee=self.emp_profile1, document_type='Resume').exists())

    def test_valid_png_upload_succeeds(self):
        self.client.force_authenticate(user=self.admin_user)
        png_file = self._create_valid_png()
        res = self.client.post('/api/hrms/documents/', {
            'employee': self.emp_profile1.id,
            'document_type': 'ID Proof',
            'file': png_file
        }, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_valid_jpeg_upload_succeeds(self):
        self.client.force_authenticate(user=self.admin_user)
        jpeg_file = self._create_valid_jpeg()
        res = self.client.post('/api/hrms/documents/', {
            'employee': self.emp_profile1.id,
            'document_type': 'Passport Photo',
            'file': jpeg_file
        }, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_valid_docx_upload_succeeds(self):
        self.client.force_authenticate(user=self.admin_user)
        docx_file = self._create_valid_docx()
        res = self.client.post('/api/hrms/documents/', {
            'employee': self.emp_profile1.id,
            'document_type': 'Offer Letter',
            'file': docx_file
        }, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    # -------------------------------------------------------------
    # TEST B: Direct SVG upload -> rejected with HTTP 400
    # -------------------------------------------------------------
    def test_direct_svg_upload_rejected(self):
        self.client.force_authenticate(user=self.admin_user)
        svg_content = b'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40"/></svg>'
        svg_file = SimpleUploadedFile("diagram.svg", svg_content, content_type="image/svg+xml")

        res = self.client.post('/api/hrms/documents/', {
            'employee': self.emp_profile1.id,
            'document_type': 'ID Proof',
            'file': svg_file
        }, format='multipart')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('file', res.data)
        error_msg = str(res.data['file'])
        self.assertTrue("SVG" in error_msg or "prohibited" in error_msg.lower())
        self.assertFalse(EmployeeDocument.objects.filter(employee=self.emp_profile1, document_type='ID Proof').exists())

    # -------------------------------------------------------------
    # TEST C: Misleading filename extension -> backend validates content
    # -------------------------------------------------------------
    def test_misleading_extension_svg_as_png_rejected(self):
        self.client.force_authenticate(user=self.admin_user)
        svg_content = b'<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'
        fake_png = SimpleUploadedFile("innocent.png", svg_content, content_type="image/png")

        res = self.client.post('/api/hrms/documents/', {
            'employee': self.emp_profile1.id,
            'document_type': 'ID Proof',
            'file': fake_png
        }, format='multipart')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('file', res.data)
        self.assertFalse(EmployeeDocument.objects.filter(employee=self.emp_profile1, document_type='ID Proof').exists())

    def test_misleading_extension_svg_as_pdf_rejected(self):
        self.client.force_authenticate(user=self.admin_user)
        svg_content = b'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><text>SVG Payload</text></svg>'
        fake_pdf = SimpleUploadedFile("resume.pdf", svg_content, content_type="application/pdf")

        res = self.client.post('/api/hrms/documents/', {
            'employee': self.emp_profile1.id,
            'document_type': 'Resume',
            'file': fake_pdf
        }, format='multipart')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('file', res.data)

    def test_corrupted_fake_content_rejected(self):
        self.client.force_authenticate(user=self.admin_user)
        garbage_content = b'Some random non-binary text that claims to be a PDF'
        fake_pdf = SimpleUploadedFile("fake.pdf", garbage_content, content_type="application/pdf")

        res = self.client.post('/api/hrms/documents/', {
            'employee': self.emp_profile1.id,
            'document_type': 'Resume',
            'file': fake_pdf
        }, format='multipart')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    # -------------------------------------------------------------
    # TEST D: Malicious SVG containing <script> or event handlers -> rejected
    # -------------------------------------------------------------
    def test_malicious_svg_with_script_tag_rejected(self):
        self.client.force_authenticate(user=self.admin_user)
        payload = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>'
        malicious_file = SimpleUploadedFile("xss_test.svg", payload, content_type="image/svg+xml")

        res = self.client.post('/api/hrms/documents/', {
            'employee': self.emp_profile1.id,
            'document_type': 'Resume',
            'file': malicious_file
        }, format='multipart')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('file', res.data)

    def test_malicious_svg_with_onload_event_handler_rejected(self):
        self.client.force_authenticate(user=self.admin_user)
        payload = b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(\'XSS\')"><rect width="100" height="100"/></svg>'
        malicious_file = SimpleUploadedFile("onload_xss.svg", payload, content_type="image/svg+xml")

        res = self.client.post('/api/hrms/documents/', {
            'employee': self.emp_profile1.id,
            'document_type': 'Resume',
            'file': malicious_file
        }, format='multipart')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('file', res.data)

    def test_malicious_svg_with_onerror_and_disguised_png_extension(self):
        self.client.force_authenticate(user=self.admin_user)
        payload = b'<svg><image href="x" onerror="alert(document.domain)"/></svg>'
        malicious_file = SimpleUploadedFile("avatar.png", payload, content_type="image/png")

        res = self.client.post('/api/hrms/documents/', {
            'employee': self.emp_profile1.id,
            'document_type': 'Profile',
            'file': malicious_file
        }, format='multipart')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('file', res.data)

    # -------------------------------------------------------------
    # TEST E: Media serving security & sandbox headers
    # -------------------------------------------------------------
    def test_safe_media_serving_headers(self):
        pdf_file = self._create_valid_pdf()
        doc = EmployeeDocument.objects.create(
            employee=self.emp_profile1,
            document_type="Contract",
            file=pdf_file
        )
        file_url = doc.file.url
        # Test requesting the media endpoint
        res = self.client.get(file_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Verify security headers
        self.assertEqual(res.headers.get('X-Content-Type-Options'), 'nosniff')
        self.assertIn("default-src 'none'", res.headers.get('Content-Security-Policy', ''))
        self.assertIn("sandbox", res.headers.get('Content-Security-Policy', ''))
        self.assertEqual(res.headers.get('X-Frame-Options'), 'DENY')

    # -------------------------------------------------------------
    # TEST F: Authorization controls on document upload
    # -------------------------------------------------------------
    def test_regular_employee_cannot_upload_for_other_employee(self):
        self.client.force_authenticate(user=self.emp_user1)
        pdf_file = self._create_valid_pdf()
        res = self.client.post('/api/hrms/documents/', {
            'employee': self.emp_profile2.id, # Target employee 2 while logged in as employee 1
            'document_type': 'Resume',
            'file': pdf_file
        }, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_regular_employee_can_upload_for_themselves(self):
        self.client.force_authenticate(user=self.emp_user1)
        pdf_file = self._create_valid_pdf()
        res = self.client.post('/api/hrms/documents/', {
            'employee': self.emp_profile1.id,
            'document_type': 'My Resume',
            'file': pdf_file
        }, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
