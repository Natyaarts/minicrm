import os
import sys
import django
import requests

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def probe_user_id():
    wise = WiseService()
    class_id = "69e89e5dbb8d6511d21d483b"
    # Try using USER_ID instead of INSTITUTE_ID
    user_id = os.getenv("WISE_USER_ID")
    url = f"https://api.wiseapp.live/institutes/v3/{user_id}/sessionLogs?classId={class_id}"
    print(f"Probing User ID URL: {url}")
    res = requests.get(url, headers=wise.get_headers())
    print(f"Status: {res.status_code}")
    if res.status_code == 200:
        print("SUCCESS!")

if __name__ == "__main__":
    probe_user_id()
