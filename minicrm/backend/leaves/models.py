from django.db import models
from hrms.models import EmployeeProfile

class LeaveType(models.Model):
    name = models.CharField(max_length=50) # Casual, Sick, Earned, LOP
    code = models.CharField(max_length=10, unique=True) # CL, SL, EL, LOP
    description = models.TextField(blank=True)
    is_paid = models.BooleanField(default=True)
    max_days_per_year = models.IntegerField(default=12)

    def __str__(self):
        return self.name

class LeaveBalance(models.Model):
    employee = models.ForeignKey(EmployeeProfile, on_delete=models.CASCADE, related_name='leave_balances')
    leave_type = models.ForeignKey(LeaveType, on_delete=models.CASCADE)
    total_days = models.DecimalField(max_digits=5, decimal_places=1)
    used_days = models.DecimalField(max_digits=5, decimal_places=1, default=0)
    
    @property
    def remaining_days(self):
        return self.total_days - self.used_days

    class Meta:
        unique_together = ('employee', 'leave_type')

    def __str__(self):
        return f"{self.employee.user.username} - {self.leave_type.code}: {self.remaining_days}"

class LeaveRequest(models.Model):
    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
        ('CANCELLED', 'Cancelled'),
    )
    
    employee = models.ForeignKey(EmployeeProfile, on_delete=models.CASCADE, related_name='leave_requests')
    leave_type = models.ForeignKey(LeaveType, on_delete=models.CASCADE)
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    approved_by = models.ForeignKey(EmployeeProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_leaves')
    rejection_reason = models.TextField(blank=True)
    applied_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"{self.employee.user.username} - {self.leave_type.name} ({self.start_date} to {self.end_date})"

    @property
    def duration(self):
        import datetime
        total_days = 0
        current_date = self.start_date
        while current_date <= self.end_date:
            # weekday() returns 6 for Sunday. Saturdays (5) are counted.
            if current_date.weekday() != 6:
                # Also skip if the day is an official Holiday
                if not Holiday.objects.filter(date=current_date).exists():
                    total_days += 1
            current_date += datetime.timedelta(days=1)
        return total_days

class Holiday(models.Model):
    name = models.CharField(max_length=100)
    date = models.DateField()
    description = models.TextField(blank=True)

    def __str__(self):
        return f"{self.name} ({self.date})"
