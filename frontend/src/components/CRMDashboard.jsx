import React, { useState, useEffect } from 'react';
import { Users, TrendingUp, DollarSign, Activity, UserMinus, UserCheck, PhoneCall, Clock } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../api/axios';

const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#ec4899'];

const CRMDashboard = ({ onStatClick, onBdeClick }) => {
    const [stats, setStats] = useState({
        total_leads: 0,
        unassigned_leads: 0,
        assigned_leads: 0,
        contacted_leads: 0,
        pending_leads: 0,
        pipeline_stages: [],
        leaderboard: [],
        revenue: 0
    });
    const [followups, setFollowups] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const [statsRes, tasksRes] = await Promise.all([
                    api.get('/crm/dashboard-stats/'),
                    api.get('/crm/tasks/?status=PENDING')
                ]);
                setStats(statsRes.data);
                setFollowups(tasksRes.data.results || tasksRes.data);
            } catch (error) {
                console.error("Failed to fetch dashboard data", error);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    if (loading) {
        return (
            <div className="p-8 flex justify-center items-center h-[500px]">
                <div className="flex flex-col items-center">
                    <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    <p className="mt-4 text-sm font-medium text-slate-500">Loading your dynamic dashboard...</p>
                </div>
            </div>
        );
    }

    const StatCard = ({ title, value, icon, bg, text, onClick }) => (
        <div 
            onClick={onClick}
            className={`bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 transition-all ${onClick ? 'cursor-pointer hover:shadow-md hover:border-indigo-300 active:scale-[0.98]' : ''}`}
        >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${bg} ${text}`}>
                {icon}
            </div>
            <div>
                <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">{title}</p>
                <h3 className="text-2xl font-black text-slate-800">{value}</h3>
            </div>
        </div>
    );

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                <Activity className="text-indigo-600" />
                Sales Analytics & Performance
            </h2>
            
            {/* Top Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatCard 
                    title="Total Leads" 
                    value={stats.total_leads} 
                    icon={<Users size={24} />} 
                    bg="bg-indigo-50" 
                    text="text-indigo-600"
                    onClick={() => onStatClick('all', '')}
                />
                <StatCard 
                    title="Unassigned Leads" 
                    value={stats.unassigned_leads} 
                    icon={<UserMinus size={24} />} 
                    bg="bg-rose-50" 
                    text="text-rose-600"
                    onClick={() => onStatClick('assignee', 'unassigned')}
                />
                <StatCard 
                    title="Contacted Leads" 
                    value={stats.contacted_leads} 
                    icon={<PhoneCall size={24} />} 
                    bg="bg-emerald-50" 
                    text="text-emerald-600"
                />
                <StatCard 
                    title="Revenue Generated" 
                    value={`₹${stats.revenue.toLocaleString()}`} 
                    icon={<DollarSign size={24} />} 
                    bg="bg-amber-50" 
                    text="text-amber-600"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                
                {/* Pipeline Stages Breakdown */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800 mb-4 flex justify-between items-center">
                        Pipeline Stages Overview
                        <span className="text-[10px] font-normal text-slate-400 bg-slate-100 px-2 py-1 rounded">Click slice to filter</span>
                    </h3>
                    {stats.pipeline_stages.length > 0 ? (
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={stats.pipeline_stages}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={100}
                                        paddingAngle={5}
                                        dataKey="count"
                                        onClick={(data) => onStatClick('stage', data.id)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        {stats.pipeline_stages.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip 
                                        formatter={(value, name, props) => [value, props.payload.name]}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Legend 
                                        layout="vertical" 
                                        verticalAlign="middle" 
                                        align="right"
                                        onClick={(data) => onStatClick('stage', data.payload.id)}
                                        wrapperStyle={{ cursor: 'pointer', fontSize: '12px' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm">No pipeline data available</div>
                    )}
                </div>

                {/* BDE Leaderboard */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800 mb-4 flex justify-between items-center">
                        Sales Rep Leaderboard
                        <span className="text-[10px] font-normal text-slate-400 bg-slate-100 px-2 py-1 rounded">Click bar to filter</span>
                    </h3>
                    {stats.leaderboard.length > 0 ? (
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={stats.leaderboard}
                                    margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                                    onClick={(data) => {
                                        if (data && data.activePayload) {
                                            if (onBdeClick) onBdeClick(data.activePayload[0].payload.id);
                                            else onStatClick('assignee', data.activePayload[0].payload.id);
                                        }
                                    }}
                                >
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} angle={-45} textAnchor="end" />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                                    <RechartsTooltip 
                                        cursor={{ fill: '#f8fafc' }}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                                    <Bar 
                                        dataKey="assigned" 
                                        name="Assigned Leads" 
                                        fill="#4f46e5" 
                                        radius={[4, 4, 0, 0]} 
                                        style={{ cursor: 'pointer' }} 
                                        onClick={(data) => {
                                            if (data && data.id) {
                                                if (onBdeClick) onBdeClick(data.id);
                                                else onStatClick('assignee', data.id);
                                            }
                                        }}
                                    />
                                    <Bar 
                                        dataKey="contacted" 
                                        name="Contacted Leads" 
                                        fill="#10b981" 
                                        radius={[4, 4, 0, 0]} 
                                        style={{ cursor: 'pointer' }} 
                                        onClick={(data) => {
                                            if (data && data.id) {
                                                if (onBdeClick) onBdeClick(data.id);
                                                else onStatClick('assignee', data.id);
                                            }
                                        }}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm">No assigned leads data</div>
                    )}
                </div>
            </div>
            
            {/* Follow-ups Widget */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-6">
                <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Clock className="text-rose-500" size={18} />
                    My Upcoming Follow-ups
                </h3>
                {followups && followups.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr>
                                    <th className="border-b border-slate-200 py-2 text-xs font-bold text-slate-500 uppercase">Title</th>
                                    <th className="border-b border-slate-200 py-2 text-xs font-bold text-slate-500 uppercase">Due Date</th>
                                    <th className="border-b border-slate-200 py-2 text-xs font-bold text-slate-500 uppercase">Notes</th>
                                    <th className="border-b border-slate-200 py-2 text-xs font-bold text-slate-500 uppercase text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {followups.map(task => (
                                    <tr key={task.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="border-b border-slate-100 py-3 text-sm font-semibold text-slate-800">{task.title}</td>
                                        <td className="border-b border-slate-100 py-3 text-xs text-slate-600">
                                            {new Date(task.due_date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                        </td>
                                        <td className="border-b border-slate-100 py-3 text-xs text-slate-500 truncate max-w-[200px]">{task.notes}</td>
                                        <td className="border-b border-slate-100 py-3 text-right">
                                            {task.student && (
                                                <button 
                                                    onClick={() => onStatClick('single', task.student)}
                                                    className="text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded transition-colors"
                                                >
                                                    View Lead
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="p-4 bg-slate-50 rounded-xl text-center text-slate-500 text-sm italic">
                        No pending follow-ups scheduled!
                    </div>
                )}
            </div>
            
        </div>
    );
};

export default CRMDashboard;
