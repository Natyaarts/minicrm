import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import client from '../api/client';
import { claimTaskDueRoute } from '../utils/taskDueNotification';

/**
 * Follow-up / task due push notifications (server: crm send_task_reminders).
 *  - creates the 'followups' Android channel (HIGH importance, default sound, vibration)
 *  - registers this device's Expo push token at POST /auth/devices/ (only a real ExponentPushToken[...])
 *  - routes TASK_DUE taps: lead -> /lead-details, otherwise -> /all-tasks
 *
 * Mounted from (tabs)/_layout.tsx, which mounts on app start and again after every login,
 * so the token is re-registered each time. Separate from usePushNotifications.ts (unchanged).
 */

export const FOLLOWUP_CHANNEL_ID = 'followups';
/** The token this device registered; logoutUser() unregisters it. */
export const FOLLOWUP_PUSH_TOKEN_KEY = 'followupPushToken';

const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[^\]\s]+\]$/;

const isExpoGo = () =>
  Constants.appOwnership === 'expo' || (Constants.executionEnvironment as string) === 'store-client';

async function ensureFollowupChannel() {
  if (Platform.OS !== 'android') return;
  // Channel settings (sound, importance) are fixed by Android once created; change the id to change them
  await Notifications.setNotificationChannelAsync(FOLLOWUP_CHANNEL_ID, {
    name: 'Follow-ups & tasks',
    description: 'Reminders when a follow-up or task is due',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

async function hasNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

async function getExpoPushToken(): Promise<string | null> {
  const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
  if (!projectId) {
    console.log('[FollowupPush] No EAS projectId; skipping registration');
    return null;
  }
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return typeof data === 'string' && EXPO_TOKEN_RE.test(data) ? data : null;
  } catch (e) {
    // e.g. FCM not configured (no google-services.json): never send the error text anywhere
    console.log('[FollowupPush] Could not get Expo push token:', e);
    return null;
  }
}

export async function registerFollowupPush(): Promise<void> {
  if (isExpoGo() || !Device.isDevice || Platform.OS === 'web') return;

  await ensureFollowupChannel(); // Android 13+: create a channel before asking for permission
  if (!(await hasNotificationPermission())) return;

  const token = await getExpoPushToken();
  if (!token) return;

  // Only while signed in: a 401 here would trigger the app-wide session-expired flow
  const authToken = await AsyncStorage.getItem('userToken');
  if (!authToken || !authToken.trim()) return;

  await client.post('/auth/devices/', {
    token,
    platform: Platform.OS,
    device_name: Device.modelName || Device.deviceName || '',
  });
  await AsyncStorage.setItem(FOLLOWUP_PUSH_TOKEN_KEY, token);
}

const openTaskDueRoute = (response: Notifications.NotificationResponse | null | undefined) => {
  const route = claimTaskDueRoute(response);
  if (!route) return;
  // Let the tabs navigator finish mounting first, so Back returns to Home
  setTimeout(() => router.push(route as any), 300);
};

export function useFollowupPush() {
  useEffect(() => {
    registerFollowupPush().catch((err) => console.log('[FollowupPush] Registration failed:', err?.message || err));
  }, []);

  // Taps while the app is running or in the background
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener(openTaskDueRoute);
    return () => sub.remove();
  }, []);

  // The tap that opened/resumed the app (also covers a tap that arrived before the listener above)
  const lastResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    openTaskDueRoute(lastResponse);
  }, [lastResponse]);
}
