import os
import django
import sys

# Set up Django environment
sys.path.append('c:/Users/91811/OneDrive/Desktop/Natyaerp/minicrm/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from leaves.models import Holiday
from datetime import date

def populate():
    print("Populating Kerala Public Holidays 2026...")
    holidays = [
        {'name': 'Mannam Jayanthi', 'date': date(2026, 1, 2)},
        {'name': 'Republic Day', 'date': date(2026, 1, 26)},
        {'name': 'Id-ul-Fitr (Ramzan)', 'date': date(2026, 3, 20)},
        {'name': 'Maundy Thursday', 'date': date(2026, 4, 2)},
        {'name': 'Good Friday', 'date': date(2026, 4, 3)},
        {'name': 'Vishu', 'date': date(2026, 4, 15)},
        {'name': 'May Day', 'date': date(2026, 5, 1)},
        {'name': 'Id-ul-Ad\'ha (Bakrid)', 'date': date(2026, 5, 27)},
        {'name': 'Muharram', 'date': date(2026, 6, 25)},
        {'name': 'Karkadaka Vavu', 'date': date(2026, 8, 12)},
        {'name': 'Independence Day', 'date': date(2026, 8, 15)},
        {'name': 'First Onam', 'date': date(2026, 8, 25)},
        {'name': 'Thiruvonam', 'date': date(2026, 8, 26)},
        {'name': 'Third Onam', 'date': date(2026, 8, 27)},
        {'name': 'Fourth Onam / Sree Narayana Guru Jayanthi', 'date': date(2026, 8, 28)},
        {'name': 'Sreekrishna Jayanthi', 'date': date(2026, 9, 4)},
        {'name': 'Sree Narayana Guru Samadhi Day', 'date': date(2026, 9, 21)},
        {'name': 'Gandhi Jayanthi', 'date': date(2026, 10, 2)},
        {'name': 'Mahanavami', 'date': date(2026, 10, 20)},
        {'name': 'Vijayadasami', 'date': date(2026, 10, 21)},
        {'name': 'Christmas', 'date': date(2026, 12, 25)},
    ]
    
    for h in holidays:
        obj, created = Holiday.objects.get_or_create(date=h['date'], defaults=h)
        if created:
            print(f"Created Holiday: {h['name']}")
        else:
            # Update name if it changed
            if obj.name != h['name']:
                obj.name = h['name']
                obj.save()
                print(f"Updated Holiday: {h['name']}")
            else:
                print(f"Holiday {h['name']} already exists")

if __name__ == '__main__':
    populate()
