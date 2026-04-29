import os
import sys
import django
import requests

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import Batch
from integrations.utils import WiseService

def compare_names():
    wise = WiseService()
    print("--- COMPARING CRM vs WISE NAMES ---")
    
    # 1. CRM Names
    crm_batches = [b.batch_name for b in Batch.objects.all()[:10]]
    print(f"Sample CRM Names: {crm_batches}")
    
    # 2. Wise Names
    wise_classes = wise.get_course_list(type="LIVE")
    wise_names = [wc.get('title') or wc.get('name') for wc in wise_classes[:10]]
    print(f"Sample Wise Names: {wise_names}")

if __name__ == "__main__":
    compare_names()
