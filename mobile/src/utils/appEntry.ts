import { router } from 'expo-router';
import { getActiveCall, getCurrentUserKey, isSessionForUser } from './ActiveCallSession';
import { getLastRoute } from './lastRoute';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { claimTaskDueRoute } from './taskDueNotification';

/** The notification tap that launched the app, if any (never throws). */
const getLaunchNotificationResponse = async () => {
  if (Platform.OS === 'web') return null;
  try {
    return await Notifications.getLastNotificationResponseAsync();
  } catch (_) {
    return null;
  }
};

// Delay before pushing on top of Home, so the tabs navigator has mounted and Back returns to Home
const PUSH_DELAY_MS = 300;

/**
 * Opens the signed-in app on Home, then on top of it:
 *  1. the dialpad, when this user still has a call that Android killed the app during; otherwise
 *  2. the lead / task list from a tapped "Follow-up due" / "Task due" notification; otherwise
 *  3. the last screen the user was on (only when `restoreLastRoute` is set: the startup gate).
 * Call only when a token is present.
 */
export const enterApp = async ({ restoreLastRoute = false }: { restoreLastRoute?: boolean } = {}) => {
  // Read everything before navigating: Home clears the saved last route when it mounts
  const [pending, userKey, lastRoute, launchResponse] = await Promise.all([
    getActiveCall(),
    getCurrentUserKey(),
    restoreLastRoute ? getLastRoute() : Promise.resolve(null),
    getLaunchNotificationResponse(),
  ]);

  router.replace('/(tabs)');

  // A tapped "Follow-up due" / "Task due" push. Claimed here so useFollowupPush doesn't route it again
  const taskDueRoute = claimTaskDueRoute(launchResponse);

  if (pending && isSessionForUser(pending, userKey)) {
    // An unsaved call still wins over a tapped notification
    setTimeout(() => {
      router.push({
        pathname: '/dialpad',
        params: {
          leadId: pending.leadId || '0',
          phone: pending.phone,
          leadStatus: pending.leadStatus || '',
          mode: pending.mode || '',
        },
      });
    }, PUSH_DELAY_MS);
    return;
  }

  if (taskDueRoute) {
    // The tapped task beats the last screen
    setTimeout(() => router.push(taskDueRoute as any), PUSH_DELAY_MS);
    return;
  }

  if (lastRoute) {
    setTimeout(() => {
      try {
        // Any saved app path; typed routes can't check a path read from storage
        router.push({ pathname: lastRoute.pathname as any, params: lastRoute.params });
      } catch (e) {
        console.warn('[appEntry] Could not reopen last screen:', lastRoute.pathname, e);
      }
    }, PUSH_DELAY_MS);
  }
};
