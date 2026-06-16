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

# Helper to send request with specific start and end dates
def test_dates(start, end):
    url = f"https://{wise.host}/institutes/{wise.institute_id}/fees/transactions"
    headers = wise.get_headers()
    params = {
        "type": "PAYMENT,OFFLINE_PAYMENT",
        "status": "CHARGED",
        "populateParticipant": "true",
        "populateClassroom": "true",
        "page_size": 100,
        "page_number": 1,
        "startDate": start,
        "endDate": end
    }

    print(f"\n--- Testing with startDate={start}, endDate={end} ---")
    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
        print("HTTP Status Code:", response.status_code)
        if response.status_code == 200:
            data = response.json()
            tx_list = data.get('data', {}).get('transactions') or []
            print(f"Transactions count: {len(tx_list)}")
            for idx, t in enumerate(tx_list[:10]):
                print(f"  {idx}: ID: {t.get('_id')}, Student: {t.get('student', {}).get('name')}, Amount: {t.get('amount')}, Date: {t.get('chargedAt') or t.get('createdAt')}")
        else:
            print("Response:", response.text)
    except Exception as e:
        print("Failed:", e)

# Test 1: June 2026
test_dates("2026-06-01", "2026-06-30")

# Test 2: May 2026
test_dates("2026-05-01", "2026-05-31")

# Test 3: Very wide range (All of 2025 and 2026)
test_dates("2025-01-01", "2026-12-31")
