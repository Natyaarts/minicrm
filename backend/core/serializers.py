# Core App Serializers
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.apps import apps
from django.db import transaction as db_transaction
from django.db.models import Sum, Count
from .models import Program, SubProgram, Course, Batch, Student, Transaction, Document

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'role', 'phone_number', 'first_name', 'last_name')

class ProgramSerializer(serializers.ModelSerializer):
    class Meta:
        model = Program
        fields = ('id', 'name', 'description', 'slug')

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
        fields = ('id', 'name', 'courses')

class ProgramHierarchySerializer(serializers.ModelSerializer):
    sub_programs = SubProgramHierarchySerializer(many=True, read_only=True)
    class Meta:
        model = Program
        fields = ('id', 'name', 'description', 'slug', 'sub_programs')

class BatchSerializer(serializers.ModelSerializer):
    student_count = serializers.SerializerMethodField()
    primary_mentor_details = UserSerializer(source='primary_mentor', read_only=True)
    secondary_mentors_details = UserSerializer(source='secondary_mentors', many=True, read_only=True)
    course_name = serializers.CharField(source='course.name', read_only=True)
    
    class Meta:
        model = Batch
        fields = '__all__'
        
    def get_student_count(self, obj):
        return getattr(obj, 'student_count_annotated', obj.students.count())

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
    class Meta:
        model = apps.get_model('forms_builder', 'StudentDynamicValue')
        fields = ('id', 'field_label', 'value', 'field')

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
    sub_program_name = serializers.CharField(source='sub_program.name', read_only=True)
    course_name = serializers.CharField(source='course.name', read_only=True)
    batch_name = serializers.CharField(source='batch.name', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    
    # Detail lists for read
    dynamic_values_list = StudentDynamicValueReadSerializer(source='dynamic_values', many=True, read_only=True)
    documents_list = DocumentSerializer(source='documents', many=True, read_only=True)
    transactions_list = TransactionSerializer(source='transactions', many=True, read_only=True)
    
    # Financial fields
    total_paid = serializers.SerializerMethodField()
    total_due = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = '__all__'
        read_only_fields = ('user', 'crm_student_id')

    def get_total_paid(self, obj):
        return obj.transactions.aggregate(total=Sum('amount'))['total'] or 0

    def get_total_due(self, obj):
        course_fee = obj.course.fee_amount if obj.course else 0
        paid = self.get_total_paid(obj)
        return max(0, course_fee - paid)

    def create(self, validated_data):
        dynamic_values = validated_data.pop('dynamic_values', None)
        transaction_details = validated_data.pop('transaction_details', None)
        passport_photo = validated_data.pop('passport_photo', None)
        aadhar_card = validated_data.pop('aadhar_card', None)
        marklist = validated_data.pop('marklist', None)
        
        with db_transaction.atomic():
            # 1. Create User
            email = validated_data.get('email')
            mobile = validated_data.get('mobile')
            username = email if email else f"user_{mobile}"
            
            # Check if user exists
            if User.objects.filter(username=username).exists():
                user = User.objects.get(username=username)
                # CRITICAL: Check if this user already has a student profile
                if hasattr(user, 'student_profile'):
                    raise serializers.ValidationError({"mobile": "An application has already been submitted for this mobile number/email."})
            else:
                user = User.objects.create_user(username=username, email=email)
                user.set_password('welcome123') # Default password
                user.role = 'STUDENT'
                user.save()

            # 2. Generate CRM ID
            count = Student.objects.count() + 1
            crm_id = f"NATYA-{count:04d}"
            
            # 3. Create Student
            student = Student.objects.create(user=user, crm_student_id=crm_id, **validated_data)
            
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
