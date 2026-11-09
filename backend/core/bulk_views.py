
import logging
from rest_framework import views, permissions, response, status
import pandas as pd
from django.db import transaction as db_transaction
from django.contrib.auth import get_user_model
from .models import Student, Program, SubProgram, Course

logger = logging.getLogger(__name__)

User = get_user_model()

from .permissions import DynamicRolePermission

from django.core.exceptions import ValidationError
from .validators import validate_spreadsheet_file

class BulkUploadView(views.APIView):
    permission_classes = [DynamicRolePermission]
    module_name = 'SALES'

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return response.Response({'error': 'No file uploaded'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_spreadsheet_file(file)
            if file.name.endswith('.csv'):
                df = pd.read_csv(file)
            else:
                df = pd.read_excel(file)
        except ValidationError as ve:
            return response.Response({'error': ve.messages if hasattr(ve, 'messages') else str(ve)}, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            logger.error(f"Bulk spreadsheet parsing error: {e}")
            return response.Response({'error': 'Failed to process spreadsheet file. Please check file format and encoding.'}, status=status.HTTP_400_BAD_REQUEST)

        # Normalize column names for flexible matching while keeping original columns accessible
        col_map = {str(c).strip().lower(): c for c in df.columns}
        has_name_col = any(k in col_map for k in ('first_name', 'first name', 'name', 'full_name', 'full name', 'student_name', 'student name'))
        has_contact_col = any(k in col_map for k in ('mobile', 'contact', 'phone', 'phone_number', 'mobile_number', 'contact_number', 'whatsapp'))
        has_email_col = any(k in col_map for k in ('email', 'email_address', 'mail'))

        if not has_name_col and not has_contact_col and not has_email_col:
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
        duplicate_count = 0
        errors = []

        def _get_val(row_obj, *keys, default=''):
            for k in keys:
                actual_col = col_map.get(k)
                if actual_col is not None and actual_col in row_obj:
                    val = row_obj[actual_col]
                    if pd.notna(val) and str(val).strip() != '':
                        return str(val).strip()
            return default

        with db_transaction.atomic():
            for index, row in df.iterrows():
                try:
                    raw_mobile = _get_val(row, 'mobile', 'contact', 'phone', 'phone_number', 'mobile_number', 'contact_number', 'whatsapp')
                    if raw_mobile.endswith('.0'):
                        raw_mobile = raw_mobile[:-2].strip()
                    mobile = raw_mobile
                    email_str = _get_val(row, 'email', 'email_address', 'mail')
                    email = email_str if email_str else None

                    raw_first = _get_val(row, 'first_name', 'first name')
                    raw_last = _get_val(row, 'last_name', 'last name', 'lastname', 'surname')
                    if raw_first:
                        first_name = raw_first
                        last_name = raw_last
                    else:
                        full_name = _get_val(row, 'name', 'full_name', 'full name', 'student_name', 'student name')
                        parts = full_name.split(' ', 1) if full_name else ['']
                        first_name = parts[0] if parts[0] else 'Unknown'
                        last_name = parts[1] if len(parts) > 1 else raw_last

                    from crm.services.deduplication import lookup_existing_student, normalize_lead_phone, normalize_lead_email
                    clean_phone = normalize_lead_phone(mobile)
                    clean_em = normalize_lead_email(email)

                    if not first_name and not clean_phone and not clean_em:
                        continue

                    dob_val = _get_val(row, 'dob', default='2000-01-01') or '2000-01-01'
                    gender_val = _get_val(row, 'gender', default='Female') or 'Female'
                    perm_address_val = _get_val(row, 'perm_address', 'address', default='')
                    perm_city_val = _get_val(row, 'perm_city', 'place', 'city', default='')

                    # Check duplicates using centralized deduplication
                    dup_student, dup_reason = lookup_existing_student(mobile=clean_phone or mobile, email=clean_em or email)
                    if dup_student:
                        lms_id = _get_val(row, 'lms_id', 'wise_id')
                        if lms_id:
                            dup_student.lms_student_id = lms_id
                            dup_student.save()
                            success_count += 1
                            continue
                        else:
                            # Resolve Program
                            program_name = _get_val(row, 'program_name')
                            if not program_name:
                                program = Program.objects.filter(name__iexact='NATYA').first() or Program.objects.first()
                            else:
                                program = Program.objects.filter(name__iexact=program_name).first()
                            if not program:
                                program = Program.objects.filter(name__iexact='NATYA').first() or Program.objects.first()

                            sub_program = None
                            sub_prog_name = _get_val(row, 'sub_program_name')
                            if sub_prog_name and program:
                                sub_program = SubProgram.objects.filter(name__iexact=sub_prog_name, program=program).first()

                            course = None
                            course_name_val = _get_val(row, 'course_name')
                            if course_name_val:
                                qs = Course.objects.all()
                                if sub_program:
                                    qs = qs.filter(sub_program=sub_program)
                                course = qs.filter(name__iexact=course_name_val).first()

                            from crm.services.deduplication import create_duplicate_lead
                            create_duplicate_lead(
                                existing_student=dup_student,
                                first_name=first_name,
                                last_name=last_name,
                                mobile=clean_phone or mobile,
                                email=clean_em or email,
                                campaign=campaign_obj,
                                program=program,
                                sales_section=campaign_obj.section if campaign_obj else 'BOTH',
                                duplicate_reason=dup_reason,
                                extra_fields={
                                    'sub_program': sub_program,
                                    'course': course,
                                    'dob': dob_val,
                                    'gender': gender_val,
                                    'perm_address': perm_address_val,
                                    'perm_city': perm_city_val,
                                },
                                log_reengagement=False
                            )
                            success_count += 1
                            duplicate_count += 1
                            continue


                    # Resolve Program
                    program_name = _get_val(row, 'program_name')
                    # Default to NATYA if missing/nan
                    if not program_name:
                        program = Program.objects.filter(name__iexact='NATYA').first() or Program.objects.first()
                    else:
                        program = Program.objects.filter(name__iexact=program_name).first()
                    
                    if not program:
                         program = Program.objects.filter(name__iexact='NATYA').first() or Program.objects.first()
                         if not program:
                             errors.append(f"Row {index+1}: Program '{program_name}' not found and no default NATYA program")
                             continue

                    # Resolve SubProgram & Course (Optional)
                    sub_program = None
                    sub_prog_name = _get_val(row, 'sub_program_name')
                    if sub_prog_name:
                         sub_program = SubProgram.objects.filter(name__iexact=sub_prog_name, program=program).first()
                    
                    course = None
                    course_name_val = _get_val(row, 'course_name')
                    if course_name_val:
                        qs = Course.objects.all()
                        if sub_program:
                            qs = qs.filter(sub_program=sub_program)
                        course = qs.filter(name__iexact=course_name_val).first()

                    # Create User
                    import uuid
                    import re
                    base_username = clean_em if clean_em else (f"user_{clean_phone}" if clean_phone else f"user_{mobile or first_name}")
                    username = re.sub(r'[^\w@+\.-]', '_', f"{base_username}_{uuid.uuid4().hex[:6]}")
                    user_email = clean_em if clean_em else (f"{clean_phone}@example.com" if clean_phone else f"lead_{uuid.uuid4().hex[:6]}@example.com")

                    user = User.objects.create_user(username=username, email=user_email)
                    user.set_password('welcome123')
                    user.role = 'STUDENT'
                    user.save()

                    # Generate CRM ID
                    crm_id = Student.generate_next_crm_id()

                    # Create Student
                    lms_id = _get_val(row, 'lms_id', 'wise_id')
                    lms_student_id = lms_id if lms_id else None

                    from crm.utils import get_canonical_new_lead_stage_id
                    Student.objects.create(
                        user=user,
                        crm_student_id=crm_id,
                        first_name=first_name,
                        last_name=last_name,
                        email=clean_em or email,
                        mobile=clean_phone or mobile,
                        program_type=program,
                        sub_program=sub_program,
                        course=course,
                        dob=dob_val, 
                        gender=gender_val,
                        perm_address=perm_address_val,
                        perm_city=perm_city_val,
                        lms_student_id=lms_student_id,
                        campaign=campaign_obj,
                        sales_section=campaign_obj.section if campaign_obj else 'BOTH',
                        lead_status=get_canonical_new_lead_stage_id(),
                        is_active=True
                    )
                    success_count += 1
                    
                except ValidationError as ve:
                    errors.append(f"Row {index+1}: {ve.messages if hasattr(ve, 'messages') else str(ve)}")
                except Exception as e:
                    logger.error(f"Bulk row import error at row {index+1}: {e}")
                    errors.append(f"Row {index+1}: Invalid row data or duplicate record.")

        return response.Response({
            'success_count': success_count,
            'duplicate_count': duplicate_count,
            'added_count': success_count - duplicate_count,
            'errors': errors
        })
