// Mentor WhatsApp contact logging (click-to-chat + log). Single source of truth for the mobile app.
// Saved through the existing POST /students/{id}/add_feedback/ (core.StudentFeedback):
//   feedback_type='WHATSAPP'; a WhatsApp CALL also has call_direction='OUTGOING' (+ call_duration).
// NEVER send mobile_call_id or call_status: either one makes the backend force feedback_type='CALL'.
// Keep in sync with frontend/src/components/mentor/mwaOutcomes.js.

export type WaOutcomeKey =
  | 'SENT'
  | 'CONNECTED'
  | 'NO_REPLY'
  | 'NOT_ON_WHATSAPP'
  | 'CALL_CONNECTED'
  | 'CALL_NOT_CONNECTED';

export interface WaOutcome {
  key: WaOutcomeKey;
  label: string;
  status: 'MESSAGE_SENT' | 'CALL_DONE' | 'NO_ANSWER' | 'NOT_REACHABLE';
  isCall: boolean;
}

export const WA_OUTCOMES: WaOutcome[] = [
  { key: 'SENT', label: 'Message sent', status: 'MESSAGE_SENT', isCall: false },
  { key: 'CONNECTED', label: 'WhatsApp connected / Replied', status: 'CALL_DONE', isCall: false },
  { key: 'NO_REPLY', label: 'No reply', status: 'NO_ANSWER', isCall: false },
  { key: 'NOT_ON_WHATSAPP', label: 'Not on WhatsApp', status: 'NOT_REACHABLE', isCall: false },
  { key: 'CALL_CONNECTED', label: 'WhatsApp call: connected', status: 'CALL_DONE', isCall: true },
  { key: 'CALL_NOT_CONNECTED', label: 'WhatsApp call: not connected', status: 'NO_ANSWER', isCall: true },
];

export const WA_GREEN = '#25D366';
export const WA_GREEN_DARK = '#059669';
export const NO_VALID_WA_NUMBER = 'No valid WhatsApp number';
export const DEFAULT_MARK_CONNECTED_NOTE = 'Marked as WhatsApp connected';

export interface WaPayloadInput {
  notes?: string;
  followupYMD?: string | null;   // 'YYYY-MM-DD'
  durationSec?: number;          // only used for CALL_CONNECTED
}

export function buildWhatsAppPayload(key: WaOutcomeKey, input: WaPayloadInput = {}): Record<string, any> {
  const outcome = WA_OUTCOMES.find(o => o.key === key);
  if (!outcome) throw new Error(`Unknown WhatsApp outcome: ${key}`);
  const payload: Record<string, any> = {
    feedback_type: 'WHATSAPP',
    status: outcome.status,
    feedback: (input.notes || '').trim(),
  };
  if (outcome.isCall) {
    payload.call_direction = 'OUTGOING';
    payload.call_duration = key === 'CALL_CONNECTED' ? Math.max(0, Math.round(input.durationSec || 0)) : 0;
  }
  if (input.followupYMD) payload.next_followup_date = input.followupYMD;
  return payload;
}

/**
 * Digits for https://wa.me/<digits>. Numbers are stored normalised by the backend (+<country><number>);
 * a bare 10-digit number is treated as Indian (+91), same as core.normalize_phone_number and the
 * web welcome flow. Returns null when there is no usable number (< 8 digits).
 */
export function toWaDigits(mobile?: string | null): string | null {
  const raw = String(mobile || '').trim();
  let digits = raw.replace(/\D/g, '');
  if (!raw.startsWith('+') && digits.length === 10) digits = `91${digits}`;
  return digits.length >= 8 ? digits : null;
}

export const waLink = (digits: string) => `https://wa.me/${digits}`;

/** "3:25" -> 205, "45" -> 45, "1:02:03" -> 3723. Returns null when the text isn't a valid duration. */
export function parseMmSs(text: string): number | null {
  const t = String(text || '').trim();
  if (!t) return null;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return null;
  const parts = t.split(':').map(Number);
  if (parts.slice(1).some(p => p > 59)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export const isWhatsAppEntry = (item: any) => String(item?.feedback_type || '').toUpperCase() === 'WHATSAPP';

/** Label for a history row. Non-WhatsApp rows return null so callers keep their current labels. */
export function whatsAppEntryLabel(item: any): { label: string; isCall: boolean } | null {
  if (!isWhatsAppEntry(item)) return null;
  const status = String(item?.status || '').toUpperCase();
  if (item?.call_direction) {
    const connected = status === 'CALL_DONE';
    return { label: connected ? 'WhatsApp call' : 'WhatsApp call: not connected', isCall: true };
  }
  const labels: Record<string, string> = {
    CALL_DONE: 'WhatsApp connected',
    NO_ANSWER: 'No reply',
    NOT_REACHABLE: 'Not on WhatsApp',
    MESSAGE_SENT: 'Message sent',
  };
  return { label: labels[status] || item?.status_display || 'WhatsApp', isCall: false };
}

/** True when the newest WhatsApp entry in an already-loaded history is a connected chat or call. */
export function isLatestWhatsAppConnected(feedbacks: any[]): boolean {
  const latest = (feedbacks || []).find(isWhatsAppEntry);   // history is newest first
  return !!latest && String(latest.status || '').toUpperCase() === 'CALL_DONE';
}
