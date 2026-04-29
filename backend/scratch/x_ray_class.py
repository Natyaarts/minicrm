import os
import sys
import django
import requests
import json

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def x_ray():
    wise = WiseService()
    class_id = "69e89e5dbb8d6511d21d483b"
    url = f"https://{wise.host}/user/v2/classes/{class_id}?full=true"
    res = requests.get(url, headers=wise.get_headers())
    if res.status_code == 200:
        data = res.json().get('data', {})
        print(f"Keys: {list(data.keys())}")
        # Look for anything related to sessions, live, or zoom
        for k in data.keys():
            if 'session' in k.lower() or 'live' in k.lower() or 'log' in k.lower():
                print(f"Found Field '{k}': {data[k]}")

if __name__ == "__main__":
    x_ray()
