import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// 1 … 4 5 [6] 7 8 … 20
const pageList = (page, total) => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = new Set([1, total, page - 1, page, page + 1]);
    if (page <= 3) [2, 3, 4].forEach((p) => pages.add(p));
    if (page >= total - 2) [total - 3, total - 2, total - 1].forEach((p) => pages.add(p));
    const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
    const out = [];
    sorted.forEach((p, i) => {
        if (i && p - sorted[i - 1] > 1) out.push(`gap-${p}`);
        out.push(p);
    });
    return out;
};

/** "Showing 21–40 of 268" + previous / page numbers / next. */
const McaPagination = ({ page, pageSize, count, onPage, disabled }) => {
    if (!count) return null;
    const totalPages = Math.max(1, Math.ceil(count / pageSize));
    const from = (page - 1) * pageSize + 1;
    const to = Math.min(count, page * pageSize);
    const btn = 'min-w-8 h-8 px-2 rounded-lg border text-sm tabular-nums disabled:opacity-40';
    return (
        <nav className="flex flex-wrap items-center justify-between gap-3 mt-4" aria-label="Pagination">
            <p className="text-sm text-slate-600 tabular-nums">Showing {from.toLocaleString('en-IN')}–{to.toLocaleString('en-IN')} of {count.toLocaleString('en-IN')}</p>
            {totalPages > 1 ? (
                <div className="flex items-center gap-1">
                    <button type="button" className={`${btn} border-slate-200 hover:bg-slate-50`} disabled={disabled || page <= 1}
                            onClick={() => onPage(page - 1)} aria-label="Previous page">
                        <ChevronLeft size={16} className="mx-auto" />
                    </button>
                    {pageList(page, totalPages).map((p) => (typeof p === 'string' ? (
                        <span key={p} className="px-1 text-slate-400" aria-hidden="true">…</span>
                    ) : (
                        <button key={p} type="button" disabled={disabled} onClick={() => onPage(p)}
                                aria-current={p === page ? 'page' : undefined}
                                className={`${btn} ${p === page ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                            {p}
                        </button>
                    )))}
                    <button type="button" className={`${btn} border-slate-200 hover:bg-slate-50`} disabled={disabled || page >= totalPages}
                            onClick={() => onPage(page + 1)} aria-label="Next page">
                        <ChevronRight size={16} className="mx-auto" />
                    </button>
                </div>
            ) : null}
        </nav>
    );
};

export default McaPagination;
