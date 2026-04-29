import os
import sys
import django
import requests

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def probe_global():
    wise = WiseService()
    url = f"https://api.wiseapp.live/institutes/v3/{wise.institute_id}/sessionLogs"
    print(f"Probing Global: {url}")
    res = requests.get(url, headers=wise.get_headers())
    print(f"Status: {res.status_code}")
    if res.status_code == 200:
        data = res.json()
        logs = data.get('data', [])
        print(f"SUCCESS! Found {len(logs)} logs.")

if __name__ == "__main__":
    probe_global()
