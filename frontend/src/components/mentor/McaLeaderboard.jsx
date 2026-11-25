import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { fmtDuration, fmtNum } from './mcaFormat';

// Talk time = phone talk time + WhatsApp call time (the split is in the cell tooltip)
const talkTotal = (r) => (r.talk_time_sec || 0) + (r.wa_talk_time_sec || 0);

const COLUMNS = [
    { key: 'name', label: 'Mentor', align: 'left' },
    { key: 'phone_connected', label: 'Call connected', channel: 'phone' },
    { key: 'phone_students_connected', label: 'Call students', channel: 'phone' },
    { key: 'wa_connected', label: 'WhatsApp connected', channel: 'whatsapp' },
    { key: 'wa_students_connected', label: 'WhatsApp students', channel: 'whatsapp' },
    { key: 'students_connected_total', label: 'Total students connected' },
    { key: 'talk_total', label: 'Talk time', fmt: fmtDuration, value: talkTotal },
];

const ROLE_BADGE = {
    'SUPER_ADMIN': 'bg-purple-50 text-purple-700 border-purple-100',
    'ADMIN': 'bg-purple-50 text-purple-700 border-purple-100',
    'HEAD - MENTOR': 'bg-indigo-50 text-indigo-700 border-indigo-100',
    'TEACHER': 'bg-amber-50 text-amber-700 border-amber-100',
};

const cellValue = (c, r) => (c.value ? c.value(r) : r[c.key]);

const McaLeaderboard = ({ rows, onSelectMentor, showPhone = true, showWhatsApp = true }) => {
    const [sort, setSort] = useState({ key: 'students_connected_total', dir: 'desc' });

    const columns = useMemo(() => COLUMNS.filter((c) =>
        !c.channel || (c.channel === 'phone' && showPhone) || (c.channel === 'whatsapp' && showWhatsApp)), [showPhone, showWhatsApp]);

    const sorted = useMemo(() => {
        const col = COLUMNS.find((c) => c.key === sort.key) || COLUMNS[0];
        const list = [...(rows || [])];
        list.sort((a, b) => {
            const av = cellValue(col, a) ?? -1;
            const bv = cellValue(col, b) ?? -1;
            const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
            return sort.dir === 'asc' ? cmp : -cmp;
        });
        return list;
    }, [rows, sort]);

    const toggle = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));

    if (!rows?.length) return <p className="text-sm text-slate-500 py-6 text-center">No activity in this range.</p>;

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
                        {columns.map((c) => (
                            <th key={c.key} className={`py-2 px-3 font-semibold ${c.align === 'left' ? 'text-left' : 'text-right'}`}
                                aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                <button type="button" onClick={() => toggle(c.key)}
                                        className={`inline-flex items-center gap-1 hover:text-slate-800 ${c.align === 'left' ? '' : 'justify-end text-right'} ${c.channel === 'whatsapp' ? 'text-emerald-700' : ''}`}>
                                    {c.label}
                                    {sort.key === c.key ? (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : null}
                                </button>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {sorted.map((r) => (
                        <tr key={r.mentor_id ?? 'deleted'} className="hover:bg-slate-50">
                            <td className="py-2 px-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                    {r.mentor_id && onSelectMentor ? (
                                        <button type="button" onClick={() => onSelectMentor(String(r.mentor_id))}
                                                className="font-medium text-slate-800 hover:text-indigo-700 text-left" title="Filter to this mentor">
                                            {r.name}
                                        </button>
                                    ) : (
                                        <span className={`font-medium ${r.mentor_id ? 'text-slate-800' : 'text-slate-400 italic'}`}>{r.name}</span>
                                    )}
                                    {r.role && r.role !== 'MENTOR' ? (
                                        <span className={`px-1.5 py-0.5 border rounded text-[10px] font-semibold ${ROLE_BADGE[r.role] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                            {r.role}
                                        </span>
                                    ) : null}
                                </div>
                                {showPhone && r.unknown_outcome > 0 ? (
                                    <div className="text-[11px] text-slate-500">{r.unknown_outcome} call{r.unknown_outcome === 1 ? '' : 's'} with unknown outcome</div>
                                ) : null}
                            </td>
                            {columns.slice(1).map((c) => {
                                const v = cellValue(c, r);
                                const title = c.key === 'talk_total' && showPhone && showWhatsApp
                                    ? `Calls ${fmtDuration(r.talk_time_sec)} · WhatsApp calls ${fmtDuration(r.wa_talk_time_sec)}` : undefined;
                                return (
                                    <td key={c.key} title={title}
                                        className={`py-2 px-3 text-right tabular-nums whitespace-nowrap ${c.key === 'students_connected_total' ? 'font-semibold text-slate-900' : 'text-slate-800'}`}>
                                        {c.fmt ? c.fmt(v) : fmtNum(v)}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default McaLeaderboard;
