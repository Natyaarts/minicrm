
from rest_framework import views, response, permissions
from core.models import Student
from .utils import WiseService
from .models import IntegrationSetting
from .serializers import IntegrationSettingSerializer
import random
import razorpay
from django.db import models

class LMSProxyView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        student_id = request.query_params.get('student_id')
        
        try:
            if student_id:
                # If querying specific student, check permissions
                student = Student.objects.get(id=student_id)
                # Ensure requester is Admin or their Mentor
                if request.user.role not in ['ADMIN', 'SUPER_ADMIN']:
                    # Check if Mentor mentors this student
                    is_mentor = False
                    if student.batch:
                        if student.batch.primary_mentor == request.user or student.batch.secondary_mentors.filter(id=request.user.id).exists():
                            is_mentor = True
                    if not is_mentor:
                         return response.Response({"error": "Permission denied"}, status=403)
            else:
                student = request.user.student_profile
        except (Student.DoesNotExist, AttributeError):
             return response.Response({"error": "Student profile not found"}, status=404)

        # Initialize Wise Service
        wise = WiseService()
        
        # If we have an LMS ID, try to fetch real data
        # If we have an LMS ID, try to fetch real data
        if student.lms_student_id and wise.api_key:
            real_data = wise.get_student_details(student.lms_student_id)
            reports = wise.get_student_reports(student.lms_student_id)
            registration = wise.get_registration_data(student.lms_student_id)
            
            if real_data and 'summary' in real_data:
                # Map Wise data to our CRM response format
                summary_list = real_data.get('summary', [])
                summary = summary_list[0] if summary_list else {}
                
                class_summary_list = real_data.get('classWiseStudentSummary', [])
                class_summary = class_summary_list[0] if class_summary_list else {}
                
                currency = summary.get('currency', 'INR')
                
                # Values are in Paisa (1/100 INR), need to divide by 100
                total_remaining = summary.get('totalRemaining', {}).get('value', 0) / 100
                paid_fee = summary.get('totalPaid', {}).get('value', 0) / 100
                due_fee = summary.get('totalDue', {}).get('value', 0) / 100
                
                total_fee = paid_fee + due_fee
                if total_remaining > total_fee:
                     total_fee = total_remaining
                
                next_due_date = class_summary.get('earliestDueDate')
                if not next_due_date:
                    next_due_date = 'N/A'
                
                attendance_val = class_summary.get('joinedRequest', 0)

                # Fetch all enrolled courses from classWiseStudentSummary
                enrolled_courses = []
                for cs in class_summary_list:
                    enrolled_courses.append({
                        "id": cs.get('classId'),
                        "name": cs.get('className') or cs.get('title') or cs.get('subject') or cs.get('name') or str(list(cs.keys())),
                        "status": cs.get('status', 'Active'),
                        "attendance": cs.get('joinedRequest', 0),
                        "due_date": cs.get('earliestDueDate', 'N/A')
                    })

                # Progress from reports if available
                progress = 0
                if reports and isinstance(reports, dict) and 'data' in reports:
                    progress = reports.get('data', {}).get('overallProgress', 0)
                
                # Activities from registration or summary
                activities = []
                if registration and 'activities' in registration:
                    activities = registration.get('activities', [])
                elif class_summary.get('lastJoinedAt'):
                    activities.append({
                        "activity": "Joined Live Session",
                        "date": class_summary.get('lastJoinedAt')
                    })
                
                return response.Response({
                    "lms_student_id": student.lms_student_id,
                    "course_progress": progress,
                    "attendance": attendance_val, 
                    "enrolled_courses": enrolled_courses,
                    "fee_details": {
                        "total_fee": total_fee,
                        "paid_fee": paid_fee,
                        "due_fee": due_fee,
                        "currency": currency,
                        "next_due_date": next_due_date
                    },
                    "recent_activities": activities,
                    "registration_data": registration,
                    "error_message": None
                })
        
        # Fallback if API fails or no data
        return response.Response({
            "lms_student_id": student.lms_student_id,
            "course_progress": 0,
            "attendance": 0,
            "fee_details": {
                "total_fee": 0,
                "paid_fee": 0,
                "due_fee": 0,
                "currency": "INR",
                "next_due_date": "N/A"
            },
            "recent_activities": [],
            "error_message": "Could not fetch live data from Wise LMS. Integration pending correct endpoint."
        })

class LinkWiseView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        student_id = request.data.get('student_id')
        
        try:
            student = Student.objects.get(id=student_id)
            # Ensure requester is Admin or their Mentor
            if request.user.role not in ['ADMIN', 'SUPER_ADMIN']:
                if request.user.role == 'MENTOR':
                    # Check if they are assigned to this student
                    is_assigned = False
                    if student.batch:
                        if student.batch.primary_mentor == request.user or student.batch.secondary_mentors.filter(pk=request.user.pk).exists():
                            is_assigned = True
                    
                    if not is_assigned:
                        return response.Response({"error": "Permission denied: You do not mentor this student"}, status=403)
                else:
                    return response.Response({"error": "Permission denied"}, status=403)
                
            wise = WiseService()
            if not wise.api_key:
                return response.Response({"error": "Wise API not configured"}, status=503)
            
            # Search by phone
            phone = student.mobile
            if not phone:
                return response.Response({"error": "Student has no mobile number for lookup"}, status=400)
            
            print(f"LinkWise: Searching for phone {phone}")
            wise_user = wise.search_student_by_phone(phone)
            
            if wise_user:
                # Found! Link it
                wise_uuid = wise_user.get('_id') or wise_user.get('id')
                student.lms_student_id = wise_uuid
                student.save()
                
                # Format name safely
                fname = wise_user.get('first_name', '')
                lname = wise_user.get('last_name', '')
                name = f"{fname} {lname}".strip() or wise_user.get('name', 'Unknown')
                
                return response.Response({
                    "success": True, 
                    "message": f"Successfully linked to {name}!", 
                    "wise_data": wise_user
                })
            else:
                return response.Response({
                    "success": False,
                    "error": "Student not found in Wise LMS with this phone number."
                }, status=404)

        except Student.DoesNotExist:
            return response.Response({"error": "Student not found"}, status=404)
        except Exception as e:
            return response.Response({"error": str(e)}, status=500)

class SyncWiseStudentsView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not request.user or not request.user.is_authenticated or request.user.role not in ['ADMIN', 'SUPER_ADMIN']:
            return response.Response({"error": "Permission denied"}, status=403)
            
        wise = WiseService()
        if not wise.api_key:
            return response.Response({"error": "Wise API not configured"}, status=503)
            
        import threading
        from django.db import connection

        def run_sync():
            try:
                from core.models import Program, Student
                from django.contrib.auth import get_user_model
                from django.db import transaction
                User = get_user_model()
                
                # Ensure a default program exists for imports
                fallback_program, _ = Program.objects.get_or_create(name="Wise Import", defaults={"slug": "wise-import"})
                
                stats = {"scanned": 0, "created": 0, "linked": 0, "updated": 0, "errors": 0}
                
                # OPTIMIZATION: Load existing data once
                crm_students = {}
                for s in Student.objects.all():
                    if s.mobile:
                        crm_students[str(s.mobile).replace(" ", "")[-10:]] = s
                
                existing_usernames = set(User.objects.values_list('username', flat=True))
                
                for wise_student in wise.get_all_students():
                    stats["scanned"] += 1
                    
                    try:
                        with transaction.atomic():
                            # Extract Data
                            wise_id = wise_student.get('_id') or wise_student.get('id')
                            raw_mobile = wise_student.get('phoneNumber') or wise_student.get('mobile') or ''
                            mobile = str(raw_mobile).replace(" ", "")
                            
                            if not mobile or len(mobile) < 10:
                                continue
                                
                            mobile_suffix = mobile[-10:]
                            email = wise_student.get('email') or wise_student.get('emailAddress')
                            fname = wise_student.get('first_name')
                            lname = wise_student.get('last_name')
                            
                            # Improved Name Parsing: Avoid using email as name
                            if not fname and not lname:
                                full_name = wise_student.get('name', '').strip()
                                if full_name and "@" not in full_name:
                                    parts = full_name.split(' ', 1)
                                    fname = parts[0]
                                    lname = parts[1] if len(parts) > 1 else ''
                                else:
                                    # If name is email or empty, leave as None to use defaults
                                    fname = None
                                    lname = None

                            # Memory Lookup instead of DB Query
                            student = crm_students.get(mobile_suffix)
                            
                            if student:
                                changed = False
                                if student.lms_student_id != wise_id:
                                    student.lms_student_id = wise_id
                                    changed = True
                                    stats["linked"] += 1
                                
                                if email and student.email != email:
                                    student.email = email
                                    changed = True
                                
                                # FORCE Update names if they are currently blank or email-like
                                current_fname = (student.first_name or '').strip()
                                current_lname = (student.last_name or '').strip()
                                
                                # If current name is empty or contains @, try to update it
                                if not current_fname or "@" in current_fname:
                                    student.first_name = fname or "Wise"
                                    changed = True
                                if not current_lname or "@" in current_lname:
                                    student.last_name = lname or "Student"
                                    changed = True
                                    
                                if changed:
                                    student.save()
                                    stats["updated"] += 1
                            else:
                                # New Student creation
                                username = f"wise_{mobile_suffix}"
                                if username in existing_usernames:
                                    import uuid
                                    username = f"wise_{mobile_suffix}_{str(uuid.uuid4())[:4]}"
                                    
                                user = User.objects.create_user(
                                    username=username,
                                    email=email or f"{username}@example.com",
                                    password="Changeme@123",
                                    role='STUDENT',
                                    first_name=fname or "Wise",
                                    last_name=lname or "Student"
                                )
                                existing_usernames.add(username)
                                
                                new_student = Student.objects.create(
                                    user=user,
                                    crm_student_id=f"WISE-{mobile_suffix}",
                                    first_name=fname or "Wise",
                                    last_name=lname or "Student",
                                    mobile=mobile,
                                    email=email,
                                    lms_student_id=wise_id,
                                    program_type=fallback_program
                                )
                                crm_students[mobile_suffix] = new_student
                                stats["created"] += 1
                    except Exception as e:
                        print(f"Sync error for student: {e}")
                        stats["errors"] += 1
                
                print(f"Background Sync Finished: {stats}")
            except Exception as e:
                print(f"Background Sync Fatal Error: {e}")
            finally:
                connection.close()

        thread = threading.Thread(target=run_sync)
        thread.daemon = True
        thread.start()
            
        return response.Response({
            "success": True,
            "message": "Full student synchronization has been started in the background. It will process all records from Wise LMS.",
            "stats": {"scanned": "In progress..."}
        })

class WiseCourseListView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role not in ['ADMIN', 'SUPER_ADMIN', 'ACADEMIC', 'MENTOR']:
            return response.Response({"error": "Permission denied"}, status=403)
            
        class_type = request.query_params.get('type', 'LIVE')
        wise = WiseService()
        courses = wise.get_all_courses(class_type=class_type)
        
        # Normalize for frontend expectations
        normalized = []
        for c in courses:
            normalized.append({
                "id": c.get('_id') or c.get('id'),
                "name": c.get('name') or c.get('title'),
                "sessionsCount": c.get('studentCount', 0), # Using studentCount as a fallback label
                "type": c.get('classType', 'LIVE'),
                "fee": c.get('feesAdded', False)
            })
            
        return response.Response(normalized)

class WiseClassStudentsView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, class_id):
        if request.user.role not in ['ADMIN', 'SUPER_ADMIN', 'ACADEMIC', 'MENTOR']:
            return response.Response({"error": "Permission denied"}, status=403)
            
        wise = WiseService()
        participants = wise.get_class_participants(class_id)
        return response.Response(participants)

class SyncWiseBatchView(views.APIView):
    """
    Syncs a specific Wise Class into the CRM as a Batch and imports its students.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if request.user.role not in ['ADMIN', 'SUPER_ADMIN']:
            return response.Response({"error": "Permission denied"}, status=403)
            
        wise_class_id = request.data.get('class_id')
        if not wise_class_id:
            return response.Response({"error": "class_id is required"}, status=400)
            
        from core.models import Batch, Course, Program, Student, SubProgram
        from django.contrib.auth import get_user_model
        from django.utils.timezone import now
        from django.db import transaction
        import datetime
        
        User = get_user_model()
        wise = WiseService()
        
        try:
            # 1. Fetch Class Details
            class_details = wise.get_course_details(wise_class_id)
            if not class_details:
                # Try getting from list if details endpoint fails
                all_c = wise.get_all_courses()
                class_details = next((c for c in all_c if c.get('_id') == wise_class_id), None)
                
            if not class_details:
                 return response.Response({"error": "Class not found in Wise LMS"}, status=404)
            
            # 2. Ensure Course exists
            program, _ = Program.objects.get_or_create(name="Wise Courses", defaults={"slug": "wise-courses"})
            sub_prog, _ = SubProgram.objects.get_or_create(program=program, name="LMS Imported")
            
            course_name = class_details.get('subject') or class_details.get('name') or "Wise Course"
            course, _ = Course.objects.get_or_create(
                name=course_name, 
                sub_program=sub_prog,
                defaults={"fee_amount": 0}
            )
            
            # 3. Create/Update Batch
            wise_program, _ = Program.objects.get_or_create(name="Wise LMS Integrated")
            wise_class_name = request.data.get('class_name', class_details.get('name') or f"Wise Class {wise_class_id}")
            wise_subject = request.data.get('subject', class_details.get('subject') or 'General')
            
            wise_sub_program, _ = SubProgram.objects.get_or_create(
                name=wise_subject, 
                program=wise_program
            )
            
            crm_course, _ = Course.objects.get_or_create(
                name=wise_class_name,
                sub_program=wise_sub_program,
                defaults={'fee_amount': 0}
            )

            batch, created = Batch.objects.get_or_create(
                name=wise_class_name,
                course=crm_course,
                defaults={
                    "start_date": datetime.date.today(),
                    "lms_batch_id": wise_class_id
                }
            )
            
            if not created and not batch.lms_batch_id:
                batch.lms_batch_id = wise_class_id
                batch.save()
            
            # 4. Fetch and Sync Participants
            participants = wise.get_class_participants(wise_class_id)
            stats = {"found": len(participants), "synced": 0, "new": 0}
            
            with transaction.atomic():
                for p in participants:
                    p_id = p.get('_id') or p.get('id')
                    p_name = p.get('name', 'Wise Student')
                    phone = p.get('phoneNumber') or p.get('mobile') or ''
                    email = p.get('email') or f"wise_{p_id}@example.com"
                    
                    # Clean phone
                    clean_phone = str(phone).replace(" ", "")
                    if len(clean_phone) < 10: continue
                    
                    # Try to find existing student (Better lookup to prevent IntegrityErrors)
                    expected_crm_id = f"WISE-{clean_phone[-10:]}"
                    student = Student.objects.filter(
                        models.Q(lms_student_id=str(p_id)) | 
                        models.Q(mobile=clean_phone) | 
                        models.Q(crm_student_id=expected_crm_id)
                    ).first()
                    
                    if not student:
                        # Create User
                        username = f"wise_{clean_phone[-10:]}"
                        # Check if username exists already to avoid clash
                        if User.objects.filter(username=username).exists():
                             import uuid
                             username = f"wise_{clean_phone[-10:]}_{str(uuid.uuid4())[:4]}"

                        # Improved Name Parsing
                        p_name = p.get('name', '').strip()
                        if not p_name or "@" in p_name:
                            first_name = "Wise"
                            last_name = "Student"
                        else:
                            name_parts = p_name.split(' ')
                            first_name = name_parts[0]
                            last_name = ' '.join(name_parts[1:]) if len(name_parts) > 1 else 'Student'

                        user, u_created = User.objects.get_or_create(
                            username=username,
                            defaults={
                                "email": email,
                                "role": "STUDENT",
                                "first_name": first_name,
                                "last_name": last_name
                            }
                        )
                        if u_created:
                            user.set_password("Changeme@123")
                            user.save()
                        
                        # Create Student
                        student = Student.objects.create(
                            user=user,
                            crm_student_id=expected_crm_id,
                            program_type=wise_program,
                            mobile=clean_phone,
                            email=email,
                            lms_student_id=str(p_id),
                            sub_program=wise_sub_program,
                            course=crm_course,
                            batch=batch
                        )
                        stats["new"] += 1
                    else:
                        # Update existing student with Wise details if empty or email
                        current_fname = (student.first_name or '').strip()
                        if not current_fname or "@" in current_fname:
                            student.first_name = first_name
                        
                        current_lname = (student.last_name or '').strip()
                        if not current_lname or "@" in current_lname:
                            student.last_name = last_name

                        if not student.lms_student_id:
                            student.lms_student_id = str(p_id)
                        if not student.course:
                            student.course = crm_course
                        if not student.sub_program:
                            student.sub_program = wise_sub_program
                        if not student.program_type:
                            student.program_type = wise_program
                        
                        student.batch = batch
                        student.save()
                        stats["synced"] += 1
                
            status_word = "created" if created else "already synced and updated"
            summary = f"Total Found: {stats['found']}, New: {stats['new']}, Updated: {stats['synced']}"
            return response.Response({
                "success": True,
                "message": f"Batch '{wise_class_name}' {status_word}. {summary}",
                "batch_id": batch.id,
                "stats": stats
            })
        except Exception as e:
            print(f"SyncWiseBatch Error: {str(e)}")
            return response.Response({"error": f"Sync failed: {str(e)}"}, status=500)


class ConsumeWiseCreditsView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        # Mentors or Admins can consume credits
        if request.user.role not in ['ADMIN', 'SUPER_ADMIN', 'MENTOR']:
            return response.Response({"error": "Permission denied"}, status=403)
            
        student_id = request.data.get('student_id')
        class_id = request.data.get('class_id')
        credit = request.data.get('credit', 1)
        note = request.data.get('note', 'Consuming Credits')
        
        try:
            student = Student.objects.get(id=student_id)
            if not student.lms_student_id:
                return response.Response({"error": "Student not linked to Wise LMS"}, status=400)
                
            wise = WiseService()
            result = wise.consume_credits(
                student.lms_student_id, 
                class_id, 
                credit, 
                note
            )
            
            if result and result.get('status') == 200:
                return response.Response({
                    "success": True,
                    "message": "Credits consumed successfully",
                    "data": result.get('data')
                })
            else:
                return response.Response({
                    "success": False,
                    "error": result.get('message', 'Failed to consume credits') if result else "API call failed"
                }, status=400)
                
        except Student.DoesNotExist:
             return response.Response({"error": "Student not found"}, status=404)
        except Exception as e:
             return response.Response({"error": str(e)}, status=500)

class IntegrationSettingViewSet(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role not in ['ADMIN', 'SUPER_ADMIN']:
            return response.Response({"error": "Permission denied"}, status=403)
        
        name = request.query_params.get('name')
        if name:
            try:
                setting = IntegrationSetting.objects.get(name=name)
                serializer = IntegrationSettingSerializer(setting)
                return response.Response(serializer.data)
            except IntegrationSetting.DoesNotExist:
                return response.Response({}, status=200) # Return empty if not found
        
        settings = IntegrationSetting.objects.all()
        serializer = IntegrationSettingSerializer(settings, many=True)
        return response.Response(serializer.data)

    def post(self, request):
        if request.user.role not in ['ADMIN', 'SUPER_ADMIN']:
            return response.Response({"error": "Permission denied"}, status=403)
        
        name = request.data.get('name')
        config = request.data.get('config', {})
        is_active = request.data.get('is_active', True)

        setting, created = IntegrationSetting.objects.get_or_create(name=name)
        setting.config = config
        setting.is_active = is_active
        setting.save()

        serializer = IntegrationSettingSerializer(setting)
        return response.Response(serializer.data)

class RazorpayOrderView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        amount = request.data.get('amount')
        currency = request.data.get('currency', 'INR')
        
        if not amount:
            return response.Response({"error": "Amount is required"}, status=400)
            
        try:
            # Get Razorpay credentials from DB
            gateway = IntegrationSetting.objects.get(name='razorpay', is_active=True)
            # Support multiple key formats and ENSURE they are stripped of accidental spaces
            k_id = gateway.config.get('key_id') or gateway.config.get('RAZORPAY_KEY_ID')
            k_secret = gateway.config.get('key_secret') or gateway.config.get('RAZORPAY_KEY_SECRET')
            
            if not k_id or not k_secret:
                return response.Response({"error": f"Razorpay keys missing in {gateway.name} config"}, status=503)
                
            def clean_key(val):
                if not val: return ""
                # Remove common prefixes like 'Live api: ', 'Secret: ', etc.
                if ':' in val:
                    val = val.split(':')[-1]
                return val.strip()

            key_id = clean_key(k_id)
            key_secret = clean_key(k_secret)
                
            client = razorpay.Client(auth=(key_id, key_secret))
            
            # Amount in paise (integer)
            try:
                order_amount = int(float(amount) * 100)
            except (ValueError, TypeError):
                return response.Response({"error": "Invalid amount format"}, status=400)

            if order_amount <= 0:
                 return response.Response({"error": "Amount must be greater than zero"}, status=400)
            
            order_data = {
                'amount': order_amount,
                'currency': currency,
                'payment_capture': '1'
            }
            
            order = client.order.create(data=order_data)
            return response.Response({
                "order_id": order['id'],
                "amount": order['amount'],
                "currency": order['currency'],
                "key_id": key_id 
            })
        except IntegrationSetting.DoesNotExist:
            return response.Response({"error": "Razorpay integration is not configured or is inactive"}, status=503)
        except Exception as e:
            print(f"Razorpay Error: {str(e)}")
            return response.Response({"error": f"Gateway Error: {str(e)}"}, status=500)

class SyncWiseAttendanceView(views.APIView):
    """
    Syncs live session logs from Wise LMS and converts them into CRM ClassSessions.
    This effectively calculates teacher attendance based on Zoom activity.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if request.user.role not in ['ADMIN', 'SUPER_ADMIN', 'ACADEMIC']:
            return response.Response({"error": "Permission denied"}, status=403)
            
        from core.models import Batch, ClassSession, Attendance
        from django.contrib.auth import get_user_model
        from django.utils.dateparse import parse_datetime
        import threading
        
        def run_sync():
            User = get_user_model()
            wise = WiseService()
            batches = Batch.objects.filter(lms_batch_id__isnull=False)
            
            for batch in batches:
                try:
                    logs = wise.get_session_logs(batch.lms_batch_id)
                    for log in logs:
                        start_time_str = log.get('start_time') or log.get('startTime')
                        if not start_time_str: continue
                        
                        start_time = parse_datetime(start_time_str)
                        if not start_time: continue
                        
                        log_date = start_time.date()
                        
                        instructor_id = str(log.get('hostedBy') or log.get('instructorId'))
                        conducting_teacher = None
                        if instructor_id:
                            conducting_teacher = User.objects.filter(lms_teacher_id=instructor_id).first()
                            
                        if not conducting_teacher:
                            conducting_teacher = batch.teacher

                        session, created = ClassSession.objects.get_or_create(
                            batch=batch, 
                            date=log_date,
                            teacher=conducting_teacher,
                            defaults={
                                'teacher_summary': f"Auto-synced from Wise LMS Zoom Session (Duration: {log.get('duration', 'N/A')} mins)"
                            }
                        )
                        
                        present_lms_ids = log.get('students', [])
                        for student in batch.students.all():
                            is_present = bool(student.lms_student_id and student.lms_student_id in present_lms_ids)
                            Attendance.objects.update_or_create(
                                session=session,
                                student=student,
                                defaults={'is_present': is_present}
                            )
                except Exception as e:
                    print(f"Failed to sync batch {batch.id}: {e}")
                    
            from django.db import connection
            connection.close()

        thread = threading.Thread(target=run_sync)
        thread.daemon = True
        thread.start()

        return response.Response({
            "success": True,
            "message": "Attendance sync has been started in the background. Please check back in a few minutes.",
        })

class SyncWiseTeachersView(views.APIView):
    """
    Imports all teachers from Wise LMS and creates CRM accounts for them.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if request.user.role not in ['ADMIN', 'SUPER_ADMIN']:
            return response.Response({"error": "Permission denied"}, status=403)
            
        from django.contrib.auth import get_user_model
        User = get_user_model()
        wise = WiseService()
        
        # Now using the fixed V2 Super-Scan
        wise_teachers = wise.get_all_teachers()
        stats = {"found": len(wise_teachers), "created": 0, "updated": 0, "errors": 0}
        
        for wt in wise_teachers:
            try:
                wt_id = str(wt.get('_id') or wt.get('id'))
                email = wt.get('email')
                phone = wt.get('mobile') or wt.get('phoneNumber') or ''
                name = wt.get('name', 'Wise Teacher')
                
                teacher = User.objects.filter(models.Q(lms_teacher_id=wt_id) | models.Q(email=email)).first()
                
                if not teacher:
                    username = f"wise_t_{wt_id}"
                    teacher = User.objects.create_user(
                        username=username,
                        email=email,
                        password='welcome123',
                        first_name=name.split(' ')[0],
                        last_name=' '.join(name.split(' ')[1:]) if ' ' in name else '',
                        role='TEACHER',
                        lms_teacher_id=wt_id,
                        phone_number=phone
                    )
                    stats["created"] += 1
                else:
                    if not teacher.lms_teacher_id:
                        teacher.lms_teacher_id = wt_id
                        teacher.save()
                    stats["updated"] += 1
            except Exception as e:
                stats["errors"] += 1
                
        return response.Response({
            "success": True,
            "message": f"Synced {stats['created']} new teachers and linked {stats['updated']} existing ones.",
            "stats": stats,
            "debug_info": {
                "total_found": len(wise_teachers)
            }
        })

class AutoLinkWiseDataView(views.APIView):
    """
    Automatically links CRM batches to Wise classes by name and assigns teachers.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if request.user.role not in ['ADMIN', 'SUPER_ADMIN']:
            return response.Response({"error": "Permission denied"}, status=403)
            
        from core.models import Batch
        from django.contrib.auth import get_user_model
        User = get_user_model()
        wise = WiseService()
        
        # 1. Fetch all Wise classes (Super-Scan style)
        all_wise_classes = []
        for type_val in ["LIVE", "UPCOMING", "PAST"]:
            all_wise_classes.extend(wise.get_course_list(type=type_val))
            
        stats = {"batches_linked": 0, "teachers_assigned": 0, "errors": 0}
        
        for wc in all_wise_classes:
            try:
                wc_name = wc.get('title') or wc.get('name')
                wc_id = str(wc.get('_id') or wc.get('id'))
                if not wc_name or not wc_id: continue
                
                # Try to find a matching batch in CRM
                batch = Batch.objects.filter(name__iexact=wc_name).first()
                if batch:
                    # Link ID
                    batch.lms_batch_id = wc_id
                    
                    # 2. Link Teacher (Scan instructors and co-teachers)
                    details = wise.get_course_details(wc_id)
                    if details:
                        instructors = details.get('coTeachers') or []
                        if details.get('instructor'): instructors.append(details.get('instructor'))
                        
                        for inst in instructors:
                            inst_id = str(inst.get('_id') or inst.get('id'))
                            crm_teacher = User.objects.filter(lms_teacher_id=inst_id).first()
                            if crm_teacher:
                                # Assign to batch
                                batch.teacher = crm_teacher
                                stats["teachers_assigned"] += 1
                                break
                    
                    batch.save()
                    stats["batches_linked"] += 1
            except Exception as e:
                print(f"Auto-link error for {wc.get('title')}: {e}")
                stats["errors"] += 1
                
        return response.Response({
            "success": True,
            "message": f"Successfully linked {stats['batches_linked']} batches and assigned {stats['teachers_assigned']} teachers.",
            "stats": stats
        })
