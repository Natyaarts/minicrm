from django.db import models
from django.conf import settings

class Program(models.Model):
    name = models.CharField(max_length=100) # e.g., Natya, Natya Career Academy
    description = models.TextField(blank=True)
    slug = models.SlugField(unique=True, blank=True, null=True)

    def __str__(self):
        return self.name

class SubProgram(models.Model):
    program = models.ForeignKey(Program, on_delete=models.CASCADE, related_name='sub_programs')
    name = models.CharField(max_length=100) # e.g., STED, AISECT
    
    def __str__(self):
        return f"{self.program.name} - {self.name}"

class Course(models.Model):
    sub_program = models.ForeignKey(SubProgram, on_delete=models.CASCADE, related_name='courses')
    name = models.CharField(max_length=100)
    fee_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    def __str__(self):
        return self.name

class Batch(models.Model):
    name = models.CharField(max_length=100)
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='batches')
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    primary_mentor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='primary_batches')
    secondary_mentors = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name='secondary_batches')

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
    first_name = models.CharField(max_length=50) # Keep first name as basic identifier
    last_name = models.CharField(max_length=50, blank=True, null=True)
    father_husband_name = models.CharField(max_length=100, blank=True, null=True)
    mother_name = models.CharField(max_length=100, blank=True, null=True)
    dob = models.DateField(blank=True, null=True)
    gender = models.CharField(max_length=20, blank=True, null=True)
    marital_status = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    mobile = models.CharField(max_length=15) # Keep mobile as basic identifier
    
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

