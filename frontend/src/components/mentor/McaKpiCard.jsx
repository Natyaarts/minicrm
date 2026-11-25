import React from 'react';
import { ChevronRight } from 'lucide-react';

const TONES = {
    default: 'bg-white border-slate-200',
    amber: 'bg-amber-50 border-amber-200',
};

/** KPI tile. With onClick it becomes a keyboard-accessible button (Enter / Space) that opens a drill-down. */
const McaKpiCard = ({ icon: Icon, label, value, hint, onClick, tone = 'default', actionLabel }) => {
    const clickable = typeof onClick === 'function';
    const handleKey = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
        }
    };
    return (
        <div
            className={`border rounded-xl p-4 shadow-sm flex flex-col gap-1 min-w-0 ${TONES[tone] || TONES.default} ${clickable
                ? 'cursor-pointer transition-all hover:border-indigo-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500' : ''}`}
            {...(clickable ? {
                role: 'button', tabIndex: 0, onClick, onKeyDown: handleKey,
                'aria-label': actionLabel || `${label}: ${value}. Show details`,
            } : {})}
        >
            <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${tone === 'amber' ? 'text-amber-800' : 'text-slate-500'}`}>
                {Icon ? <Icon size={14} className="shrink-0" aria-hidden="true" /> : null}
                <span className="truncate">{label}</span>
                {clickable ? <ChevronRight size={14} className="ml-auto shrink-0 text-slate-400" aria-hidden="true" /> : null}
            </div>
            <div className="text-2xl font-bold text-slate-900 tabular-nums truncate">{value}</div>
            {hint ? <div className={`text-[11px] leading-snug ${tone === 'amber' ? 'text-amber-800/80' : 'text-slate-500'}`}>{hint}</div> : null}
        </div>
    );
};

export default McaKpiCard;
