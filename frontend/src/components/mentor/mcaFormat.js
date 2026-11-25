// Formatting + colour helpers for Mentor Call Analytics.

// Categorical slots in fixed order (validated reference palette, light mode). Never cycled.
export const MCA_SERIES = {
    calls: '#2a78d6',       // slot 1 blue
    connected: '#eb6834',   // slot 2 orange
    waConnected: '#1baf7a', // slot 3 aqua (WhatsApp connected)
};
export const MCA_STATUS_COLORS = {
    CONNECTED: '#2a78d6',   // slot 1
    MISSED: '#eb6834',      // slot 2
    UNANSWERED: '#1baf7a',  // slot 3
    UNKNOWN: '#a8a29e',     // neutral: outcome not recorded
};
export const MCA_STATUS_LABELS = {
    CONNECTED: 'Connected',
    MISSED: 'Missed',
    UNANSWERED: 'Unanswered',
    REJECTED: 'Rejected',
    BUSY: 'Busy',
    FAILED: 'Failed',
    UNKNOWN: 'Unknown outcome',
};

export const statusKey = (s) => (s ? String(s).toUpperCase() : 'UNKNOWN');
export const statusLabel = (s) => MCA_STATUS_LABELS[statusKey(s)] || s;

// 3725 -> "1:02" (h:mm)
export const fmtHM = (sec) => {
    const s = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}:${String(m).padStart(2, '0')}`;
};

// 0 -> "0s", 108 -> "1m 48s", 3900 -> "1h 05m"
export const fmtDuration = (sec) => {
    const s = Math.max(0, Math.round(sec || 0));
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
};

export const fmtNum = (n) => (n === null || n === undefined ? 'n/a' : Number(n).toLocaleString('en-IN'));
export const fmtPct = (n) => (n === null || n === undefined ? 'n/a' : `${n}%`);

export const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

export const fmtDateTime = (iso) => {
    if (!iso) return '';
    // Backend sends IST with offset; show it in IST regardless of the viewer's browser zone.
    return new Date(iso).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
};

export const hourLabel = (h) => {
    const suffix = h < 12 ? 'am' : 'pm';
    const hh = h % 12 === 0 ? 12 : h % 12;
    return `${hh}${suffix}`;
};

// YYYY-MM-DD in India time
export const istToday = () => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(new Date());
    return parts; // en-CA formats as YYYY-MM-DD
};

export const shiftDays = (iso, days) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
};

export const presetRange = (preset) => {
    const today = istToday();
    switch (preset) {
        case 'today': return { start_date: today, end_date: today };
        case '7d': return { start_date: shiftDays(today, -6), end_date: today };
        case 'month': return { start_date: `${today.slice(0, 8)}01`, end_date: today };
        case '30d':
        default: return { start_date: shiftDays(today, -29), end_date: today };
    }
};
