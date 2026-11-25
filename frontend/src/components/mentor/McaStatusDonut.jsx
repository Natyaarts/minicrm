import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { MCA_STATUS_COLORS, statusKey, statusLabel, fmtNum } from './mcaFormat';

const McaStatusDonut = ({ breakdown, kpis }) => {
    const data = (breakdown || []).map((r) => ({
        key: statusKey(r.call_status),
        name: statusLabel(r.call_status),
        value: r.count,
    }));
    const total = data.reduce((s, d) => s + d.value, 0);
    const colorFor = (key) => MCA_STATUS_COLORS[key] || '#78716c';

    return (
        <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="h-48 w-48 shrink-0 relative">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="95%"
                             paddingAngle={data.length > 1 ? 2 : 0} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                            {data.map((d) => <Cell key={d.key} fill={colorFor(d.key)} />)}
                        </Pie>
                        <Tooltip formatter={(v, n) => [`${v} (${total ? Math.round((100 * v) / total) : 0}%)`, n]} />
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-bold text-slate-900 tabular-nums">{fmtNum(total)}</span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wide">calls</span>
                </div>
            </div>
            {/* Legend doubles as the table view: label + count + share, so identity never relies on colour alone */}
            <ul className="flex-1 w-full space-y-1.5 text-sm">
                {data.map((d) => (
                    <li key={d.key} className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-slate-700">
                            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: colorFor(d.key) }} />
                            {d.name}
                        </span>
                        <span className="tabular-nums text-slate-900 font-medium">
                            {d.value} <span className="text-slate-500 font-normal">({total ? Math.round((100 * d.value) / total) : 0}%)</span>
                        </span>
                    </li>
                ))}
                {['rejected', 'busy', 'failed'].map((k) => (
                    kpis?.[k] === null ? (
                        <li key={k} className="flex items-center justify-between gap-3 text-slate-400">
                            <span className="pl-5 capitalize">{k}</span>
                            <span title="The mobile app does not record this outcome yet">n/a</span>
                        </li>
                    ) : null
                ))}
            </ul>
        </div>
    );
};

export default McaStatusDonut;
