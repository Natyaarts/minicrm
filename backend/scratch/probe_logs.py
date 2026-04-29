import os
import sys
import django
import requests

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def probe():
    wise = WiseService()
    class_id = "69e89e5dbb8d6511d21d483b"
    url = f"https://{wise.host}/institutes/{wise.institute_id}/sessionLogs?classId={class_id}"
    print(f"Probing: {url}")
    res = requests.get(url, headers=wise.get_headers())
    print(f"Status: {res.status_code}")
    print(f"Response: {res.text}")

if __name__ == "__main__":
    probe()
