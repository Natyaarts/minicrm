"""
Device push-token registration (multi-device). Mounted under /auth/devices/ in users/urls.py.
The older single-token endpoint /auth/expo-token/ is unchanged.
"""
from django.utils import timezone
from rest_framework import status, views
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import DeviceToken
from .push import is_expo_push_token


class DeviceTokenRegisterView(views.APIView):
    """POST {token, platform?, device_name?}: register this device for the current user."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = str(request.data.get('token') or '').strip()
        if not is_expo_push_token(token):
            return Response({'error': 'A valid Expo push token is required.'}, status=status.HTTP_400_BAD_REQUEST)

        platform = str(request.data.get('platform') or '')[:20]
        device_name = str(request.data.get('device_name') or '')[:255]

        device, created = DeviceToken.objects.update_or_create(
            token=token,
            defaults={
                'user': request.user,  # a token re-registered by another user moves to them
                'platform': platform,
                'device_name': device_name,
                'is_active': True,
                'last_seen_at': timezone.now(),
            },
        )
        return Response(
            {'id': device.id, 'is_active': device.is_active, 'created': created},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class DeviceTokenUnregisterView(views.APIView):
    """DELETE /auth/devices/<token>/: stop pushes to this device (only the caller's own token)."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, token):
        DeviceToken.objects.filter(token=token.strip(), user=request.user).update(is_active=False)
        # Idempotent: same response whether or not the token existed
        return Response(status=status.HTTP_204_NO_CONTENT)
