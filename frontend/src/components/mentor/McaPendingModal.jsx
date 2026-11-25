import React, { useMemo, useState } from 'react';
import { Download, AlertCircle } from 'lucide-react';
import McaModal from './McaModal';
import McaPagination from './McaPagination';
import useMcaPaged from './useMcaPaged';
import { getPendingStudents, exportPendingStudentsCsv } from '../../api/mentorCallAnalytics';
import { fmtDate } from './mcaFormat';

const PAGE_SIZE = 20;

/** Paginated list of active students in scope with no connected contact (phone or WhatsApp) in the range. */
const McaPendingModal = ({ filters, onClose }) => {
    const [page, setPage] = useState(1);
    const [exporting, setExporting] = useState(false);
    // Pending ignores channel and call outcome: "connected" means either channel
    const params = useMemo(() => {
        const rest = { ...filters };
        delete rest.channel;
        delete rest.call_status;
        return rest;
    }, [filters]);
    const { count, results, error, loading } = useMcaPaged(getPendingStudents, params, page, PAGE_SIZE, 'Could not load pending students.');

    const handleExport = async () => {
        setExporting(true);
        try {
            await exportPendingStudentsCsv(params);
        } catch (e) {
            console.error('Pending export failed', e);
            alert('Failed to export.');
        } finally {
            setExporting(false);
        }
    };

    return (
        <McaModal
            title="Pending students"
            subtitle={`Active students with no connected call or WhatsApp contact from ${filters.start_date || ''} to ${filters.end_date || ''}. Overdue follow-ups first, then never connected.`}
            onClose={onClose}
            headerExtra={(
                <button type="button" onClick={handleExport} disabled={exporting || !count}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 shrink-0">
                    <Download size={14} /> {exporting ? 'Exporting…' : 'Export CSV'}
                </button>
            )}
        >
            {error ? (
                <p className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
                    <AlertCircle size={16} /> {error}
                </p>
            ) : null}

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide text-left">
                            <th className="py-2 px-3 font-semibold">Student</th>
                            <th className="py-2 px-3 font-semibold">Mentor</th>
                            <th className="py-2 px-3 font-semibold">Batch</th>
                            <th className="py-2 px-3 font-semibold whitespace-nowrap">Last contact</th>
                            <th className="py-2 px-3 font-semibold whitespace-nowrap">Last connected</th>
                            <th className="py-2 px-3 font-semibold text-right" title="Calls / WhatsApp contacts in this period that did not connect">Attempts</th>
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
                            <tr><td colSpan={7} className="py-10 text-center text-slate-500">Every active student was connected in this period.</td></tr>
                        ) : null}
                        {results.map((r) => (
                            <tr key={r.student_id} className="align-top hover:bg-slate-50">
                                <td className="py-2 px-3">
                                    <div className="font-medium text-slate-800">{r.student_name || '—'}</div>
                                    <div className="text-[11px] text-slate-500">{r.student_phone}{r.crm_student_id ? ` · ${r.crm_student_id}` : ''}</div>
                                </td>
                                <td className="py-2 px-3 text-slate-700">{r.mentor_name || '—'}</td>
                                <td className="py-2 px-3 text-slate-700">{r.batch_name || '—'}</td>
                                <td className="py-2 px-3 whitespace-nowrap text-slate-700">{r.last_contact_date ? fmtDate(r.last_contact_date) : 'Never'}</td>
                                <td className="py-2 px-3 whitespace-nowrap text-slate-700">
                                    {r.last_connected_date ? fmtDate(r.last_connected_date) : <span className="text-amber-700 font-medium">Never</span>}
                                </td>
                                <td className="py-2 px-3 text-right tabular-nums text-slate-800">{r.attempts_in_range}</td>
                                <td className="py-2 px-3 whitespace-nowrap">
                                    {r.next_followup_date ? (
                                        <span className={r.is_overdue ? 'text-red-600 font-semibold' : 'text-slate-700'}>
                                            {fmtDate(r.next_followup_date)}{r.is_overdue ? ' · overdue' : ''}
                                        </span>
                                    ) : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <McaPagination page={page} pageSize={PAGE_SIZE} count={count} disabled={loading} onPage={setPage} />
        </McaModal>
    );
};

export default McaPendingModal;
