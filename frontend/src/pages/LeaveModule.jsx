import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { 
    CalendarDays, 
    Plus, 
    CheckCircle2, 
    XCircle, 
    Clock, 
    Calendar,
    ChevronLeft,
    ChevronRight,
    AlertCircle,
    Info,
    Check,
    X,
    Filter,
    Settings,
    Edit2,
    Trash
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

const LeaveModule = () => {
    const { user: authUser } = useAuth();
    const [activeTab, setActiveTab] = useState('my-requests');
    const [adminFilter, setAdminFilter] = useState('PENDING_MANAGER');
    const [leaveTypes, setLeaveTypes] = useState([]);
    const [balances, setBalances] = useState([]);
    const [requests, setRequests] = useState([]);
    const [holidays, setHolidays] = useState([]);
    const [loading, setLoading] = useState(false);
    
    const [viewDate, setViewDate] = useState(new Date());
    const [showModal, setShowModal] = useState(false);
    const [newRequest, setNewRequest] = useState({
        type: '',
        start_date: '',
        end_date: '',
        reason: ''
    });

    const fetchData = async () => {
        setLoading(true);
        try {
            const [typesRes, balRes, reqRes, holRes] = await Promise.all([
                api.get('leaves/types/'),
                api.get('leaves/balances/'),
                api.get('leaves/requests/'),
                api.get('leaves/holidays/')
            ]);
            setLeaveTypes(typesRes.data.results || typesRes.data);
            setBalances(balRes.data.results || balRes.data);
            setRequests(reqRes.data.results || reqRes.data);
            setHolidays(holRes.data.results || holRes.data);
        } catch (err) {
            console.error("Failed to fetch leave data", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleApplyLeave = async () => {
        setLoading(true);
        try {
            await api.post('leaves/requests/', {
                leave_type: newRequest.type,
                start_date: newRequest.start_date,
                end_date: newRequest.end_date,
                reason: newRequest.reason
            });
            setShowModal(false);
            setNewRequest({ type: '', start_date: '', end_date: '', reason: '' });
            fetchData();
            alert("Leave application submitted!");
        } catch (err) {
            alert(err.response?.data?.error || "Failed to submit request");
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (id, status, reason = '') => {
        setLoading(true);
        try {
            await api.post(`leaves/requests/${id}/${status}/`, { rejection_reason: reason });
            fetchData();
        } catch (err) {
            alert("Failed to update status");
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'APPROVED': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
            case 'REJECTED': return 'bg-rose-50 text-rose-600 border-rose-100';
            case 'PENDING_MANAGER': return 'bg-orange-50 text-orange-600 border-orange-100';
            case 'PENDING_HR': return 'bg-blue-50 text-blue-600 border-blue-100';
            default: return 'bg-slate-50 text-slate-400 border-slate-100';
        }
    };

    const [newType, setNewType] = useState({ name: '', code: '', is_paid: true, max_days_per_year: 12 });
    const [newHoliday, setNewHoliday] = useState({ name: '', date: '', description: '' });
    const [editingType, setEditingType] = useState(null);
    const [editingHoliday, setEditingHoliday] = useState(null);

    const handleAddType = async () => {
        try {
            if (editingType) {
                await api.put(`leaves/types/${editingType}/`, newType);
                setEditingType(null);
            } else {
                await api.post('leaves/types/', newType);
            }
            setNewType({ name: '', code: '', is_paid: true, max_days_per_year: 12 });
            fetchData();
            alert(editingType ? "Type updated!" : "Leave type added!");
        } catch (err) { alert("Failed to save type"); }
    };

    const handleAddHoliday = async () => {
        try {
            if (editingHoliday) {
                await api.put(`leaves/holidays/${editingHoliday}/`, newHoliday);
                setEditingHoliday(null);
            } else {
                await api.post('leaves/holidays/', newHoliday);
            }
            setNewHoliday({ name: '', date: '', description: '' });
            fetchData();
            alert(editingHoliday ? "Holiday updated!" : "Holiday added!");
        } catch (err) { alert("Failed to save holiday"); }
    };

    const handleDeleteType = async (id) => {
        if (!window.confirm("Delete this leave type?")) return;
        try {
            await api.delete(`leaves/types/${id}/`);
            fetchData();
        } catch (err) { alert("Failed to delete"); }
    };

    const handleDeleteHoliday = async (id) => {
        if (!window.confirm("Delete this holiday?")) return;
        try {
            await api.delete(`leaves/holidays/${id}/`);
            fetchData();
        } catch (err) { alert("Failed to delete"); }
    };

    const renderSettings = () => (
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center justify-between">
                    Manage Leave Types
                    {editingType && <button onClick={() => {setEditingType(null); setNewType({name:'',code:'',is_paid:true,max_days_per_year:12})}} className="text-xs text-rose-500 underline font-medium">Cancel Edit</button>}
                </h3>
                <div className="space-y-4 bg-slate-50 p-5 rounded-xl border border-slate-200">
                    <input 
                        placeholder="Type Name (e.g. Sick Leave)"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-medium text-sm outline-none focus:border-indigo-400"
                        value={newType.name} onChange={e => setNewType({...newType, name: e.target.value})}
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <input 
                            placeholder="Code (SL)"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-medium text-sm outline-none focus:border-indigo-400"
                            value={newType.code} onChange={e => setNewType({...newType, code: e.target.value})}
                        />
                        <input 
                            type="number"
                            placeholder="Max Days/Year"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-medium text-sm outline-none focus:border-indigo-400"
                            value={newType.max_days_per_year} onChange={e => setNewType({...newType, max_days_per_year: e.target.value})}
                        />
                    </div>
                    <button onClick={handleAddType} className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all ${editingType ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-800 text-white hover:bg-slate-900'}`}>
                        {editingType ? 'Update Leave Type' : 'Add Leave Type'}
                    </button>
                </div>
                <div className="mt-6 space-y-2">
                    {leaveTypes.map(t => (
                        <div key={t.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg shadow-sm group">
                            <span className="font-semibold text-sm text-slate-800">{t.name} ({t.code})</span>
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">{t.max_days_per_year} Days</span>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => {setEditingType(t.id); setNewType(t)}} className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded">
                                        <Edit2 size={14} />
                                    </button>
                                    <button onClick={() => handleDeleteType(t.id)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded">
                                        <Trash size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div>
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center justify-between">
                    Manage Holidays
                    {editingHoliday && <button onClick={() => {setEditingHoliday(null); setNewHoliday({name:'',date:'',description:''})}} className="text-xs text-rose-500 underline font-medium">Cancel Edit</button>}
                </h3>
                <div className="space-y-4 bg-slate-50 p-5 rounded-xl border border-slate-200">
                    <input 
                        placeholder="Holiday Name (e.g. Republic Day)"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-medium text-sm outline-none focus:border-indigo-400"
                        value={newHoliday.name} onChange={e => setNewHoliday({...newHoliday, name: e.target.value})}
                    />
                    <input 
                        type="date"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-medium text-sm outline-none focus:border-indigo-400"
                        value={newHoliday.date} onChange={e => setNewHoliday({...newHoliday, date: e.target.value})}
                    />
                    <button onClick={handleAddHoliday} className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all ${editingHoliday ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-slate-800 text-white hover:bg-slate-900'}`}>
                        {editingHoliday ? 'Update Holiday' : 'Add Holiday'}
                    </button>
                </div>
                <div className="mt-6 space-y-2">
                    {holidays.map(h => (
                        <div key={h.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg shadow-sm group">
                            <span className="font-semibold text-sm text-slate-800">{h.name}</span>
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">{new Date(h.date).toLocaleDateString()}</span>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => {setEditingHoliday(h.id); setNewHoliday(h)}} className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded">
                                        <Edit2 size={14} />
                                    </button>
                                    <button onClick={() => handleDeleteHoliday(h.id)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded">
                                        <Trash size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    const renderPolicy = () => (
        <div className="p-6 max-w-4xl">
            <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                <Info className="text-indigo-600" size={20} />
                Company Leave Policy
            </h3>
            
            <div className="space-y-6 text-sm text-slate-600">
                <section>
                    <h4 className="font-semibold text-slate-800 mb-2 uppercase tracking-wider text-xs">1. Application Process</h4>
                    <p className="leading-relaxed">
                        All leave requests must be submitted through this portal. 
                        <span className="text-slate-800 font-semibold ml-1">Casual Leave (CL)</span> requires a minimum of 2 days advance notice. 
                        <span className="text-slate-800 font-semibold ml-1">Sick Leave (SL)</span> can be submitted on the day of absence.
                    </p>
                </section>

                <section>
                    <h4 className="font-semibold text-slate-800 mb-2 uppercase tracking-wider text-xs">2. Approval Workflow</h4>
                    <p className="leading-relaxed">
                        Requests are first reviewed by the Department Head and finally approved by the HR Manager. 
                        You will receive a real-time notification once your request is processed.
                    </p>
                </section>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                        <div className="flex items-center gap-2 mb-3 text-emerald-600">
                            <CheckCircle2 size={16} />
                            <span className="font-semibold uppercase text-[10px] tracking-wider">Sundays & Holidays</span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Sundays and Official Public Holidays falling within your leave period are automatically skipped and NOT counted as leave days. Saturdays are standard working days.
                        </p>
                    </div>

                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                        <div className="flex items-center gap-2 mb-3 text-indigo-600">
                            <AlertCircle size={16} />
                            <span className="font-semibold uppercase text-[10px] tracking-wider">Carry Forward</span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            A maximum of 5 Earned Leaves (EL) can be carried forward to the next calendar year.
                        </p>
                    </div>
                </div>

                <section className="bg-rose-50 p-5 rounded-xl border border-rose-200">
                    <h4 className="font-semibold text-rose-800 mb-2 text-sm flex items-center gap-2">
                        <AlertCircle size={14} /> Loss of Pay (LOP)
                    </h4>
                    <p className="text-rose-700 text-xs leading-relaxed">
                        Any absence taken without a remaining balance or without prior approval will be automatically 
                        categorized as Loss of Pay (LOP) and will be deducted from the monthly payroll.
                    </p>
                </section>
            </div>
        </div>
    );

    const renderCalendar = () => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const days = [];
        for (let i = 0; i < firstDay; i++) days.push(null);
        for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
        
        return (
            <div className="p-6">
                <div className="flex items-center justify-between mb-6 px-2">
                    <h3 className="text-xl font-bold text-slate-800 capitalize">
                        {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </h3>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setViewDate(new Date(year, month - 1, 1))}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 text-slate-600"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <button 
                            onClick={() => setViewDate(new Date(year, month + 1, 1))}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 text-slate-600"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
                
                <div className="grid grid-cols-7 gap-3">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                        <div key={d} className="text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">{d}</div>
                    ))}
                    {days.map((date, idx) => {
                        if (!date) return <div key={`empty-${idx}`} />;
                        
                        const dateStr = date.toLocaleDateString('en-CA'); // YYYY-MM-DD
                        const dayHolidays = holidays.filter(h => h.date === dateStr);
                        const dayLeaves = requests.filter(r => r.status === 'APPROVED' && dateStr >= r.start_date && dateStr <= r.end_date);
                        
                        return (
                            <div key={dateStr} className={`min-h-[100px] p-3 border border-slate-200 rounded-lg relative transition-all ${
                                date.getDay() === 0 ? 'bg-slate-50/50' : 'bg-white shadow-sm hover:shadow-md'
                            }`}>
                                <span className={`text-xs font-semibold ${date.getDay() === 0 ? 'text-rose-500' : 'text-slate-700'}`}>{date.getDate()}</span>
                                <div className="mt-2 space-y-1">
                                    {dayHolidays.map(h => (
                                        <div key={h.id} className="text-[9px] font-semibold bg-indigo-50 text-indigo-700 px-1.5 py-1 rounded truncate border border-indigo-100" title={h.name}>
                                            🎉 {h.name}
                                        </div>
                                    ))}
                                    {dayLeaves.map(l => (
                                        <div key={l.id} className="text-[9px] font-medium bg-emerald-50 text-emerald-700 px-1.5 py-1 rounded truncate border border-emerald-100" title={`${l.employee_name} (${l.leave_type_name})`}>
                                            👤 {l.employee_name}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="p-8 max-w-7xl mx-auto font-sans">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 mt-2">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 mb-1">Leave Central</h2>
                    <p className="text-slate-500 text-sm">Manage time-off, balances and approvals seamlessly.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => setShowModal(true)}
                        className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg font-semibold hover:bg-slate-900 transition-all shadow-sm text-sm"
                    >
                        <Plus size={16} />
                        Apply for Leave
                    </button>
                </div>
            </div>

            {/* Balances Grid - Only show personal balances at the top */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                {balances.filter(bal => bal.user_id === authUser?.id).map((bal) => (
                    <motion.div 
                        whileHover={{ y: -2 }}
                        key={bal.id} 
                        className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm transition-all"
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg">
                                <CalendarDays size={18} />
                            </div>
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{bal.leave_type_code}</span>
                        </div>
                        <h4 className="text-sm font-semibold text-slate-600 mb-1">{bal.leave_type_name}</h4>
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-2xl font-bold text-slate-800">{bal.total_days - bal.used_days}</span>
                            <span className="text-xs font-medium text-slate-500">days left</span>
                        </div>
                        <div className="mt-4 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-indigo-500 transition-all" 
                                style={{ width: `${(bal.used_days / bal.total_days) * 100}%` }}
                            />
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 bg-slate-100 p-1 rounded-lg w-fit border border-slate-200">
                {[
                    { id: 'my-requests', label: 'My Requests', icon: Clock },
                    { id: 'calendar', label: 'Leave Calendar', icon: Calendar },
                    { id: 'admin-panel', label: 'Team Approvals', icon: CheckCircle2, managerOrAdmin: true },
                    { id: 'settings', label: 'Manage Types & Holidays', icon: Settings, adminOnly: true },
                    { id: 'policy', label: 'Leave Policies', icon: Info },
                ].filter(tab => {
                    if (tab.adminOnly) return authUser?.role === 'SUPER_ADMIN';
                    if (tab.managerOrAdmin) return authUser?.role === 'SUPER_ADMIN' || requests.some(r => r.user_id !== authUser?.id);
                    return true;
                }).map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
                            activeTab === tab.id ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Table / Calendar / Settings */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
                {activeTab === 'admin-panel' && (
                    <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50 flex-wrap gap-4">
                        <h3 className="text-lg font-bold text-slate-800">Process Requests</h3>
                        <div className="flex gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm flex-wrap">
                            {['PENDING_MANAGER', 'PENDING_HR', 'APPROVED', 'REJECTED'].map(status => (
                                <button
                                    key={status}
                                    onClick={() => setAdminFilter(status)}
                                    className={`px-3 py-1.5 rounded-md text-[10px] font-semibold tracking-wider transition-all ${
                                        adminFilter === status ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    {status.replace('_', ' ')}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {activeTab === 'calendar' ? renderCalendar() : 
                 activeTab === 'settings' ? renderSettings() : 
                 activeTab === 'policy' ? renderPolicy() : (
                    <table className="w-full border-collapse text-left">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-5 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Employee</th>
                                <th className="px-5 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Period</th>
                                <th className="px-5 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                                <th className="px-5 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Days</th>
                                <th className="px-5 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="px-5 py-3 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {requests.filter(req => {
                                if (activeTab === 'admin-panel') return req.status === adminFilter;
                                if (activeTab === 'my-requests') return req.user_id === authUser?.id;
                                return true;
                            }).map((req) => (
                                <tr key={req.id} className="hover:bg-slate-50 transition-colors group">
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-bold">
                                                {req.employee_name?.[0]}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-slate-800">{req.employee_name}</p>
                                                <p className="text-[10px] font-medium text-slate-500 uppercase">EMP-{req.employee}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                                            <Calendar size={14} className="text-slate-400" />
                                            {new Date(req.start_date).toLocaleDateString()} - {new Date(req.end_date).toLocaleDateString()}
                                        </div>
                                    </td>
                                    <td className="px-5 py-4">
                                        <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-md uppercase tracking-wider">
                                            {req.leave_type_name}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 text-sm font-bold text-slate-800">{req.duration} Days</td>
                                    <td className="px-5 py-4">
                                        <span className={`px-3 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider border ${getStatusColor(req.status)}`}>
                                            {req.status}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 text-right">
                                        {activeTab === 'admin-panel' && (req.status === 'PENDING_MANAGER' || req.status === 'PENDING_HR') ? (
                                            <div className="flex justify-end gap-2">
                                                {((req.status === 'PENDING_MANAGER' && req.user_id !== authUser?.id) || 
                                                  (req.status === 'PENDING_HR' && authUser?.role === 'SUPER_ADMIN') ||
                                                  (req.status === 'PENDING_MANAGER' && authUser?.role === 'SUPER_ADMIN')) && (
                                                    <button 
                                                        onClick={() => handleAction(req.id, 'approve')}
                                                        className="p-1.5 bg-emerald-50 text-emerald-600 rounded-md hover:bg-emerald-100 transition-colors"
                                                        title="Approve"
                                                    >
                                                        <Check size={16} strokeWidth={2.5} />
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={() => {
                                                        const reason = prompt("Enter rejection reason:");
                                                        if(reason) handleAction(req.id, 'reject', reason);
                                                    }}
                                                    className="p-1.5 bg-rose-50 text-rose-600 rounded-md hover:bg-rose-100 transition-colors"
                                                    title="Reject"
                                                >
                                                    <X size={16} strokeWidth={2.5} />
                                                </button>
                                            </div>
                                        ) : (
                                            <button className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
                                                <ChevronRight size={16} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Apply Modal */}
            <AnimatePresence>
                {showModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                            onClick={() => setShowModal(false)}
                        />
                        <motion.div 
                            initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
                            className="bg-white rounded-xl p-6 w-full max-w-md relative z-10 shadow-xl border border-slate-200"
                        >
                            <h3 className="text-xl font-bold text-slate-800 mb-1">Request Leave</h3>
                            <p className="text-slate-500 text-sm mb-6">Tell us when you'll be away.</p>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Leave Type</label>
                                    <select 
                                        value={newRequest.type}
                                        onChange={(e) => setNewRequest({ ...newRequest, type: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium text-sm outline-none focus:border-indigo-400 transition-all"
                                    >
                                        <option value="">Select Type...</option>
                                        {leaveTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">From</label>
                                        <input 
                                            type="date" 
                                            value={newRequest.start_date}
                                            onChange={(e) => setNewRequest({ ...newRequest, start_date: e.target.value })}
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium text-sm outline-none focus:border-indigo-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">To</label>
                                        <input 
                                            type="date" 
                                            value={newRequest.end_date}
                                            onChange={(e) => setNewRequest({ ...newRequest, end_date: e.target.value })}
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium text-sm outline-none focus:border-indigo-400"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Reason</label>
                                    <textarea 
                                        placeholder="Brief reason for your leave..."
                                        rows={3}
                                        value={newRequest.reason}
                                        onChange={(e) => setNewRequest({ ...newRequest, reason: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium text-sm outline-none focus:border-indigo-400"
                                    />
                                </div>
                                <div className="flex gap-2 mt-6">
                                    <button 
                                        onClick={() => setShowModal(false)}
                                        className="w-1/2 py-2 border border-slate-200 text-slate-600 rounded-lg font-semibold hover:bg-slate-50 transition-all text-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={handleApplyLeave}
                                        disabled={loading || !newRequest.type || !newRequest.start_date}
                                        className="w-1/2 py-2 bg-slate-800 text-white rounded-lg font-semibold hover:bg-slate-900 transition-all shadow-sm text-sm disabled:opacity-50"
                                    >
                                        {loading ? "Submitting..." : "Send Request"}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default LeaveModule;
