import React, { useState, useEffect } from 'react';
import {
    Users, GraduationCap, UserCheck, DollarSign,
    ArrowUpRight, ArrowDownRight, PieChart as PieIcon,
    BarChart2, FileText, Download, Filter, Search,
    Briefcase, AlertCircle, ChevronRight, TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api/axios';

const AnalyticsModule = () => {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [dueStudents, setDueStudents] = useState([]);
    const [showDueModal, setShowDueModal] = useState(false);
    
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    
    const [batchPage, setBatchPage] = useState(1);
    const batchesPerPage = 5;

    useEffect(() => {
        fetchAnalytics();
    }, [selectedMonth, selectedYear]);

    const fetchAnalytics = async () => {
        setLoading(true);
        try {
            const res = await api.get(`analytics-details/?month=${selectedMonth}&year=${selectedYear}`);
            setData(res.data);
        } catch (err) {
            console.error("Failed to fetch analytics", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchDueStudents = async () => {
        try {
            const res = await api.get('students/due_students/');
            setDueStudents(res.data.results || res.data);
            setShowDueModal(true);
        } catch (err) {
            console.error(err);
        }
    };

    const handleExport = async (type) => {
        try {
            const endpoint = type === 'students' ? 'students/export_csv/' : 'campaigns/export_csv/';
            const res = await api.get(endpoint, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${type}_report.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            alert("Export failed");
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    const StatCard = ({ title, value, icon: Icon, color, trend, trendValue }) => (
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all group">
            <div className="flex justify-between items-start mb-4">
                <div className={`p-4 rounded-2xl bg-gradient-to-br ${color} text-white shadow-lg shadow-indigo-100`}>
                    <Icon size={24} />
                </div>
                {trend && (
                    <div className={`flex items-center gap-1 text-xs font-bold ${trend === 'up' ? 'text-emerald-500' : 'text-rose-500'} bg-slate-50 px-2 py-1 rounded-lg`}>
                        {trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        {trendValue}
                    </div>
                )}
            </div>
            <div>
                <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">{title}</p>
                <h3 className="text-3xl font-black text-slate-900">{value}</h3>
            </div>
        </div>
    );

    return (
        <div className="space-y-8 pb-20 animate-fadeIn">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight">Intelligence <span className="text-indigo-600">Hub</span></h1>
                    <p className="text-slate-500 mt-2 font-medium italic">Comprehensive data visualization and reporting center.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => handleExport('students')}
                        className="px-6 py-3 bg-white border border-slate-200 rounded-2xl text-slate-600 text-sm font-bold shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2"
                    >
                        <Download size={18} /> Export Students
                    </button>
                    <button className="px-6 py-3 bg-indigo-600 text-white rounded-2xl text-sm font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-2">
                        <FileText size={18} /> Schedule Report
                    </button>
                </div>
            </div>

            {/* Main Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Students"
                    value={data.students_count}
                    icon={Users}
                    color="from-blue-600 to-indigo-600"
                    trend="up"
                    trendValue="+12%"
                />
                <StatCard
                    title="Active Mentors"
                    value={data.teachers_count}
                    icon={UserCheck}
                    color="from-violet-600 to-purple-600"
                />
                <StatCard
                    title="Live Batches"
                    value={data.batches_count}
                    icon={GraduationCap}
                    color="from-indigo-500 to-blue-500"
                />
                <StatCard
                    title="Net Revenue"
                    value={`₹${data.revenue_metrics.collected.toLocaleString()}`}
                    icon={DollarSign}
                    color="from-emerald-500 to-teal-500"
                    trend="up"
                    trendValue="+8.4%"
                />
            </div>

            {/* Tabs */}
            <div className="flex gap-4 border-b border-slate-200 pb-px mb-6">
                {['overview', 'teachers'].map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-3 text-sm font-bold uppercase tracking-wider transition-all border-b-2 -mb-[2px] ${
                            activeTab === tab 
                            ? 'text-indigo-600 border-indigo-600' 
                            : 'text-slate-400 border-transparent hover:text-slate-600'
                        }`}
                    >
                        {tab.replace('_', ' ')}
                    </button>
                ))}
            </div>

            {activeTab === 'overview' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Revenue Breakdown */}
                    <div className="lg:col-span-1 bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
                        <div className="relative z-10">
                            <h3 className="text-xl font-bold mb-8 flex items-center gap-2">
                                <PieIcon size={20} className="text-indigo-400" /> Revenue Distribution
                            </h3>

                            <div className="space-y-8">
                                <div>
                                    <div className="flex justify-between text-xs font-black uppercase tracking-widest text-slate-400 mb-2">
                                        <span>Collected</span>
                                        <span className="text-emerald-400">₹{data.revenue_metrics.collected.toLocaleString()}</span>
                                    </div>
                                    <div className="w-full bg-white/10 h-3 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${(data.revenue_metrics.collected / data.revenue_metrics.potential) * 100}%` }}
                                            className="bg-emerald-500 h-full rounded-full"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between text-xs font-black uppercase tracking-widest text-slate-400 mb-2">
                                        <span>Outstanding Dues</span>
                                        <span className="text-rose-400">₹{data.revenue_metrics.due.toLocaleString()}</span>
                                    </div>
                                    <div className="w-full bg-white/10 h-3 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${(data.revenue_metrics.due / data.revenue_metrics.potential) * 100}%` }}
                                            className="bg-rose-500 h-full rounded-full shadow-lg shadow-rose-500/50"
                                        />
                                    </div>
                                </div>

                                <div className="pt-8 border-t border-white/10">
                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Total Potential Revenue</p>
                                    <p className="text-4xl font-black text-white">₹{data.revenue_metrics.potential.toLocaleString()}</p>
                                </div>

                                <button
                                    onClick={fetchDueStudents}
                                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold transition-all mt-4 flex items-center justify-center gap-2"
                                >
                                    <AlertCircle size={18} /> View Delinquent Students
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Batch Utilization */}
                    <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm">
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800">Batch Utilization</h3>
                                <p className="text-sm text-slate-400 font-medium">Student capacity and engagement by batch</p>
                            </div>
                            <div className="p-2 bg-slate-50 rounded-xl">
                                <TrendingUp size={20} className="text-indigo-600" />
                            </div>
                        </div>

                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-left">
                                <thead className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] border-b border-slate-100">
                                    <tr>
                                        <th className="pb-4">Batch Name</th>
                                        <th className="pb-4">Course</th>
                                        <th className="pb-4 text-center">Students</th>
                                        <th className="pb-4 text-center">Efficiency</th>
                                        <th className="pb-4"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {data.batch_details.slice((batchPage - 1) * batchesPerPage, batchPage * batchesPerPage).map((batch, i) => (
                                        <tr key={i} className="group hover:bg-slate-50/50 transition-colors">
                                            <td className="py-5 font-bold text-slate-800">{batch.name}</td>
                                            <td className="py-5 text-sm text-slate-500">{batch.course__name || 'N/A'}</td>
                                            <td className="py-5 text-center">
                                                <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg font-bold text-xs">
                                                    {batch.student_count}
                                                </span>
                                            </td>
                                            <td className="py-5">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden min-w-[60px]">
                                                        <div className="bg-indigo-600 h-full rounded-full" style={{ width: '75%' }} />
                                                    </div>
                                                    <span className="text-[10px] font-bold text-slate-400">75%</span>
                                                </div>
                                            </td>
                                            <td className="py-5 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"><ChevronRight size={18} /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        
                        {/* Pagination Controls */}
                        {data.batch_details.length > batchesPerPage && (
                            <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-100">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                    Showing {(batchPage - 1) * batchesPerPage + 1} - {Math.min(batchPage * batchesPerPage, data.batch_details.length)} of {data.batch_details.length}
                                </span>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => setBatchPage(p => Math.max(1, p - 1))}
                                        disabled={batchPage === 1}
                                        className="px-3 py-1.5 text-sm font-bold text-slate-600 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50 disabled:hover:bg-slate-50 disabled:hover:text-slate-600 rounded-lg transition-colors"
                                    >
                                        Prev
                                    </button>
                                    <button 
                                        onClick={() => setBatchPage(p => Math.min(Math.ceil(data.batch_details.length / batchesPerPage), p + 1))}
                                        disabled={batchPage === Math.ceil(data.batch_details.length / batchesPerPage)}
                                        className="px-3 py-1.5 text-sm font-bold text-slate-600 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50 disabled:hover:bg-slate-50 disabled:hover:text-slate-600 rounded-lg transition-colors"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'teachers' && (
                <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                        <div>
                            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Briefcase size={20} className="text-indigo-600"/> Faculty Performance & Attendance</h3>
                            <p className="text-sm text-slate-400 font-medium">Aggregated data from Zoom class sessions and assigned batches.</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <select 
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                                className="px-4 py-2 bg-slate-50 border-none rounded-xl text-slate-600 font-bold focus:ring-2 focus:ring-indigo-100 outline-none"
                            >
                                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                    <option key={m} value={m}>
                                        {new Date(2000, m - 1).toLocaleString('default', { month: 'long' })}
                                    </option>
                                ))}
                            </select>
                            <select 
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(Number(e.target.value))}
                                className="px-4 py-2 bg-slate-50 border-none rounded-xl text-slate-600 font-bold focus:ring-2 focus:ring-indigo-100 outline-none"
                            >
                                {[2024, 2025, 2026, 2027].map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left">
                            <thead className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] border-b border-slate-100">
                                <tr>
                                    <th className="pb-4 pl-4">Teacher Name</th>
                                    <th className="pb-4 text-center">Assigned Courses</th>
                                    <th className="pb-4 text-center">Total Time Taught</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {data.teacher_performance?.map((t, i) => (
                                    <tr key={i} className="group hover:bg-slate-50/50 transition-colors">
                                        <td className="py-5 pl-4 font-bold text-slate-800 flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs">
                                                {t.name.charAt(0)}
                                            </div>
                                            {t.name}
                                        </td>
                                        <td className="py-5 text-center">
                                            <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg font-bold text-xs">
                                                {t.courses}
                                            </span>
                                        </td>
                                        <td className="py-5 text-center">
                                            <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg font-black text-xs">
                                                {t.formatted_time} <span className="text-[9px] font-bold text-emerald-500/80 ml-1">({t.sessions} classes)</span>
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {(!data.teacher_performance || data.teacher_performance.length === 0) && (
                                    <tr>
                                        <td colSpan="3" className="py-10 text-center text-slate-400 font-medium">
                                            No active teachers found or attendance synced.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}


            {/* Delinquent Students Modal */}
            <AnimatePresence>
                {showDueModal && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white rounded-[2.5rem] p-8 w-full max-w-2xl border border-slate-200 shadow-2xl relative"
                        >
                            <button onClick={() => setShowDueModal(false)} className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600"><Search size={20} className="rotate-45" /></button>
                            <h2 className="text-2xl font-black mb-6 text-slate-900 flex items-center gap-2">
                                <AlertCircle className="text-rose-500" /> Outstanding <span className="text-rose-600">Dues</span>
                            </h2>
                            <div className="max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
                                <table className="w-full text-left">
                                    <thead className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-100">
                                        <tr>
                                            <th className="pb-4">Student</th>
                                            <th className="pb-4">Program</th>
                                            <th className="pb-4 text-right">Paid</th>
                                            <th className="pb-4 text-right">Due</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {dueStudents.map((s, i) => (
                                            <tr key={i}>
                                                <td className="py-4 font-bold text-slate-800">{s.first_name} {s.last_name}</td>
                                                <td className="py-4 text-sm text-slate-500">{s.program_name}</td>
                                                <td className="py-4 text-right text-sm text-slate-500">₹{s.total_paid}</td>
                                                <td className="py-4 text-right font-black text-rose-600">₹{s.total_due}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <button
                                onClick={() => handleExport('students')}
                                className="w-full mt-8 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-black transition-all"
                            >
                                Export Delinquent List
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Search & Global Actions */}
            <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-1 group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={20} />
                    <input
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-slate-600 font-medium focus:ring-2 focus:ring-indigo-100 transition-all outline-none"
                        placeholder="Search for deep analytics on specific students, mentors or batches..."
                    />
                </div>
                <div className="flex gap-2">
                    <button className="px-4 py-3 bg-slate-50 text-slate-500 rounded-2xl font-bold flex items-center gap-2 hover:bg-slate-100 transition-all">
                        <Filter size={18} /> Advanced Filter
                    </button>
                    <button className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold hover:bg-black transition-all">
                        Generate PDF Report
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AnalyticsModule;
