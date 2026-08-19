import os
import sys
import django

sys.path.append(r'c:\Users\91811\OneDrive\Desktop\Natya Aug\minicrm\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from crm.models import PipelineStage

print("Pipeline Stages:")
for stage in PipelineStage.objects.all():
    print(f"  ID: {stage.id} | Name: {stage.name} | Order: {stage.order}")

