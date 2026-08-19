import os
import sys
import django

sys.path.append(r'c:\Users\91811\OneDrive\Desktop\Natya Aug\minicrm\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import Program

print("Programs in Database:")
for program in Program.objects.all():
    print(f"  ID: {program.id} | Name: {program.name} | Slug: {program.slug}")



