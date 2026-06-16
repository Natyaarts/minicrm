import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

wise = WiseService()
print("Host:", wise.host)
print("API Key:", "Found" if wise.api_key else "Missing")
print("Institute ID:", wise.institute_id)

if not wise.api_key:
    print("Error: API Key is missing. Check your .env file or environment variables.")
    sys.exit(1)

# 1. Fetch with no date filters
print("\n--- Fetching with no dates ---")
tx_data = wise.get_institute_transactions()
if tx_data and isinstance(tx_data, dict):
    tx_list = tx_data.get('transactions') or []
    print(f"Total transactions found: {len(tx_list)}")
    for idx, t in enumerate(tx_list[:10]):
        print(f"{idx}: ID: {t.get('_id')}, Student: {t.get('student', {}).get('name')}, Amount: {t.get('amount')}, Date: {t.get('chargedAt') or t.get('createdAt')}, Status: {t.get('status')}, Type: {t.get('type')}")
else:
    print("No transactions returned (None)")

# 2. Fetch for a wide date range in 2026
print("\n--- Fetching for 2026-05-01 to 2026-06-30 ---")
tx_data = wise.get_institute_transactions(start_date="2026-05-01", end_date="2026-06-30")
if tx_data and isinstance(tx_data, dict):
    tx_list = tx_data.get('transactions') or []
    print(f"Transactions found in range (2026-05-01 to 2026-06-30): {len(tx_list)}")
    for idx, t in enumerate(tx_list[:10]):
        print(f"{idx}: ID: {t.get('_id')}, Student: {t.get('student', {}).get('name')}, Amount: {t.get('amount')}, Date: {t.get('chargedAt') or t.get('createdAt')}")
else:
    print("No transactions returned in range (None)")
