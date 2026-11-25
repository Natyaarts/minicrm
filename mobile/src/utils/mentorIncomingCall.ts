// Mentor-only helpers for INCOMING phone calls (GlobalCallListener mentor path + dialpad.tsx mentor mode).
// Sales users (and admins) never take this path: their incoming calls keep the CRM interaction flow.
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';

// Roles whose incoming calls are saved as StudentFeedback. Same normalisation as dialpad.tsx / the backend
// (String(role).toUpperCase().trim()). ADMIN / SUPER_ADMIN are deliberately NOT here: they keep the
// current (CRM) incoming-call flow.
export const MENTOR_INCOMING_ROLES = ['MENTOR', 'TEACHER', 'HEAD - MENTOR', 'ACADEMIC MENTOR', 'ACADEMIC', 'ACADEMIC_COORDINATOR'];

export interface IncomingCallUserContext {
  isMentor: boolean;
  /** Same key as ActiveCallSession.getCurrentUserKey(): cached userInfo id, else username, else '' */
  userKey: string;
}

/** Signed-in user's role from the cached userInfo. Logged out / unknown -> not a mentor (current behaviour). */
export const getIncomingCallUserContext = async (): Promise<IncomingCallUserContext> => {
  try {
    const [token, raw] = await Promise.all([AsyncStorage.getItem('userToken'), AsyncStorage.getItem('userInfo')]);
    if (!token || !raw) return { isMentor: false, userKey: '' };
    const info = JSON.parse(raw);
    const role = String(info?.role || '').toUpperCase().trim();
    const key = info?.id ?? info?.username;
    const userKey = key !== undefined && key !== null ? String(key) : '';
    return { isMentor: !!userKey && MENTOR_INCOMING_ROLES.includes(role), userKey };
  } catch (_) {
    return { isMentor: false, userKey: '' };
  }
};

/**
 * Last 10 digits of a phone number, normalised like the backend (crm/utils.normalize_phone_for_matching):
 * digits only, an 11-digit number with a leading 0 or a 12-digit number with a leading 91 is reduced to
 * 10 digits. Returns '' when fewer than 10 digits remain (no reliable match).
 */
export const normalizePhoneLast10 = (raw?: string | null): string => {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  return digits.length >= 10 ? digits.slice(-10) : '';
};

export interface MentorStudentMatch {
  id: number;
  name: string;
  mobile: string;
  batchName: string;
}

/**
 * The mentor's own students whose mobile matches the caller. Uses GET /students/?search=<last10>&own_only=true:
 * own_only=true is what addStudentFeedback sends, so every student returned here is one the mentor may save
 * feedback for. Resolves [] when nothing matches and null when the lookup failed (network / server).
 */
export const findMentorStudentsByPhone = async (phone?: string | null): Promise<MentorStudentMatch[] | null> => {
  const target = normalizePhoneLast10(phone);
  if (!target) return [];
  try {
    const res = await client.get('/students/', { params: { search: target, own_only: 'true' } });
    const raw = res.data;
    const list: any[] = Array.isArray(raw) ? raw : (raw?.results || []);
    return list
      .filter((s) => s && s.id && normalizePhoneLast10(s.mobile) === target)
      .map((s) => ({
        id: Number(s.id),
        name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || `Student #${s.id}`,
        mobile: String(s.mobile || ''),
        batchName: String(s.batch_name || s.batch_details?.name || ''),
      }));
  } catch (e: any) {
    console.warn('[mentor-incoming] student lookup failed:', e?.response?.status || e?.message || e);
    return null;
  }
};

export const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ── "Incoming call in progress" flag ────────────────────────────────────────────────────────────────
// Set by GlobalCallListener from RINGING until shortly after the call's recording was processed. dialpad.tsx
// (mentor mode only) ignores native recording events meanwhile, so an incoming call's recording can't be
// attached to an outgoing call that is in Call Review.
const INCOMING_FLAG_MAX_AGE_MS = 30 * 60 * 1000; // safety net if IDLE never arrives
let incomingCallToken = 0;
let incomingCallSince = 0;

/** Marks an incoming call as started; returns a token for endIncomingCall(). */
export const beginIncomingCall = (): number => {
  incomingCallToken += 1;
  incomingCallSince = Date.now();
  return incomingCallToken;
};

/** Clears the flag after `delayMs`, unless a newer incoming call started meanwhile. */
export const endIncomingCall = (token: number, delayMs = 3000) => {
  setTimeout(() => {
    if (token === incomingCallToken) incomingCallSince = 0;
  }, delayMs);
};

export const isIncomingCallInProgress = (): boolean =>
  incomingCallSince > 0 && Date.now() - incomingCallSince < INCOMING_FLAG_MAX_AGE_MS;
