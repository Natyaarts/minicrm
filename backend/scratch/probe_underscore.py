import os
import sys
import django
import requests

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def probe_underscore():
    wise = WiseService()
    class_id = "69e89e5dbb8d6511d21d483b"
    url = f"https://api.wiseapp.live/institutes/v3/{wise.institute_id}/sessionLogs?class_id={class_id}"
    print(f"Probing Underscore: {url}")
    res = requests.get(url, headers=wise.get_headers())
    print(f"Status: {res.status_code}")
    if res.status_code == 200:
        print("SUCCESS!")

if __name__ == "__main__":
    probe_underscore()
