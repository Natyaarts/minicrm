import os
import sys
import django
import requests

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def check_teacher_wise():
    wise = WiseService()
    url = f"https://api.wiseapp.live/institutes/{wise.institute_id}/analytics/teachers"
    res = requests.get(url, headers=wise.get_headers())
    print(res.status_code)
    print(res.text[:500])

if __name__ == "__main__":
    check_teacher_wise()
