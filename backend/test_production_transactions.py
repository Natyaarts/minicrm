import os
import sys
import django
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

wise = WiseService()
print("Host:", wise.host)
print("API Key:", "Found" if wise.api_key else "Missing")
print("Institute ID:", wise.institute_id)

if not wise.api_key:
    print("Error: API Key is missing.")
    sys.exit(1)

# Direct raw requests call to see status code and response body
url = f"https://{wise.host}/institutes/{wise.institute_id}/fees/transactions"
headers = wise.get_headers()
params = {
    "type": "PAYMENT,OFFLINE_PAYMENT",
    "status": "CHARGED",
    "populateParticipant": "true",
    "populateClassroom": "true",
    "page_size": 100,
    "page_number": 1
}

print(f"\nSending direct request to URL: {url}")
print("Headers:", {k: (v[:10] + '...' if k in ['Authorization', 'x-api-key'] else v) for k, v in headers.items()})
print("Params:", params)

try:
    response = requests.get(url, headers=headers, params=params, timeout=10)
    print("HTTP Status Code:", response.status_code)
    try:
        data = response.json()
        print("Response JSON Status:", data.get('status'))
        print("Response JSON Message:", data.get('message'))
        print("Response Keys:", list(data.keys()))
        if 'data' in data:
            print("Response 'data' type:", type(data['data']))
            if isinstance(data['data'], dict):
                print("Response 'data' keys:", list(data['data'].keys()))
                tx_list = data['data'].get('transactions') or []
                print(f"Transactions count: {len(tx_list)}")
            else:
                print("Response 'data' value:", data['data'])
        else:
            print("Response JSON (full):", data)
    except Exception as e:
        print("Failed to parse JSON response. Raw body:")
        print(response.text[:1000])
except Exception as e:
    print("Request failed with exception:", e)
