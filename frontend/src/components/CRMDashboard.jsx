import React, { useState, useEffect } from 'react';
import { Users, TrendingUp, DollarSign, Activity, UserMinus, UserCheck, PhoneCall, Clock, ChevronLeft, ChevronRight, Sparkles, UserX } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#ec4899'];

const CRMDashboard = ({ onStatClick, onBdeClick, sectionFilter: propSectionFilter, setSectionFilter: propSetSectionFilter }) => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

    const canFilterSection = isAdmin || (['SALES_HEAD', 'SALES_MANAGER', 'MANAGER', 'SALES_LEAD'].includes(user?.role) && (user?.sales_section === 'BOTH' || !user?.sales_section));
    const [internalSectionFilter, setInternalSectionFilter] = useState('');
    const sectionFilter = propSectionFilter !== undefined ? propSectionFilter : internalSectionFilter;
    const setSectionFilter = propSetSectionFilter || setInternalSectionFilter;

    const [datePreset, setDatePreset] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const [stats, setStats] = useState({
        total_leads: 0,
        unassigned_leads: 0,
        assigned_leads: 0,
        fresh_leads: 0,
        contacted_leads: 0,
        converted_leads: 0,
        dropped_leads: 0,
        pipeline_stages: [],
        leaderboard: [],
        revenue: 0
    });
    const [followups, setFollowups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [followupsLoading, setFollowupsLoading] = useState(false);
    const [followupsPage, setFollowupsPage] = useState(1);
    const [totalFollowupsPages, setTotalFollowupsPages] = useState(1);
    const [totalFollowupsCount, setTotalFollowupsCount] = useState(0);

    const fetchStats = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (canFilterSection && sectionFilter) params.append('sales_section', sectionFilter);
            if (datePreset) params.append('date_preset', datePreset);
            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);
            const res = await api.get(`/crm/dashboard-stats/?${params.toString()}`);
            setStats(res.data);
        } catch (error) {
            console.error("Failed to fetch dashboard stats", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchFollowups = async (page) => {
        setFollowupsLoading(true);
        try {
            const res = await api.get(`/crm/tasks/?status=PENDING&page=${page}&page_size=5`);
            setFollowups(res.data.results || res.data);
            if (res.data.count !== undefined) {
                setTotalFollowupsCount(res.data.count);
                setTotalFollowupsPages(Math.ceil(res.data.count / 5));
            } else {
                setTotalFollowupsCount(res.data.length || 0);
                setTotalFollowupsPages(1);
            }
        } catch (error) {
            console.error("Failed to fetch dashboard tasks", error);
        } finally {
            setFollowupsLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, [sectionFilter, canFilterSection, datePreset, startDate, endDate]);

    useEffect(() => {
        fetchFollowups(followupsPage);
    }, [followupsPage]);

    if (loading && !stats.total_leads) {
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
            <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-6 gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Activity className="text-indigo-600" />
                    Sales Analytics & Performance
                </h2>
                
                <div className="flex flex-wrap items-center gap-3">
                    {canFilterSection && (
                        <div className="flex items-center gap-1.5">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Section:</label>
                            <select
                                value={sectionFilter}
                                onChange={(e) => setSectionFilter(e.target.value)}
                                className="text-sm border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700 bg-slate-50"
                            >
                                <option value="">All Sections</option>
                                <option value="REGULAR">Regular</option>
                                <option value="CAREER_ACADEMY">Career Academy</option>
                            </select>
                        </div>
                    )}

                    <div className="flex items-center gap-1.5">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Period:</label>
                        <select
                            value={datePreset}
                            onChange={(e) => {
                                const val = e.target.value;
                                setDatePreset(val);
                                if (val !== 'custom') {
                                    setStartDate('');
                                    setEndDate('');
                                }
                            }}
                            className="text-sm border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700 bg-slate-50"
                        >
                            <option value="">All Time</option>
                            <option value="today">Today</option>
                            <option value="yesterday">Yesterday</option>
                            <option value="this_week">This Week</option>
                            <option value="this_month">This Month</option>
                            <option value="last_7_days">Last 7 Days</option>
                            <option value="last_30_days">Last 30 Days</option>
                            <option value="last_month">Last Month</option>
                            <option value="custom">Custom Range</option>
                        </select>
                    </div>

                    {(datePreset === 'custom' || startDate || endDate) && (
                        <div className="flex items-center bg-slate-50 border border-slate-300 rounded-lg overflow-hidden text-sm">
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => {
                                    setStartDate(e.target.value);
                                    if (datePreset !== 'custom') setDatePreset('custom');
                                }}
                                className="px-2 py-1 bg-transparent border-r border-slate-300 text-slate-700 text-xs outline-none"
                            />
                            <span className="px-1.5 text-slate-400 text-xs">to</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => {
                                    setEndDate(e.target.value);
                                    if (datePreset !== 'custom') setDatePreset('custom');
                                }}
                                className="px-2 py-1 bg-transparent text-slate-700 text-xs outline-none"
                            />
                        </div>
                    )}

                    {(sectionFilter || datePreset || startDate || endDate) && (
                        <button
                            onClick={() => {
                                setSectionFilter('');
                                setDatePreset('');
                                setStartDate('');
                                setEndDate('');
                            }}
                            className="px-2.5 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>
            
            {/* Top Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard
                    title="Total Leads"
                    value={stats.total_leads}
                    icon={<Users size={24} />}
                    bg="bg-indigo-50"
                    text="text-indigo-600"
                    onClick={() => onStatClick('all', '', 'Total Leads', { sales_section: sectionFilter, start_date: startDate, end_date: endDate })}
                />
                <StatCard
                    title="Fresh Leads"
                    value={stats.fresh_leads || 0}
                    icon={<Sparkles size={24} />}
                    bg="bg-teal-50"
                    text="text-teal-600"
                    onClick={() => onStatClick('fresh', 'true', 'Fresh / Uncontacted Leads', { sales_section: sectionFilter, start_date: startDate, end_date: endDate })}
                />
                <StatCard
                    title="Unassigned Leads"
                    value={stats.unassigned_leads}
                    icon={<UserMinus size={24} />}
                    bg="bg-rose-50"
                    text="text-rose-600"
                    onClick={() => onStatClick('assignee', 'unassigned', 'Unassigned Leads', { sales_section: sectionFilter, start_date: startDate, end_date: endDate })}
                />
                <StatCard
                    title="Assigned Leads"
                    value={stats.assigned_leads}
                    icon={<UserCheck size={24} />}
                    bg="bg-sky-50"
                    text="text-sky-600"
                    onClick={() => onStatClick('assignee', 'assigned', 'Assigned Leads', { sales_section: sectionFilter, start_date: startDate, end_date: endDate })}
                />
                <StatCard
                    title="Contacted Leads"
                    value={stats.contacted_leads}
                    icon={<PhoneCall size={24} />}
                    bg="bg-emerald-50"
                    text="text-emerald-600"
                    onClick={() => onStatClick('contacted', 'true', 'Contacted Leads', { sales_section: sectionFilter, start_date: startDate, end_date: endDate })}
                />
                <StatCard
                    title="Converted Leads"
                    value={stats.converted_leads}
                    icon={<UserCheck size={24} />}
                    bg="bg-blue-50"
                    text="text-blue-600"
                    onClick={() => onStatClick('status', 'converted', 'Converted Leads', { sales_section: sectionFilter, start_date: startDate, end_date: endDate })}
                />
                <StatCard
                    title="Dropped Leads"
                    value={stats.dropped_leads || 0}
                    icon={<UserX size={24} />}
                    bg="bg-slate-100"
                    text="text-slate-600"
                    onClick={() => onStatClick('status', 'dropped', 'Dropped Leads', { sales_section: sectionFilter, start_date: startDate, end_date: endDate })}
                />
                <StatCard
                    title="Revenue"
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
                                        onClick={(data) => onStatClick('stage', data.id, data.id, { sales_section: sectionFilter, start_date: startDate, end_date: endDate })}
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
                                        onClick={(data) => onStatClick('stage', data.payload.id, data.payload.id)}
                                        wrapperStyle={{ cursor: 'pointer', fontSize: '12px',overflowY: 'auto', maxHeight: '300px', }}
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
                                            else onStatClick('assignee', data.activePayload[0].payload.id, data.activePayload[0].payload.name);
                                        }
                                    }}
                                >
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} angle={-45} textAnchor="end" />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                                    <RechartsTooltip 
                                        cursor={{ fill: '#f8fafc' }}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '20px', bottom:'0' }} />
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
                {followupsLoading ? (
                    <div className="py-8 flex justify-center items-center">
                        <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    </div>
                ) : followups && followups.length > 0 ? (
                    <>
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
                                                        onClick={() => onStatClick('single', task.student, 'Lead Details')}
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
                        
                        {/* Pagination Controls */}
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                            <span className="text-xs font-semibold text-slate-500">
                                Showing page <strong className="text-slate-800">{followupsPage}</strong> of <strong className="text-slate-800">{totalFollowupsPages}</strong> ({totalFollowupsCount} total follow-ups)
                            </span>
                            {totalFollowupsPages > 1 && (
                                <div className="flex items-center gap-1.5">
                                    <button
                                        disabled={followupsPage === 1}
                                        onClick={() => setFollowupsPage(prev => Math.max(prev - 1, 1))}
                                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:hover:bg-transparent transition-all"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>
                                    <button
                                        disabled={followupsPage === totalFollowupsPages}
                                        onClick={() => setFollowupsPage(prev => Math.min(prev + 1, totalFollowupsPages))}
                                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:hover:bg-transparent transition-all"
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
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
