import requests
import json

url = 'http://127.0.0.1:8000/api/crm/interactions/'

# Let's get a token first
# Assuming we can login as Super Admin
login_url = 'http://127.0.0.1:8000/api/auth/login/'
r_login = requests.post(login_url, json={'username': 'natya', 'password': 'natyassuperadminpassword'}, headers={'Content-Type': 'application/json'}) # wait, I don't know the password.
# Let's use the local token from sqlite directly by running a script inside Django shell.
