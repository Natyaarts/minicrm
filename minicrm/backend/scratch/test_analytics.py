import os
import sys
import django
import requests
import json

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def test_analytics():
    wise = WiseService()
    # Try different analytics links
    urls = [
        f"https://api.wiseapp.live/institutes/v3/{wise.institute_id}/analytics/teachers",
        f"https://api.wiseapp.live/institutes/{wise.institute_id}/analytics/teachers",
        f"https://api.wiseapp.live/institutes/v3/{wise.institute_id}/analytics/sessions",
        f"https://api.wiseapp.live/institutes/{wise.institute_id}/analytics/sessions",
        f"https://api.wiseapp.live/institutes/v3/{wise.institute_id}/sessions",
        f"https://api.wiseapp.live/institutes/{wise.institute_id}/sessions",
    ]
    
    for url in urls:
        print(f"Testing URL: {url}")
        res = requests.get(url, headers=wise.get_headers())
        print(f"Status: {res.status_code}")
        if res.status_code == 200:
            print(f"SUCCESS: {url}")
            try:
                data = res.json()
                print(f"Keys: {list(data.keys())}")
                if 'data' in data:
                    print(f"Sample data: {str(data['data'])[:200]}")
            except:
                pass

if __name__ == "__main__":
    test_analytics()
