import React, { useState, useEffect } from 'react';
import { PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneOff, Clock, Users, PhoneCall, Calendar, BarChart2, ChevronLeft, ChevronRight } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import api from '../api/axios';

const CallAnalyticsDashboard = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('summary');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [direction, setDirection] = useState('');
    const [status, setStatus] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [salesUsers, setSalesUsers] = useState([]);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const res = await api.get('/crm/sales-users/');
                setSalesUsers(res.data);
            } catch (err) {
                console.error("Failed to load sales users", err);
            }
        };
        fetchUsers();
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                let url = '/crm/call-analytics/?';
                if (startDate) url += `start_date=${startDate}&`;
                if (endDate) url += `end_date=${endDate}&`;
                if (employeeId) url += `employee_id=${employeeId}&`;
                if (direction) url += `direction=${direction}&`;
                if (status) url += `status=${status}&`;
                url += `page=${currentPage}&`;
                const res = await api.get(url);
                setData(res.data);
            } catch (err) {
                console.error('Failed to fetch call analytics', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [startDate, endDate, employeeId, direction, status, currentPage]);

    const exportToCSV = () => {
        if (!data) return;
        
        let csvContent = "data:text/csv;charset=utf-8,";
        
        if (activeTab === 'history') {
            csvContent += "Date & Time,Sales Executive,Client Name,Direction,Status,Duration\n";
            data.history.forEach(call => {
                const dateStr = new Date(call.date).toLocaleString().replace(/,/g, '');
                const row = `${dateStr},${call.employee},${call.client},${call.direction},${call.status || 'UNKNOWN'},${call.duration}s`;
                csvContent += row + "\n";
            });
        } else {
            csvContent += "Sr. No.,Employee,Total Calls,Total Duration (s),Connected Calls,Connected Duration (s),Unique Clients\n";
            data.employee_summary.forEach(emp => {
                const row = `${emp.sr_no},${emp.name},${emp.total_calls},${emp.total_duration},${emp.connected_calls},${emp.connected_duration},${emp.unique_clients}`;
                csvContent += row + "\n";
            });
        }

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `call_analytics_${activeTab}_${new Date().getTime()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '0h 0m 0s';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h}h ${m}m ${s}s`;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[500px]">
                <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!data) return <div className="p-8 text-center text-slate-500">Failed to load analytics data.</div>;

    const pieData = [
        { name: 'Incoming', value: data.summary.incoming_calls, color: '#10B981' }, // emerald-500
        { name: 'Outgoing', value: data.summary.outgoing_calls, color: '#F59E0B' }, // amber-500
        { name: 'Missed', value: data.summary.missed_calls, color: '#EF4444' },    // red-500
        { name: 'Rejected', value: data.summary.rejected_calls, color: '#991B1B' },  // red-800
    ].filter(d => d.value > 0);

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto bg-slate-50 min-h-screen">
            {/* Tabs Row */}
            <div className="mb-4 flex border-b border-slate-200">
                <div className="flex gap-8">
                    <button onClick={() => setActiveTab('summary')} className={`pb-3 font-semibold flex items-center gap-2 ${activeTab === 'summary' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-slate-500 hover:text-slate-800'}`}>
                        <span className={`w-6 h-6 rounded flex items-center justify-center ${activeTab === 'summary' ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}><BarChart2 size={14}/></span> Summary
                    </button>
                    <button onClick={() => setActiveTab('history')} className={`pb-3 font-semibold flex items-center gap-2 ${activeTab === 'history' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-slate-500 hover:text-slate-800'}`}>
                        Call History
                    </button>
                    <button onClick={() => setActiveTab('analysis')} className={`pb-3 font-semibold flex items-center gap-2 ${activeTab === 'analysis' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-slate-500 hover:text-slate-800'}`}>
                        Analysis
                    </button>
                </div>
            </div>

            {/* Filters Row */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                    <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-300 rounded bg-slate-50 outline-none text-slate-700 focus:border-orange-500 focus:ring-1 focus:ring-orange-500">
                        <option value="">All Employees</option>
                        {salesUsers.map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                    </select>
                    <select value={direction} onChange={(e) => setDirection(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-300 rounded bg-slate-50 outline-none text-slate-700 focus:border-orange-500 focus:ring-1 focus:ring-orange-500">
                        <option value="">All Directions</option>
                        <option value="INCOMING">Incoming</option>
                        <option value="OUTGOING">Outgoing</option>
                    </select>
                    <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-300 rounded bg-slate-50 outline-none text-slate-700 focus:border-orange-500 focus:ring-1 focus:ring-orange-500">
                        <option value="">All Statuses</option>
                        <option value="CONNECTED">Connected</option>
                        <option value="MISSED">Missed/Unanswered</option>
                        <option value="REJECTED">Rejected</option>
                    </select>
                    <div className="flex items-center bg-slate-50 border border-slate-300 rounded overflow-hidden focus-within:border-orange-500 focus-within:ring-1 focus-within:ring-orange-500">
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-1.5 text-sm outline-none bg-transparent border-r border-slate-300 text-slate-700" />
                        <span className="px-2 text-slate-400 text-sm">to</span>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-1.5 text-sm outline-none bg-transparent text-slate-700" />
                    </div>
                </div>
                <div>
                    <button onClick={exportToCSV} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded shadow-sm transition-colors flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        Export Excel
                    </button>
                </div>
            </div>

            {activeTab === 'summary' && (
                <>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
                {/* Left Table: Call Type Summary */}
                <div className="col-span-1 lg:col-span-4 bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3 font-semibold">Call Type</th>
                                <th className="px-4 py-3 font-semibold">Calls</th>
                                <th className="px-4 py-3 font-semibold">Duration</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            <tr>
                                <td className="px-4 py-3 flex items-center gap-2 text-emerald-600 font-medium">
                                    <PhoneIncoming size={16} /> Incoming
                                </td>
                                <td className="px-4 py-3">{data.summary.incoming_calls}</td>
                                <td className="px-4 py-3">{formatDuration(data.summary.incoming_duration)}</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3 flex items-center gap-2 text-amber-500 font-medium">
                                    <PhoneOutgoing size={16} /> Outgoing
                                </td>
                                <td className="px-4 py-3">{data.summary.outgoing_calls}</td>
                                <td className="px-4 py-3">{formatDuration(data.summary.outgoing_duration)}</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3 flex items-center gap-2 text-red-500 font-medium">
                                    <PhoneMissed size={16} /> Missed
                                </td>
                                <td className="px-4 py-3">{data.summary.missed_calls}</td>
                                <td className="px-4 py-3">-</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3 flex items-center gap-2 text-red-800 font-medium">
                                    <PhoneOff size={16} /> Rejected
                                </td>
                                <td className="px-4 py-3">{data.summary.rejected_calls}</td>
                                <td className="px-4 py-3">-</td>
                            </tr>
                            <tr className="bg-slate-50 font-bold text-slate-800">
                                <td className="px-4 py-3">Total</td>
                                <td className="px-4 py-3">{data.summary.total_calls}</td>
                                <td className="px-4 py-3">{formatDuration(data.summary.total_duration)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Center: Quick Stats */}
                <div className="col-span-1 lg:col-span-3 grid grid-cols-1 gap-3">
                    <div className="bg-slate-50 p-4 rounded border border-slate-200 flex justify-between items-center">
                        <div>
                            <p className="text-xs text-slate-500 flex items-center gap-1"><PhoneOff size={12}/> Never Attended</p>
                            <p className="font-bold text-slate-700">{data.quick_stats.never_attended}</p>
                        </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded border border-slate-200 flex justify-between items-center">
                        <div>
                            <p className="text-xs text-slate-500 flex items-center gap-1"><PhoneMissed size={12}/> Not Pickup by Client</p>
                            <p className="font-bold text-slate-700">{data.quick_stats.not_pickup}</p>
                        </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded border border-slate-200 flex justify-between items-center">
                        <div>
                            <p className="text-xs text-slate-500 flex items-center gap-1"><PhoneCall size={12}/> Connected Calls</p>
                            <p className="font-bold text-slate-700">{data.quick_stats.connected}</p>
                        </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded border border-slate-200 flex justify-between items-center">
                        <div>
                            <p className="text-xs text-slate-500 flex items-center gap-1"><Users size={12}/> Unique Clients</p>
                            <p className="font-bold text-slate-700">{data.quick_stats.unique_clients}</p>
                        </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded border border-slate-200 flex justify-between items-center">
                        <div>
                            <p className="text-xs text-slate-500 flex items-center gap-1"><Clock size={12}/> Working Hours</p>
                            <p className="font-bold text-slate-700">{formatDuration(data.quick_stats.working_hours)}</p>
                        </div>
                    </div>
                </div>

                {/* Right: Pie Chart */}
                <div className="col-span-1 lg:col-span-5 bg-white rounded-lg border border-slate-200 shadow-sm p-4 relative flex flex-col justify-center items-center">
                    <div className="absolute top-4 right-4 text-xs text-slate-500 border border-slate-200 px-2 py-1 rounded flex items-center gap-1 cursor-pointer">
                        Reload summary
                    </div>
                    
                    {pieData.length > 0 ? (
                        <div className="h-64 w-full relative">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={100}
                                        paddingAngle={2}
                                        dataKey="value"
                                        label={({percent}) => `${(percent * 100).toFixed(0)}%`}
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <span className="text-sm font-semibold text-slate-600">Calls</span>
                            </div>
                        </div>
                    ) : (
                        <div className="h-64 flex items-center justify-center text-slate-400">No calls data</div>
                    )}

                    <div className="flex gap-4 mt-2 text-xs">
                        {pieData.map((d, i) => (
                            <div key={i} className="flex items-center gap-1">
                                <span className="w-6 h-2" style={{ backgroundColor: d.color }}></span>
                                <span className="text-slate-600">{d.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Bottom: Employee Summary */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden mb-8">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800 text-lg">Employee Summary</h3>
                    <div className="text-sm text-slate-500 flex items-center gap-2">
                        Show 
                        <select className="border border-slate-300 rounded px-2 py-1 bg-white">
                            <option>10</option>
                            <option>25</option>
                        </select>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3 font-semibold whitespace-nowrap">Sr. No.</th>
                                <th className="px-4 py-3 font-semibold whitespace-nowrap">Employee</th>
                                <th className="px-4 py-3 font-semibold text-center whitespace-nowrap border-x border-slate-200">Total Calls</th>
                                <th className="px-4 py-3 font-semibold text-center whitespace-nowrap">Total Duration</th>
                                <th className="px-4 py-3 font-semibold text-center whitespace-nowrap text-orange-500 bg-orange-50 border-x border-slate-200">Connected Calls</th>
                                <th className="px-4 py-3 font-semibold text-center whitespace-nowrap bg-orange-50 border-r border-slate-200">Conn. Calls Duration</th>
                                <th className="px-4 py-3 font-semibold text-center whitespace-nowrap bg-orange-50 border-r border-slate-200">Conn. Call Avg. Duration</th>
                                <th className="px-4 py-3 font-semibold text-center whitespace-nowrap border-r border-slate-200">Working Hours</th>
                                <th className="px-4 py-3 font-semibold text-center whitespace-nowrap border-r border-slate-200">Unique Clients</th>
                                <th className="px-4 py-3 font-semibold text-center whitespace-nowrap">Unique Conn. Calls</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {data.employee_summary.map((emp, index) => (
                                <tr key={emp.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 text-center">{emp.sr_no}</td>
                                    <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{emp.name}</td>
                                    <td className="px-4 py-3 text-center border-x border-slate-200">{emp.total_calls}</td>
                                    <td className="px-4 py-3 text-center">{formatDuration(emp.total_duration)}</td>
                                    <td className="px-4 py-3 text-center font-bold text-orange-600 bg-orange-50/50 border-x border-slate-200">{emp.connected_calls}</td>
                                    <td className="px-4 py-3 text-center bg-orange-50/50 border-r border-slate-200">{formatDuration(emp.connected_duration)}</td>
                                    <td className="px-4 py-3 text-center bg-orange-50/50 border-r border-slate-200">{formatDuration(emp.avg_duration)}</td>
                                    <td className="px-4 py-3 text-center border-r border-slate-200">{formatDuration(emp.total_duration)}</td>
                                    <td className="px-4 py-3 text-center border-r border-slate-200">{emp.unique_clients}</td>
                                    <td className="px-4 py-3 text-center">{emp.unique_connected}</td>
                                </tr>
                            ))}
                            {data.employee_summary.length === 0 && (
                                <tr>
                                    <td colSpan="10" className="px-4 py-8 text-center text-slate-500">No employee analytics available.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            </>
            )}

            {activeTab === 'analysis' && (
                <div className="space-y-6 mb-8">
                    {data.employee_summary && data.employee_summary.length > 0 ? (
                        <>
                            {/* Chart 1: Call Volumes */}
                            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
                                <h3 className="font-bold text-slate-800 text-lg mb-6">Employee Performance (Calls)</h3>
                                <div className="h-80 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={data.employee_summary} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                                            <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                                            <Tooltip cursor={{fill: '#F1F5F9'}} contentStyle={{borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                                            <Legend wrapperStyle={{paddingTop: '20px'}} />
                                            <Bar dataKey="total_calls" name="Total Calls" fill="#94A3B8" radius={[4, 4, 0, 0]} barSize={40} />
                                            <Bar dataKey="connected_calls" name="Connected Calls" fill="#F97316" radius={[4, 4, 0, 0]} barSize={40} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Chart 2: Durations */}
                                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
                                    <h3 className="font-bold text-slate-800 text-lg mb-6">Duration Performance (Seconds)</h3>
                                    <div className="h-80 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={data.employee_summary} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                                                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                                                <Tooltip cursor={{fill: '#F1F5F9'}} contentStyle={{borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                                                <Legend wrapperStyle={{paddingTop: '20px'}} />
                                                <Bar dataKey="total_duration" name="Total Duration (s)" fill="#CBD5E1" radius={[4, 4, 0, 0]} barSize={30} />
                                                <Bar dataKey="connected_duration" name="Connected Duration (s)" fill="#10B981" radius={[4, 4, 0, 0]} barSize={30} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Chart 3: Client Engagement */}
                                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
                                    <h3 className="font-bold text-slate-800 text-lg mb-6">Client Engagement</h3>
                                    <div className="h-80 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={data.employee_summary} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                                                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                                                <Tooltip cursor={{fill: '#F1F5F9'}} contentStyle={{borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                                                <Legend wrapperStyle={{paddingTop: '20px'}} />
                                                <Bar dataKey="unique_clients" name="Unique Clients Contacted" fill="#6366F1" radius={[4, 4, 0, 0]} barSize={30} />
                                                <Bar dataKey="unique_connected" name="Unique Clients Connected" fill="#8B5CF6" radius={[4, 4, 0, 0]} barSize={30} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 h-96 flex items-center justify-center text-slate-400">
                            No employee data available for analysis
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'history' && (
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden mb-8">
                    <div className="p-4 border-b border-slate-200">
                        <h3 className="font-bold text-slate-800 text-lg">Call History Log</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">Date & Time</th>
                                    <th className="px-4 py-3 font-semibold">Sales Executive</th>
                                    <th className="px-4 py-3 font-semibold">Client Name</th>
                                    <th className="px-4 py-3 font-semibold">Direction</th>
                                    <th className="px-4 py-3 font-semibold">Status</th>
                                    <th className="px-4 py-3 font-semibold">Duration</th>
                                    <th className="px-4 py-3 font-semibold text-center">Recording</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {data?.history?.map((call) => (
                                    <tr key={call.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3">{new Date(call.date).toLocaleString()}</td>
                                        <td className="px-4 py-3 font-medium">{call.employee}</td>
                                        <td className="px-4 py-3 text-slate-600">{call.client}</td>
                                        <td className="px-4 py-3">
                                            {call.direction === 'INCOMING' ? <span className="text-emerald-600 flex items-center gap-1"><PhoneIncoming size={14}/> Incoming</span> : <span className="text-amber-500 flex items-center gap-1"><PhoneOutgoing size={14}/> Outgoing</span>}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded text-xs font-semibold ${call.status === 'CONNECTED' ? 'bg-green-100 text-green-700' : call.status === 'MISSED' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
                                                {call.status || 'UNKNOWN'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">{formatDuration(call.duration)}</td>
                                        <td className="px-4 py-3 text-center">
                                            {call.recording_url ? (
                                                <audio controls controlsList="nodownload noplaybackrate" className="h-8 w-48">
                                                    <source src={call.recording_url.startsWith('http') ? call.recording_url : `${api.defaults.baseURL.split('/api')[0]}${call.recording_url}`} type="audio/mpeg" />
                                                    Your browser does not support the audio element.
                                                </audio>
                                            ) : (
                                                <span className="text-slate-400 text-xs italic">No audio</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {(!data?.history || data.history.length === 0) && (
                                    <tr>
                                        <td colSpan="7" className="px-4 py-8 text-center text-slate-500">No call history available for selected dates.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {/* Pagination Controls */}
                    {data?.total_history > 20 && (
                        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
                            <span className="text-sm text-slate-500">
                                Page <span className="font-medium text-slate-700">{currentPage}</span> of <span className="font-medium text-slate-700">{Math.ceil(data.total_history / 20)}</span>
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white hover:text-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(Math.ceil(data.total_history / 20), p + 1))}
                                    disabled={currentPage === Math.ceil(data.total_history / 20)}
                                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white hover:text-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default CallAnalyticsDashboard;
