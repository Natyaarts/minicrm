from rest_framework import serializers
from .models import Expense, ExpenseCategory

class ExpenseCategorySerializer(serializers.ModelSerializer):
    expense_count = serializers.IntegerField(source='expenses.count', read_only=True)
    total_spent = serializers.SerializerMethodField()

    class Meta:
        model = ExpenseCategory
        fields = ['id', 'name', 'description', 'expense_count', 'total_spent']

    def get_total_spent(self, obj):
        from django.db.models import Sum
        return obj.expenses.aggregate(Sum('amount'))['amount__sum'] or 0

class ExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.ReadOnlyField(source='category.name')

    class Meta:
        model = Expense
        fields = '__all__'
