import client from './client';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const loginUser = async (username, password) => {
  try {
    const response = await client.post('/login/', { username, password });
    
    if (response.data.token) {
      // Store token and user info
      await AsyncStorage.setItem('userToken', response.data.token);
      await AsyncStorage.setItem('userInfo', JSON.stringify(response.data.user));
      return { success: true, user: response.data.user };
    }
    return { success: false, error: 'Login failed' };
  } catch (error) {
    const errorMsg = error.response?.data?.error || 'Server error. Please try again.';
    return { success: false, error: errorMsg };
  }
};

export const logoutUser = async () => {
  await AsyncStorage.removeItem('userToken');
  await AsyncStorage.removeItem('userInfo');
};
