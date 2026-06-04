import requests
import json
from .models import Notification

def send_push_notification(user, title, message, notification_type='INFO', target_url=None):
    # 1. Create the database notification
    Notification.objects.create(
        user=user,
        title=title,
        message=message,
        notification_type=notification_type,
        target_url=target_url
    )

    # 2. Dispatch to Expo Push Servers if token exists
    if not user.expo_push_token:
        return False
        
    try:
        response = requests.post(
            'https://exp.host/--/api/v2/push/send',
            headers={
                'Accept': 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            json={
                'to': user.expo_push_token,
                'title': title,
                'body': message,
                'data': {'url': target_url} if target_url else {},
                'sound': 'default'
            }
        )
        response.raise_for_status()
        return True
    except Exception as e:
        print(f"Failed to send push notification: {e}")
        return False
