import os
import sys
import django
import requests

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def test_sessions_paginated():
    wise = WiseService()
    class_id = "69e89e5dbb8d6511d21d483b"
    
    url = f"https://api.wiseapp.live/institutes/{wise.institute_id}/sessions?classId={class_id}&paginateBy=COUNT"
    print(f"Testing URL: {url}")
    res = requests.get(url, headers=wise.get_headers())
    print(f"Status: {res.status_code}")
    print(f"Response: {res.text[:500]}")

if __name__ == "__main__":
    test_sessions_paginated()
