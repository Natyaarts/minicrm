import base64
import json
from functools import lru_cache

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from django.conf import settings
from django.core.cache import cache

NONCE_PREFIX = "login_nonce:"


class InvalidLogin(Exception):
    pass


@lru_cache(maxsize=1)
def _private_key():
    with open(settings.LOGIN_RSA_PRIVATE_KEY_PATH, "rb") as f:
        return serialization.load_pem_private_key(f.read(), password=None)


@lru_cache(maxsize=1)
def public_key_pem():
    with open(settings.LOGIN_RSA_PUBLIC_KEY_PATH, "r") as f:
        return f.read()


def consume_credentials(b64_cipher):
    """Decrypt, burn the one-time nonce. Returns (username, password)."""
    try:
        plaintext = _private_key().decrypt(
            base64.b64decode(b64_cipher),
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None,
            ),
        )
        data = json.loads(plaintext)
        username, password = data["username"], data["password"]
        nonce = data["nonce"]
    except Exception:
        raise InvalidLogin()

    # delete() returns False if the nonce is missing, expired, or already used.
    # The cache TTL (LOGIN_NONCE_TTL) enforces freshness.
    if not cache.delete(NONCE_PREFIX + str(nonce)):
        raise InvalidLogin()

    return username, password