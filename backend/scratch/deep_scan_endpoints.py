import os
import sys
import django
import requests

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def deep_scan():
    wise = WiseService()
    class_id = "69e89e5dbb8d6511d21d483b"
    prefixes = ["", "v1/", "v2/", "v3/", "user/", "user/v2/", "institutes/", "institutes/v3/"]
    endpoints = ["sessionLogs", "session-logs", "attendance", "meetings", "live-sessions"]
    
    for p in prefixes:
        for e in endpoints:
            url = f"https://{wise.host}/{p}{wise.institute_id}/{e}?classId={class_id}"
            try:
                res = requests.get(url, headers=wise.get_headers(), timeout=5)
                if res.status_code == 200:
                    print(f"SUCCESS! URL: {url}")
                    return
                elif res.status_code != 404:
                    print(f"INTERESTING: {url} -> {res.status_code}")
            except:
                pass
    print("Deep scan finished. No success.")

if __name__ == "__main__":
    deep_scan()
