import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { MCA_SERIES, hourLabel } from './mcaFormat';

const HourTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const r = payload[0].payload;
    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-xs text-slate-700">
            <div className="font-semibold text-slate-800 mb-0.5">{hourLabel(r.hour)} – {hourLabel((r.hour + 1) % 24)} IST</div>
            Calls: <b>{r.calls}</b> · Connected: <b>{r.connected}</b>
        </div>
    );
};

const McaHourlyChart = ({ data, coverage }) => (
    <div>
        <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap={2}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                    <XAxis dataKey="hour" tickFormatter={hourLabel} interval={2} tick={{ fontSize: 11, fill: '#57534e' }}
                           tickLine={false} axisLine={{ stroke: '#d6d3d1' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#57534e' }} tickLine={false} axisLine={false} />
                    <Tooltip content={<HourTooltip />} cursor={{ fill: 'rgba(42,120,214,0.06)' }} />
                    <Bar dataKey="calls" name="Calls" fill={MCA_SERIES.calls} radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
            India time (IST), from the call start time. Based on {coverage?.with_start_time ?? 0} of {coverage?.total ?? 0} calls
            {coverage && coverage.total > coverage.with_start_time ? ' (the rest have no recorded start time)' : ''}.
        </p>
    </div>
);

export default McaHourlyChart;
