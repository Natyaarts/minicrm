# Core App Serializers
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.apps import apps
from django.db import transaction as db_transaction
from django.db.models import Sum, Count
from .models import Program, SubProgram, Course, Batch, Student, Transaction, Document, SyllabusPart, ClassSession, Attendance, BatchResource, Exam, ExamResult, Question, QuestionOption, StudentSubmission, MonthlyPayment, StudentTeacherHandover, normalize_phone_number

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'role', 'phone_number', 'first_name', 'last_name')

class ProgramSerializer(serializers.ModelSerializer):
    class Meta:
        model = Program
        fields = ('id', 'name', 'description', 'slug', 'require_payment', 'registration_fee')

class SubProgramSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubProgram
        fields = '__all__'

class CourseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = '__all__'

class SubProgramHierarchySerializer(serializers.ModelSerializer):
    courses = CourseSerializer(many=True, read_only=True)
    class Meta:
        model = SubProgram
        fields = ('id', 'name', 'courses', 'require_payment', 'registration_fee')

class ProgramHierarchySerializer(serializers.ModelSerializer):
    sub_programs = SubProgramHierarchySerializer(many=True, read_only=True)
    class Meta:
        model = Program
        fields = ('id', 'name', 'description', 'slug', 'sub_programs', 'require_payment', 'registration_fee')

class SyllabusPartSerializer(serializers.ModelSerializer):
    class Meta:
        model = SyllabusPart
        fields = '__all__'

class AttendanceSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.first_name', read_only=True)
    student_crm_id = serializers.CharField(source='student.crm_student_id', read_only=True)
    class Meta:
        model = Attendance
        fields = '__all__'

class BatchResourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = BatchResource
        fields = '__all__'

class StudentSubmissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentSubmission
        fields = ['id', 'exam', 'student', 'start_time', 'end_time', 'is_submitted', 'answers_json', 'score']

class QuestionOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuestionOption
        fields = ['id', 'option_text', 'is_correct']

class QuestionSerializer(serializers.ModelSerializer):
    options = QuestionOptionSerializer(many=True, required=False)
    
    class Meta:
        model = Question
        fields = ['id', 'text', 'question_type', 'marks', 'options']

    def create(self, validated_data):
        options_data = validated_data.pop('options', [])
        question = Question.objects.create(**validated_data)
        for option_data in options_data:
            QuestionOption.objects.create(question=question, **option_data)
        return question

class ExamResultSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.first_name', read_only=True)
    class Meta:
        model = ExamResult
        fields = '__all__'

class ExamSerializer(serializers.ModelSerializer):
    results = ExamResultSerializer(many=True, read_only=True)
    questions = QuestionSerializer(many=True, read_only=True)
    pass_percentage = serializers.SerializerMethodField()
    
    class Meta:
        model = Exam
        fields = ['id', 'title', 'exam_type', 'description', 'date', 'total_marks', 'passing_marks', 'is_published', 'pass_percentage', 'results', 'questions']

    def get_pass_percentage(self, obj):
        results = obj.results.all()
        if not results:
            return 0
        passed = results.filter(marks_obtained__gte=obj.passing_marks, is_present=True).count()
        return round((passed / results.count()) * 100, 2)

class ClassSessionSerializer(serializers.ModelSerializer):
    attendances = AttendanceSerializer(many=True, read_only=True)
    class Meta:
        model = ClassSession
        fields = '__all__'

from .models import BatchAssignmentHistory

class BatchAssignmentHistorySerializer(serializers.ModelSerializer):
    previous_mentor_name = serializers.SerializerMethodField()
    new_mentor_name = serializers.SerializerMethodField()
    assigned_by_name = serializers.SerializerMethodField()

    class Meta:
        model = BatchAssignmentHistory
        fields = ['id', 'batch', 'previous_mentor', 'new_mentor', 'assigned_by', 'assigned_at', 'reason', 
                  'previous_mentor_name', 'new_mentor_name', 'assigned_by_name']
        
    def get_previous_mentor_name(self, obj):
        return f"{obj.previous_mentor.first_name} {obj.previous_mentor.last_name}" if obj.previous_mentor else "None"

    def get_new_mentor_name(self, obj):
        return f"{obj.new_mentor.first_name} {obj.new_mentor.last_name}" if obj.new_mentor else "None"
        
    def get_assigned_by_name(self, obj):
        return f"{obj.assigned_by.first_name} {obj.assigned_by.last_name}" if obj.assigned_by else "System"

class BatchSerializer(serializers.ModelSerializer):
    student_count = serializers.SerializerMethodField()
    primary_mentor_details = UserSerializer(source='primary_mentor', read_only=True)
    secondary_mentors_details = UserSerializer(source='secondary_mentors', many=True, read_only=True)
    teacher_details = UserSerializer(source='teacher', read_only=True)
    course_name = serializers.CharField(source='course.name', read_only=True)
    sub_program_name = serializers.CharField(source='course.sub_program.name', read_only=True)
    syllabus_parts = SyllabusPartSerializer(many=True, read_only=True)
    resources = BatchResourceSerializer(many=True, read_only=True)
    exams = ExamSerializer(many=True, read_only=True)
    syllabus_progress = serializers.SerializerMethodField()
    
    class Meta:
        model = Batch
        fields = '__all__'
        
    def get_student_count(self, obj):
        return getattr(obj, 'student_count_annotated', obj.students.count())
        
    def get_syllabus_progress(self, obj):
        total = sum(part.weight_percentage for part in obj.syllabus_parts.all())
        completed = sum(part.weight_percentage for part in obj.syllabus_parts.all() if part.is_completed)
        if total > 0:
            return round((completed / total) * 100, 2)
        return 0

class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = '__all__'

class DocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Document
        fields = '__all__'

class StudentDynamicValueReadSerializer(serializers.ModelSerializer):
    field_label = serializers.CharField(source='field.label', read_only=True)
    field_group = serializers.CharField(source='field.field_group', read_only=True)
    class Meta:
        model = apps.get_model('forms_builder', 'StudentDynamicValue')
        fields = ('id', 'field_label', 'field_group', 'value', 'field')

class MonthlyPaymentSerializer(serializers.ModelSerializer):
    marked_by_name = serializers.SerializerMethodField()

    class Meta:
        model = MonthlyPayment
        fields = '__all__'

    def get_marked_by_name(self, obj):
        if obj.marked_by:
            return f"{obj.marked_by.first_name} {obj.marked_by.last_name}".strip() or obj.marked_by.username
        return "System"

class StudentTeacherHandoverSerializer(serializers.ModelSerializer):
    previous_teacher_name = serializers.SerializerMethodField()
    current_teacher_name = serializers.SerializerMethodField()
    changed_by_name = serializers.SerializerMethodField()
    student_name = serializers.CharField(source='student.first_name', read_only=True)

    class Meta:
        model = StudentTeacherHandover
        fields = '__all__'

    def get_previous_teacher_name(self, obj):
        if obj.previous_teacher:
            return f"{obj.previous_teacher.first_name} {obj.previous_teacher.last_name}".strip() or obj.previous_teacher.username
        return "None"

    def get_current_teacher_name(self, obj):
        if obj.current_teacher:
            return f"{obj.current_teacher.first_name} {obj.current_teacher.last_name}".strip() or obj.current_teacher.username
        return "None"

    def get_changed_by_name(self, obj):
        if obj.changed_by:
            return f"{obj.changed_by.first_name} {obj.changed_by.last_name}".strip() or obj.changed_by.username
        return "System"

class StudentSerializer(serializers.ModelSerializer):
    # Field to accept dynamic values as a JSON string or dict
    dynamic_values = serializers.JSONField(required=False, write_only=True)
    # Transactions and Documents can be handled separately if complex, but let's try to include transaction info
    transaction_details = serializers.DictField(required=False, write_only=True)
    
    # Explicit file fields for uploads
    passport_photo = serializers.FileField(write_only=True, required=False)
    aadhar_card = serializers.FileField(write_only=True, required=False)
    marklist = serializers.FileField(write_only=True, required=False) # For accumulated marklists or single file

    # Read-only nested fields for display
    program_name = serializers.CharField(source='program_type.name', read_only=True)
    program_slug = serializers.CharField(source='program_type.slug', read_only=True)
    sub_program_name = serializers.CharField(source='sub_program.name', read_only=True)
    course_name = serializers.CharField(source='course.name', read_only=True)
    batch_name = serializers.CharField(source='batch.name', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    lms_course_names = serializers.CharField(read_only=True)
    campaign_name = serializers.CharField(source='campaign.name', read_only=True)
    created_at = serializers.DateTimeField(source='user.date_joined', read_only=True)
    
    # Assignment
    assigned_to_name = serializers.SerializerMethodField()
    teacher_name = serializers.SerializerMethodField()
    
    # Detail lists for read
    dynamic_values_list = StudentDynamicValueReadSerializer(source='dynamic_values', many=True, read_only=True)
    documents_list = DocumentSerializer(source='documents', many=True, read_only=True)
    transactions_list = TransactionSerializer(source='transactions', many=True, read_only=True)
    monthly_payments_list = MonthlyPaymentSerializer(source='monthly_payments', many=True, read_only=True)
    teacher_handovers_list = StudentTeacherHandoverSerializer(source='teacher_handovers', many=True, read_only=True)
    
    # Financial fields
    total_paid = serializers.SerializerMethodField()
    total_due = serializers.SerializerMethodField()
    monthly_payment_months = serializers.SerializerMethodField()

    # Read-only numeric IDs for frontend sync
    program_type_id = serializers.IntegerField(source='program_type.id', read_only=True)
    sub_program_id = serializers.IntegerField(source='sub_program.id', read_only=True, allow_null=True)
    course_id = serializers.IntegerField(source='course.id', read_only=True, allow_null=True)
    batch_id = serializers.IntegerField(source='batch.id', read_only=True, allow_null=True)


    class Meta:
        model = Student
        fields = '__all__'
        read_only_fields = ('user', 'crm_student_id')

    def get_total_paid(self, obj):
        return obj.transactions.aggregate(total=Sum('amount'))['total'] or 0

    def get_assigned_to_name(self, obj):
        if obj.assigned_to:
            return f"{obj.assigned_to.first_name} {obj.assigned_to.last_name}".strip() or obj.assigned_to.username
        return None

    def get_teacher_name(self, obj):
        if obj.batch and obj.batch.teacher:
            return f"{obj.batch.teacher.first_name} {obj.batch.teacher.last_name}".strip() or obj.batch.teacher.username
        return "Not Assigned"


    def get_total_due(self, obj):
        course_fee = obj.course.fee_amount if obj.course else 0
        paid = self.get_total_paid(obj)
        return max(0, course_fee - paid)

    def get_monthly_payment_months(self, obj):
        return [p.month.strftime('%Y-%m-%d') for p in obj.monthly_payments.all()]

    def create(self, validated_data):
        dynamic_values = validated_data.pop('dynamic_values', None)
        transaction_details = validated_data.pop('transaction_details', None)
        passport_photo = validated_data.pop('passport_photo', None)
        aadhar_card = validated_data.pop('aadhar_card', None)
        marklist = validated_data.pop('marklist', None)
        
        # Extract core fields from dynamic values if missing
        if dynamic_values:
            dyn_dict = {}
            if isinstance(dynamic_values, str):
                import json
                try:
                    dyn_dict = json.loads(dynamic_values)
                except Exception:
                    dyn_dict = {}
            elif isinstance(dynamic_values, dict):
                dyn_dict = dynamic_values

            DynamicField = apps.get_model('forms_builder', 'DynamicField')
            for f_id, f_val in dyn_dict.items():
                if not f_val or not str(f_val).strip():
                    continue
                try:
                    f_obj = DynamicField.objects.get(id=f_id)
                    lbl = f_obj.label.lower().strip()
                    if ('full name' in lbl or lbl == 'name') and (not validated_data.get('first_name') or validated_data.get('first_name') in ['Student', '']):
                        parts = str(f_val).strip().split(' ', 1)
                        validated_data['first_name'] = parts[0]
                        if len(parts) > 1 and parts[1]:
                            validated_data['last_name'] = parts[1]
                        elif not validated_data.get('last_name'):
                            validated_data['last_name'] = ''
                    elif ('mobile' in lbl or 'phone' in lbl or 'contact' in lbl) and not validated_data.get('mobile'):
                        validated_data['mobile'] = normalize_phone_number(f_val)
                    elif 'email' in lbl and not validated_data.get('email'):
                        validated_data['email'] = str(f_val).strip().lower()
                    elif ('dob' in lbl or 'date of birth' in lbl) and not validated_data.get('dob'):
                        try:
                            validated_data['dob'] = str(f_val).split('T')[0]
                        except Exception:
                            pass
                    elif 'gender' in lbl and not validated_data.get('gender'):
                        validated_data['gender'] = str(f_val).strip()
                    elif 'marital' in lbl and not validated_data.get('marital_status'):
                        validated_data['marital_status'] = str(f_val).strip()
                    elif ('father' in lbl) and not validated_data.get('father_husband_name'):
                        validated_data['father_husband_name'] = str(f_val).strip()
                    elif ('mother' in lbl) and not validated_data.get('mother_name'):
                        validated_data['mother_name'] = str(f_val).strip()
                    elif ('address' in lbl or 'permanent address' in lbl) and not validated_data.get('perm_address'):
                        validated_data['perm_address'] = str(f_val).strip()
                    elif 'district' in lbl and not validated_data.get('perm_district'):
                        validated_data['perm_district'] = str(f_val).strip()
                    elif 'state' in lbl and not validated_data.get('perm_state'):
                        validated_data['perm_state'] = str(f_val).strip()
                except (DynamicField.DoesNotExist, ValueError):
                    pass

        with db_transaction.atomic():
            # 1. Normalize and check duplicates
            email = validated_data.get('email')
            mobile = validated_data.get('mobile')
            program = validated_data.get('program_type')
            is_nsdc = bool(
                program and (
                    getattr(program, 'slug', '') == 'nsdc'
                    or 'nsdc' in getattr(program, 'name', '').lower()
                    or 'national skill development' in getattr(program, 'name', '').lower()
                )
            )
            
            from crm.services.deduplication import lookup_existing_student, normalize_lead_phone, normalize_lead_email
            clean_phone = normalize_lead_phone(mobile)
            clean_em = normalize_lead_email(email)
            if clean_phone:
                validated_data['mobile'] = clean_phone
            if clean_em:
                validated_data['email'] = clean_em

            # Centralized duplicate check
            dup_student, dup_reason = lookup_existing_student(mobile=clean_phone or mobile, email=clean_em or email)
            if dup_student and not is_nsdc:
                raise serializers.ValidationError({
                    "mobile": f"A student or lead record already exists with these contact details (CRM ID: {dup_student.crm_student_id})."
                })

            username = clean_em if clean_em else (f"user_{clean_phone}" if clean_phone else f"student_{Student.objects.count() + 1}")
            
            # Check if user exists
            if User.objects.filter(username=username).exists():
                user = User.objects.get(username=username)
                if hasattr(user, 'student_profile'):
                    if is_nsdc:
                        # For NSDC application by an existing student, generate a distinct user account
                        # to preserve 1-to-1 relationship with the new NSDC application
                        import uuid
                        unique_suffix = uuid.uuid4().hex[:8]
                        nsdc_username = f"nsdc_{clean_phone or clean_em or 'student'}_{unique_suffix}"
                        user = User.objects.create_user(
                            username=nsdc_username,
                            email=clean_em or '',
                            first_name=validated_data.get('first_name', ''),
                            last_name=validated_data.get('last_name', '')
                        )
                        user.set_password('welcome123')
                        user.role = 'STUDENT'
                        user.save()
                    else:
                        raise serializers.ValidationError({"mobile": "An application has already been submitted for this mobile number/email."})
            else:
                user = User.objects.create_user(
                    username=username, 
                    email=clean_em or '',
                    first_name=validated_data.get('first_name', ''),
                    last_name=validated_data.get('last_name', '')
                )
                user.set_password('welcome123') # Default password
                user.role = 'STUDENT'
                user.save()

            # 2. Generate CRM ID
            crm_id = Student.generate_next_crm_id()
            
            # 3. Create Student
            student = Student.objects.create(user=user, crm_student_id=crm_id, **validated_data)
            
            # If this is an NSDC application for an existing student, record interaction on original student
            if is_nsdc and dup_student:
                try:
                    from crm.services.deduplication import record_reengagement_interaction
                    record_reengagement_interaction(
                        student=dup_student,
                        source_name="NSDC Application Form",
                        notes=f"Student submitted a new NSDC Application (Application ID: {crm_id})."
                    )
                except Exception as e:
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(f"Could not log NSDC submission on existing student: {e}")

            # 4. Handle Documents (Legacy & Dynamic)
            Document = apps.get_model('core', 'Document')
            DynamicField = apps.get_model('forms_builder', 'DynamicField')
            
            # Legacy fields
            if passport_photo:
                Document.objects.create(student=student, document_type='Passport Photo', file=passport_photo)
            if aadhar_card:
                Document.objects.create(student=student, document_type='Aadhar Card', file=aadhar_card)
            if marklist:
                Document.objects.create(student=student, document_type='Marklist', file=marklist)

            # Dynamic fields (from request.FILES)
            request = self.context.get('request')
            if request and request.FILES:
                for key, file_obj in request.FILES.items():
                    if key.startswith('dynamic_file_'):
                        try:
                            field_id = key.split('_')[-1]
                            field_obj = DynamicField.objects.get(id=field_id)
                            Document.objects.create(
                                student=student, 
                                document_type=field_obj.label, 
                                file=file_obj
                            )
                        except:
                            pass

            # 5. Handle Dynamic Values
            if dynamic_values:
                StudentDynamicValue = apps.get_model('forms_builder', 'StudentDynamicValue')
                DynamicField = apps.get_model('forms_builder', 'DynamicField')
                
                # Check directly if it's a dict, otherwise try parsing if string (frontend might send stringified JSON)
                if isinstance(dynamic_values, str):
                    import json
                    try:
                        dynamic_values = json.loads(dynamic_values)
                    except:
                        dynamic_values = {}

                for field_id, value in dynamic_values.items():
                    try:
                        field_obj = DynamicField.objects.get(id=field_id)
                        StudentDynamicValue.objects.create(
                            student=student,
                            field=field_obj,
                            value=value
                        )
                    except DynamicField.DoesNotExist:
                        pass
            
            # 6. Handle Transaction
            if transaction_details:
                # Same check for stringified JSON
                if isinstance(transaction_details, str):
                    import json
                    try:
                        transaction_details = json.loads(transaction_details)
                    except:
                        transaction_details = {}
                        
                Transaction.objects.create(student=student, **transaction_details)

        return student

    def update(self, instance, validated_data):
        dynamic_values = validated_data.pop('dynamic_values', None)
        
        # Update core student fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        # Update User fields if first_name, last_name, email or mobile changed
        user = instance.user
        updated_user = False
        if 'first_name' in validated_data:
            user.first_name = validated_data['first_name']
            updated_user = True
        if 'last_name' in validated_data:
            user.last_name = validated_data['last_name']
            updated_user = True
        if 'email' in validated_data:
            user.email = validated_data['email']
            updated_user = True
        if updated_user:
            user.save()

        # Handle Files from request.FILES
        request = self.context.get('request')
        if request and request.FILES:
            Document = apps.get_model('core', 'Document')
            DynamicField = apps.get_model('forms_builder', 'DynamicField')
            
            for key, file_obj in request.FILES.items():
                if key.startswith('dynamic_file_'):
                    try:
                        field_id = key.split('_')[-1]
                        field_obj = DynamicField.objects.get(id=field_id)
                        
                        # Use update_or_create logic based on document_type
                        Document.objects.update_or_create(
                            student=instance,
                            document_type=field_obj.label,
                            defaults={'file': file_obj}
                        )
                    except Exception as e:
                        print(f"Error updating dynamic file: {e}")

        # Handle Dynamic Values Update
        if dynamic_values:
            StudentDynamicValue = apps.get_model('forms_builder', 'StudentDynamicValue')
            DynamicField = apps.get_model('forms_builder', 'DynamicField')
            
            if isinstance(dynamic_values, str):
                import json
                try:
                    dynamic_values = json.loads(dynamic_values)
                except:
                    dynamic_values = {}

            for field_id, value in dynamic_values.items():
                try:
                    field_obj = DynamicField.objects.get(id=field_id)
                    # Update if exists, otherwise create
                    val_obj, created = StudentDynamicValue.objects.get_or_create(
                        student=instance,
                        field=field_obj,
                        defaults={'value': value}
                    )
                    if not created:
                        val_obj.value = value
                        val_obj.save()
                except DynamicField.DoesNotExist:
                    pass

        return instance
