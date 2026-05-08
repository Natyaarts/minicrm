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
        print(f"Full Course Data Keys: {list(c.keys())}")
        print(f"Instructor field value: {c.get('instructor')}")
        print(f"Teacher field value: {c.get('teacher')}")
        print(f"User field value: {c.get('user')}")
        # Show whole object for one class to be sure
        import json
        print(f"SAMPLE CLASS DATA: {json.dumps(c, indent=2)}")

if __name__ == "__main__":
    inspect_one()
