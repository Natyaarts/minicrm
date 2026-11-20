import type * as Notifications from 'expo-notifications';

/**
 * "Follow-up due" / "Task due" pushes sent by the server (crm send_task_reminders):
 *   data = { type: 'TASK_DUE', kind: 'followup' | 'assigned', taskId, leadId | null }
 * and the mentor morning digest (core/mentor_digest.py):
 *   data = { type: 'MENTOR_FOLLOWUPS', date, count }  -> Mentors tab
 *
 * Shared by useFollowupPush (warm taps) and appEntry (cold start), so a tap is routed once.
 */

export type TaskDueRoute =
  | { pathname: '/lead-details'; params: { leadId: string } }
  | { pathname: '/all-tasks' }
  | { pathname: '/(tabs)/four' };

// Responses already routed in this JS session (cold start + useLastNotificationResponse see the same one)
const handledResponses = new Set<string>();

const responseKey = (response: Notifications.NotificationResponse) =>
  `${response.notification.request.identifier}:${response.actionIdentifier}`;

/** The route for a TASK_DUE / MENTOR_FOLLOWUPS tap, or null for any other notification. */
export const taskDueRoute = (response: Notifications.NotificationResponse | null | undefined): TaskDueRoute | null => {
  const data = response?.notification?.request?.content?.data as Record<string, unknown> | undefined;
  if (data?.type === 'MENTOR_FOLLOWUPS') return { pathname: '/(tabs)/four' };
  if (!data || data.type !== 'TASK_DUE') return null;
  const leadId = data.leadId;
  if (leadId !== null && leadId !== undefined && String(leadId) !== '' && String(leadId) !== '0') {
    return { pathname: '/lead-details', params: { leadId: String(leadId) } };
  }
  return { pathname: '/all-tasks' };
};

/**
 * Returns the route for this response the first time it is seen, and null afterwards
 * (or if it is not a TASK_DUE notification).
 */
export const claimTaskDueRoute = (response: Notifications.NotificationResponse | null | undefined): TaskDueRoute | null => {
  const route = taskDueRoute(response);
  if (!route || !response) return null;
  const key = responseKey(response);
  if (handledResponses.has(key)) return null;
  handledResponses.add(key);
  return route;
};
