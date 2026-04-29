import os
import sys
import django
import requests

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def force_test():
    wise = WiseService()
    print("--- FORCE TESTING TEACHER SYNC ---")
    
    # Test V2 Classes
    url = f"https://{wise.host}/institutes/{wise.institute_id}/classes?classType=LIVE"
    print(f"URL: {url}")
    res = requests.get(url, headers=wise.get_headers())
    print(f"Status: {res.status_code}")
    
    if res.status_code == 200:
        data = res.json()
        classes = data.get('data', {}).get('classes', [])
        print(f"Classes Found: {len(classes)}")
        
        unique_t = {}
        for c in classes[:20]: # Check first 20
            instr = c.get('instructor')
            if instr:
                t_id = instr.get('_id') or instr.get('id')
                print(f"Found Instructor: {instr.get('name')} (ID: {t_id})")
                if t_id: unique_t[t_id] = instr
        
        print(f"\nUnique Teachers identified in first 20 classes: {len(unique_t)}")
    else:
        print(f"Error Response: {res.text}")

if __name__ == "__main__":
    force_test()
