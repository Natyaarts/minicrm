import os
import sys
import django
import requests

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def test_v2_classes():
    wise = WiseService()
    print("--- TESTING V2 vs V3 CLASSES ---")
    
    # 1. Test V3
    url_v3 = f"https://{wise.host}/institutes/v3/{wise.institute_id}/classes?type=LIVE"
    print(f"Checking V3: {url_v3}")
    res_v3 = requests.get(url_v3, headers=wise.get_headers())
    print(f"V3 Status: {res_v3.status_code}")
    if res_v3.status_code == 200:
        print(f"V3 Count: {len(res_v3.json().get('data', {}).get('classes', []))}")
        
    # 2. Test V2
    url_v2 = f"https://{wise.host}/institutes/{wise.institute_id}/classes?classType=LIVE"
    print(f"Checking V2: {url_v2}")
    res_v2 = requests.get(url_v2, headers=wise.get_headers())
    print(f"V2 Status: {res_v2.status_code}")
    if res_v2.status_code == 200:
        print(f"V2 Response Data: {res_v2.json().get('data', [])[:1]}") # Sample 1

if __name__ == "__main__":
    test_v2_classes()
