import client from './client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { secureLogin } from './secureLogin';
export { handleSessionExpired } from './session';

export const loginUser = async (username, password) => {
  try {
    const deviceName = Platform.OS === 'android' ? 'Android Mobile' : Platform.OS === 'ios' ? 'iOS Mobile' : 'Mobile App';

    // 1. Encrypted login (RSA-OAEP happens inside secureLogin)
    const data = await secureLogin(username, password, { device_name: deviceName });

    if (!data || !data.token) {
      return { success: false, error: 'Login failed' };
    }

    // 2. Save the token first, because the client interceptor reads it for the next call
    await AsyncStorage.setItem('userToken', data.token);

    // 3. Get the authoritative profile from the server, not from the login body
    let me;
    try {
      me = (await client.get('/auth/me/')).data;
    } catch (e) {
      await AsyncStorage.multiRemove(['userToken', 'userInfo']);
      return { success: false, error: 'Login failed. Please try again.' };
    }

    if (me && me.role) {
      await AsyncStorage.setItem('userInfo', JSON.stringify(me));
    }
    return { success: true, user: me };
  } catch (error) {
    if (error.status === 429) {
      return { success: false, error: 'Too many attempts. Please wait a minute and try again.' };
    }
    // secureLogin puts the server's error text into error.message
    return { success: false, error: error.message || 'Server error. Please try again.' };
  }
};

export const logoutUser = async () => {
  try {
    // Attempt graceful server-side token revocation
    await client.post('/auth/logout/').catch(() => {});
  } catch (_) {}
  await AsyncStorage.multiRemove(['userToken', 'userInfo']);
};