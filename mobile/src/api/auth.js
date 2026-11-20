import client from './client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { clearActiveCall } from '../utils/ActiveCallSession';
import { clearLastRoute } from '../utils/lastRoute';
export { handleSessionExpired } from './session';

export const loginUser = async (username, password) => {
  try {
    const deviceName = Platform.OS === 'android' ? 'Android Mobile' : Platform.OS === 'ios' ? 'iOS Mobile' : 'Mobile App';
    const response = await client.post('/auth/login/', { username, password, device_name: deviceName });

    
    if (response.data && response.data.token) {
      // Store token and user info
      await AsyncStorage.setItem('userToken', response.data.token);
      if (response.data.user && response.data.user.role) {
        await AsyncStorage.setItem('userInfo', JSON.stringify(response.data.user));
      }
      return { success: true, user: response.data.user };
    }
    return { success: false, error: 'Login failed' };
  } catch (error) {
    const errorMsg = error.response?.data?.error || error.response?.data?.detail || 'Server error. Please try again.';
    return { success: false, error: errorMsg };
  }
};

// Stop "Follow-up due" pushes to this phone (see src/hooks/useFollowupPush.ts). Best effort, never throws.
// Uses fetch instead of `client` so a 401 here can't trigger the session-expired alert mid-logout.
const unregisterFollowupPush = async () => {
  try {
    const [pushToken, authToken] = await Promise.all([
      AsyncStorage.getItem('followupPushToken'),
      AsyncStorage.getItem('userToken'),
    ]);
    if (pushToken && authToken && authToken.trim()) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        await fetch(`${client.defaults.baseURL}auth/devices/${encodeURIComponent(pushToken)}/`, {
          method: 'DELETE',
          headers: { Authorization: `Token ${authToken.trim()}` },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    }
  } catch (_) {}
  try { await AsyncStorage.removeItem('followupPushToken'); } catch (_) {}
};

export const logoutUser = async () => {
  await unregisterFollowupPush();
  try {
    // Attempt graceful server-side token revocation
    await client.post('/auth/logout/').catch(() => {});
  } catch (_) {}
  await AsyncStorage.multiRemove(['userToken', 'userInfo']);
  // An explicit logout abandons any unsaved call (a session-expiry re-login keeps it)
  await clearActiveCall();
  await clearLastRoute();
};
