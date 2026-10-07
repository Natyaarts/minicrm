import client from './client';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const loginUser = async (username, password) => {
  try {
    const response = await client.post('/auth/login/', { username, password });
    
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

export const logoutUser = async () => {
  try {
    // Attempt graceful server-side token revocation
    await client.post('/auth/logout/').catch(() => {});
  } catch (_) {}
  await AsyncStorage.multiRemove(['userToken', 'userInfo']);
};
