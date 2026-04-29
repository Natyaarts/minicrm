import os
import sys
import django
import requests

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def test_details():
    wise = WiseService()
    class_id = "69e89e5dbb8d6511d21d483b"
    url = f"https://{wise.host}/user/v2/classes/{class_id}?full=true"
    print(f"Checking Details: {url}")
    res = requests.get(url, headers=wise.get_headers())
    print(f"Status: {res.status_code}")
    if res.status_code == 200:
        data = res.json()
        print(f"Data Keys: {data.keys()}")
        course = data.get('data', {})
        print(f"Instructor: {course.get('instructor')}")
        print(f"Co-Teachers: {course.get('coTeachers')}")

if __name__ == "__main__":
    test_details()
