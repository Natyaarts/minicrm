import os
import sys
import django
import requests

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def inspect_one():
    wise = WiseService()
    url = f"https://{wise.host}/institutes/{wise.institute_id}/classes?classType=LIVE"
    res = requests.get(url, headers=wise.get_headers())
    data = res.json()
    classes = data.get('data', {}).get('classes', [])
    if classes:
        c = classes[0]
        # Only print the most likely teacher fields
        for k in ['instructor', 'teacher', 'host', 'creator', 'user']:
            print(f"Field '{k}': {c.get(k)}")
        
        # If none of those, print all keys that look like IDs
        for k, v in c.items():
            if isinstance(v, str) and len(v) == 24:
                print(f"Possible ID Field '{k}': {v}")

if __name__ == "__main__":
    inspect_one()
