from django.db import models, transaction
from django.db.models import F
from django.conf import settings
from django.db.models.functions import Lower
import datetime
from .validators import validate_student_document_file, validate_batch_resource_file, validate_audio_recording_file


class Program(models.Model):
    name = models.CharField(max_length=100, unique=True) # e.g., Natya, Natya Career Academy
    description = models.TextField(blank=True)
    slug = models.SlugField(unique=True, blank=True, null=True)
    require_payment = models.BooleanField(default=False)
    registration_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)


    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower('name'),
                name='uniq_program_name_ci',
            )
        ]


    def save(self, *args, **kwargs):
        if not self.slug and self.name:
            from django.utils.text import slugify
            base_slug = slugify(self.name)
            if 'nsdc' in self.name.lower():
                base_slug = 'nsdc'
            slug = base_slug
            counter = 1
            while Program.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f"{base_slug}-{counter}"
                counter += 1
            self.slug = slug
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

class SubProgram(models.Model):
    program = models.ForeignKey(Program, on_delete=models.CASCADE, related_name='sub_programs')
    name = models.CharField(max_length=100) # e.g., STED, AISECT
    require_payment = models.BooleanField(default=False)
    registration_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)


    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['program', 'name'],
                name='uniq_subprogram_name_per_program',
            )
        ]
        
    
    def __str__(self):
        return f"{self.program.name} - {self.name}"

class Course(models.Model):
    sub_program = models.ForeignKey(SubProgram, on_delete=models.CASCADE, related_name='courses')
    name = models.CharField(max_length=100)
    fee_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    registration_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    require_payment = models.BooleanField(default=False)

    def __str__(self):
        return self.name

class Batch(models.Model):
    name = models.CharField(max_length=100)
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='batches')
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    primary_mentor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='primary_batches')
    secondary_mentors = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name='secondary_batches')
    teacher = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='teacher_batches')
    lms_batch_id = models.CharField(max_length=100, null=True, blank=True, help_text="Wise LMS Class ID")

    def __str__(self):
        return self.name

class BatchAssignmentHistory(models.Model):
    batch = models.ForeignKey(Batch, on_delete=models.CASCADE, related_name='assignment_history')
    previous_mentor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='previous_batch_assignments')
    new_mentor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='new_batch_assignments')
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='batch_assignments_made')
    assigned_at = models.DateTimeField(auto_now_add=True)
    reason = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.batch.name} reassigned to {self.new_mentor.username if self.new_mentor else 'None'} by {self.assigned_by.username if self.assigned_by else 'System'}"

def normalize_phone_number(val):
    if not val:
        return ''
    val_str = str(val).strip()
    digits = ''.join(c for c in val_str if c.isdigit())
    if not digits:
        return ''
    if len(digits) == 11 and digits.startswith('0'):
        digits = digits[1:]
    if len(digits) == 10:
        return f"+91{digits}"
    return f"+{digits}"

class NormalizedMobileField(models.CharField):
    def get_prep_value(self, value):
        val = super().get_prep_value(value)
        if val:
            return normalize_phone_number(val)
        return val

    def pre_save(self, model_instance, add):
        val = super().pre_save(model_instance, add)
        if val:
            return normalize_phone_number(val)
        return val

class NormalizedEmailField(models.EmailField):
    def get_prep_value(self, value):
        val = super().get_prep_value(value)
        if val:
            return str(val).strip().lower()
        return val

    def pre_save(self, model_instance, add):
        val = super().pre_save(model_instance, add)
        if val:
            return str(val).strip().lower()
        return val

class CRMIDCounter(models.Model):
    name = models.CharField(max_length=50, primary_key=True)
    value = models.PositiveBigIntegerField(default=0)

    class Meta:
        db_table = "core_crmid_counter"

    def __str__(self):
        return f"{self.name}: {self.value}"

    

class Student(models.Model):
    LEAD_STATUS_CHOICES = [
        ('NEW', 'New Lead'),
        ('FOLLOW_UP', 'Follow-up'),
        ('PAYMENT_PENDING', 'Payment Pending'),
        ('ENROLLED', 'Enrolled'),
        ('DROPPED', 'Dropped'),
        ('DUPLICATE', 'Duplicate Lead'),
    ]
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='student_profile')
    crm_student_id = models.CharField(max_length=50, unique=True)
    program_type = models.ForeignKey(Program, on_delete=models.PROTECT)
    sub_program = models.ForeignKey(SubProgram, on_delete=models.SET_NULL, null=True, blank=True)
    course = models.ForeignKey(Course, on_delete=models.SET_NULL, null=True, blank=True)
    batch = models.ForeignKey(Batch, on_delete=models.SET_NULL, null=True, related_name='students')
    is_active = models.BooleanField(default=True)
    lead_status = models.CharField(max_length=50, default='NEW')
    academic_status = models.CharField(max_length=20, default='ACTIVE', choices=[('ACTIVE', 'Active'), ('ON_BREAK', 'On Break'), ('DISCONTINUED', 'Discontinued')])
    discontinued_date = models.DateField(null=True, blank=True)
    
    # Lead Assignment (Sales Process)
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_leads')
    campaign = models.ForeignKey('crm.Campaign', on_delete=models.SET_NULL, null=True, blank=True, related_name='leads')
    # Links a duplicate lead to the original CRM student record
    duplicate_of = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='duplicate_leads'
    )
    
    SALES_SECTION_CHOICES = (
        ('CAREER_ACADEMY', 'Career Academy'),
        ('REGULAR', 'Regular'),
        ('BOTH', 'Both'),
    )
    sales_section = models.CharField(max_length=20, choices=SALES_SECTION_CHOICES, default='BOTH')

    # Meta Facebook Lead Ads Integration
    meta_lead_id = models.CharField(max_length=200, null=True, blank=True, unique=True, help_text='Facebook Lead Ad lead_id for Conversions API feedback')
    LEAD_QUALITY_CHOICES = [
        ('UNKNOWN', 'Not Reviewed'),
        ('QUALITY', 'Quality Lead'),
        ('FAKE', 'Fake / Junk Lead'),
    ]
    lead_quality = models.CharField(max_length=20, choices=LEAD_QUALITY_CHOICES, default='UNKNOWN', help_text='Sales rep feedback sent back to Meta for ad optimization')
    cre_update = models.TextField(blank=True, null=True, default='', help_text='Optional update or notes from Customer Relationship Executive (CRE)')

    @classmethod
    def generate_next_crm_id(cls):
        with transaction.atomic():
            updated = CRMIDCounter.objects.filter(
                pk="student"
            ).update(
                value=F("value") + 1
            )

            if updated != 1:
                raise RuntimeError(
                    "CRM ID counter is not initialized. "
                    "Please run database migrations."
                )

            counter_value = CRMIDCounter.objects.values_list(
                "value",
                flat=True
            ).get(pk="student")

        if counter_value < 1000:
            return f"NATYA-{counter_value:04d}"

        return f"NATYA-{counter_value}"


    @classmethod
    def generate_next_llad_id(cls, target_date=None):
        if target_date is None:
            target_date = datetime.date.today()

        prefix = f"LLAD-{target_date.strftime('%d%m%y')}"
        counter_name = f"llad_{target_date.strftime('%Y%m%d')}"

        with transaction.atomic():
            max_num = 0

            existing_ids = cls.objects.filter(
                crm_student_id__startswith=prefix
            ).values_list("crm_student_id", flat=True)

            for existing_id in existing_ids:
                suffix = existing_id[len(prefix):]

                if suffix.isdigit():
                    max_num = max(max_num, int(suffix))

            CRMIDCounter.objects.get_or_create(
                name=counter_name,
                defaults={"value": max_num}
            )

            updated = CRMIDCounter.objects.filter(
                pk=counter_name
            ).update(
                value=F("value") + 1
            )

            if updated != 1:
                raise RuntimeError("LLAD counter could not be updated.")

            counter_value = CRMIDCounter.objects.values_list(
                "value",
                flat=True
            ).get(pk=counter_name)

        return f"{prefix}{counter_value:03d}"

    # Personal Info - Minimal required for system, others optional
    first_name = models.CharField(max_length=50, blank=True, null=True)
    last_name = models.CharField(max_length=50, blank=True, null=True)
    father_husband_name = models.CharField(max_length=100, blank=True, null=True)
    mother_name = models.CharField(max_length=100, blank=True, null=True)
    dob = models.DateField(blank=True, null=True)
    gender = models.CharField(max_length=20, blank=True, null=True)
    marital_status = models.CharField(max_length=20, blank=True, null=True)
    email = NormalizedEmailField(blank=True, null=True)
    mobile = NormalizedMobileField(max_length=15, blank=True, null=True)
    
    # Address
    perm_address = models.TextField(blank=True, null=True)
    perm_city = models.CharField(max_length=50, blank=True, null=True)
    perm_district = models.CharField(max_length=50, blank=True, null=True)
    perm_state = models.CharField(max_length=50, blank=True, null=True)
    perm_pincode = models.CharField(max_length=10, blank=True, null=True)
    
    corr_address = models.TextField(blank=True, null=True)
    corr_city = models.CharField(max_length=50, blank=True, null=True)
    corr_district = models.CharField(max_length=50, blank=True, null=True)
    corr_state = models.CharField(max_length=50, blank=True, null=True)
    corr_pincode = models.CharField(max_length=10, blank=True, null=True)

    # LMS identifiers
    lms_student_id = models.CharField(max_length=100, blank=True, null=True)
    lms_course_id = models.CharField(max_length=100, blank=True, null=True)
    lms_course_names = models.CharField(max_length=500, blank=True, null=True)
    lms_batch_id = models.CharField(max_length=100, blank=True, null=True)
    
    # Fee Tracking
    total_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0.0)
    paid_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0.0)
    fee_due_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)

    # Welcome message tracking
    welcome_sent = models.BooleanField(default=False)
    welcome_sent_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        # Freshly created leads: ensure canonical 'New Lead' stage is assigned
        # if not explicitly set or if assigned legacy 'NEW'/'new'
        if not self.pk:
            raw_status = str(self.lead_status or '').strip()
            if not raw_status or raw_status.upper() in ['NEW', 'NEW LEAD', 'DEFAULT']:
                try:
                    from crm.utils import get_canonical_new_lead_stage_id
                    self.lead_status = get_canonical_new_lead_stage_id()
                except Exception:
                    pass
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.first_name} {self.last_name}"

class StudentBreakHistory(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='break_history')
    break_start_date = models.DateField(default=datetime.date.today)
    rejoin_date = models.DateField(null=True, blank=True)
    reason = models.TextField(blank=True, null=True)
    is_active_break = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.student} - Break ({self.break_start_date} to {self.rejoin_date or 'Present'})"


class Transaction(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='transactions')
    transaction_id = models.CharField(max_length=100)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    date = models.DateTimeField(auto_now_add=True)
    transaction_link = models.URLField(blank=True, null=True)
    
    def __str__(self):
        return f"{self.student} - {self.transaction_id}"

class Document(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='documents')
    document_type = models.CharField(max_length=50) # e.g., Photo, Aadhar, Marklist
    file = models.FileField(upload_to='student_docs/', validators=[validate_student_document_file])
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.student} - {self.document_type}"

class SyllabusPart(models.Model):
    batch = models.ForeignKey(Batch, on_delete=models.CASCADE, related_name='syllabus_parts')
    semester = models.CharField(max_length=100, blank=True, null=True, help_text="e.g., Semester 1")
    module = models.CharField(max_length=100, blank=True, null=True, help_text="e.g., Module A")
    subject = models.CharField(max_length=100, blank=True, null=True, help_text="e.g., Theory")
    title = models.CharField(max_length=200)
    weight_percentage = models.DecimalField(max_digits=5, decimal_places=2, help_text="Percentage weight of this part")
    is_completed = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']
        
    def __str__(self):
        return f"{self.batch.name} - {self.title}"

class ClassSession(models.Model):
    batch = models.ForeignKey(Batch, on_delete=models.CASCADE, related_name='class_sessions')
    teacher = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='conducted_sessions')
    date = models.DateField()
    teacher_summary = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.batch.name} - {self.date}"

class Attendance(models.Model):
    session = models.ForeignKey(ClassSession, on_delete=models.CASCADE, related_name='attendances')
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='attendances')
    is_present = models.BooleanField(default=True)
    
    class Meta:
        unique_together = ('session', 'student')

    def __str__(self):
        return f"{self.student} - {self.session.date} - {'Present' if self.is_present else 'Absent'}"
class BatchResource(models.Model):
    batch = models.ForeignKey(Batch, on_delete=models.CASCADE, related_name='resources')
    title = models.CharField(max_length=200)
    file = models.FileField(upload_to='batch_resources/', validators=[validate_batch_resource_file])
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.batch.name} - {self.title}"

class Exam(models.Model):
    EXAM_TYPES = [
        ('UNIT', 'Unit Test'),
        ('PERIODIC', 'Periodic Assessment'),
        ('MIDTERM', 'Midterm Examination'),
        ('FINAL', 'Final Examination'),
        ('ASSIGNMENT', 'Assignment/Project'),
        ('VIVA', 'Viva Voce'),
    ]
    batch = models.ForeignKey(Batch, on_delete=models.CASCADE, related_name='exams')
    title = models.CharField(max_length=200)
    exam_type = models.CharField(max_length=20, choices=EXAM_TYPES, default='UNIT')
    description = models.TextField(blank=True, null=True)
    date = models.DateField()
    total_marks = models.DecimalField(max_digits=5, decimal_places=2, default=100)
    passing_marks = models.DecimalField(max_digits=5, decimal_places=2, default=40)
    is_published = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.batch.name} - {self.title}"

class Question(models.Model):
    QUESTION_TYPES = [
        ('MCQ', 'Multiple Choice Topic'),
        ('THEORY', 'Short/Long Answer'),
        ('TRUEFALSE', 'True / False'),
    ]
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name='questions')
    text = models.TextField()
    question_type = models.CharField(max_length=20, choices=QUESTION_TYPES, default='MCQ')
    marks = models.IntegerField(default=1)
    correct_answer_text = models.TextField(blank=True, null=True, help_text="For theory auto-keywords or reference")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.exam.title} - Q: {self.text[:30]}"

class QuestionOption(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name='options')
    option_text = models.CharField(max_length=500)
    is_correct = models.BooleanField(default=False)

    def __str__(self):
        return f"Option for {self.question.id}"

class StudentSubmission(models.Model):
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE)
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    start_time = models.DateTimeField(auto_now_add=True)
    end_time = models.DateTimeField(blank=True, null=True)
    is_submitted = models.BooleanField(default=False)
    
    # Store answers as JSON for flexibility: {question_id: answer_text/option_id}
    answers_json = models.JSONField(default=dict) 
    
    score = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    def __str__(self):
        return f"{self.student.first_name} - {self.exam.title}"

class ExamResult(models.Model):
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name='results')
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='exam_results')
    marks_obtained = models.DecimalField(max_digits=5, decimal_places=2)
    remarks = models.CharField(max_length=200, blank=True, null=True)
    is_present = models.BooleanField(default=True)

    class Meta:
        unique_together = ('exam', 'student')

    def __str__(self):
        return f"{self.student} - {self.exam.title} - {self.marks_obtained}"

class MonthlyPayment(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='monthly_payments')
    month = models.DateField(help_text="First day of the paid month, e.g. YYYY-MM-01")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    paid_date = models.DateField(default=datetime.date.today)
    marked_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        unique_together = ('student', 'month')
        ordering = ['-month', '-paid_date']

    def __str__(self):
        return f"{self.student} - {self.month.strftime('%B %Y')} - {self.amount}"

class StudentTeacherHandover(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='teacher_handovers')
    previous_teacher = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='previous_teacher_handovers')
    current_teacher = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='current_teacher_handovers')
    reason = models.TextField(blank=True, null=True)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='teacher_handovers_initiated')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        prev = f"{self.previous_teacher.first_name} {self.previous_teacher.last_name}" if self.previous_teacher else "None"
        curr = f"{self.current_teacher.first_name} {self.current_teacher.last_name}" if self.current_teacher else "None"
        return f"Handover for {self.student}: {prev} -> {curr}"


class FeeEditLog(models.Model):
    """Audit log for all fee-related changes"""
    ACTION_CHOICES = [
        ('FEE_UPDATE', 'Fee Structure Updated'),
        ('PAYMENT_ADD', 'Payment Recorded'),
        ('PAYMENT_EDIT', 'Payment Edited'),
        ('PAYMENT_DELETE', 'Payment Deleted'),
    ]
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='fee_edit_logs')
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    field_name = models.CharField(max_length=100, blank=True, null=True, help_text="Which field was changed")
    old_value = models.TextField(blank=True, null=True)
    new_value = models.TextField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    edited_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='fee_edits_made')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        editor = self.edited_by.get_full_name() if self.edited_by else 'System'
        return f"{self.student} | {self.action} by {editor} at {self.created_at}"




class StudentFeedback(models.Model):
    TYPE_CHOICES = [
        ('CALL', 'Phone Call'),
        ('WHATSAPP', 'WhatsApp'),
        ('MEETING', 'Meeting'),
        ('NOTE', 'Note'),
    ]
    STATUS_CHOICES = [
        ('CALL_DONE', 'Call Done'),
        ('NO_ANSWER', 'No Answer'),
        ('NOT_REACHABLE', 'Not Reachable'),
        ('CALL_BACK', 'Call Back Later'),
        ('MESSAGE_SENT', 'Message Sent'),
        ('OTHER', 'Other'),
    ]
    CALL_DIRECTION_CHOICES = [('INCOMING', 'Incoming'), ('OUTGOING', 'Outgoing')]
    CALL_STATUS_CHOICES = [
        ('CONNECTED', 'Connected'), ('MISSED', 'Missed'), ('REJECTED', 'Rejected'),
        ('UNANSWERED', 'Unanswered'), ('BUSY', 'Busy'), ('FAILED', 'Failed'),
    ]

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='feedbacks')
    mentor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='given_feedbacks')
    feedback_date = models.DateField(default=datetime.date.today, db_index=True)
    feedback_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='CALL')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES)
    feedback = models.TextField(blank=True, default='')
    next_followup_date = models.DateField(null=True, blank=True)

    # Call details (same shape as LeadInteraction)
    mobile_call_id = models.CharField(max_length=150, null=True, blank=True, unique=True, db_index=True)
    customer_number = models.CharField(max_length=50, null=True, blank=True)
    call_direction = models.CharField(max_length=20, choices=CALL_DIRECTION_CHOICES, null=True, blank=True)
    call_status = models.CharField(max_length=30, choices=CALL_STATUS_CHOICES, null=True, blank=True)
    call_duration = models.IntegerField(default=0, help_text="Duration in seconds")
    start_time = models.DateTimeField(null=True, blank=True)
    end_time = models.DateTimeField(null=True, blank=True)
    audio_recording = models.FileField(upload_to='feedback_recordings/%Y/%m/', null=True, blank=True,
                                       validators=[validate_audio_recording_file])
    recording_url = models.CharField(max_length=1000, null=True, blank=True)

    # Optional link to a call already logged by the mobile app
    interaction = models.ForeignKey('crm.LeadInteraction', on_delete=models.SET_NULL,
                                    null=True, blank=True, related_name='mentor_feedbacks')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-feedback_date', '-created_at']

    def save(self, *args, **kwargs):
        # Same rule as LeadInteraction: unconnected calls carry no duration or recording
        if (self.call_status or '').upper() in ['MISSED', 'REJECTED', 'UNANSWERED', 'FAILED']:
            self.call_duration = 0
            self.recording_url = None
            if self.audio_recording:
                try:
                    self.audio_recording.delete(save=False)
                except Exception:
                    pass
                self.audio_recording = None
        if not self.mobile_call_id:
            self.mobile_call_id = None   # keep the unique constraint happy for blanks
        super().save(*args, **kwargs)