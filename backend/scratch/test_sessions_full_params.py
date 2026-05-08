import os
import sys
import django
import requests
import json

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def test_sessions_full_params():
    wise = WiseService()
    class_id = "69e89e5dbb8d6511d21d483b"
    
    url = f"https://api.wiseapp.live/institutes/{wise.institute_id}/sessions?classId={class_id}&paginateBy=COUNT&page_number=1&page_size=100"
    print(f"Testing URL: {url}")
    res = requests.get(url, headers=wise.get_headers())
    print(f"Status: {res.status_code}")
    if res.status_code == 200:
        data = res.json()
        print(f"Data keys: {list(data.keys())}")
        if 'data' in data:
            print(f"Inner Data keys: {list(data['data'].keys())}")
            if 'sessions' in data['data']:
                sessions = data['data']['sessions']
                print(f"Found {len(sessions)} sessions!")
                if sessions:
                    print(f"Sample Session: {json.dumps(sessions[0], indent=2)}")
    else:
        print(f"Error: {res.text}")

if __name__ == "__main__":
    test_sessions_full_params()
