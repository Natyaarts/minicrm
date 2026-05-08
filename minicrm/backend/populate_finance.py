import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from finance.models import ExpenseCategory

categories = [
    "Salaries & Wages",
    "Office Rent",
    "Electricity & Utilities",
    "Internet & Software",
    "Marketing & Ads",
    "Stationery & Supplies",
    "Travel & Transport",
    "Maintenance & Repairs"
]

for cat_name in categories:
    obj, created = ExpenseCategory.objects.get_or_create(name=cat_name)
    if created:
        print(f"Created category: {cat_name}")
    else:
        print(f"Category already exists: {cat_name}")
