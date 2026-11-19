import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Remembers the screen the user was on, so an Android restart (process killed while the screen
 * was locked) reopens that screen instead of Home.
 */

const LAST_ROUTE_KEY = 'lastRoute';
const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

// Never restored: the startup gate / Home, auth screens, the profile modal, and the dialpad
// (an in-progress call is restored separately by ActiveCallSession).
const EXCLUDED_PATHS = ['/', '/login', '/modal', '/dialpad'];

export type RouteParams = Record<string, string | string[]>;

export interface LastRoute {
  pathname: string;
  params: RouteParams;
  savedAt: number;
}

export const isRestorablePath = (pathname: string | null | undefined): pathname is string =>
  !!pathname && pathname.startsWith('/') && !EXCLUDED_PATHS.includes(pathname);

/** Keeps only plain string / string-array params (drops undefined and anything odd). */
const cleanParams = (params: Record<string, unknown> | null | undefined): RouteParams => {
  const out: RouteParams = {};
  for (const [k, v] of Object.entries(params || {})) {
    if (typeof v === 'string') out[k] = v;
    else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) out[k] = v as string[];
  }
  return out;
};

export const saveLastRoute = async (pathname: string, params?: Record<string, unknown>): Promise<void> => {
  if (!isRestorablePath(pathname)) return;
  try {
    const record: LastRoute = { pathname, params: cleanParams(params), savedAt: Date.now() };
    await AsyncStorage.setItem(LAST_ROUTE_KEY, JSON.stringify(record));
  } catch (e) {
    console.warn('[lastRoute] save failed:', e);
  }
};

/** The last screen if it was saved within the last hour; anything older or invalid is removed. */
export const getLastRoute = async (): Promise<LastRoute | null> => {
  try {
    const raw = await AsyncStorage.getItem(LAST_ROUTE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastRoute;
    const age = Date.now() - Number(parsed?.savedAt || 0);
    if (!isRestorablePath(parsed?.pathname) || !(age >= 0 && age <= MAX_AGE_MS)) {
      await AsyncStorage.removeItem(LAST_ROUTE_KEY);
      return null;
    }
    return { pathname: parsed.pathname, params: cleanParams(parsed.params), savedAt: parsed.savedAt };
  } catch (e) {
    console.warn('[lastRoute] read failed, discarding:', e);
    try { await AsyncStorage.removeItem(LAST_ROUTE_KEY); } catch (_) {}
    return null;
  }
};

export const clearLastRoute = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(LAST_ROUTE_KEY);
  } catch (e) {
    console.warn('[lastRoute] clear failed:', e);
  }
};
