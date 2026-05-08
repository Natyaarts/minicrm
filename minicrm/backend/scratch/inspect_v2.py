import os
import sys
import django
import requests

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from integrations.utils import WiseService

def inspect_v2():
    wise = WiseService()
    url_v2 = f"https://{wise.host}/institutes/{wise.institute_id}/classes?classType=LIVE"
    res_v2 = requests.get(url_v2, headers=wise.get_headers())
    data = res_v2.json()
    print(f"V2 Data Type: {type(data.get('data'))}")
    print(f"V2 Keys: {data.keys()}")
    if data.get('data'):
        # If it's a dict, show keys
        if isinstance(data['data'], dict):
            print(f"V2 Internal Keys: {data['data'].keys()}")
            # Check if classes are in a key
            for k in data['data'].keys():
                if isinstance(data['data'][k], list):
                    print(f"Key '{k}' has {len(data['data'][k])} items.")

if __name__ == "__main__":
    inspect_v2()
