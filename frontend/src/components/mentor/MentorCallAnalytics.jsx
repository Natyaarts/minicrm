import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    PhoneCall, PhoneOutgoing, PhoneIncoming, Percent, Clock, Timer, Users, AlertCircle, Lock, RefreshCw,
    MessageCircle, UserCheck, Phone, Info, Hourglass,
} from 'lucide-react';
import McaConnectedModal from './McaConnectedModal';
import McaPendingModal from './McaPendingModal';
import MwaIcon from './MwaIcon';
import {
    getMentorCallAnalytics, getProgramsForFilter, getCoursesForFilter, getBatchesForFilter,
} from '../../api/mentorCallAnalytics';
import McaKpiCard from './McaKpiCard';
import McaTrendChart from './McaTrendChart';
import McaStatusDonut from './McaStatusDonut';
import McaHourlyChart from './McaHourlyChart';
import McaLeaderboard from './McaLeaderboard';
import McaCallTable from './McaCallTable';
import { fmtDuration, fmtNum, fmtPct, presetRange, istToday } from './mcaFormat';

const PRESETS = [
    { id: 'today', label: 'Today' },
    { id: '7d', label: '7d' },
    { id: '30d', label: '30d' },
    { id: 'month', label: 'This month' },
    { id: 'custom', label: 'Custom' },
];

const CHANNELS = [
    { id: 'all', label: 'All' },
    { id: 'phone', label: 'Phone' },
    { id: 'whatsapp', label: 'WhatsApp' },
];

const STATUS_OPTIONS = [
    { value: '', label: 'All call outcomes' },
    { value: 'CONNECTED', label: 'Connected' },
    { value: 'MISSED', label: 'Missed / unanswered' },
    { value: 'UNKNOWN', label: 'Unknown outcome' },
];

const selectCls = 'px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 min-w-0';

const Panel = ({ title, subtitle, children, className = '' }) => (
    <section className={`bg-white border border-slate-200 rounded-xl shadow-sm p-4 sm:p-5 ${className}`}>
        <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
            {subtitle ? <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p> : null}
        </div>
        {children}
    </section>
);

// Load a filter dropdown source; a 403/failure just hides that dropdown.
const useOptionalList = (loader) => {
    const [list, setList] = useState(null);
    useEffect(() => {
        let cancelled = false;
        loader().then((l) => { if (!cancelled) setList(l); }).catch(() => { if (!cancelled) setList(null); });
        return () => { cancelled = true; };
    }, [loader]);
    return list;
};

const MentorCallAnalytics = () => {
    const [preset, setPreset] = useState('30d');
    const [range, setRange] = useState(presetRange('30d'));
    const [mentorId, setMentorId] = useState('');
    const [programId, setProgramId] = useState('');
    const [courseId, setCourseId] = useState('');
    const [batchId, setBatchId] = useState('');
    const [callStatus, setCallStatus] = useState('');
    const [channel, setChannel] = useState('all');
    // Last finished request: { key, data, error }. Loading = the current request key hasn't finished yet.
    const [result, setResult] = useState({ key: null, data: null, error: null });
    const [reloadTick, setReloadTick] = useState(0);
    // Drill-down modal: null | { type: 'connected', tab: 'phone' | 'whatsapp', direction?: 'outgoing' | 'incoming' } | { type: 'pending' }
    const [modal, setModal] = useState(null);
    const closeModal = useCallback(() => setModal(null), []);

    const programs = useOptionalList(getProgramsForFilter);
    const courses = useOptionalList(getCoursesForFilter);
    const batches = useOptionalList(getBatchesForFilter);

    const filters = useMemo(() => ({
        start_date: range.start_date,
        end_date: range.end_date,
        mentor_id: mentorId,
        program_id: programId,
        course_id: courseId,
        batch_id: batchId,
        // The call-outcome filter applies to phone calls only, so it isn't sent in WhatsApp-only view
        call_status: channel === 'whatsapp' ? '' : callStatus,
        channel,
    }), [range, mentorId, programId, courseId, batchId, callStatus, channel]);

    const rangeInvalid = Boolean(range.start_date && range.end_date && range.end_date < range.start_date);
    const requestKey = `${JSON.stringify(filters)}#${reloadTick}`;

    useEffect(() => {
        if (rangeInvalid) return undefined;
        let cancelled = false;
        getMentorCallAnalytics({ ...filters, include_manual: 'true' })
            .then((d) => { if (!cancelled) setResult({ key: requestKey, data: d, error: null }); })
            .catch((e) => {
                if (cancelled) return;
                const status = e.response?.status;
                const body = e.response?.data;
                const message = body?.detail
                    || (body && typeof body === 'object' ? Object.values(body).flat().join(' ') : '')
                    || 'Could not load call analytics.';
                setResult({ key: requestKey, data: null, error: { forbidden: status === 403, message } });
            });
        return () => { cancelled = true; };
    }, [filters, rangeInvalid, requestKey]);

    const loading = !rangeInvalid && result.key !== requestKey;
    const { data, error } = result;   // the previous result stays on screen (dimmed) while a new one loads

    const choosePreset = (id) => {
        setPreset(id);
        if (id !== 'custom') setRange(presetRange(id));
    };

    // Courses link to a sub-program, not a program, so the course list isn't narrowed by program.
    const filteredCourses = courses;

    const filteredBatches = useMemo(() => {
        if (!batches) return null;
        if (!courseId) return batches;
        return batches.filter((b) => String(b.course ?? b.course_id ?? '') === courseId);
    }, [batches, courseId]);

    const resetFilters = () => {
        choosePreset('30d');
        setMentorId(''); setProgramId(''); setCourseId(''); setBatchId(''); setCallStatus(''); setChannel('all');
    };

    if (error?.forbidden) {
        return (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center shadow-sm">
                <Lock className="mx-auto text-slate-400 mb-3" size={28} />
                <h3 className="font-semibold text-slate-800">You don't have access to Call Analytics</h3>
                <p className="text-sm text-slate-500 mt-1">
                    This page is available to admins, managers and mentor heads. {error.message && error.message !== 'You do not have permission to perform this action.' ? error.message : ''}
                </p>
            </div>
        );
    }

    const k = data?.kpis;
    const wa = k?.whatsapp || null;                       // null when the WhatsApp channel isn't included
    const hasPhone = k ? k.total_calls !== null : false;  // null when the phone channel isn't included
    const waActivity = wa ? wa.wa_messages + wa.wa_connected + wa.wa_no_reply + wa.wa_not_on_whatsapp + wa.wa_calls : 0;
    // Incoming calls (student called the mentor): separate keys, not part of total calls / connect rate
    const incomingCalls = hasPhone ? (k.incoming_calls ?? 0) : 0;
    const isEmpty = k ? (hasPhone ? k.total_calls : 0) + incomingCalls + waActivity === 0 : false;
    const isTeam = data?.scope?.type === 'team';
    const showMentorSelect = (data?.mentor_options?.length || 0) > 1;
    const pendingCard = k ? (
        <McaKpiCard icon={Hourglass} label="Pending students" tone="amber"
                    value={fmtNum(k.pending_count)}
                    hint="Not connected in this period (call or WhatsApp)"
                    onClick={() => setModal({ type: 'pending' })}
                    actionLabel={`Pending students: ${fmtNum(k.pending_count)}. Show the list`} />
    ) : null;

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-lg font-bold text-slate-900">Call Analytics</h2>
                <p className="text-sm text-slate-500">
                    Outgoing calls, incoming calls from students and WhatsApp contacts logged with feedback{isTeam ? ' · you and your team' : ' · all mentors'}. Dates use the feedback date (IST).
                </p>
            </div>

            {/* Filter bar */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-2">
                <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5" role="group" aria-label="Channel">
                    {CHANNELS.map((c) => (
                        <button key={c.id} type="button" onClick={() => setChannel(c.id)} aria-pressed={channel === c.id}
                                className={`px-3 py-1 text-xs sm:text-sm rounded-md font-medium transition-colors inline-flex items-center gap-1.5 ${channel === c.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                            {c.id === 'phone' ? <Phone size={12} aria-hidden="true" /> : null}
                            {c.id === 'whatsapp' ? <MwaIcon size={12} /> : null}
                            {c.label}
                        </button>
                    ))}
                </div>
                <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5 flex-wrap">
                    {PRESETS.map((p) => (
                        <button key={p.id} type="button" onClick={() => choosePreset(p.id)}
                                className={`px-3 py-1 text-xs sm:text-sm rounded-md font-medium transition-colors ${preset === p.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                            {p.label}
                        </button>
                    ))}
                </div>
                {preset === 'custom' ? (
                    <div className="flex items-center gap-1">
                        <input type="date" value={range.start_date} max={istToday()} aria-label="Start date"
                               onChange={(e) => setRange((r) => ({ ...r, start_date: e.target.value }))} className={selectCls} />
                        <span className="text-slate-400 text-sm">to</span>
                        <input type="date" value={range.end_date} max={istToday()} aria-label="End date"
                               onChange={(e) => setRange((r) => ({ ...r, end_date: e.target.value }))} className={selectCls} />
                    </div>
                ) : null}
                {showMentorSelect ? (
                    <select value={mentorId} onChange={(e) => setMentorId(e.target.value)} className={selectCls} aria-label="Mentor">
                        <option value="">{isTeam ? 'My team' : 'All mentors'}</option>
                        {data.mentor_options.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                ) : null}
                {programs ? (
                    <select value={programId} onChange={(e) => { setProgramId(e.target.value); setCourseId(''); setBatchId(''); }} className={selectCls} aria-label="Program">
                        <option value="">All programs</option>
                        {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                ) : null}
                {filteredCourses ? (
                    <select value={courseId} onChange={(e) => { setCourseId(e.target.value); setBatchId(''); }} className={selectCls} aria-label="Course">
                        <option value="">All courses</option>
                        {filteredCourses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                ) : null}
                {filteredBatches ? (
                    <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className={selectCls} aria-label="Batch">
                        <option value="">All batches</option>
                        {filteredBatches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                ) : null}
                {channel !== 'whatsapp' ? (
                    <select value={callStatus} onChange={(e) => setCallStatus(e.target.value)} className={selectCls} aria-label="Call outcome"
                            title="Filters phone calls only; WhatsApp entries are not affected">
                        {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                ) : null}
                <div className="ml-auto flex items-center gap-2">
                    <button type="button" onClick={resetFilters} className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1">Reset</button>
                    <button type="button" onClick={() => setReloadTick((t) => t + 1)} aria-label="Refresh"
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {rangeInvalid ? (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">The end date is before the start date.</p>
            ) : null}

            {error && !error.forbidden ? (
                <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{error.message}</span>
                    <button type="button" onClick={() => setReloadTick((t) => t + 1)} className="ml-auto underline">Retry</button>
                </div>
            ) : null}

            {loading && !data ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />)}
                </div>
            ) : null}

            {data ? (
                <div className={`space-y-5 transition-opacity ${loading ? 'opacity-60' : ''}`}>
                    {/* Combined: one distinct student count across both channels (a student reached twice counts once) */}
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 flex items-center gap-3">
                        <UserCheck size={20} className="text-indigo-600 shrink-0" aria-hidden="true" />
                        <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                                Total students connected {channel === 'all' ? '(call + WhatsApp)' : channel === 'phone' ? '(call)' : '(WhatsApp)'}
                            </p>
                            <p className="text-2xl font-bold text-slate-900 tabular-nums">{fmtNum(k.students_connected_total)}</p>
                        </div>
                        {channel === 'all' && hasPhone && wa ? (
                            <p className="ml-auto text-xs text-indigo-700 text-right">
                                {fmtNum(k.phone_students_connected)} by call · {fmtNum(wa.wa_students_connected)} on WhatsApp
                                <br /><span className="text-indigo-500">each student counted once</span>
                            </p>
                        ) : null}
                    </div>

                    {/* Phone KPI cards. Longest call / Recordings were removed from the UI (API keys kept). */}
                    {hasPhone ? (
                        <>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                <McaKpiCard icon={PhoneOutgoing} label="Total calls" value={fmtNum(k.total_calls)} hint="Outgoing calls" />
                                <McaKpiCard icon={PhoneCall} label="Connected" value={fmtNum(k.connected)}
                                            hint={`${fmtNum(k.missed)} missed / unanswered · click for list`}
                                            onClick={() => setModal({ type: 'connected', tab: 'phone', direction: 'outgoing' })}
                                            actionLabel={`Connected calls: ${fmtNum(k.connected)}. Show the list`} />
                                <McaKpiCard icon={Percent} label="Connect rate" value={fmtPct(k.connect_rate)}
                                            hint={k.unknown_outcome > 0 ? `Excludes ${k.unknown_outcome} with unknown outcome` : 'Connected ÷ calls'} />
                                <McaKpiCard icon={Clock} label="Talk time" value={fmtDuration(k.talk_time_sec)} hint="Connected calls" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <McaKpiCard icon={Timer} label="Avg duration" value={fmtDuration(k.avg_duration_sec)} hint="Connected calls" />
                                <McaKpiCard icon={Users} label="Unique students" value={fmtNum(k.unique_students)}
                                            hint={k.phone_students_connected !== null ? `${fmtNum(k.phone_students_connected)} connected` : undefined} />
                                {pendingCard}
                            </div>
                            {incomingCalls > 0 ? (
                                <div role="button" tabIndex={0}
                                     aria-label={`Incoming calls: ${fmtNum(k.incoming_connected)} answered. Show the list`}
                                     onClick={() => setModal({ type: 'connected', tab: 'phone', direction: 'incoming' })}
                                     onKeyDown={(e) => {
                                         if (e.key === 'Enter' || e.key === ' ') {
                                             e.preventDefault();
                                             setModal({ type: 'connected', tab: 'phone', direction: 'incoming' });
                                         }
                                     }}
                                     className="bg-sky-50/60 border border-sky-100 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 cursor-pointer transition-all hover:border-sky-300 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-sky-800 flex items-center gap-1.5">
                                        <PhoneIncoming size={13} aria-hidden="true" /> Incoming calls
                                    </p>
                                    <p className="text-sm text-slate-700"><b className="tabular-nums">{fmtNum(k.incoming_calls)}</b> received</p>
                                    <p className="text-sm text-slate-700"><b className="tabular-nums">{fmtNum(k.incoming_connected)}</b> answered</p>
                                    <p className="text-sm text-slate-700"><b className="tabular-nums">{fmtNum(k.incoming_missed)}</b> missed</p>
                                    <p className="text-sm text-slate-700"><b className="tabular-nums">{fmtDuration(k.incoming_talk_time_sec)}</b> talk time</p>
                                    <p className="text-[11px] text-sky-900/70 w-full">
                                        Not included in total calls, connect rate or talk time above. An answered incoming call counts the student as connected. Click for the answered calls.
                                    </p>
                                </div>
                            ) : null}
                        </>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{pendingCard}</div>
                    )}

                    {/* WhatsApp KPI cards (green) */}
                    {wa ? (
                        <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3 space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 flex items-center gap-1.5">
                                <MwaIcon size={13} /> WhatsApp
                            </p>
                            {/* WhatsApp calls / WhatsApp talk time were removed from the UI (API keys kept). */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {/* <McaKpiCard icon={MessageCircle} label="Messages sent" value={fmtNum(wa.wa_messages)}
                                            hint={`${fmtNum(wa.wa_no_reply)} no reply · ${fmtNum(wa.wa_not_on_whatsapp)} not on WhatsApp`} /> */}
                                <McaKpiCard icon={MwaIcon} label="WhatsApp connected" value={fmtNum(wa.wa_connected)}
                                            hint={`${wa.wa_calls_connected ? `Includes ${fmtNum(wa.wa_calls_connected)} connected call${wa.wa_calls_connected === 1 ? '' : 's'}` : 'Chats and calls marked connected'} · click for list`}
                                            onClick={() => setModal({ type: 'connected', tab: 'whatsapp' })}
                                            actionLabel={`WhatsApp connected: ${fmtNum(wa.wa_connected)}. Show the list`} />
                                <McaKpiCard icon={UserCheck} label="Students connected" value={fmtNum(wa.wa_students_connected)}
                                            hint="Distinct students" />
                            </div>
                            <p className="text-[11px] text-emerald-900/80 flex items-center gap-1.5">
                                <Info size={12} aria-hidden="true" className="shrink-0" />
                                WhatsApp outcomes are marked by mentors and can't be checked automatically.
                            </p>
                        </div>
                    ) : null}

                    {(hasPhone && k.unknown_outcome > 0) || k.manual_entries > 0 ? (
                        <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 space-y-0.5">
                            {hasPhone && k.unknown_outcome > 0 ? (
                                <p><b>{k.unknown_outcome}</b> call{k.unknown_outcome === 1 ? ' was' : 's were'} saved as “Call Done” without a recorded outcome. They count as calls but are left out of the connect rate.</p>
                            ) : null}
                            {k.manual_entries > 0 ? (
                                <p><b>{k.manual_entries}</b> manually typed feedback entr{k.manual_entries === 1 ? 'y is' : 'ies are'} not counted as calls.</p>
                            ) : null}
                        </div>
                    ) : null}

                    {isEmpty ? (
                        <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center">
                            <PhoneOutgoing className="mx-auto text-slate-300 mb-2" size={28} />
                            <p className="text-slate-600 font-medium">
                                {channel === 'whatsapp' ? 'No WhatsApp contacts in this range' : channel === 'phone' ? 'No calls in this range' : 'No calls or WhatsApp contacts in this range'}
                            </p>
                            <p className="text-sm text-slate-500">Try a wider date range or clear the filters.</p>
                        </div>
                    ) : (
                        <>
                            <div className={`grid grid-cols-1 gap-5 ${hasPhone ? 'xl:grid-cols-3' : ''}`}>
                                <Panel title="Daily activity"
                                       subtitle={hasPhone && wa ? 'Calls, connected calls and WhatsApp connections per day'
                                           : hasPhone ? 'Calls and connected calls per day' : 'WhatsApp connections per day'}
                                       className={hasPhone ? 'xl:col-span-2' : ''}>
                                    <McaTrendChart data={data.trend} showPhone={hasPhone} showWhatsApp={!!wa} />
                                </Panel>
                                {hasPhone ? (
                                    <Panel title="Call outcomes">
                                        <McaStatusDonut breakdown={data.status_breakdown} kpis={k} />
                                    </Panel>
                                ) : null}
                            </div>

                            <div className={`grid grid-cols-1 gap-5 ${hasPhone ? 'xl:grid-cols-3' : ''}`}>
                                {hasPhone ? (
                                    <Panel title="Time of day" subtitle="When calls start">
                                        <McaHourlyChart data={data.hourly} coverage={data.hourly_coverage} />
                                    </Panel>
                                ) : null}
                                <Panel title="Mentor leaderboard" subtitle="Click a name to filter. Students are counted once per mentor."
                                       className={hasPhone ? 'xl:col-span-2' : ''}>
                                    <McaLeaderboard rows={data.leaderboard} showPhone={hasPhone} showWhatsApp={!!wa}
                                                    onSelectMentor={showMentorSelect ? setMentorId : null} />
                                </Panel>
                            </div>
                        </>
                    )}

                    <Panel title={channel === 'whatsapp' ? 'WhatsApp contacts' : channel === 'phone' ? 'Calls' : 'Calls and WhatsApp contacts'}
                           subtitle="Newest first. Export downloads every entry that matches the filters.">
                        <McaCallTable filters={filters} />
                    </Panel>

                    {modal?.type === 'connected' ? (
                        <McaConnectedModal filters={filters} initialTab={modal.tab} initialDirection={modal.direction || 'outgoing'}
                                           onClose={closeModal} />
                    ) : null}
                    {modal?.type === 'pending' ? <McaPendingModal filters={filters} onClose={closeModal} /> : null}
                </div>
            ) : null}
        </div>
    );
};

export default MentorCallAnalytics;
