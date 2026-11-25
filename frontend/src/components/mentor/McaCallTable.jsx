import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { getMentorCalls, exportMentorCallsCsv } from '../../api/mentorCallAnalytics';
import { MCA_STATUS_COLORS, statusKey, statusLabel, fmtDuration, fmtDate, fmtDateTime } from './mcaFormat';
import MwaIcon from './MwaIcon';

const PAGE_SIZE = 20;

const McaCallTable = ({ filters }) => {
    const filterKey = JSON.stringify(filters);
    // Page is remembered per filter set, so new filters start again at page 1 without an effect.
    const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
    const page = pageState.key === filterKey ? pageState.page : 1;
    const setPage = (updater) => setPageState({ key: filterKey, page: typeof updater === 'function' ? updater(page) : updater });

    const [result, setResult] = useState({ key: null, count: 0, results: [], error: '' });
    const [exporting, setExporting] = useState(false);
    const requestKey = `${filterKey}#${page}`;

    useEffect(() => {
        let cancelled = false;
        getMentorCalls({ ...JSON.parse(filterKey), page, page_size: PAGE_SIZE })
            .then((d) => { if (!cancelled) setResult({ key: requestKey, count: d.count || 0, results: d.results || [], error: '' }); })
            .catch((e) => {
                if (!cancelled) setResult({ key: requestKey, count: 0, results: [], error: e.response?.data?.detail || 'Could not load calls.' });
            });
        return () => { cancelled = true; };
    }, [filterKey, page, requestKey]);

    const loading = result.key !== requestKey;
    const { error } = result;
    const data = { count: result.count, results: result.results };

    const handleExport = async () => {
        setExporting(true);
        try {
            await exportMentorCallsCsv(filters);
        } catch (e) {
            console.error('Mentor call export failed', e);
            alert('Failed to export calls.');
        } finally {
            setExporting(false);
        }
    };

    const totalPages = Math.max(1, Math.ceil(data.count / PAGE_SIZE));

    return (
        <div>
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <p className="text-sm text-slate-500">{data.count} entr{data.count === 1 ? 'y' : 'ies'}</p>
                <button type="button" onClick={handleExport} disabled={exporting || data.count === 0}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50">
                    <Download size={14} /> {exporting ? 'Exporting…' : 'Export CSV'}
                </button>
            </div>

            {error ? <p className="text-sm text-red-600 py-4">{error}</p> : null}

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide text-left">
                            <th className="py-2 px-3 font-semibold whitespace-nowrap">Date</th>
                            <th className="py-2 px-3 font-semibold">Mentor</th>
                            <th className="py-2 px-3 font-semibold">Student</th>
                            <th className="py-2 px-3 font-semibold">Outcome</th>
                            <th className="py-2 px-3 font-semibold text-right">Duration</th>
                            <th className="py-2 px-3 font-semibold">Feedback</th>
                            <th className="py-2 px-3 font-semibold">Recording</th>
                        </tr>
                    </thead>
                    <tbody className={`divide-y divide-slate-100 ${loading ? 'opacity-50' : ''}`}>
                        {!loading && !error && data.results.length === 0 ? (
                            <tr><td colSpan={7} className="py-8 text-center text-slate-500">Nothing matches these filters.</td></tr>
                        ) : null}
                        {data.results.map((r) => (
                            <tr key={r.id} className="align-top hover:bg-slate-50">
                                <td className="py-2 px-3 whitespace-nowrap text-slate-700">
                                    {r.start_time ? fmtDateTime(r.start_time) : fmtDate(r.feedback_date)}
                                </td>
                                <td className="py-2 px-3 text-slate-800">
                                    <span className={r.mentor_id ? '' : 'italic text-slate-400'}>{r.mentor_name}</span>
                                </td>
                                <td className="py-2 px-3">
                                    <div className="text-slate-800 font-medium">{r.student_name || '—'}</div>
                                    <div className="text-[11px] text-slate-500">{r.student_phone}{r.batch_name ? ` · ${r.batch_name}` : ''}</div>
                                </td>
                                <td className="py-2 px-3 whitespace-nowrap">
                                    {r.channel === 'WHATSAPP' ? (
                                        <>
                                            <span className="inline-flex items-center gap-1.5 text-emerald-700">
                                                <MwaIcon size={12} /> {r.whatsapp_label}
                                            </span>
                                            <div className="text-[11px] text-slate-500">WhatsApp · marked by mentor</div>
                                        </>
                                    ) : (
                                        <>
                                            <span className="inline-flex items-center gap-1.5 text-slate-700">
                                                <span className="w-2 h-2 rounded-full" style={{ background: MCA_STATUS_COLORS[statusKey(r.call_status)] || '#78716c' }} />
                                                {statusLabel(r.call_status)}
                                            </span>
                                            <div className="text-[11px] text-slate-500">
                                                {r.status_display}
                                                {' · '}
                                                <span className={r.direction === 'INCOMING' ? 'text-sky-700 font-medium' : ''}>
                                                    {r.direction === 'INCOMING' ? 'Incoming' : 'Outgoing'}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </td>
                                <td className="py-2 px-3 text-right tabular-nums text-slate-800 whitespace-nowrap">
                                    {r.call_duration ? fmtDuration(r.call_duration) : '—'}
                                </td>
                                <td className="py-2 px-3 text-slate-700 max-w-xs">
                                    <span className="line-clamp-2 break-words" title={r.feedback}>{r.feedback || '—'}</span>
                                </td>
                                <td className="py-2 px-3">
                                    {r.recording_url ? (
                                        <audio controls preload="none" src={r.recording_url} className="h-8 w-56 max-w-full">
                                            <a href={r.recording_url} target="_blank" rel="noreferrer">Open recording</a>
                                        </audio>
                                    ) : <span className="text-slate-400">—</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 ? (
                <div className="flex items-center justify-end gap-2 mt-3 text-sm">
                    <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}
                            className="p-1.5 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50" aria-label="Previous page">
                        <ChevronLeft size={16} />
                    </button>
                    <span className="text-slate-600 tabular-nums">Page {page} of {totalPages}</span>
                    <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading}
                            className="p-1.5 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50" aria-label="Next page">
                        <ChevronRight size={16} />
                    </button>
                </div>
            ) : null}
        </div>
    );
};

export default McaCallTable;
