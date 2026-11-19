import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, usePathname, useGlobalSearchParams, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import 'react-native-reanimated';
import { AppState, LogBox } from 'react-native';
import { saveLastRoute, clearLastRoute, isRestorablePath } from '../src/utils/lastRoute';

LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
]);

import { useColorScheme } from '@/components/useColorScheme';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  // app/index.tsx is the startup gate (spinner → login, Home, or the screen to resume)
  initialRouteName: 'index',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    import('react-native').then(({ Platform }) => {
      if (Platform.OS === 'android') {
        Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }
    });
  }, []);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

import GlobalCallListener from '../src/components/GlobalCallListener';

// Saves the current screen (see src/utils/lastRoute.ts) so an Android restart can reopen it.
function LastRouteTracker() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const segments = useSegments();
  const paramsKey = JSON.stringify(params);
  const latest = useRef({ pathname, params });
  latest.current = { pathname, params };

  // Both the startup gate (app/index.tsx) and the Home tab have pathname '/'; only Home is inside (tabs)
  const onHome = pathname === '/' && segments[0] === '(tabs)';

  useEffect(() => {
    if (onHome) {
      clearLastRoute(); // back on Home: a restart should land on Home
    } else if (isRestorablePath(pathname)) {
      saveLastRoute(pathname, params as Record<string, unknown>);
    }
    // '/', '/login', '/modal', '/dialpad' (and the gate): keep whatever was saved before
  }, [pathname, paramsKey, onHome]);

  // Refresh the timestamp when the app is backgrounded, so "within the last hour" counts from
  // when the user left the app (e.g. the screen locked), not from when they opened the screen
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'background') return;
      const { pathname: p, params: q } = latest.current;
      if (isRestorablePath(p)) saveLastRoute(p, q as Record<string, unknown>);
    });
    return () => sub.remove();
  }, []);

  return null;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <GlobalCallListener />
      <LastRouteTracker />
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="task-details" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}
