from django.db import models
from hrms.models import EmployeeProfile

class SalaryStructure(models.Model):
    employee = models.OneToOneField(EmployeeProfile, on_delete=models.CASCADE, related_name='salary_structure')
    base_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    hra = models.DecimalField(max_digits=12, decimal_places=2, default=0.00, verbose_name="House Rent Allowance")
    conveyance = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    medical = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    special_allowance = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    
    # Statutory Deductions (can be expanded)
    provident_fund = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    professional_tax = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Salary Structure - {self.employee.user.get_full_name()}"

    @property
    def total_allowances(self):
        return self.hra + self.conveyance + self.medical + self.special_allowance

    @property
    def total_deductions(self):
        return self.provident_fund + self.professional_tax

    @property
    def net_salary(self):
        return (self.base_salary + self.total_allowances) - self.total_deductions

class Payslip(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('PAID', 'Paid'),
        ('CANCELLED', 'Cancelled'),
    ]
    
    employee = models.ForeignKey(EmployeeProfile, on_delete=models.CASCADE, related_name='payslips')
    month = models.IntegerField() # 1 to 12
    year = models.IntegerField()
    
    basic_pay = models.DecimalField(max_digits=12, decimal_places=2)
    total_allowances = models.DecimalField(max_digits=12, decimal_places=2)
    lop_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    loan_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    total_deductions = models.DecimalField(max_digits=12, decimal_places=2)
    net_salary = models.DecimalField(max_digits=12, decimal_places=2)
    
    total_working_days = models.IntegerField(default=30)
    paid_days = models.DecimalField(max_digits=4, decimal_places=1, default=30.0)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    payment_method = models.CharField(max_length=50, blank=True, null=True)
    paid_on = models.DateTimeField(blank=True, null=True)
    
    generated_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        unique_together = ('employee', 'month', 'year')

    def __str__(self):
        return f"Payslip {self.month}/{self.year} - {self.employee.user.get_full_name()}"

class BonusDeduction(models.Model):
    TYPE_CHOICES = [
        ('BONUS', 'Bonus'),
        ('DEDUCTION', 'Deduction'),
    ]
    
    employee = models.ForeignKey(EmployeeProfile, on_delete=models.CASCADE, related_name='adjustments')
    adjustment_type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.CharField(max_length=255)
    month = models.IntegerField()
    year = models.IntegerField()
    is_applied = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.adjustment_type} - {self.amount} ({self.employee.user.username})"

class EmployeeLoan(models.Model):
    employee = models.ForeignKey(EmployeeProfile, on_delete=models.CASCADE, related_name='loans')
    loan_amount = models.DecimalField(max_digits=12, decimal_places=2)
    monthly_repayment = models.DecimalField(max_digits=12, decimal_places=2)
    balance_amount = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Loan {self.employee.user.username} - Bal: {self.balance_amount}"
