from django.db import models
from django.conf import settings

class Program(models.Model):
    name = models.CharField(max_length=100) # e.g., Natya, Natya Career Academy
    description = models.TextField(blank=True)
    slug = models.SlugField(unique=True, blank=True, null=True)
    require_payment = models.BooleanField(default=False)
    registration_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    def __str__(self):
        return self.name

class SubProgram(models.Model):
    program = models.ForeignKey(Program, on_delete=models.CASCADE, related_name='sub_programs')
    name = models.CharField(max_length=100) # e.g., STED, AISECT
    require_payment = models.BooleanField(default=False)
    registration_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
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

    def __str__(self):
        return self.name

class Student(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='student_profile')
    crm_student_id = models.CharField(max_length=50, unique=True)
    program_type = models.ForeignKey(Program, on_delete=models.PROTECT)
    sub_program = models.ForeignKey(SubProgram, on_delete=models.SET_NULL, null=True, blank=True)
    course = models.ForeignKey(Course, on_delete=models.SET_NULL, null=True, blank=True)
    batch = models.ForeignKey(Batch, on_delete=models.SET_NULL, null=True, related_name='students')
    is_active = models.BooleanField(default=True)
    
    # Personal Info - Minimal required for system, others optional
    first_name = models.CharField(max_length=50, blank=True, null=True)
    last_name = models.CharField(max_length=50, blank=True, null=True)
    father_husband_name = models.CharField(max_length=100, blank=True, null=True)
    mother_name = models.CharField(max_length=100, blank=True, null=True)
    dob = models.DateField(blank=True, null=True)
    gender = models.CharField(max_length=20, blank=True, null=True)
    marital_status = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    mobile = models.CharField(max_length=15, blank=True, null=True)
    
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
    lms_batch_id = models.CharField(max_length=100, blank=True, null=True)

    def __str__(self):
        return f"{self.first_name} {self.last_name}"

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
    file = models.FileField(upload_to='student_docs/')
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
    file = models.FileField(upload_to='batch_resources/')
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
