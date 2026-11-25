import React, { useState } from 'react';
import { X, Calendar } from 'lucide-react';
import api from '../../api/axios';
import MwaIcon from './MwaIcon';
import {
    WA_OUTCOMES, buildWhatsAppPayload, parseMmSs, DEFAULT_MARK_CONNECTED_NOTE,
} from './mwaOutcomes';

const studentName = (s) => `${s?.first_name || ''} ${s?.last_name || ''}`.trim() || 'this student';

const errorMessage = (err, fallback) => {
    const d = err?.response?.data;
    if (d?.error) return d.error;
    if (d?.detail) return d.detail;
    if (d && typeof d === 'object') return Object.values(d).flat().join(' ') || fallback;
    return err?.message || fallback;
};

const todayYMD = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Log a WhatsApp contact for a student (mode="log"), or confirm "Mark as WhatsApp connected" (mode="mark").
 * Posts to the existing add_feedback endpoint. On failure the real error is shown and nothing is faked.
 */
const MentorWhatsAppLogModal = ({ student, mode = 'log', onClose, onSaved }) => {
    const [outcome, setOutcome] = useState('SENT');
    const [notes, setNotes] = useState('');
    const [duration, setDuration] = useState('');
    const [followup, setFollowup] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState('');   // success message shown briefly before the modal closes itself

    if (!student) return null;
    const isMark = mode === 'mark';
    const name = studentName(student);

    const save = async (e) => {
        e.preventDefault();
        if (saving || done) return;
        let payload;
        if (isMark) {
            payload = buildWhatsAppPayload('CONNECTED', { notes: notes.trim() || DEFAULT_MARK_CONNECTED_NOTE });
        } else {
            let durationSec = 0;
            if (outcome === 'CALL_CONNECTED') {
                const parsed = parseMmSs(duration);
                if (parsed === null || parsed <= 0) {
                    setError('Enter the call length as mm:ss, e.g. 4:30');
                    return;
                }
                durationSec = parsed;
            }
            payload = buildWhatsAppPayload(outcome, { notes, durationSec, followupYMD: followup || null });
        }
        setSaving(true);
        setError('');
        try {
            const res = await api.post(`students/${student.id}/add_feedback/`, payload, { params: { own_only: 'true' } });
            onSaved?.(res.data);
            setDone(isMark ? `${name} marked as WhatsApp connected` : 'WhatsApp log saved');
            setTimeout(() => onClose?.(), 1200);
        } catch (err) {
            setError(errorMessage(err, isMark ? 'Unable to mark as WhatsApp connected.' : 'Unable to save the WhatsApp log.'));
        } finally {
            setSaving(false);
        }
    };

    const fieldCls = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500';

    return (
        <div className="fixed inset-0 z-[120] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <form onSubmit={save} className="bg-white w-full max-w-lg max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-emerald-50/60">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                            <MwaIcon size={18} />
                        </span>
                        <div className="min-w-0">
                            <h2 className="text-base font-bold text-slate-800 truncate">
                                {isMark ? 'Mark as WhatsApp connected' : 'Log WhatsApp contact'}
                            </h2>
                            <p className="text-xs text-slate-500 truncate">{name}{student.crm_student_id ? ` • ${student.crm_student_id}` : ''}</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} disabled={saving} aria-label="Close"
                            className="p-2 rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-100">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto">
                    {isMark ? (
                        <p className="text-sm text-slate-700">Mark <b>{name}</b> as WhatsApp connected?</p>
                    ) : (
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Outcome *</p>
                            <div className="flex flex-wrap gap-2">
                                {WA_OUTCOMES.map((o) => (
                                    <button key={o.key} type="button" onClick={() => { setOutcome(o.key); setError(''); }}
                                            aria-pressed={outcome === o.key}
                                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${outcome === o.key
                                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-emerald-300'}`}>
                                        {o.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {!isMark && outcome === 'CALL_CONNECTED' ? (
                        <label className="block">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Call length (mm:ss) *</span>
                            <input value={duration} onChange={(e) => { setDuration(e.target.value); setError(''); }}
                                   placeholder="e.g. 4:30" inputMode="numeric" maxLength={8} className={`${fieldCls} mt-1.5`} />
                        </label>
                    ) : null}

                    <label className="block">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{isMark ? 'Note (optional)' : 'Notes'}</span>
                        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                                  placeholder={isMark ? 'e.g. Replied and confirmed class timing' : 'What was discussed?'}
                                  className={`${fieldCls} mt-1.5 resize-y`} />
                    </label>

                    {!isMark ? (
                        <label className="block">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1"><Calendar size={12} /> Next follow-up</span>
                            <input type="date" value={followup} min={todayYMD()} onChange={(e) => setFollowup(e.target.value)} className={`${fieldCls} mt-1.5`} />
                        </label>
                    ) : null}

                    {error ? <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p> : null}
                    {done ? <p role="status" className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">✓ {done}</p> : null}
                </div>

                <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
                    <button type="button" onClick={onClose} disabled={saving}
                            className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl">
                        Cancel
                    </button>
                    <button type="submit" disabled={saving || !!done}
                            className="px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-60 inline-flex items-center gap-2">
                        <MwaIcon size={14} /> {saving ? 'Saving…' : isMark ? 'Mark connected' : 'Save WhatsApp log'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default MentorWhatsAppLogModal;
