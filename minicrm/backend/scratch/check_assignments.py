import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import Batch
from django.contrib.auth import get_user_model

User = get_user_model()

print("--- Batch Assignments ---")
for batch in Batch.objects.all():
    if batch.teacher:
        print(f"Batch: {batch.name} (ID: {batch.id}) -> Teacher: {batch.teacher.username} (ID: {batch.teacher.id})")
    else:
        # print(f"Batch: {batch.name} -> No Teacher")
        pass

print("\n--- Teacher Check ---")
test_user = User.objects.filter(username='test').first()
if test_user:
    assigned = Batch.objects.filter(teacher=test_user)
    print(f"User 'test' has {assigned.count()} assigned batches.")
    for b in assigned:
        print(f"- {b.name}")
else:
    print("User 'test' not found.")
