import os
import sys
import django
import requests

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def test_sessions():
    wise = WiseService()
    class_id = "69e89e5dbb8d6511d21d483b"
    
    url = f"https://api.wiseapp.live/institutes/{wise.institute_id}/sessions?classId={class_id}"
    print(f"Testing URL: {url}")
    res = requests.get(url, headers=wise.get_headers())
    print(f"Status: {res.status_code}")
    print(f"Response: {res.text}")
    
    # Try class_id
    url2 = f"https://api.wiseapp.live/institutes/{wise.institute_id}/sessions?class_id={class_id}"
    print(f"Testing URL2: {url2}")
    res2 = requests.get(url2, headers=wise.get_headers())
    print(f"Status: {res2.status_code}")
    print(f"Response: {res2.text[:200]}")

if __name__ == "__main__":
    test_sessions()
