import os
import sys
import django
import requests

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def probe_namespace():
    wise = WiseService()
    class_id = "69e89e5dbb8d6511d21d483b"
    # Try using namespace in host
    host = f"{wise.namespace}.wiseapp.live"
    url = f"https://{host}/api/institutes/{wise.institute_id}/sessionLogs?classId={class_id}"
    print(f"Probing Namespace URL: {url}")
    try:
        res = requests.get(url, headers=wise.get_headers())
        print(f"Status: {res.status_code}")
        if res.status_code == 200:
            print("SUCCESS!")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    probe_namespace()
