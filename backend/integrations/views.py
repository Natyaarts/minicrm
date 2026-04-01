
from rest_framework import views, response, permissions
from core.models import Student
from .utils import WiseService
from .models import IntegrationSetting
from .serializers import IntegrationSettingSerializer
import random
import razorpay

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
                        "name": cs.get('className'),
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
            
        from core.models import Program, Student
        from django.contrib.auth import get_user_model
        from django.db import transaction
        User = get_user_model()
        
        # Ensure a default program exists for imports
        fallback_program, _ = Program.objects.get_or_create(name="Wise Import", defaults={"slug": "wise-import"})
        
        stats = {"scanned": 0, "created": 0, "linked": 0, "updated": 0, "errors": 0}
        
        try:
            # OPTIMIZATION: Load existing data once to avoid 1000s of database queries
            crm_students = {}
            for s in Student.objects.all():
                if s.mobile:
                    crm_students[str(s.mobile).replace(" ", "")[-10:]] = s
            
            existing_usernames = set(User.objects.values_list('username', flat=True))
            
            # Use atomic transaction to make database writes 10x faster
            with transaction.atomic():
                for wise_student in wise.get_all_students():
                    stats["scanned"] += 1
                    
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
                    
                    if not fname and not lname:
                        full_name = wise_student.get('name', '').strip()
                        if full_name:
                            parts = full_name.split(' ', 1)
                            fname = parts[0]
                            lname = parts[1] if len(parts) > 1 else ''

                    # Memory Lookup instead of DB Query
                    student = crm_students.get(mobile_suffix)
                    
                    if student:
                        # Only save if changed to save time
                        changed = False
                        if student.lms_student_id != wise_id:
                            student.lms_student_id = wise_id
                            changed = True
                            stats["linked"] += 1
                        
                        if email and student.email != email:
                            student.email = email
                            changed = True
                            
                        if changed:
                            student.save()
                            stats["updated"] += 1
                    else:
                        # New Student creation
                        try:
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
                                mobile=mobile,
                                email=email,
                                lms_student_id=wise_id,
                                program=fallback_program
                            )
                            crm_students[mobile_suffix] = new_student
                            stats["created"] += 1
                        except Exception as e:
                            print(f"Sync create error: {e}")
                            stats["errors"] += 1
                            
            return response.Response({
                "success": True,
                "message": "Sync completed successfully",
                "stats": stats
            })
            
        except Exception as e:
            print(f"Sync Final Error: {e}")
            return response.Response({"error": str(e)}, status=500)

class WiseCourseListView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role not in ['ADMIN', 'SUPER_ADMIN', 'ACADEMIC', 'MENTOR']:
            return response.Response({"error": "Permission denied"}, status=403)
            
        class_type = request.query_params.get('type', 'LIVE')
        wise = WiseService()
        courses = wise.get_all_courses(class_type=class_type)
        
        # Optionally fetch details for each to get student counts if not provided by Wise list
        # But Wise list usually has studentCount or similar if showCoTeachers=true is used
        
        return response.Response(courses)

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
        import datetime
        
        User = get_user_model()
        wise = WiseService()
        
        # 1. Fetch Class Details
        class_details = wise.get_course_details(wise_class_id)
        if not class_details:
            # Try getting from list if details endpoint fails
            all_c = wise.get_all_courses()
            class_details = next((c for c in all_c if c.get('_id') == wise_class_id), None)
            
        if not class_details:
             return response.Response({"error": "Class not found in Wise LMS"}, status=404)
        
        # 2. Ensure Course exists
        # We might need a default Program/SubProgram
        program, _ = Program.objects.get_or_create(name="Wise Courses", defaults={"slug": "wise-courses"})
        sub_prog, _ = SubProgram.objects.get_or_create(program=program, name="LMS Imported")
        
        course_name = class_details.get('subject') or class_details.get('name') or "Wise Course"
        course, _ = Course.objects.get_or_create(
            name=course_name, 
            sub_program=sub_prog,
            defaults={"fee_amount": 0}
        )
        
        # 3. Create/Update Batch
        batch_name = class_details.get('name') or f"Batch - {course_name}"
        # Use lms_batch_id in Student to track, but Batch model doesn't have an LMS ID yet.
        # Let's add it or use name matching for now, OR better, check if students are assigned to it.
        # I'll look for a batch that has this Wise ID in some way or just match by name.
        # Actually, let's just create/get by name for now, or we should add an 'lms_id' to Batch model.
        
        # Temporarily using name matching - better to add field but I'll skip migration for split second
        batch, created = Batch.objects.get_or_create(
            name=batch_name,
            course=course,
            defaults={
                "start_date": datetime.date.today(),
                "primary_mentor": request.user # Assign to creator by default
            }
        )
        
        # 4. Fetch and Sync Participants
        participants = wise.get_class_participants(wise_class_id)
        stats = {"found": len(participants), "synced": 0, "new": 0}
        
        for p in participants:
            p_id = p.get('_id') or p.get('id')
            p_name = p.get('name', 'Wise Student')
            phone = p.get('phoneNumber') or p.get('mobile') or ''
            email = p.get('email') or f"wise_{p_id}@example.com"
            
            # Clean phone
            clean_phone = str(phone).replace(" ", "")
            if len(clean_phone) < 10: continue
            
            # Try to find existing student
            student = Student.objects.filter(models.Q(lms_student_id=p_id) | models.Q(mobile=clean_phone)).first()
            
            if not student:
                # Create User
                username = f"wise_{clean_phone[-10:]}"
                user, u_created = User.objects.get_or_create(
                    username=username,
                    defaults={
                        "email": email,
                        "role": "STUDENT",
                        "first_name": p_name.split(' ')[0],
                        "last_name": ' '.join(p_name.split(' ')[1:]) if ' ' in p_name else 'Student'
                    }
                )
                if u_created:
                    user.set_password("Changeme@123")
                    user.save()
                
                # Create Student
                student = Student.objects.create(
                    user=user,
                    crm_student_id=f"WISE-{clean_phone[-10:]}",
                    program_type=program,
                    mobile=clean_phone,
                    email=email,
                    lms_student_id=p_id,
                    lms_batch_id=wise_class_id,
                    batch=batch
                )
                stats["new"] += 1
            else:
                # Update Student
                student.batch = batch
                student.lms_student_id = p_id
                student.lms_batch_id = wise_class_id
                student.save()
                stats["synced"] += 1
                
        return response.Response({
            "success": True,
            "message": f"Batch '{batch_name}' synchronized.",
            "batch_id": batch.id,
            "stats": stats
        })

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
