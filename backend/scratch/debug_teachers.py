import os
import sys
import django

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def test_sync():
    wise = WiseService()
    print("--- TESTING TEACHER SYNC ---")
    
    # 1. Test V3 Teachers
    url_v3 = f"https://{wise.host}/institutes/v3/{wise.institute_id}/teachers"
    print(f"Checking V3 Teachers: {url_v3}")
    import requests
    res = requests.get(url_v3, headers=wise.get_headers())
    print(f"V3 Status: {res.status_code}")
    if res.status_code == 200:
        print(f"V3 Response: {res.json()}")
        
    # 2. Test Course List
    print("\nChecking Course List...")
    for t in ["LIVE", "UPCOMING", "PAST"]:
        courses = wise.get_course_list(type=t)
        print(f"Found {len(courses)} {t} courses.")
        if courses:
            # Check the first course structure
            c = courses[0]
            print(f"Sample Course Keys: {list(c.keys())}")
            print(f"Instructor field: {c.get('instructor')}")
            print(f"Co-Teachers field: {c.get('co_teachers') or c.get('coTeachers')}")

if __name__ == "__main__":
    test_sync()
