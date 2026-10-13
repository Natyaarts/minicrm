import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { router } from 'expo-router';

let isHandlingSessionExpiry = false;

export const handleSessionExpired = async () => {
  if (isHandlingSessionExpiry) {
    return;
  }
  isHandlingSessionExpiry = true;

  try {
    await AsyncStorage.multiRemove(['userToken', 'userInfo']);

    // Navigate to login screen immediately so the UI cleanly resets
    try {
      router.replace('/login');
    } catch (navErr) {
      console.warn('[Session] Navigation to /login failed on session expiry:', navErr);
    }

    // Display native alert dialog over the clean login screen
    Alert.alert(
      'Session Expired',
      'Your session has expired. Please log in again.',
      [{ text: 'OK' }],
      { cancelable: true }
    );
  } catch (err) {
    console.error('[Session] Error handling session expiry:', err);
  } finally {
    // Keep mutex active for a debounce period to absorb parallel 401 responses
    setTimeout(() => {
      isHandlingSessionExpiry = false;
    }, 2000);
  }
};
