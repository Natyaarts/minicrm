import React, { useMemo, useState } from 'react';
import { Download, Phone, AlertCircle } from 'lucide-react';
import McaModal from './McaModal';
import McaPagination from './McaPagination';
import MwaIcon from './MwaIcon';
import useMcaPaged from './useMcaPaged';
import { getMentorCalls, exportMentorCallsCsv } from '../../api/mentorCallAnalytics';
import { fmtDate, fmtDateTime, fmtDuration } from './mcaFormat';

const PAGE_SIZE = 20;
const TABS = [
    { id: 'phone', label: 'Phone' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'all', label: 'All' },
];
// Phone tab only. Outgoing = the "Connected" card (calls without a direction count as outgoing);
// Incoming = the incoming calls row (students who called the mentor).
const DIRECTIONS = [
    { id: 'outgoing', label: 'Outgoing' },
    { id: 'incoming', label: 'Incoming' },
];

const ChannelBadge = ({ channel }) => (channel === 'WHATSAPP' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
        <MwaIcon size={11} /> WhatsApp
    </span>
) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
        <Phone size={11} aria-hidden="true" /> Phone
    </span>
));

/** Paginated list of connected contacts (phone CONNECTED / WhatsApp marked connected) for the page filters. */
const McaConnectedModal = ({ filters, initialTab = 'phone', initialDirection = 'outgoing', onClose }) => {
    const [tab, setTab] = useState(initialTab);
    const [direction, setDirection] = useState(initialDirection);
    // Page remembered per tab (and phone direction), so switching starts at page 1
    const viewKey = tab === 'phone' ? `phone:${direction}` : tab;
    const [pageState, setPageState] = useState({ view: viewKey, page: 1 });
    const page = pageState.view === viewKey ? pageState.page : 1;
    const [expanded, setExpanded] = useState(null);
    const [exporting, setExporting] = useState(false);

    // Page filters (date range, mentor, batch/course/program); the call-outcome filter doesn't apply here
    const params = useMemo(() => ({
        ...filters, call_status: '', channel: tab, outcome: 'connected',
        ...(tab === 'phone' ? { direction } : {}),
    }), [filters, tab, direction]);
    const { count, results, error, loading } = useMcaPaged(getMentorCalls, params, page, PAGE_SIZE, 'Could not load connected contacts.');

    const handleExport = async () => {
        setExporting(true);
        try {
            await exportMentorCallsCsv(params);
        } catch (e) {
            console.error('Connected export failed', e);
            alert('Failed to export.');
        } finally {
            setExporting(false);
        }
    };

    return (
        <McaModal
            title="Connected contacts"
            subtitle={`${filters.start_date || ''} to ${filters.end_date || ''} · phone calls that connected (outgoing and incoming) and WhatsApp contacts marked connected`}
            onClose={onClose}
            headerExtra={(
                <button type="button" onClick={handleExport} disabled={exporting || !count}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 shrink-0">
                    <Download size={14} /> {exporting ? 'Exporting…' : 'Export CSV'}
                </button>
            )}
        >
            <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5 w-fit mb-4" role="tablist" aria-label="Channel">
                {TABS.map((t) => (
                    <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
                            onClick={() => { setTab(t.id); setExpanded(null); }}
                            className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${tab === t.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                        {t.label}
                    </button>
                ))}
            </div>
            {tab === 'phone' ? (
                <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5 w-fit -mt-2 mb-4" role="tablist" aria-label="Call direction">
                    {DIRECTIONS.map((d) => (
                        <button key={d.id} type="button" role="tab" aria-selected={direction === d.id}
                                onClick={() => { setDirection(d.id); setExpanded(null); }}
                                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${direction === d.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                            {d.label}
                        </button>
                    ))}
                </div>
            ) : null}

            {error ? (
                <p className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
                    <AlertCircle size={16} /> {error}
                </p>
            ) : null}

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide text-left">
                            <th className="py-2 px-3 font-semibold whitespace-nowrap">Date & time (IST)</th>
                            <th className="py-2 px-3 font-semibold">Student</th>
                            <th className="py-2 px-3 font-semibold">Mentor</th>
                            <th className="py-2 px-3 font-semibold">Channel</th>
                            <th className="py-2 px-3 font-semibold text-right">Duration</th>
                            <th className="py-2 px-3 font-semibold">Notes</th>
                            <th className="py-2 px-3 font-semibold whitespace-nowrap">Next follow-up</th>
                        </tr>
                    </thead>
                    <tbody className={`divide-y divide-slate-100 ${loading ? 'opacity-50' : ''}`}>
                        {loading && !results.length ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <tr key={`sk-${i}`}><td colSpan={7} className="py-3 px-3"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td></tr>
                            ))
                        ) : null}
                        {!loading && !error && !results.length ? (
                            <tr><td colSpan={7} className="py-10 text-center text-slate-500">No connected contacts in this period</td></tr>
                        ) : null}
                        {results.map((r) => {
                            const isWa = r.channel === 'WHATSAPP';
                            const open = expanded === r.id;
                            return (
                                <tr key={r.id} className="align-top hover:bg-slate-50">
                                    <td className="py-2 px-3 whitespace-nowrap text-slate-700">
                                        {r.start_time ? fmtDateTime(r.start_time) : fmtDate(r.feedback_date)}
                                    </td>
                                    <td className="py-2 px-3">
                                        <div className="font-medium text-slate-800">{r.student_name || '—'}</div>
                                        <div className="text-[11px] text-slate-500">{r.student_phone}</div>
                                    </td>
                                    <td className="py-2 px-3 text-slate-700">
                                        <span className={r.mentor_id ? '' : 'italic text-slate-400'}>{r.mentor_name}</span>
                                    </td>
                                    <td className="py-2 px-3 whitespace-nowrap">
                                        <ChannelBadge channel={r.channel} />
                                        {!isWa ? (
                                            <div className="text-[11px] text-slate-500 mt-0.5">{r.direction === 'INCOMING' ? 'Incoming' : 'Outgoing'}</div>
                                        ) : null}
                                    </td>
                                    <td className="py-2 px-3 text-right tabular-nums text-slate-800 whitespace-nowrap">
                                        {isWa ? '–' : fmtDuration(r.call_duration)}
                                    </td>
                                    <td className="py-2 px-3 text-slate-700 max-w-xs">
                                        {r.feedback ? (
                                            <button type="button" onClick={() => setExpanded(open ? null : r.id)} title={r.feedback}
                                                    aria-expanded={open}
                                                    className={`text-left break-words ${open ? '' : 'line-clamp-2'}`}>
                                                {r.feedback}
                                            </button>
                                        ) : '—'}
                                    </td>
                                    <td className="py-2 px-3 whitespace-nowrap text-slate-700">{r.next_followup_date ? fmtDate(r.next_followup_date) : '—'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <McaPagination page={page} pageSize={PAGE_SIZE} count={count} disabled={loading}
                           onPage={(p) => { setPageState({ view: viewKey, page: p }); setExpanded(null); }} />
        </McaModal>
    );
};

export default McaConnectedModal;
