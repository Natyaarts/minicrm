import os
import sys
import django
import requests

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def test_v2_last_hope():
    wise = WiseService()
    class_id = "69e89e5dbb8d6511d21d483b"
    for url in [
        f"https://{wise.host}/institutes/{wise.institute_id}/session_logs?class_id={class_id}",
        f"https://{wise.host}/institutes/v2/{wise.institute_id}/sessionLogs?classId={class_id}",
        f"https://{wise.host}/institutes/v2/{wise.institute_id}/session-logs?classId={class_id}"
    ]:
        print(f"\nChecking URL: {url}")
        res = requests.get(url, headers=wise.get_headers())
        print(f"Status: {res.status_code}")
        if res.status_code == 200:
            print(f"SUCCESS!")

if __name__ == "__main__":
    test_v2_last_hope()
