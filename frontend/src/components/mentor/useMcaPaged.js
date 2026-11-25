import { useEffect, useState } from 'react';

const errorMessage = (e, fallback) => {
    const d = e?.response?.data;
    if (d?.detail) return d.detail;
    if (d && typeof d === 'object') return Object.values(d).flat().join(' ') || fallback;
    return fallback;
};

/**
 * Server-side paginated fetch. `params` must be a stable JSON-able object; loading is derived from the
 * request key (no setState in the effect body). The last result stays visible while the next page loads.
 */
export default function useMcaPaged(fetcher, params, page, pageSize = 20, fallbackError = 'Could not load data.') {
    const paramsKey = JSON.stringify(params);
    const requestKey = `${paramsKey}#${page}#${pageSize}`;
    const [result, setResult] = useState({ key: null, count: 0, results: [], error: '' });

    useEffect(() => {
        let cancelled = false;
        fetcher({ ...JSON.parse(paramsKey), page, page_size: pageSize })
            .then((d) => { if (!cancelled) setResult({ key: requestKey, count: d.count || 0, results: d.results || [], error: '' }); })
            .catch((e) => { if (!cancelled) setResult({ key: requestKey, count: 0, results: [], error: errorMessage(e, fallbackError) }); });
        return () => { cancelled = true; };
    }, [fetcher, paramsKey, page, pageSize, requestKey, fallbackError]);

    return { ...result, loading: result.key !== requestKey };
}
