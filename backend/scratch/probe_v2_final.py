import os
import sys
import django
import requests

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def probe_v2_final():
    wise = WiseService()
    class_id = "69e89e5dbb8d6511d21d483b"
    # Try putting v2 at the start
    url = f"https://api.wiseapp.live/v2/institutes/{wise.institute_id}/sessionLogs?classId={class_id}"
    print(f"Probing V2 Final: {url}")
    res = requests.get(url, headers=wise.get_headers())
    print(f"Status: {res.status_code}")
    if res.status_code == 200:
        print("SUCCESS!")

if __name__ == "__main__":
    probe_v2_final()
