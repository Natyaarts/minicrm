from datetime import timedelta
from django.utils import timezone
from django.conf import settings
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed
from .models import UserAuthToken

DEFAULT_TOKEN_EXPIRATION_HOURS = getattr(settings, 'AUTH_TOKEN_EXPIRATION_HOURS', None)

def get_token_ttl():
    hours = getattr(settings, 'AUTH_TOKEN_EXPIRATION_HOURS', DEFAULT_TOKEN_EXPIRATION_HOURS)
    if hours is None or hours <= 0:
        return None
    return timedelta(hours=hours)

class ExpiringTokenAuthentication(TokenAuthentication):
    """
    Extends DRF TokenAuthentication to provide server-side multi-device token authentication
    with optional token expiration.
    If AUTH_TOKEN_EXPIRATION_HOURS is configured, tokens older than the TTL are revoked and rejected with HTTP 401.
    If not configured, tokens remain active until explicit logout or password change.
    """
    model = UserAuthToken

    def authenticate_credentials(self, key):
        model = self.get_model()
        try:
            token = model.objects.select_related('user').get(key=key)
        except model.DoesNotExist:
            raise AuthenticationFailed('Invalid or revoked authentication token.')

        if not token.user.is_active:
            raise AuthenticationFailed('User account is inactive or disabled.')

        # Check token expiration if configured
        token_ttl = get_token_ttl()
        if token_ttl is not None and (timezone.now() - token.created > token_ttl):
            # Token has expired: remove it from database
            token.delete()
            raise AuthenticationFailed('Authentication token has expired. Please log in again.')

        return (token.user, token)
