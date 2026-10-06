from datetime import timedelta
from django.utils import timezone
from django.conf import settings
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.authtoken.models import Token

DEFAULT_TOKEN_EXPIRATION_HOURS = getattr(settings, 'AUTH_TOKEN_EXPIRATION_HOURS', 24)

def get_token_ttl():
    hours = getattr(settings, 'AUTH_TOKEN_EXPIRATION_HOURS', DEFAULT_TOKEN_EXPIRATION_HOURS)
    return timedelta(hours=hours)

class ExpiringTokenAuthentication(TokenAuthentication):
    """
    Extends DRF TokenAuthentication to provide server-side token expiration.
    Tokens older than AUTH_TOKEN_EXPIRATION_HOURS are revoked and rejected with HTTP 401.
    """
    model = Token

    def authenticate_credentials(self, key):
        model = self.get_model()
        try:
            token = model.objects.select_related('user').get(key=key)
        except model.DoesNotExist:
            raise AuthenticationFailed('Invalid or revoked authentication token.')

        if not token.user.is_active:
            raise AuthenticationFailed('User account is inactive or disabled.')

        # Check token expiration
        token_ttl = get_token_ttl()
        if timezone.now() - token.created > token_ttl:
            # Token has expired: remove it from database
            token.delete()
            raise AuthenticationFailed('Authentication token has expired. Please log in again.')

        return (token.user, token)
