import os
import sys
import django
import requests

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def fetch_direct_from_wise():
    wise = WiseService()
    # Let's get the classes of a specific teacher
    url = f"https://api.wiseapp.live/institutes/{wise.institute_id}/analytics/teachers"
    # Wait, the analytics/teachers endpoint didn't work.
    # Let's get all sessions
    url = f"https://api.wiseapp.live/institutes/{wise.institute_id}/sessions?paginateBy=COUNT&page_number=1&page_size=500"
    res = requests.get(url, headers=wise.get_headers())
    if res.status_code == 200:
        data = res.json().get('data', {}).get('sessions', [])
        
        teacher_totals = {}
        for session in data:
            instructor_id = session.get('hostedBy') or session.get('instructorId')
            duration_ms = session.get('duration', 0)
            if instructor_id:
                if instructor_id not in teacher_totals:
                    teacher_totals[instructor_id] = {'count': 0, 'duration': 0}
                teacher_totals[instructor_id]['count'] += 1
                teacher_totals[instructor_id]['duration'] += duration_ms
                
        print("Instructor ID | API Sessions | API Hours")
        for t_id, stats in teacher_totals.items():
            hours = stats['duration'] / (1000 * 60 * 60)
            print(f"{t_id} | {stats['count']} | {round(hours, 1)} hrs")

if __name__ == "__main__":
    fetch_direct_from_wise()
