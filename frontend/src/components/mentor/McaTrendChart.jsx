import React from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { MCA_SERIES, fmtDate, fmtDuration } from './mcaFormat';

// One count axis only: calls (bars), connected calls and WhatsApp connected (lines).
// Talk time is in the tooltip, not on a second axis.
const TrendTooltip = ({ active, payload, label, showPhone, showWhatsApp }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-xs">
            <div className="font-semibold text-slate-800 mb-1">{fmtDate(label)}</div>
            {showPhone ? (
                <>
                    <div className="flex items-center gap-2 text-slate-700">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: MCA_SERIES.calls }} />Calls: <b>{row.calls}</b>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700">
                        <span className="w-2.5 h-0.5" style={{ background: MCA_SERIES.connected }} />Connected: <b>{row.connected}</b>
                    </div>
                </>
            ) : null}
            {showWhatsApp ? (
                <div className="flex items-center gap-2 text-slate-700">
                    <span className="w-2.5 h-0.5" style={{ background: MCA_SERIES.waConnected }} />WhatsApp connected: <b>{row.wa_connected}</b>
                </div>
            ) : null}
            {showPhone ? <div className="text-slate-500 mt-1">Call talk time: {fmtDuration(row.talk_time_sec)}</div> : null}
        </div>
    );
};

const McaTrendChart = ({ data, showPhone = true, showWhatsApp = false }) => (
    <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11, fill: '#57534e' }}
                       tickLine={false} axisLine={{ stroke: '#d6d3d1' }} minTickGap={16} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#57534e' }} tickLine={false} axisLine={false} />
                <Tooltip content={<TrendTooltip showPhone={showPhone} showWhatsApp={showWhatsApp} />} cursor={{ fill: 'rgba(42,120,214,0.06)' }} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12, color: '#44403c' }} />
                {showPhone ? (
                    <Bar dataKey="calls" name="Calls" fill={MCA_SERIES.calls} radius={[4, 4, 0, 0]} maxBarSize={22} />
                ) : null}
                {showPhone ? (
                    <Line dataKey="connected" name="Connected" type="monotone" stroke={MCA_SERIES.connected}
                          strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
                ) : null}
                {showWhatsApp ? (
                    <Line dataKey="wa_connected" name="WhatsApp connected" type="monotone" stroke={MCA_SERIES.waConnected}
                          strokeWidth={2} strokeDasharray="5 3" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
                ) : null}
            </ComposedChart>
        </ResponsiveContainer>
    </div>
);

export default McaTrendChart;
