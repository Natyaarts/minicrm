
from rest_framework import views, permissions, response, status
import pandas as pd
from django.db import transaction as db_transaction
from django.contrib.auth import get_user_model
from .models import Student, Program, SubProgram, Course

User = get_user_model()

from .permissions import DynamicRolePermission

class BulkUploadView(views.APIView):
    permission_classes = [DynamicRolePermission]
    module_name = 'SALES'

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return response.Response({'error': 'No file uploaded'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if file.name.endswith('.csv'):
                df = pd.read_csv(file)
            else:
                df = pd.read_excel(file)
        except Exception as e:
            return response.Response({'error': f'Failed to process file: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

        # Basic Required Columns (Customize based on Template)
        required_cols = ['first_name', 'last_name', 'email', 'mobile', 'program_name']
        missing = [col for col in required_cols if col not in df.columns]
        if missing:
             return response.Response({'error': f'Missing columns: {", ".join(missing)}'}, status=status.HTTP_400_BAD_REQUEST)

        # Fetch campaign if provided
        campaign_id = request.data.get('campaign_id')
        campaign_obj = None
        if campaign_id:
            from crm.models import Campaign
            campaign_obj = Campaign.objects.filter(id=campaign_id).first()

        success_count = 0
        errors = []

        with db_transaction.atomic():
            for index, row in df.iterrows():
                try:
                    # Clean Data
                    mobile = str(row['mobile']).replace('.0', '').strip()
                    email = str(row['email']).strip() if pd.notna(row.get('email')) else None
                    first_name = row['first_name']
                    
                    from crm.services.deduplication import lookup_existing_student, normalize_lead_phone, normalize_lead_email
                    clean_phone = normalize_lead_phone(mobile)
                    clean_em = normalize_lead_email(email)

                    # Check duplicates using centralized deduplication
                    dup_student, dup_reason = lookup_existing_student(mobile=clean_phone or mobile, email=clean_em or email)
                    if dup_student:
                        lms_id = row.get('lms_id') or row.get('wise_id')
                        if lms_id and pd.notna(lms_id):
                            dup_student.lms_student_id = str(lms_id).strip()
                            dup_student.save()
                            success_count += 1
                            continue
                        else:
                            errors.append(f"Row {index+1}: Skipped duplicate lead ({dup_reason})")
                            continue

                    # Resolve Program
                    program_name = row.get('program_name')
                    # Default to NATYA if missing/nan
                    if not program_name or pd.isna(program_name):
                        program = Program.objects.get(name__iexact='NATYA')
                    else:
                        program = Program.objects.filter(name__iexact=program_name).first()
                    
                    if not program:
                         # Fallback to first program if not found? Or Error?
                         # Let's try to find 'NATYA' as a safe default
                         program = Program.objects.filter(name__iexact='NATYA').first()
                         if not program:
                             errors.append(f"Row {index+1}: Program '{program_name}' not found and no default NATYA program")
                             continue

                    # Resolve SubProgram & Course (Optional)
                    sub_program = None
                    if 'sub_program_name' in row and pd.notna(row['sub_program_name']):
                         sub_program = SubProgram.objects.filter(name__iexact=row['sub_program_name'], program=program).first()
                    
                    course = None
                    if 'course_name' in row and pd.notna(row['course_name']):
                        qs = Course.objects.all()
                        if sub_program:
                            qs = qs.filter(sub_program=sub_program)
                        course = qs.filter(name__iexact=row['course_name']).first()

                    # Create User
                    username = clean_em if clean_em else (f"user_{clean_phone}" if clean_phone else f"user_{mobile}")
                    user_email = clean_em if clean_em else (f"{clean_phone}@example.com" if clean_phone else f"{mobile}@example.com")

                    user = User.objects.create_user(username=username, email=user_email)
                    user.set_password('welcome123')
                    user.role = 'STUDENT'
                    user.save()

                    # Generate CRM ID
                    crm_id = Student.generate_next_crm_id()

                    # Create Student
                    lms_id = row.get('lms_id') or row.get('wise_id')
                    lms_student_id = str(lms_id).strip() if lms_id and pd.notna(lms_id) else None

                    Student.objects.create(
                        user=user,
                        crm_student_id=crm_id,
                        first_name=first_name,
                        last_name=row.get('last_name', '') if pd.notna(row.get('last_name')) else '',
                        email=email,
                        mobile=mobile,
                        program_type=program,
                        sub_program=sub_program,
                        course=course,
                        # Map other fields safely
                        dob=row.get('dob', '2000-01-01'), 
                        gender=row.get('gender', 'Female'),
                        perm_address=row.get('perm_address', ''),
                        lms_student_id=lms_student_id,
                        campaign=campaign_obj,
                        is_active=True
                    )
                    success_count += 1
                    
                except Exception as e:
                    errors.append(f"Row {index+1}: {str(e)}")

        return response.Response({
            'success_count': success_count,
            'errors': errors
        })
