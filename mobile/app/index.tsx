import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { enterApp } from '../src/utils/appEntry';

/**
 * Startup gate. Shows a spinner instead of the login form while deciding where to go, so an
 * Android restart (process killed while the screen was locked) doesn't look like a logout.
 * The token is not verified here: (tabs)/_layout.tsx calls /auth/me/, and a 401 returns to
 * login through the client.js interceptor.
 */
export default function Index() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let token: string | null = null;
      try {
        token = await AsyncStorage.getItem('userToken');
      } catch (e) {
        console.warn('[Startup] Could not read userToken:', e);
      }
      if (cancelled) return;
      if (!token || !token.trim()) {
        router.replace('/login');
        return;
      }
      // An unsaved call wins (dialpad); otherwise reopen the last screen from before the restart
      await enterApp({ restoreLastRoute: true });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
      <ActivityIndicator size="large" color="#3182CE" />
    </View>
  );
}
