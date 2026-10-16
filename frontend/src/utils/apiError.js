export const formatApiError = (err, fallback) => {
    const d = err.response?.data;
    if (!d) return err.response ? `${fallback} (HTTP ${err.response.status})` : 'Network error';
    if (typeof d === 'string') return fallback;
    if (d.error || d.detail) return d.error || d.detail;
    return Object.entries(d)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : JSON.stringify(v)}`)
        .join('\n');
};