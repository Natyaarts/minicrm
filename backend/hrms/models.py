from django.db import models
from django.conf import settings

class Department(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

class Designation(models.Model):
    ROLE_CHOICES = (
        ('ADMIN', 'Admin'),
        ('SALES', 'Sales'),
        ('MENTOR', 'Mentor'),
        ('ACADEMIC', 'Academic'),
        ('ACADEMIC_COORDINATOR', 'Coordinator'),
        ('TEACHER', 'Teacher'),
        ('EMPLOYEE', 'General Employee'),
    )
    name = models.CharField(max_length=100, unique=True)
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='designations')
    permission_role = models.CharField(max_length=30, choices=ROLE_CHOICES, default='EMPLOYEE')
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.department.name})"

class CustomField(models.Model):
    FIELD_TYPES = (
        ('text', 'Text'),
        ('number', 'Number'),
        ('date', 'Date'),
        ('select', 'Dropdown'),
        ('file', 'Image / File'),
    )
    name = models.CharField(max_length=100)
    label = models.CharField(max_length=100)
    field_type = models.CharField(max_length=20, choices=FIELD_TYPES, default='text')
    required = models.BooleanField(default=False)
    options = models.JSONField(blank=True, null=True, help_text="For dropdowns, provide a list of options.")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.label

class EmployeeProfile(models.Model):
    EMPLOYMENT_TYPE_CHOICES = (
        ('FULL_TIME', 'Full Time'),
        ('PART_TIME', 'Part Time'),
        ('CONTRACT', 'Contract'),
        ('INTERN', 'Intern'),
    )
    
    STATUS_CHOICES = (
        ('ACTIVE', 'Active'),
        ('ON_LEAVE', 'On Leave'),
        ('RESIGNED', 'Resigned'),
        ('TERMINATED', 'Terminated'),
    )

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='hrms_profile')
    employee_id = models.CharField(max_length=20, unique=True)
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True)
    designation = models.ForeignKey(Designation, on_delete=models.SET_NULL, null=True, blank=True)
    reporting_to = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='subordinates')
    
    # Personal Information
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=10, blank=True)
    
    # Job Information
    date_of_joining = models.DateField()
    employment_type = models.CharField(max_length=20, choices=EMPLOYMENT_TYPE_CHOICES, default='FULL_TIME')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ACTIVE')
    base_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    # Dynamic Custom Data
    additional_data = models.JSONField(default=dict, blank=True)
    
    address = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        # Auto-sync permission role from designation to user
        if self.designation and self.designation.permission_role:
            user = self.user
            if hasattr(user, 'role') and user.role != self.designation.permission_role:
                user.role = self.designation.permission_role
                user.save(update_fields=['role'])
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.user.get_full_name()} ({self.employee_id})"

class ShiftSetting(models.Model):
    name = models.CharField(max_length=50, default="General Shift")
    start_time = models.TimeField(default="09:00:00")
    end_time = models.TimeField(default="18:00:00")
    grace_period_minutes = models.IntegerField(default=15)
    
    # Geofencing Data
    office_latitude = models.DecimalField(max_digits=9, decimal_places=6, default=0.0)
    office_longitude = models.DecimalField(max_digits=9, decimal_places=6, default=0.0)
    allowed_radius_meters = models.IntegerField(default=200, help_text="Radius in meters from office coordinates")
    
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} ({self.start_time} - {self.end_time})"

class Attendance(models.Model):
    STATUS_CHOICES = (
        ('PRESENT', 'Present'),
        ('LATE', 'Late'),
        ('ABSENT', 'Absent'),
        ('HALF_DAY', 'Half Day'),
        ('ON_LEAVE', 'On Leave'),
    )

    employee = models.ForeignKey(EmployeeProfile, on_delete=models.CASCADE, related_name='attendance_records')
    date = models.DateField(auto_now_add=True)
    clock_in = models.TimeField(null=True, blank=True)
    clock_out = models.TimeField(null=True, blank=True)
    
    # Location Data for Geo-Fencing
    clock_in_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    clock_in_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    clock_out_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    clock_out_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    
    # Verification Data
    clock_in_photo = models.ImageField(upload_to='attendance_photos/', null=True, blank=True)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PRESENT')
    notes = models.TextField(blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('employee', 'date')
        ordering = ['-date', '-clock_in']

    def __str__(self):
        return f"{self.employee.user.username} - {self.date}"

class Task(models.Model):
    STATUS_CHOICES = (
        ('TODO', 'To Do'),
        ('IN_PROGRESS', 'In Progress'),
        ('REVIEW', 'In Review'),
        ('DONE', 'Done'),
    )
    PRIORITY_CHOICES = (
        ('LOW', 'Low'),
        ('MEDIUM', 'Medium'),
        ('HIGH', 'High'),
        ('URGENT', 'Urgent'),
    )
    
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    assignee = models.ForeignKey(EmployeeProfile, on_delete=models.CASCADE, related_name='assigned_tasks')
    assigned_by = models.ForeignKey(EmployeeProfile, on_delete=models.SET_NULL, null=True, related_name='created_tasks')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='TODO')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='MEDIUM')
    due_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} - {self.assignee.user.get_full_name()}"

class TaskComment(models.Model):
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Comment by {self.author.username} on {self.task.title}"

class CompanyPost(models.Model):
    POST_TYPE_CHOICES = (
        ('GENERAL', 'General Post'),
        ('ANNOUNCEMENT', 'Announcement'),
        ('CELEBRATION', 'Celebration'),
    )
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='company_posts')
    content = models.TextField()
    post_type = models.CharField(max_length=20, choices=POST_TYPE_CHOICES, default='GENERAL')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.post_type} by {self.author.username} on {self.created_at.date()}"

class EmployeeDocument(models.Model):
    employee = models.ForeignKey(EmployeeProfile, on_delete=models.CASCADE, related_name='documents')
    document_type = models.CharField(max_length=100) # e.g. Resume, ID Proof, Contract
    file = models.FileField(upload_to='employee_docs/')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.document_type} - {self.employee.user.username}"

class Asset(models.Model):
    STATUS_CHOICES = (
        ('AVAILABLE', 'Available'),
        ('ASSIGNED', 'Assigned'),
        ('MAINTENANCE', 'In Maintenance'),
        ('RETIRED', 'Retired'),
    )
    name = models.CharField(max_length=100)
    asset_id = models.CharField(max_length=50, unique=True)
    category = models.CharField(max_length=50) # Laptop, Monitor, Key
    assigned_to = models.ForeignKey(EmployeeProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name='assets')
    assigned_date = models.DateField(null=True, blank=True)
    returned_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='AVAILABLE')

    def __str__(self):
        return f"{self.name} ({self.asset_id})"

class Expense(models.Model):
    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
        ('PAID', 'Paid'),
    )
    employee = models.ForeignKey(EmployeeProfile, on_delete=models.CASCADE, related_name='expenses')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    category = models.CharField(max_length=50) # Travel, Internet, Meals
    description = models.TextField()
    receipt = models.FileField(upload_to='expense_receipts/', null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    submitted_date = models.DateField(auto_now_add=True)

    def __str__(self):
        return f"{self.employee.user.username} - {self.amount} ({self.status})"

class PerformanceReview(models.Model):
    employee = models.ForeignKey(EmployeeProfile, on_delete=models.CASCADE, related_name='reviews')
    reviewer = models.ForeignKey(EmployeeProfile, on_delete=models.SET_NULL, null=True, related_name='reviews_given')
    review_period = models.CharField(max_length=50) # e.g. Q1 2026
    rating = models.IntegerField() # 1 to 5
    feedback = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.employee.user.username} - {self.review_period} - {self.rating}/5"

class Offboarding(models.Model):
    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('IN_PROGRESS', 'In Progress'),
        ('COMPLETED', 'Completed'),
    )
    employee = models.OneToOneField(EmployeeProfile, on_delete=models.CASCADE, related_name='offboarding')
    resignation_date = models.DateField()
    last_working_day = models.DateField()
    reason = models.TextField()
    assets_returned = models.BooleanField(default=False)
    exit_interview_completed = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')

    def __str__(self):
        return f"Offboarding: {self.employee.user.username}"
