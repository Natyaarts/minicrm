import requests
import os
import base64
from dotenv import load_dotenv

load_dotenv()

host = os.getenv('WISE_API_HOST', 'api.wiseapp.live')
api_key = os.getenv('WISE_API_KEY')
user_id = os.getenv('WISE_USER_ID')
institute_id = os.getenv('WISE_INSTITUTE_ID')

auth_str = f"{user_id}:{api_key}"
auth_base64 = base64.b64encode(auth_str.encode()).decode()

test_namespaces = [
    "natya",        # Current configured
    "natyaarts",    # Domain name part
    "learn",        # Subdomain part
    "default",      # Standard default
    "wise",         # Generic
    "",             # Empty
]

url = f"https://{host}/institutes/{institute_id}/students"
print(f"Testing URL: {url}")

for ns in test_namespaces:
    print(f"\n--- Testing Namespace: '{ns}' ---")
    headers = {
        'Authorization': f'Basic {auth_base64}',
        'x-api-key': api_key,
        'Content-Type': 'application/json'
    }
    
    if ns:
        headers['x-wise-namespace'] = ns
        headers['user-agent'] = f'VendorIntegrations/{ns}'
    else:
        # Try without namespace header
        headers['user-agent'] = 'VendorIntegrations/default'

    try:
        # Search for a known manual student (Athira)
        params = {'search': 'Athira'} 
        res = requests.get(url, headers=headers, params=params)
        
        print(f"Status: {res.status_code}")
        if res.status_code == 200:
            data = res.json()
            students = data.get('data', {}).get('students', [])
            count = len(students)
            print(f"Found: {count} students")
            if count > 0:
                print(f"First Match: {students[0]}")
        else:
            print(f"Error: {res.text[:100]}")

    except Exception as e:
        print(f"Exception: {e}")
