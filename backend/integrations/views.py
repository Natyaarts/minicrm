
from rest_framework import views, response, permissions
from core.models import Student
from .utils import WiseService
import random

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
            
        from core.models import Program
        from django.contrib.auth import get_user_model
        User = get_user_model()
        
        # Ensure a default program exists for imports
        fallback_program, _ = Program.objects.get_or_create(name="Wise Import", defaults={"slug": "wise-import"})
        
        stats = {"scanned": 0, "created": 0, "linked": 0, "updated": 0, "errors": 0}
        
        try:
            for wise_student in wise.get_all_students():
                stats["scanned"] += 1
                
                # Extract Data - Handle V3 Field Differences
                wise_id = wise_student.get('_id') or wise_student.get('id')
                
                # Phone: V3 uses 'phoneNumber', V2 might use 'mobile'
                raw_mobile = wise_student.get('phoneNumber') or wise_student.get('mobile') or ''
                mobile = str(raw_mobile).replace(" ", "")
                
                email = wise_student.get('email')
                if not email:
                    email = wise_student.get('emailAddress') # V3 variation
                
                # Name: V3 might just return 'name'
                fname = wise_student.get('first_name')
                lname = wise_student.get('last_name')
                
                if not fname and not lname:
                    full_name = wise_student.get('name', '').strip()
                    if full_name:
                        parts = full_name.split(' ', 1)
                        fname = parts[0]
                        lname = parts[1] if len(parts) > 1 else ''
                
                if not mobile or len(mobile) < 10:
                    # Log skip for debugging
                    print(f"Skipping student {wise_id}: Invalid mobile '{mobile}'")
                    continue
                    
                # Check if exists in CRM
                # Try finding by mobile (last 10 digits)
                mobile_suffix = mobile[-10:]
                
                # We need to find if any student matches this phone
                # Since phone format in DB might vary, let's try strict matching first
                student = Student.objects.filter(mobile__icontains=mobile_suffix).first()
                
                if student:
                    # Exists -> Update Link
                    if student.lms_student_id != wise_id:
                        student.lms_student_id = wise_id
                        student.save()
                        stats["linked"] += 1
                        # If we just linked, we also check email, but don't double count 'updated'
                        if email and student.email != email:
                            student.email = email
                            student.save()
                    elif email and student.email != email:
                        student.email = email
                        student.save()
                        stats["updated"] += 1
                    else:
                        stats["updated"] += 1 # Count existing reliable links as 'updated/verified' too? Or separate 'verified' count? 
                        # To match previous behavior let's count verified as updated or separate.
                        # Actually 'updated' in previous code meant "found existing". 
                        pass
                else:
                    # New Student -> Create
                    try:
                        # 1. Create User
                        username = f"wise_{mobile_suffix}"
                        if User.objects.filter(username=username).exists():
                            # Generate unique if overlap
                            import uuid
                            username = f"wise_{mobile_suffix}_{str(uuid.uuid4())[:4]}"
                            
                        user = User.objects.create_user(
                            username=username,
                            email=email or f"{username}@example.com",
                            password="Changeme@123", # Default password
                            role='STUDENT',
                            first_name=fname,
                            last_name=lname
                        )
                        
                        # 2. Create Student Profile
                        Student.objects.create(
                            user=user,
                            crm_student_id=f"WISE-{mobile_suffix}",
                            program_type=fallback_program,
                            first_name=fname or "Wise",
                            last_name=lname or "Student",
                            mobile=mobile,
                            email=email,
                            lms_student_id=wise_id
                        )
                        stats["created"] += 1
                    except Exception as e:
                        print(f"Error creating student {mobile}: {e}")
                        stats["errors"] += 1
                        
            return response.Response({
                "success": True,
                "message": "Sync completed successfully",
                "stats": stats
            })
            
        except Exception as e:
            print(f"Sync Error: {e}")
            return response.Response({"error": str(e)}, status=500)

class WiseCourseListView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role not in ['ADMIN', 'SUPER_ADMIN', 'ACADEMIC']:
            return response.Response({"error": "Permission denied"}, status=403)
            
        class_type = request.query_params.get('type', 'LIVE')
        wise = WiseService()
        courses = wise.get_all_courses(class_type=class_type)
        
        return response.Response(courses)

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
