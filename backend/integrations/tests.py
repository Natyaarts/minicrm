from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from core.models import Student, Batch, Course, Program, SubProgram
from crm.models import PipelineStage
from crm.utils import get_canonical_converted_stage_id, get_canonical_converted_stage

User = get_user_model()


class WiseIntegrationSyncTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Admin User
        self.admin = User.objects.create_user(
            username='wise_admin',
            password='password123',
            email='admin@example.com',
            role='SUPER_ADMIN'
        )
        self.client.force_authenticate(user=self.admin)

        # Standard Student User for authorization checks
        self.student_user = User.objects.create_user(
            username='regular_student',
            password='password123',
            email='student@example.com',
            role='STUDENT'
        )

        # Ensure canonical Converted stage exists for standard tests
        self.stage_converted = PipelineStage.objects.create(name='Converted', order=4)

    @patch('integrations.views.WiseService')
    def test_create_new_student_with_valid_name(self, mock_wise_service):
        """1. Creating a new student with a valid participant name."""
        mock_wise = MagicMock()
        mock_wise_service.return_value = mock_wise
        mock_wise.get_course_details.return_value = {
            'name': 'Wise Kathak Beginners',
            'subject': 'Classical Dance'
        }
        mock_wise.get_class_participants.return_value = [
            {
                '_id': 'wise_p_101',
                'name': 'Aarav Sharma',
                'phoneNumber': '9876543210',
                'email': 'aarav.sharma@example.com'
            }
        ]

        res = self.client.post('/api/integrations/sync-batch/', {'class_id': 'wise_class_101'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data.get('success'))
        self.assertEqual(res.data['stats']['new'], 1)

        student = Student.objects.get(crm_student_id='WISE-9876543210')
        self.assertEqual(student.first_name, 'Aarav')
        self.assertEqual(student.last_name, 'Sharma')
        self.assertEqual(student.mobile, '+919876543210')
        self.assertEqual(student.lead_status, str(self.stage_converted.id))
        self.assertEqual(student.batch.name, 'Wise Kathak Beginners')

    @patch('integrations.views.WiseService')
    def test_create_new_student_with_empty_or_email_name(self, mock_wise_service):
        """2. Creating a new student with an empty or email-like name falls back to 'Wise Student'."""
        mock_wise = MagicMock()
        mock_wise_service.return_value = mock_wise
        mock_wise.get_course_details.return_value = {'name': 'Wise Vocal Class', 'subject': 'Music'}
        mock_wise.get_class_participants.return_value = [
            {
                '_id': 'wise_p_empty',
                'name': '',
                'phoneNumber': '9876543211',
                'email': 'blank@example.com'
            },
            {
                '_id': 'wise_p_email',
                'name': 'emailuser@example.com',
                'phoneNumber': '9876543212',
                'email': 'emailuser@example.com'
            }
        ]

        res = self.client.post('/api/integrations/sync-batch/', {'class_id': 'wise_class_102'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['stats']['new'], 2)

        s_empty = Student.objects.get(crm_student_id='WISE-9876543211')
        self.assertEqual(s_empty.first_name, 'Wise')
        self.assertEqual(s_empty.last_name, 'Student')

        s_email = Student.objects.get(crm_student_id='WISE-9876543212')
        self.assertEqual(s_email.first_name, 'Wise')
        self.assertEqual(s_email.last_name, 'Student')

    @patch('integrations.views.WiseService')
    def test_update_existing_student_with_empty_or_email_name(self, mock_wise_service):
        """3. Updating an existing student whose first or last name is empty or email-like."""
        program, _ = Program.objects.get_or_create(name="Existing Program")
        user = User.objects.create_user(username='existing_user_3', password='password123', role='STUDENT')
        existing_student = Student.objects.create(
            user=user,
            crm_student_id='WISE-9876543213',
            mobile='+919876543213',
            first_name='user3@example.com',  # email-like name that needs fixing
            last_name='',
            program_type=program,
            lead_status='NEW'
        )

        mock_wise = MagicMock()
        mock_wise_service.return_value = mock_wise
        mock_wise.get_course_details.return_value = {'name': 'Wise Tabla Class', 'subject': 'Percussion'}
        mock_wise.get_class_participants.return_value = [
            {
                '_id': 'wise_p_103',
                'name': 'Vikram Malhotra',
                'phoneNumber': '9876543213',
                'email': 'vikram@example.com'
            }
        ]

        res = self.client.post('/api/integrations/sync-batch/', {'class_id': 'wise_class_103'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['stats']['synced'], 1)
        self.assertEqual(res.data['stats']['new'], 0)

        existing_student.refresh_from_db()
        self.assertEqual(existing_student.first_name, 'Vikram')
        self.assertEqual(existing_student.last_name, 'Malhotra')
        self.assertEqual(existing_student.lead_status, str(self.stage_converted.id))

    @patch('integrations.views.WiseService')
    def test_new_participant_followed_by_existing_participant_missing_name_scoping(self, mock_wise_service):
        """
        4. Processing a new participant followed by an existing participant with a missing name,
        ensuring names are never copied across records (verifies variable scoping fix).
        """
        program, _ = Program.objects.get_or_create(name="Existing Program")
        u_exist = User.objects.create_user(username='existing_u_4', password='password123', role='STUDENT')
        existing_student = Student.objects.create(
            user=u_exist,
            crm_student_id='WISE-9876543215',
            mobile='+919876543215',
            first_name='',
            last_name='',
            program_type=program,
            lead_status='NEW'
        )

        mock_wise = MagicMock()
        mock_wise_service.return_value = mock_wise
        mock_wise.get_course_details.return_value = {'name': 'Wise Sitar Class', 'subject': 'Strings'}
        # Participant 1 is new with name 'Priya Patel'
        # Participant 2 is existing with empty name
        mock_wise.get_class_participants.return_value = [
            {
                '_id': 'wise_p_new_1',
                'name': 'Priya Patel',
                'phoneNumber': '9876543214',
                'email': 'priya.patel@example.com'
            },
            {
                '_id': 'wise_p_exist_2',
                'name': '',
                'phoneNumber': '9876543215',
                'email': 'existing@example.com'
            }
        ]

        res = self.client.post('/api/integrations/sync-batch/', {'class_id': 'wise_class_104'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['stats']['new'], 1)
        self.assertEqual(res.data['stats']['synced'], 1)

        # Verify new participant received 'Priya Patel'
        new_student = Student.objects.get(crm_student_id='WISE-9876543214')
        self.assertEqual(new_student.first_name, 'Priya')
        self.assertEqual(new_student.last_name, 'Patel')

        # Verify existing student was updated with fallback 'Wise Student', NOT 'Priya Patel'
        existing_student.refresh_from_db()
        self.assertEqual(existing_student.first_name, 'Wise')
        self.assertEqual(existing_student.last_name, 'Student')
        self.assertEqual(existing_student.lead_status, str(self.stage_converted.id))

    @patch('integrations.views.WiseService')
    def test_repeated_imports_are_idempotent(self, mock_wise_service):
        """5. Repeated imports of the same batch do not create duplicate students or batches."""
        mock_wise = MagicMock()
        mock_wise_service.return_value = mock_wise
        mock_wise.get_course_details.return_value = {'name': 'Wise Bharatnatyam', 'subject': 'Dance'}
        mock_wise.get_class_participants.return_value = [
            {
                '_id': 'wise_p_repeat_1',
                'name': 'Ananya Iyer',
                'phoneNumber': '9876543216',
                'email': 'ananya@example.com'
            }
        ]

        # First import
        res1 = self.client.post('/api/integrations/sync-batch/', {'class_id': 'wise_class_repeat'}, format='json')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertEqual(res1.data['stats']['new'], 1)
        self.assertEqual(res1.data['stats']['synced'], 0)

        total_batches_after_first = Batch.objects.filter(lms_batch_id='wise_class_repeat').count()
        total_students_after_first = Student.objects.filter(crm_student_id='WISE-9876543216').count()
        self.assertEqual(total_batches_after_first, 1)
        self.assertEqual(total_students_after_first, 1)

        # Second import (repeat)
        res2 = self.client.post('/api/integrations/sync-batch/', {'class_id': 'wise_class_repeat'}, format='json')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data['stats']['new'], 0)
        self.assertEqual(res2.data['stats']['synced'], 1)

        total_batches_after_second = Batch.objects.filter(lms_batch_id='wise_class_repeat').count()
        total_students_after_second = Student.objects.filter(crm_student_id='WISE-9876543216').count()
        self.assertEqual(total_batches_after_second, 1)
        self.assertEqual(total_students_after_second, 1)

    def test_converted_stage_fallback_when_only_enrolled_stage_exists(self):
        """6a. Fallback behavior: when only 'Enrolled' stage exists, it renames to 'Converted'."""
        PipelineStage.objects.all().delete()
        enrolled_stage = PipelineStage.objects.create(name='Enrolled', order=2)

        stage_id = get_canonical_converted_stage_id()
        self.assertEqual(stage_id, str(enrolled_stage.id))

        enrolled_stage.refresh_from_db()
        self.assertEqual(enrolled_stage.name, 'Converted')

    def test_converted_stage_fallback_when_no_stages_exist(self):
        """6b. Fallback behavior: when no PipelineStage exists, it creates 'Converted' dynamically."""
        PipelineStage.objects.all().delete()
        self.assertEqual(PipelineStage.objects.count(), 0)

        stage_id = get_canonical_converted_stage_id()
        self.assertTrue(stage_id.isdigit())

        created_stage = PipelineStage.objects.get(id=int(stage_id))
        self.assertEqual(created_stage.name, 'Converted')
        self.assertEqual(created_stage.order, 4)

    @patch('integrations.views.WiseService')
    def test_wise_class_students_view_permissions_and_response(self, mock_wise_service):
        """7. WiseClassStudentsView checks role permissions and returns participants."""
        mock_wise = MagicMock()
        mock_wise_service.return_value = mock_wise
        mock_wise.get_class_participants.return_value = [
            {'_id': 'p1', 'name': 'Student One'},
            {'_id': 'p2', 'name': 'Student Two'}
        ]

        # Admin access -> 200 OK
        res_admin = self.client.get('/api/integrations/courses/class_999/participants/')
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_admin.data), 2)

        # Student user access -> 403 Forbidden
        self.client.force_authenticate(user=self.student_user)
        res_student = self.client.get('/api/integrations/courses/class_999/participants/')
        self.assertEqual(res_student.status_code, status.HTTP_403_FORBIDDEN)
