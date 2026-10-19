import calendar
from datetime import timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from finance.models import Expense, ExpenseCategory

User = get_user_model()


class ExpenseSummaryTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_superuser(
            username='admin_finance',
            email='admin_finance@example.com',
            password='testpassword123',
            role='SUPER_ADMIN'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.cat1 = ExpenseCategory.objects.create(name='Office Supplies')
        self.cat2 = ExpenseCategory.objects.create(name='Software')

    def test_summary_strictly_bounds_to_current_month(self):
        today = timezone.now().date()
        first_day = today.replace(day=1)
        _, last_day_num = calendar.monthrange(today.year, today.month)
        last_day = today.replace(day=last_day_num)

        # Expense in current month
        Expense.objects.create(
            title='Current Month 1',
            category=self.cat1,
            amount=Decimal('500.00'),
            date=first_day,
            payment_method='BANK_TRANSFER'
        )
        Expense.objects.create(
            title='Current Month 2',
            category=self.cat2,
            amount=Decimal('300.00'),
            date=last_day,
            payment_method='UPI'
        )

        # Expense in previous month
        prev_month_last_day = first_day - timedelta(days=1)
        Expense.objects.create(
            title='Previous Month Expense',
            category=self.cat1,
            amount=Decimal('1000.00'),
            date=prev_month_last_day,
            payment_method='CASH'
        )

        # Expense in next month
        next_month_first_day = last_day + timedelta(days=1)
        Expense.objects.create(
            title='Next Month Expense',
            category=self.cat2,
            amount=Decimal('2000.00'),
            date=next_month_first_day,
            payment_method='CARD'
        )

        response = self.client.get('/api/finance/expenses/summary/')
        self.assertEqual(response.status_code, 200)
        data = response.data

        # monthly_total should only be 500 + 300 = 800
        self.assertEqual(Decimal(str(data['monthly_total'])), Decimal('800.00'))

        # all_time_total should be 500 + 300 + 1000 + 2000 = 3800
        self.assertEqual(Decimal(str(data['all_time_total'])), Decimal('3800.00'))

        # Breakdown should only have current month expenses: cat1 = 500, cat2 = 300
        breakdown_dict = {item['name']: item['value'] for item in data['breakdown']}
        self.assertEqual(breakdown_dict.get('Office Supplies'), 500.0)
        self.assertEqual(breakdown_dict.get('Software'), 300.0)
