import os
import sys
import django
import requests

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def deep_probe_v2():
    wise = WiseService()
    class_id = "69e89e5dbb8d6511d21d483b"
    # Try putting /api/ in different places
    urls = [
        f"https://api.wiseapp.live/institutes/v3/{wise.institute_id}/sessionLogs?classId={class_id}",
        f"https://api.wiseapp.live/institutes/{wise.institute_id}/v3/sessionLogs?classId={class_id}",
        f"https://api.wiseapp.live/institutes/{wise.institute_id}/sessionLogs?classId={class_id}",
        f"https://api.wiseapp.live/user/v3/institutes/{wise.institute_id}/sessionLogs?classId={class_id}",
        f"https://api.wiseapp.live/user/v2/institutes/{wise.institute_id}/sessionLogs?classId={class_id}",
        f"https://api.wiseapp.live/institutes/v3/{wise.institute_id}/classes/{class_id}/sessionLogs"
    ]
    
    for url in urls:
        print(f"Testing: {url}")
        res = requests.get(url, headers=wise.get_headers())
        if res.status_code == 200:
            print(f"SUCCESS on {url}!")
            return
        else:
            print(f"Failed: {res.status_code}")

if __name__ == "__main__":
    deep_probe_v2()
