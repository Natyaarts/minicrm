from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.db.models import Sum
from .models import Expense, ExpenseCategory
from .serializers import ExpenseSerializer, ExpenseCategorySerializer
from datetime import datetime, timedelta

class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    queryset = ExpenseCategory.objects.all()
    serializer_class = ExpenseCategorySerializer
    permission_classes = [permissions.IsAuthenticated]

class ExpenseViewSet(viewsets.ModelViewSet):
    queryset = Expense.objects.all()
    serializer_class = ExpenseSerializer
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=['get'])
    def summary(self, request):
        # Get total expenses for current month
        today = datetime.now()
        first_day = today.replace(day=1)
        
        monthly_total = Expense.objects.filter(date__gte=first_day).aggregate(Sum('amount'))['amount__sum'] or 0
        all_time_total = Expense.objects.aggregate(Sum('amount'))['amount__sum'] or 0
        
        # Get category breakdown
        categories = ExpenseCategory.objects.all()
        breakdown = []
        for cat in categories:
            total = Expense.objects.filter(category=cat, date__gte=first_day).aggregate(Sum('amount'))['amount__sum'] or 0
            if total > 0:
                breakdown.append({
                    "name": cat.name,
                    "value": float(total)
                })

        return Response({
            "monthly_total": monthly_total,
            "all_time_total": all_time_total,
            "breakdown": breakdown
        })
