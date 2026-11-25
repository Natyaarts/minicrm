import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/** Modal shell for the analytics drill-downs: Esc closes, focus moves into the dialog, body scroll is locked. */
const McaModal = ({ title, subtitle, onClose, children, headerExtra }) => {
    const dialogRef = useRef(null);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialogRef.current?.focus();
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[130] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
             onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
                 className="bg-white w-full max-w-6xl max-h-[92vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col outline-none">
                <div className="px-5 py-4 border-b border-slate-100 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-base font-bold text-slate-900">{title}</h2>
                        {subtitle ? <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p> : null}
                    </div>
                    {headerExtra}
                    <button type="button" onClick={onClose} aria-label="Close"
                            className="p-2 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 shrink-0">
                        <X size={16} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            </div>
        </div>
    );
};

export default McaModal;
