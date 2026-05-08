import os
import sys
import django
import requests

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def test_logs_v2():
    wise = WiseService()
    class_id = "69e89e5dbb8d6511d21d483b"
    # More variations
    for url in [
        f"https://{wise.host}/institutes/{wise.institute_id}/classes/{class_id}/sessionLogs",
        f"https://{wise.host}/user/v2/classes/{class_id}/sessionLogs",
        f"https://{wise.host}/institutes/{wise.institute_id}/classes/{class_id}/attendance",
        f"https://{wise.host}/user/v2/classes/{class_id}/attendance"
    ]:
        print(f"\nChecking URL: {url}")
        res = requests.get(url, headers=wise.get_headers())
        print(f"Status: {res.status_code}")
        if res.status_code == 200:
            print(f"SUCCESS! Found logs.")
            print(res.json().get('data')[:1])

if __name__ == "__main__":
    test_logs_v2()
