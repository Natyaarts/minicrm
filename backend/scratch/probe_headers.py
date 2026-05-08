import os
import sys
import django
import requests

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def probe_headers():
    wise = WiseService()
    class_id = "69e89e5dbb8d6511d21d483b"
    url = f"https://api.wiseapp.live/institutes/v3/{wise.institute_id}/sessionLogs?classId={class_id}"
    headers = wise.get_headers()
    headers['user-agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    
    print(f"Probing with Browser Header: {url}")
    res = requests.get(url, headers=headers)
    print(f"Status: {res.status_code}")
    if res.status_code == 200:
        print("SUCCESS!")

if __name__ == "__main__":
    probe_headers()
