// Mentor WhatsApp contact logging (click-to-chat + log). Single source of truth for the web app.
// Saved through the existing POST students/{id}/add_feedback/?own_only=true (core.StudentFeedback):
//   feedback_type='WHATSAPP'; a WhatsApp CALL also has call_direction='OUTGOING' (+ call_duration).
// NEVER send mobile_call_id or call_status: either one makes the backend force feedback_type='CALL'.
// Keep in sync with mobile/src/utils/whatsappMentor.ts.

export const WA_OUTCOMES = [
    { key: 'SENT', label: 'Message sent', status: 'MESSAGE_SENT', isCall: false },
    { key: 'CONNECTED', label: 'WhatsApp connected / Replied', status: 'CALL_DONE', isCall: false },
    { key: 'NO_REPLY', label: 'No reply', status: 'NO_ANSWER', isCall: false },
    { key: 'NOT_ON_WHATSAPP', label: 'Not on WhatsApp', status: 'NOT_REACHABLE', isCall: false },
    { key: 'CALL_CONNECTED', label: 'WhatsApp call: connected', status: 'CALL_DONE', isCall: true },
    { key: 'CALL_NOT_CONNECTED', label: 'WhatsApp call: not connected', status: 'NO_ANSWER', isCall: true },
];

export const NO_VALID_WA_NUMBER = 'No valid WhatsApp number';
export const DEFAULT_MARK_CONNECTED_NOTE = 'Marked as WhatsApp connected';

export function buildWhatsAppPayload(key, { notes = '', followupYMD = null, durationSec = 0 } = {}) {
    const outcome = WA_OUTCOMES.find((o) => o.key === key);
    if (!outcome) throw new Error(`Unknown WhatsApp outcome: ${key}`);
    const payload = { feedback_type: 'WHATSAPP', status: outcome.status, feedback: String(notes || '').trim() };
    if (outcome.isCall) {
        payload.call_direction = 'OUTGOING';
        payload.call_duration = key === 'CALL_CONNECTED' ? Math.max(0, Math.round(durationSec || 0)) : 0;
    }
    if (followupYMD) payload.next_followup_date = followupYMD;
    return payload;
}

/**
 * Digits for https://wa.me/<digits>. Numbers are stored normalised by the backend (+<country><number>);
 * a bare 10-digit number is treated as Indian (+91), same as core.normalize_phone_number and the
 * welcome flow. Returns null when there is no usable number (< 8 digits).
 */
export function toWaDigits(mobile) {
    const raw = String(mobile || '').trim();
    let digits = raw.replace(/\D/g, '');
    if (!raw.startsWith('+') && digits.length === 10) digits = `91${digits}`;
    return digits.length >= 8 ? digits : null;
}

export const waLink = (digits) => `https://wa.me/${digits}`;

/** "3:25" -> 205, "45" -> 45, "1:02:03" -> 3723; null when not a valid duration. */
export function parseMmSs(text) {
    const t = String(text || '').trim();
    if (!t || !/^\d+(:\d{1,2}){0,2}$/.test(t)) return null;
    const parts = t.split(':').map(Number);
    if (parts.slice(1).some((p) => p > 59)) return null;
    return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export const isWhatsAppEntry = (item) => String(item?.feedback_type || '').toUpperCase() === 'WHATSAPP';

/** Label for a history row; null for non-WhatsApp rows so they keep their current labels. */
export function whatsAppEntryLabel(item) {
    if (!isWhatsAppEntry(item)) return null;
    const status = String(item?.status || '').toUpperCase();
    if (item?.call_direction) {
        return { label: status === 'CALL_DONE' ? 'WhatsApp call' : 'WhatsApp call: not connected', isCall: true };
    }
    const labels = {
        CALL_DONE: 'WhatsApp connected',
        NO_ANSWER: 'No reply',
        NOT_REACHABLE: 'Not on WhatsApp',
        MESSAGE_SENT: 'Message sent',
    };
    return { label: labels[status] || item?.status_display || 'WhatsApp', isCall: false };
}

/** True when the newest WhatsApp entry in an already-loaded (newest-first) history is CONNECTED. */
export function isLatestWhatsAppConnected(feedbacks) {
    const latest = (feedbacks || []).find(isWhatsAppEntry);
    return !!latest && String(latest.status || '').toUpperCase() === 'CALL_DONE';
}

export const fmtWaDuration = (sec) => {
    const s = Math.max(0, Math.round(sec || 0));
    if (!s) return '';
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};
