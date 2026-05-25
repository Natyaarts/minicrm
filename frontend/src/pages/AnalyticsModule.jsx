import React, { useState, useEffect } from 'react';
import {
    Users, GraduationCap, UserCheck, DollarSign,
    PieChart as PieIcon, FileText, Download, AlertCircle, Briefcase
} from 'lucide-react';
import api from '../api/axios';

const AnalyticsModule = () => {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const [dueStudents, setDueStudents] = useState([]);
    const [showDueModal, setShowDueModal] = useState(false);
    
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    
    const [batchPage, setBatchPage] = useState(1);
    const batchesPerPage = 5;
    
    const [expandedTeacher, setExpandedTeacher] = useState(null);
    const [expandedBatch, setExpandedBatch] = useState(null);

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

    const exportTeachersCSV = () => {
        if (!data?.teacher_performance) return;
        
        let csvContent = "Teacher Name,Total Assigned Courses,Total Time Taught,Total Classes,Batch Name,Class Date,Class Duration\n";
        
        data.teacher_performance.forEach(t => {
            const name = `"${t.name.replace(/"/g, '""')}"`;
            if (t.classes && t.classes.length > 0) {
                t.classes.forEach(c => {
                    const batchName = `"${c.batch_name.replace(/"/g, '""')}"`;
                    if (c.dates && c.dates.length > 0) {
                        c.dates.forEach(d => {
                            csvContent += `${name},${t.courses},${t.formatted_time},${t.sessions},${batchName},${d.date},${d.duration}\n`;
                        });
                    } else {
                        csvContent += `${name},${t.courses},${t.formatted_time},${t.sessions},${batchName},N/A,N/A\n`;
                    }
                });
            } else {
                csvContent += `${name},${t.courses},${t.formatted_time},${t.sessions},N/A,N/A,N/A\n`;
            }
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `faculty_attendance_${selectedMonth}_${selectedYear}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading) return <div className="p-8 text-center text-slate-500 font-medium">Loading analytics data...</div>;
    if (!data) return <div className="p-8 text-center text-red-500 font-medium">Error loading data.</div>;

    const StatCard = ({ title, value, icon: Icon, trend, trendValue }) => (
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
            <div className="flex justify-between items-center mb-4">
                <div className="text-slate-500"><Icon size={20} /></div>
                {trend && <div className={`text-xs font-medium ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>{trend === 'up' ? '+' : '-'}{trendValue}</div>}
            </div>
            <p className="text-sm text-slate-500 mb-1">{title}</p>
            <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
        </div>
    );

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 bg-slate-50 min-h-screen">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Intelligence Hub</h1>
                    <p className="text-sm text-slate-500 mt-1">Analytics and reporting</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => handleExport('students')} className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                        <Download size={16} /> Export Students
                    </button>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2">
                        <FileText size={16} /> Schedule Report
                    </button>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Total Students" value={data.students_count} icon={Users} trend="up" trendValue="12%" />
                <StatCard title="Active Mentors" value={data.teachers_count} icon={UserCheck} />
                <StatCard title="Live Batches" value={data.batches_count} icon={GraduationCap} />
                <StatCard title="Net Revenue" value={`₹${data.revenue_metrics.collected.toLocaleString()}`} icon={DollarSign} trend="up" trendValue="8.4%" />
            </div>

            {/* Tabs */}
            <div className="border-b border-slate-200">
                <div className="flex gap-6">
                    {['overview', 'teachers'].map((tab) => (
                        <button 
                            key={tab} 
                            onClick={() => setActiveTab(tab)} 
                            className={`pb-3 text-sm font-medium transition-colors ${activeTab === tab ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2"><PieIcon size={18} className="text-slate-400"/> Revenue</h3>
                        <div className="space-y-6">
                            <div>
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="text-slate-600 font-medium">Collected</span>
                                    <span className="font-bold text-green-600">₹{data.revenue_metrics.collected.toLocaleString()}</span>
                                </div>
                                <div className="w-full bg-slate-100 h-2 rounded overflow-hidden">
                                    <div className="bg-green-500 h-full rounded" style={{ width: `${(data.revenue_metrics.collected / data.revenue_metrics.potential) * 100}%` }} />
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="text-slate-600 font-medium">Outstanding Dues</span>
                                    <span className="font-bold text-red-600">₹{data.revenue_metrics.due.toLocaleString()}</span>
                                </div>
                                <div className="w-full bg-slate-100 h-2 rounded overflow-hidden">
                                    <div className="bg-red-500 h-full rounded" style={{ width: `${(data.revenue_metrics.due / data.revenue_metrics.potential) * 100}%` }} />
                                </div>
                            </div>
                            <div className="pt-6 border-t border-slate-100">
                                <p className="text-sm text-slate-500 mb-1">Total Potential Revenue</p>
                                <p className="text-3xl font-bold text-slate-900">₹{data.revenue_metrics.potential.toLocaleString()}</p>
                            </div>
                            <button 
                                onClick={fetchDueStudents} 
                                className="w-full py-2.5 bg-slate-50 text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                            >
                                <AlertCircle size={16} /> View Delinquent Students
                            </button>
                        </div>
                    </div>

                    <div className="lg:col-span-2 bg-white p-6 rounded-lg border border-slate-200 shadow-sm flex flex-col">
                        <h3 className="font-bold text-slate-800 mb-4">Batch Utilization</h3>
                        <div className="overflow-x-auto flex-1">
                            <table className="w-full text-sm text-left">
                                <thead className="text-slate-500 border-b border-slate-200 bg-slate-50">
                                    <tr>
                                        <th className="py-3 px-4 font-semibold">Batch Name</th>
                                        <th className="py-3 px-4 font-semibold">Course</th>
                                        <th className="py-3 px-4 font-semibold">Students</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.batch_details.slice((batchPage - 1) * batchesPerPage, batchPage * batchesPerPage).map((b, i) => (
                                        <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                                            <td className="py-3 px-4 font-medium text-slate-800">{b.name}</td>
                                            <td className="py-3 px-4 text-slate-500">{b.course__name || 'N/A'}</td>
                                            <td className="py-3 px-4">
                                                <span className="inline-block px-2.5 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                                                    {b.student_count}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {data.batch_details.length > batchesPerPage && (
                            <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-100 text-sm text-slate-500">
                                <span>Showing {(batchPage - 1) * batchesPerPage + 1} - {Math.min(batchPage * batchesPerPage, data.batch_details.length)} of {data.batch_details.length}</span>
                                <div className="flex gap-2">
                                    <button onClick={() => setBatchPage(p => Math.max(1, p - 1))} disabled={batchPage === 1} className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 font-medium transition-colors">Prev</button>
                                    <button onClick={() => setBatchPage(p => Math.min(Math.ceil(data.batch_details.length / batchesPerPage), p + 1))} disabled={batchPage === Math.ceil(data.batch_details.length / batchesPerPage)} className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 font-medium transition-colors">Next</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Teachers Tab */}
            {activeTab === 'teachers' && (
                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2"><Briefcase size={18} className="text-slate-400"/> Faculty Performance</h3>
                        <div className="flex flex-wrap gap-2">
                            <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))} className="border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none">
                                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (<option key={m} value={m}>{new Date(2000, m - 1).toLocaleString('default', { month: 'short' })}</option>))}
                            </select>
                            <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none">
                                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                            <button onClick={exportTeachersCSV} className="px-4 py-2 text-sm font-medium text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg flex items-center gap-2 transition-colors">
                                <Download size={14} /> Export
                            </button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left border-collapse">
                            <thead className="text-slate-500 bg-slate-50 border-y border-slate-200">
                                <tr>
                                    <th className="py-3 px-4 font-semibold">Teacher Name</th>
                                    <th className="py-3 px-4 font-semibold">Assigned Courses</th>
                                    <th className="py-3 px-4 font-semibold">Total Time Taught</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.teacher_performance?.map((t, i) => (
                                    <React.Fragment key={i}>
                                    <tr 
                                        onClick={() => setExpandedTeacher(expandedTeacher === t.id ? null : t.id)} 
                                        className="border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50/80 transition-colors"
                                    >
                                        <td className="py-4 px-4 font-medium text-blue-600">{t.name}</td>
                                        <td className="py-4 px-4 text-slate-600">{t.courses}</td>
                                        <td className="py-4 px-4 text-slate-600">{t.formatted_time} <span className="text-slate-400 text-xs">({t.sessions} classes)</span></td>
                                    </tr>
                                    {expandedTeacher === t.id && t.classes && (
                                        <tr>
                                            <td colSpan="3" className="p-0 bg-slate-50 border-b border-slate-200">
                                                <div className="p-4 space-y-3">
                                                    {t.classes.map((c, idx) => (
                                                        <div key={idx} className="bg-white p-4 border border-slate-200 rounded-lg shadow-sm">
                                                            <div 
                                                                onClick={() => setExpandedBatch(expandedBatch === `${t.id}-${c.batch_name}` ? null : `${t.id}-${c.batch_name}`)} 
                                                                className="flex justify-between items-center font-medium cursor-pointer"
                                                            >
                                                                <span className="text-slate-800">{c.batch_name}</span>
                                                                <span className="text-slate-500 text-xs bg-slate-100 px-2 py-1 rounded">{c.sessions} classes | {c.formatted_time}</span>
                                                            </div>
                                                            {expandedBatch === `${t.id}-${c.batch_name}` && c.dates && (
                                                                <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                                                    {c.dates.map((d, didx) => (
                                                                        <div key={didx} className="p-3 border border-slate-200 rounded bg-slate-50 text-xs">
                                                                            <div className="font-bold text-slate-700 mb-2 border-b border-slate-200 pb-1">{d.date} <span className="text-slate-400 font-normal">({d.duration})</span></div>
                                                                            <div className="flex justify-between mb-1"><span className="text-slate-500">Present:</span> <span className="font-medium text-green-600">{d.present_count}</span></div>
                                                                            <div className="flex justify-between"><span className="text-slate-500">Absent:</span> <span className="font-medium text-red-600">{d.absent_count}</span></div>
                                                                        </div>
                                                                    ))}
                                                                    {c.dates.length === 0 && <div className="text-slate-400 italic text-xs py-2">No session dates available.</div>}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                    </React.Fragment>
                                ))}
                                {(!data.teacher_performance || data.teacher_performance.length === 0) && (
                                    <tr>
                                        <td colSpan="3" className="py-8 text-center text-slate-500">No faculty data available for this period.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Delinquent Students Modal */}
            {showDueModal && (
                <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><AlertCircle className="text-red-500"/> Outstanding Dues</h2>
                            <button onClick={() => setShowDueModal(false)} className="text-slate-400 hover:text-slate-700 p-1">✕</button>
                        </div>
                        <div className="overflow-y-auto flex-1 border border-slate-200 rounded-lg">
                            <table className="w-full text-sm text-left">
                                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                                    <tr>
                                        <th className="py-3 px-4 font-semibold">Student Name</th>
                                        <th className="py-3 px-4 font-semibold">Program</th>
                                        <th className="py-3 px-4 font-semibold text-right">Paid</th>
                                        <th className="py-3 px-4 font-semibold text-right">Due</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {dueStudents.map((s, i) => (
                                        <tr key={i} className="hover:bg-slate-50/50">
                                            <td className="py-3 px-4 font-medium text-slate-800">{s.first_name} {s.last_name}</td>
                                            <td className="py-3 px-4 text-slate-500">{s.program_name}</td>
                                            <td className="py-3 px-4 text-right text-slate-600">₹{s.total_paid}</td>
                                            <td className="py-3 px-4 text-right font-bold text-red-600">₹{s.total_due}</td>
                                        </tr>
                                    ))}
                                    {dueStudents.length === 0 && (
                                        <tr><td colSpan="4" className="py-6 text-center text-slate-500">No students with outstanding dues found.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
                            <button 
                                onClick={() => handleExport('students')} 
                                className="px-5 py-2.5 bg-slate-800 text-white rounded-lg hover:bg-slate-900 font-medium transition-colors"
                            >
                                Export Delinquent List
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AnalyticsModule;
