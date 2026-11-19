import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persists the dialpad's in-progress call so it survives Android killing the app
 * (long call, screen locked, app behind the system dialer). On the next start the
 * app reopens the dialpad and finishes logging the call from this record.
 */

const ACTIVE_CALL_KEY = 'activeCallSession';
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

export type ActiveCallStatus = 'CALLING' | 'ACTIVE' | 'POST_CALL';

export interface ActiveCallSession {
  sessionId: string;
  userId: string; // cached userInfo id (or username) of the user who placed the call
  mobileCallId: string;
  phone: string; // cleaned (no spaces, dashes, parentheses, dots)
  leadId: string | null;
  leadStatus: string | null;
  mode: string | null;
  startTime: number;
  prevSessionEndMs: number;
  status: ActiveCallStatus;
  notes: string;
  savedAt: number;
}

/** Identity of the signed-in user from the cached userInfo: its id, else its username, else ''. */
export const getCurrentUserKey = async (): Promise<string> => {
  try {
    const raw = await AsyncStorage.getItem('userInfo');
    if (!raw) return '';
    const info = JSON.parse(raw);
    const key = info?.id ?? info?.username;
    return key !== undefined && key !== null ? String(key) : '';
  } catch (_) {
    return '';
  }
};

/** True when the saved call was placed by the user currently signed in. */
export const isSessionForUser = (session: ActiveCallSession | null, userKey: string): boolean =>
  !!session && !!userKey && !!session.userId && session.userId === userKey;

// All operations run one at a time, in call order, so an update that is still in flight
// can never write back a session that was cleared after it was requested.
let opQueue: Promise<unknown> = Promise.resolve();
const serialize = <T>(op: () => Promise<T>): Promise<T> => {
  const run = opQueue.then(op, op);
  opQueue = run.catch(() => {});
  return run;
};

const readValid = async (): Promise<ActiveCallSession | null> => {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_CALL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveCallSession;
    const valid = parsed && typeof parsed.sessionId === 'string' && parsed.sessionId &&
      typeof parsed.phone === 'string' && parsed.phone;
    const age = Date.now() - Number(parsed?.savedAt || 0);
    if (!valid || !(age >= 0 && age <= MAX_AGE_MS)) {
      await AsyncStorage.removeItem(ACTIVE_CALL_KEY);
      return null;
    }
    return parsed;
  } catch (e) {
    console.warn('[ActiveCallSession] read failed, discarding:', e);
    try { await AsyncStorage.removeItem(ACTIVE_CALL_KEY); } catch (_) {}
    return null;
  }
};

export const saveActiveCall = (session: Omit<ActiveCallSession, 'savedAt'>): Promise<void> => serialize(async () => {
  try {
    const record: ActiveCallSession = { ...session, savedAt: Date.now() };
    await AsyncStorage.setItem(ACTIVE_CALL_KEY, JSON.stringify(record));
  } catch (e) {
    console.warn('[ActiveCallSession] save failed:', e);
  }
});

/** The saved session, or null. Anything older than 6 hours (since its last update) is removed. */
export const getActiveCall = (): Promise<ActiveCallSession | null> => serialize(readValid);

/**
 * Merges fields into the saved session. No-op when nothing is saved, or when
 * `expectedSessionId` is given and a different call is saved.
 */
export const updateActiveCall = (
  patch: Partial<Omit<ActiveCallSession, 'sessionId' | 'savedAt'>>,
  expectedSessionId?: string
): Promise<void> => serialize(async () => {
  try {
    const current = await readValid();
    if (!current) return;
    if (expectedSessionId && current.sessionId !== expectedSessionId) return;
    const next: ActiveCallSession = { ...current, ...patch, savedAt: Date.now() };
    await AsyncStorage.setItem(ACTIVE_CALL_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('[ActiveCallSession] update failed:', e);
  }
});

export const clearActiveCall = (): Promise<void> => serialize(async () => {
  try {
    await AsyncStorage.removeItem(ACTIVE_CALL_KEY);
  } catch (e) {
    console.warn('[ActiveCallSession] clear failed:', e);
  }
});
