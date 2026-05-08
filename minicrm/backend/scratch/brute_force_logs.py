import os
import sys
import django
import requests

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def brute_force():
    wise = WiseService()
    class_id = "69e89e5dbb8d6511d21d483b"
    words = ["sessionLogs", "sessionlogs", "session_logs", "session-logs", "attendance", "attendanceLogs", "meetingLogs", "meetings", "liveSessions", "live-sessions", "history", "logs", "activity", "reports"]
    
    for w in words:
        url = f"https://api.wiseapp.live/institutes/v3/{wise.institute_id}/{w}?classId={class_id}"
        try:
            res = requests.get(url, headers=wise.get_headers(), timeout=3)
            if res.status_code == 200:
                print(f"SUCCESS! Word: {w}")
                return
            elif res.status_code != 404:
                print(f"Word '{w}' -> {res.status_code}")
        except:
            pass
    print("Finished brute force. No luck.")

if __name__ == "__main__":
    brute_force()
