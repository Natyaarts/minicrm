import os
import sys
import django
import requests

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def test_users():
    wise = WiseService()
    # Try different user endpoints
    for url in [
        f"https://{wise.host}/institutes/{wise.institute_id}/participants",
        f"https://{wise.host}/institutes/{wise.institute_id}/users",
        f"https://{wise.host}/user/institutes/{wise.institute_id}/users"
    ]:
        print(f"\nChecking URL: {url}")
        res = requests.get(url, headers=wise.get_headers())
        print(f"Status: {res.status_code}")
        if res.status_code == 200:
            data = res.json()
            # Inspect first user
            users = data.get('data', [])
            if isinstance(users, dict): users = users.get('users', [])
            if users:
                print(f"Found {len(users)} users. Sample Role: {users[0].get('role')}")
                # Print roles of all users to find teachers
                roles = set([u.get('role') for u in users])
                print(f"All Roles Found: {roles}")

if __name__ == "__main__":
    test_users()
