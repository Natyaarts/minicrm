import os
import sys
import django
import requests

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def check_anjali():
    wise = WiseService()
    url = f"https://api.wiseapp.live/institutes/{wise.institute_id}/sessions?paginateBy=COUNT&page_number=1&page_size=500"
    res = requests.get(url, headers=wise.get_headers())
    
    anjali_sessions = []
    
    if res.status_code == 200:
        data = res.json().get('data', {}).get('sessions', [])
        for session in data:
            if session.get('hostedBy', {}).get('name', '') == 'Anjali Nair Kalakshetra' or session.get('instructorId') == '16795648':
                pass
            
            # Since we don't know Anjali's exact ID, let's just find the instructor with exactly 10 sessions in the response.
        
        counts = {}
        for session in data:
            inst = session.get('hostedBy') or session.get('instructorId')
            if inst not in counts:
                counts[inst] = []
            counts[inst].append(session)
            
        for inst, sessions in counts.items():
            if len(sessions) == 10:
                print(f"Found instructor with 10 sessions: {inst}")
                for s in sessions:
                    print(f"Date: {s.get('startTime')} | Duration: {s.get('duration')}")

if __name__ == "__main__":
    check_anjali()
