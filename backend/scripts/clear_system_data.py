import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.apps import apps
from django.contrib.auth import get_user_model
from django.db import transaction

User = get_user_model()

def clear_all_data():
    print("Starting system-wide data cleanup...")
    
    # We want to keep superusers so you can still log in
    superusers = list(User.objects.filter(is_superuser=True))
    superuser_ids = [u.id for u in superusers]
    
    # List of models to skip entirely (system metadata)
    excluded_models = [
        'ContentType', 
        'Permission', 
        'Group', 
        'Session', 
        'LogEntry',
        'Migration'
    ]

    with transaction.atomic():
        # Iterate through all installed apps
        for app_config in apps.get_app_configs():
            for model in app_config.get_models():
                model_name = model.__name__
                
                if model_name in excluded_models:
                    continue
                
                try:
                    count = 0
                    if model == User:
                        # Keep superusers
                        res = model.objects.exclude(id__in=superuser_ids).delete()
                        count = res[0]
                    else:
                        res = model.objects.all().delete()
                        count = res[0]
                    
                    if count > 0:
                        print(f"✅ Cleared {count} records from {app_config.label}.{model_name}")
                except Exception as e:
                    print(f"⚠️ Could not clear {model_name}: {str(e)}")

    print("\n✨ Cleanup Complete! All student data, programs, courses, and transactions have been removed.")
    print(f"👤 Kept {len(superusers)} SuperAdmin accounts for access.")

if __name__ == "__main__":
    clear_all_data()
