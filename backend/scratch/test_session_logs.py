import os
import sys
import django
import requests

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def test_logs():
    wise = WiseService()
    class_id = "69e89e5dbb8d6511d21d483b"
    # Try V2 and V3 style for sessionLogs
    for url in [
        f"https://{wise.host}/institutes/{wise.institute_id}/sessionLogs?classId={class_id}",
        f"https://{wise.host}/institutes/v3/{wise.institute_id}/session-logs?classId={class_id}",
        f"https://{wise.host}/institutes/v3/{wise.institute_id}/sessionLogs?classId={class_id}"
    ]:
        print(f"\nChecking URL: {url}")
        res = requests.get(url, headers=wise.get_headers())
        print(f"Status: {res.status_code}")
        if res.status_code == 200:
            data = res.json()
            logs = data.get('data', [])
            print(f"Found {len(logs)} logs.")
            if logs:
                print(f"Sample Log: {logs[0]}")

if __name__ == "__main__":
    test_logs()
