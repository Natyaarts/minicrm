import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { 
    Clock, 
    MapPin, 
    Calendar, 
    CheckCircle2, 
    XCircle, 
    Timer,
    ChevronLeft,
    ChevronRight,
    Search,
    Filter,
    User,
    Download,
    UserX,
    PlusCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import FaceSelfieCapture from '../components/FaceSelfieCapture';

// Helper for local India/IST date string YYYY-MM-DD
const getTodayIST = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const AttendanceModule = () => {
    const { user: authUser } = useAuth();
    const [loading, setLoading] = useState(false);
    const [attendanceLogs, setAttendanceLogs] = useState([]);
    const [todayRecord, setTodayRecord] = useState(null);
    const [location, setLocation] = useState({ latitude: null, longitude: null, status: 'idle' });
    const [activeTab, setActiveTab] = useState('personal');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [showSelfieCapture, setShowSelfieCapture] = useState(false);
    const [previewImage, setPreviewImage] = useState(null);
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ count: 0, next: null, previous: null });
    const todayStr = getTodayIST();
    const [startDate, setStartDate] = useState(todayStr);
    const [endDate, setEndDate] = useState(todayStr);
    const [dashboardStats, setDashboardStats] = useState({
        presentCount: 0,
        lateCount: 0,
        activeNow: 0,
        leaveCount: 0,
        halfDayCount: 0,
        absentCount: 0,
        missedClockOutCount: 0,
        wfhCount: 0,
        totalEmployees: 0
    });
    const [statLists, setStatLists] = useState({
        present: [],
        late: [],
        active_now: [],
        on_leave: [],
        half_day: [],
        absent: [],
        missed_clock_out: [],
        wfh: []
    });
    const [allEmployees, setAllEmployees] = useState([]);
    const [selectedDashboardStat, setSelectedDashboardStat] = useState(null);
    // Manual Entry modal state
    const [showManualEntry, setShowManualEntry] = useState(false);
    const [manualForm, setManualForm] = useState({ employee_id: '', date: todayStr, clock_in: '09:30', clock_out: '', status: 'PRESENT' });
    const [manualLoading, setManualLoading] = useState(false);
    const [manualMsg, setManualMsg] = useState(null);

    const isAdmin = authUser?.role === 'SUPER_ADMIN' || authUser?.role === 'ADMIN';

    useEffect(() => {
        if (isAdmin) {
            setActiveTab('master');
        }
    }, [authUser]);

    useEffect(() => {
        fetchAttendance(1);
        requestLocation();
    }, [activeTab, startDate, endDate, filterType]);

    const requestLocation = () => {
        if ("geolocation" in navigator) {
            setLocation(prev => ({ ...prev, status: 'requesting' }));
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setLocation({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        status: 'granted'
                    });
                },
                (error) => {
                    console.error("Location error:", error);
                    setLocation(prev => ({ ...prev, status: 'denied' }));
                }
            );
        } else {
            setLocation(prev => ({ ...prev, status: 'unsupported' }));
        }
    };

    const fetchAttendance = async (pageNum = page) => {
        setLoading(true);
        try {
            let query = `hrms/attendance/?page=${pageNum}`;
            if (startDate) query += `&start_date=${startDate}`;
            if (endDate) query += `&end_date=${endDate}`;
            if (filterType && filterType !== 'all') {
                if (filterType === 'missed_clock_out') {
                    query += `&missed_clock_out=true`;
                } else {
                    query += `&status=${filterType.toUpperCase()}`;
                }
            }
            
            const res = await api.get(query);
            const data = res.data.results || res.data || [];
            setAttendanceLogs(data);
            setPage(pageNum);
            setPagination({
                count: res.data.count || data.length,
                next: res.data.next,
                previous: res.data.previous
            });

            // Authoritative summary from backend for today / selected date
            const todayStrLocal = getTodayIST();
            const summaryRes = await api.get(`hrms/attendance/daily_summary/?date=${startDate || todayStrLocal}`);
            const summaryData = summaryRes.data;
            
            if (summaryData && summaryData.counts) {
                setDashboardStats({
                    presentCount: summaryData.counts.present_count || 0,
                    lateCount: summaryData.counts.late_count || 0,
                    activeNow: summaryData.counts.active_now_count || 0,
                    leaveCount: summaryData.counts.on_leave_count || 0,
                    halfDayCount: summaryData.counts.half_day_count || 0,
                    absentCount: summaryData.counts.absent_count || 0,
                    missedClockOutCount: summaryData.counts.missed_clock_out_count || 0,
                    wfhCount: summaryData.counts.wfh_count || 0,
                    totalEmployees: summaryData.counts.total_employees || 0
                });
                setStatLists(summaryData.employees || {});

                // Populate allEmployees for dropdown
                const combined = [
                    ...(summaryData.employees?.present || []),
                    ...(summaryData.employees?.absent || []),
                    ...(summaryData.employees?.on_leave || [])
                ];
                const seen = new Set();
                const uniqueEmps = [];
                combined.forEach(e => {
                    if (!seen.has(e.id)) {
                        seen.add(e.id);
                        uniqueEmps.push(e);
                    }
                });
                setAllEmployees(uniqueEmps);
            }

            // Always check current user's today record accurately
            const myAttRes = await api.get(`hrms/attendance/?my_only=true&start_date=${todayStrLocal}&end_date=${todayStrLocal}`);
            const myAttData = myAttRes.data.results || myAttRes.data || [];
            setTodayRecord(myAttData[0] || null);
        } catch (err) {
            console.error("Failed to fetch attendance", err);
        } finally {
            setLoading(false);
        }
    };

    const handleExportCSV = async () => {
        try {
            let exportUrl = `hrms/attendance/date_range_report/?start_date=${startDate || getTodayIST()}&end_date=${endDate || getTodayIST()}`;
            if (filterType && filterType !== 'all') {
                if (filterType === 'missed_clock_out') {
                    exportUrl += `&filter_type=missed_clock_out`;
                } else {
                    exportUrl += `&status_filter=${filterType.toUpperCase()}`;
                }
            }
            const res = await api.get(exportUrl);
            const records = res.data.results || res.data || [];
            if (!records.length) return alert("No data to export.");
            
            const headers = ["Employee", "Employee ID", "Date", "Clock In", "Clock Out", "Duration", "Status", "Notes"];
            const rows = records.map(log => [
                `"${log.employee_name || ''}"`,
                `"${log.employee_id_display || ''}"`,
                `"${log.date || ''}"`,
                `"${log.clock_in ? log.clock_in : ''}"`,
                `"${log.clock_out ? log.clock_out : ''}"`,
                `"${log.duration_display || '--'}"`,
                `"${log.status || ''}"`,
                `"${log.notes || ''}"`
            ].join(','));

            const csvContent = [headers.join(','), ...rows].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `Attendance_Export_${getTodayIST()}.csv`);
            link.click();
        } catch (e) {
            console.error("Export error", e);
            alert("Failed to export attendance");
        }
    };

    const getCurrentLocationFresh = () => new Promise((resolve) => {
        if (!("geolocation" in navigator)) {
            resolve({ latitude: null, longitude: null });
            return;
        }
        const timeout = setTimeout(() => resolve({ latitude: null, longitude: null }), 10000);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                clearTimeout(timeout);
                resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
            },
            () => {
                clearTimeout(timeout);
                resolve({ latitude: null, longitude: null });
            },
            { enableHighAccuracy: true, timeout: 9000, maximumAge: 0 }
        );
    });

    const handleClockIn = async (photoData = null) => {
        if (!photoData) {
            if (location.status === 'denied') {
                alert("Location access is REQUIRED to clock in.\n\nPlease enable Location for your browser in your phone Settings, then refresh this page.");
                requestLocation();
                return;
            }
            setShowSelfieCapture(true);
            return;
        }
        setShowSelfieCapture(false);
        setLoading(true);
        try {
            // Get a fresh GPS fix at the moment of submission
            const freshLoc = await getCurrentLocationFresh();
            const lat = freshLoc.latitude ?? location.latitude;
            const lon = freshLoc.longitude ?? location.longitude;

            const res = await api.post('hrms/attendance/clock_in/', {
                latitude: lat,
                longitude: lon,
                photo: photoData
            });
            if (res.data && res.data.is_face_verified === false) {
                alert("Face verification failed. Please try again with better lighting.");
            }
            fetchAttendance();
        } catch (err) {
            console.error("Clock In Error:", err);
            alert(err.response?.data?.error || `Clock-in failed: ${err.message || 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    };


    const handleClockOut = async () => {
        setLoading(true);
        try {
            await api.post('hrms/attendance/clock_out/', {
                latitude: location.latitude,
                longitude: location.longitude
            });
            fetchAttendance();
        } catch (err) {
            alert(err.response?.data?.error || "Clock-out failed");
        } finally {
            setLoading(false);
        }
    };

    const handleOverrideStatus = async (logId, newStatus) => {
        try {
            await api.patch(`hrms/attendance/${logId}/override_status/`, { status: newStatus });
            fetchAttendance();
        } catch (err) {
            alert(err.response?.data?.error || "Failed to override status");
        }
    };

    const handleMarkPresent = async (employeeId) => {
        try {
            await api.post('hrms/attendance/mark_present/', { employee_id: employeeId });
            fetchAttendance();
        } catch (err) {
            alert(err.response?.data?.error || "Failed to mark present");
        }
    };

    const handleManualEntry = async (e) => {
        e.preventDefault();
        setManualLoading(true);
        setManualMsg(null);
        try {
            const payload = {
                employee_id: manualForm.employee_id,
                date: manualForm.date,
                clock_in: manualForm.clock_in || null,
                clock_out: manualForm.clock_out || null,
                status: manualForm.status,
            };
            const res = await api.post('hrms/attendance/manual_entry/', payload);
            setManualMsg({ type: 'success', text: res.data.message || 'Attendance saved successfully!' });
            fetchAttendance();
            setTimeout(() => { setShowManualEntry(false); setManualMsg(null); }, 1800);
        } catch (err) {
            setManualMsg({ type: 'error', text: err.response?.data?.error || 'Failed to save attendance.' });
        } finally {
            setManualLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-fadeIn px-2 md:px-0 pb-20 relative">
            {/* Manual Entry Modal */}
            <AnimatePresence>
                {showManualEntry && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={(e) => { if (e.target === e.currentTarget) setShowManualEntry(false); }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                        >
                            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-4 flex items-center justify-between text-white">
                                <div className="flex items-center space-x-2">
                                    <Clock size={20} />
                                    <h3 className="font-bold text-base">Manual Attendance Entry</h3>
                                </div>
                                <button onClick={() => setShowManualEntry(false)} className="text-white/80 hover:text-white">
                                    <XCircle size={20} />
                                </button>
                            </div>

                            <form onSubmit={handleManualEntry} className="p-6 space-y-4">
                                {manualMsg && (
                                    <div className={`p-3 rounded-lg text-xs font-medium ${manualMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                                        {manualMsg.text}
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Employee *</label>
                                    <select
                                        value={manualForm.employee_id}
                                        onChange={(e) => setManualForm({ ...manualForm, employee_id: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                        required
                                    >
                                        <option value="">Select Employee</option>
                                        {allEmployees.map(emp => (
                                            <option key={emp.id} value={emp.id}>
                                                {emp.name || emp.username} ({emp.employee_id})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Date *</label>
                                    <input
                                        type="date"
                                        value={manualForm.date}
                                        onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Clock In (HH:MM)</label>
                                        <input
                                            type="time"
                                            value={manualForm.clock_in}
                                            onChange={(e) => setManualForm({ ...manualForm, clock_in: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Clock Out (HH:MM)</label>
                                        <input
                                            type="time"
                                            value={manualForm.clock_out}
                                            onChange={(e) => setManualForm({ ...manualForm, clock_out: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Status *</label>
                                    <select
                                        value={manualForm.status}
                                        onChange={(e) => setManualForm({ ...manualForm, status: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    >
                                        <option value="PRESENT">Present</option>
                                        <option value="LATE">Late</option>
                                        <option value="HALF_DAY">Half Day</option>
                                        <option value="ON_LEAVE">On Leave</option>
                                        <option value="ABSENT">Absent</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Notes / Reason</label>
                                    <textarea
                                        rows={2}
                                        value={manualForm.notes || ''}
                                        onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })}
                                        placeholder="e.g. Regularized by Admin, Client visit..."
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none"
                                    />
                                </div>

                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowManualEntry(false)}
                                        className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={manualLoading}
                                        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all disabled:opacity-50"
                                    >
                                        {manualLoading ? 'Saving...' : 'Save Attendance'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {previewImage && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
                        onClick={() => setPreviewImage(null)}
                    >
                        <motion.div 
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.95 }}
                            className="bg-white p-2 rounded-2xl shadow-2xl max-w-lg w-full relative"
                            onClick={e => e.stopPropagation()}
                        >
                            <button 
                                onClick={() => setPreviewImage(null)}
                                className="absolute -top-4 -right-4 w-10 h-10 bg-white text-slate-800 rounded-full flex items-center justify-center shadow-lg hover:bg-slate-100"
                            >
                                <XCircle size={24} />
                            </button>
                            <img src={previewImage} alt="Clock in preview" className="w-full h-auto rounded-xl" />
                        </motion.div>
                    </motion.div>
                )}
                {selectedDashboardStat && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
                        onClick={() => setSelectedDashboardStat(null)}
                    >
                        <motion.div 
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.95 }}
                            className="bg-white p-6 rounded-2xl shadow-2xl max-w-lg w-full relative max-h-[80vh] overflow-y-auto"
                            onClick={e => e.stopPropagation()}
                        >
                            <button 
                                onClick={() => setSelectedDashboardStat(null)}
                                className="absolute top-4 right-4 w-8 h-8 bg-slate-100 text-slate-800 rounded-full flex items-center justify-center hover:bg-slate-200"
                            >
                                <XCircle size={20} />
                            </button>
                            <h2 className="text-xl font-bold text-slate-800 mb-4 capitalize">
                                {selectedDashboardStat === 'active' ? 'Active Now' : 
                                 selectedDashboardStat === 'present' ? 'Present / Late' : 
                                 selectedDashboardStat === 'leave' ? 'On Leave' : 
                                 selectedDashboardStat === 'absent' ? 'Absent' : 
                                 selectedDashboardStat === 'missedClockOut' ? 'Missed Clock-Out' : 
                                 selectedDashboardStat === 'wfh' ? 'Work From Home' : 'Half Day'} Employees
                            </h2>
                            <div className="space-y-3">
                                {(() => {
                                    const list = 
                                        selectedDashboardStat === 'active' ? (statLists.active_now || []) :
                                        selectedDashboardStat === 'present' ? (statLists.present || []) :
                                        selectedDashboardStat === 'leave' ? (statLists.on_leave || []) :
                                        selectedDashboardStat === 'halfDay' ? (statLists.half_day || []) :
                                        selectedDashboardStat === 'absent' ? (statLists.absent || []) :
                                        selectedDashboardStat === 'missedClockOut' ? (statLists.missed_clock_out || []) :
                                        selectedDashboardStat === 'wfh' ? (statLists.wfh || []) : [];

                                    if (!list.length) {
                                        return <p className="text-center text-slate-500 py-4">No employees found in this category.</p>;
                                    }

                                    return list.map((emp, idx) => (
                                        <div key={idx} className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-100">
                                            <div>
                                                <p className="font-semibold text-slate-800">{emp.name || emp.username || 'Employee'}</p>
                                                <p className="text-xs text-slate-500">
                                                    ID: {emp.employee_id} {emp.clock_in ? `• In: ${emp.clock_in}` : ''} {emp.clock_out ? `• Out: ${emp.clock_out}` : ''}
                                                </p>
                                                {emp.leave_type && (
                                                    <p className="text-[11px] text-amber-600 font-medium mt-0.5">
                                                        Leave: {emp.leave_type} {emp.leave_reason ? `(${emp.leave_reason})` : ''}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="text-right flex items-center space-x-2">
                                                {selectedDashboardStat === 'absent' && isAdmin && (
                                                    <button 
                                                        onClick={() => handleMarkPresent(emp.id)}
                                                        className="px-2 py-1 bg-green-100 hover:bg-green-200 text-green-700 text-xs font-bold rounded transition-colors"
                                                    >
                                                        Mark Present
                                                    </button>
                                                )}
                                                {selectedDashboardStat === 'active' && <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded">Active</span>}
                                                {selectedDashboardStat === 'present' && <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded">{emp.status || 'Present'}</span>}
                                                {selectedDashboardStat === 'leave' && <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded">On Leave</span>}
                                                {selectedDashboardStat === 'halfDay' && <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded">Half Day</span>}
                                                {selectedDashboardStat === 'absent' && <span className="px-2 py-1 bg-slate-200 text-slate-700 text-xs font-bold rounded">Absent</span>}
                                                {selectedDashboardStat === 'missedClockOut' && <span className="px-2 py-1 bg-rose-100 text-rose-700 text-xs font-bold rounded">Missed Out</span>}
                                                {selectedDashboardStat === 'wfh' && <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded">WFH</span>}
                                            </div>
                                        </div>
                                    ));
                                })()}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            {showSelfieCapture && (
                <FaceSelfieCapture 
                    onCapture={handleClockIn}
                    onCancel={() => setShowSelfieCapture(false)}
                />
            )}
            {/* Header Area */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">
                        Attendance <span className="text-indigo-600">Hub</span>
                    </h1>
                    <p className="text-slate-500 mt-1 text-xs font-normal flex items-center gap-2">
                        <Calendar size={14} className="text-indigo-600" />
                        {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                </div>

                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <button 
                        onClick={() => setActiveTab('personal')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            activeTab === 'personal' 
                            ? 'bg-indigo-600 text-white shadow-sm' 
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm'
                        }`}
                    >
                        My Logs
                    </button>
                    {isAdmin && (
                        <>
                            <button 
                                onClick={() => setActiveTab('master')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                    activeTab === 'master' 
                                    ? 'bg-indigo-600 text-white shadow-sm' 
                                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm'
                                }`}
                            >
                                Master Sheet
                            </button>
                            <button 
                                onClick={() => setActiveTab('settings')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                    activeTab === 'settings' 
                                    ? 'bg-indigo-600 text-white shadow-sm' 
                                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm'
                                }`}
                            >
                                Settings
                            </button>
                        </>
                    )}
                </div>
            </div>

            {isAdmin && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div 
                        onClick={() => setSelectedDashboardStat('active')}
                        className={`bg-white p-4 rounded-xl border ${selectedDashboardStat === 'active' ? 'border-emerald-500 shadow-md ring-2 ring-emerald-200' : 'border-slate-200 shadow-sm hover:border-emerald-300 hover:shadow-md'} flex items-center justify-between cursor-pointer transition-all`}
                    >
                        <div>
                            <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider mb-0.5">Active Now</p>
                            <h3 className="text-xl font-bold text-slate-800">{dashboardStats.activeNow}</h3>
                        </div>
                        <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                            <User size={18} />
                        </div>
                    </div>
                    <div 
                        onClick={() => setSelectedDashboardStat('present')}
                        className={`bg-white p-4 rounded-xl border ${selectedDashboardStat === 'present' ? 'border-teal-500 shadow-md ring-2 ring-teal-200' : 'border-slate-200 shadow-sm hover:border-teal-300 hover:shadow-md'} flex items-center justify-between cursor-pointer transition-all`}
                    >
                        <div>
                            <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider mb-0.5">Present</p>
                            <h3 className="text-xl font-bold text-slate-800">{dashboardStats.presentCount}</h3>
                        </div>
                        <div className="w-9 h-9 rounded-full bg-teal-50 flex items-center justify-center text-teal-600">
                            <CheckCircle2 size={18} />
                        </div>
                    </div>
                    <div 
                        onClick={() => setSelectedDashboardStat('leave')}
                        className={`bg-white p-4 rounded-xl border ${selectedDashboardStat === 'leave' ? 'border-purple-500 shadow-md ring-2 ring-purple-200' : 'border-slate-200 shadow-sm hover:border-purple-300 hover:shadow-md'} flex items-center justify-between cursor-pointer transition-all`}
                    >
                        <div>
                            <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider mb-0.5">On Leave</p>
                            <h3 className="text-xl font-bold text-slate-800">{dashboardStats.leaveCount}</h3>
                        </div>
                        <div className="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
                            <XCircle size={18} />
                        </div>
                    </div>
                    <div 
                        onClick={() => setSelectedDashboardStat('halfDay')}
                        className={`bg-white p-4 rounded-xl border ${selectedDashboardStat === 'halfDay' ? 'border-amber-500 shadow-md ring-2 ring-amber-200' : 'border-slate-200 shadow-sm hover:border-amber-300 hover:shadow-md'} flex items-center justify-between cursor-pointer transition-all`}
                    >
                        <div>
                            <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider mb-0.5">Half Day</p>
                            <h3 className="text-xl font-bold text-slate-800">{dashboardStats.halfDayCount}</h3>
                        </div>
                        <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
                            <Timer size={18} />
                        </div>
                    </div>
                    <div 
                        onClick={() => setSelectedDashboardStat('absent')}
                        className={`bg-white p-4 rounded-xl border ${selectedDashboardStat === 'absent' ? 'border-slate-500 shadow-md ring-2 ring-slate-200' : 'border-slate-200 shadow-sm hover:border-slate-400 hover:shadow-md'} flex items-center justify-between cursor-pointer transition-all`}
                    >
                        <div>
                            <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider mb-0.5">Absent</p>
                            <h3 className="text-xl font-bold text-slate-800">{dashboardStats.absentCount}</h3>
                        </div>
                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                            <UserX size={18} />
                        </div>
                    </div>
                    <div 
                        onClick={() => setSelectedDashboardStat('missedClockOut')}
                        className={`bg-white p-4 rounded-xl border ${selectedDashboardStat === 'missedClockOut' ? 'border-rose-500 shadow-md ring-2 ring-rose-200' : 'border-slate-200 shadow-sm hover:border-rose-300 hover:shadow-md'} flex items-center justify-between cursor-pointer transition-all`}
                    >
                        <div>
                            <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider mb-0.5">Missed Out</p>
                            <h3 className="text-xl font-bold text-slate-800">{dashboardStats.missedClockOutCount}</h3>
                        </div>
                        <div className="w-9 h-9 rounded-full bg-rose-50 flex items-center justify-center text-rose-600">
                            <Clock size={18} />
                        </div>
                    </div>
                </div>
            )}

                {activeTab === 'settings' && isAdmin ? (
                    <SettingsView location={location} requestLocation={requestLocation} />
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Clock In/Out Card */}
                    <div className="lg:col-span-1 space-y-4">
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-full -mr-12 -mt-12 group-hover:scale-110 transition-transform duration-500" />
                            
                            <div className="relative z-10">
                                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center text-white mb-4 shadow-sm">
                                    <Clock size={20} />
                                </div>
                                
                                <h3 className="text-lg font-bold text-slate-800 mb-1">
                                    {todayRecord?.clock_out ? "Work Completed" : todayRecord?.clock_in ? "You're Logged In" : "Ready to Start?"}
                                </h3>
                                <p className="text-slate-500 text-xs mb-6">
                                    {todayRecord?.clock_out 
                                        ? "Great job today! See you tomorrow." 
                                        : todayRecord?.clock_in 
                                            ? `Clocked in at ${todayRecord.clock_in}` 
                                            : "Mark your attendance for today."
                                    }
                                </p>

                                <div className="space-y-3">
                                    {!todayRecord?.clock_in && (
                                        <button 
                                            onClick={() => handleClockIn()}
                                            disabled={loading || location.status !== 'granted'}
                                            className="w-full py-2 bg-slate-800 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600 transition-all shadow-sm hover:shadow-md disabled:opacity-50"
                                        >
                                            {loading ? "Processing..." : "Clock In Now"}
                                        </button>
                                    )}
                                    
                                    {todayRecord?.clock_in && !todayRecord?.clock_out && (
                                        <button 
                                            onClick={handleClockOut}
                                            disabled={loading || location.status !== 'granted'}
                                            className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-all shadow-sm hover:shadow-md disabled:opacity-50"
                                        >
                                            {loading ? "Processing..." : "Clock Out"}
                                        </button>
                                    )}

                                    {todayRecord?.clock_out && (
                                        <div className="p-3 bg-emerald-50 rounded-lg flex items-center gap-2 border border-emerald-100">
                                            <CheckCircle2 size={16} className="text-emerald-500" />
                                            <span className="text-emerald-700 font-semibold text-xs uppercase tracking-wider">Shift Ended</span>
                                        </div>
                                    )}
                                </div>

                                {/* Location Status */}
                                <div className="mt-6 flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${location.status === 'granted' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                                        <MapPin size={16} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Geo-Fence Status</p>
                                        <p className="text-xs font-semibold text-slate-700">
                                            {location.status === 'granted' ? 'Location Secured' : 'Location Required'}
                                        </p>
                                    </div>
                                    {location.status !== 'granted' && (
                                        <button onClick={requestLocation} className="text-[10px] font-bold text-red-600 uppercase underline">Retry</button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Working Stats */}
                        <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 text-white shadow-sm">
                            <Timer className="text-indigo-400 mb-3" size={20} />
                            <h4 className="text-slate-400 font-semibold text-[10px] uppercase tracking-wider mb-1">Weekly Progress</h4>
                            {(() => {
                                const now = new Date();
                                const startOfWeek = new Date(now);
                                startOfWeek.setDate(now.getDate() - now.getDay());
                                startOfWeek.setHours(0, 0, 0, 0);

                                let totalMs = 0;
                                attendanceLogs
                                    .filter(l => Number(l.user_id) === Number(authUser?.id))
                                    .forEach(log => {
                                        const logDate = new Date(log.date);
                                        if (logDate >= startOfWeek && log.clock_in && log.clock_out) {
                                            const start = new Date(`2000-01-01T${log.clock_in}`);
                                            const end = new Date(`2000-01-01T${log.clock_out}`);
                                            totalMs += (end - start);
                                        }
                                    });

                                const totalHrs = Math.floor(totalMs / (1000 * 60 * 60));
                                const progress = Math.min(100, (totalHrs / 40) * 100);

                                return (
                                    <>
                                        <p className="text-lg font-bold mb-3">{totalHrs}h / 40h</p>
                                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-indigo-500 transition-all duration-1000" 
                                                style={{ width: `${progress}%` }} 
                                            />
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>

                    {/* Data Table Area */}
                    <div className="lg:col-span-2">
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
                            <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
                                <h3 className="text-base font-bold text-slate-800">
                                    {activeTab === 'master' ? "Master Attendance Sheet" : "Your Recent Logs"}
                                </h3>
                                
                                <div className="flex items-center gap-2 flex-wrap">
                                    <input 
                                        type="date" 
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-400 font-semibold text-slate-600"
                                        title="Start Date"
                                    />
                                    <span className="text-slate-400 text-xs font-bold">to</span>
                                    <input 
                                        type="date" 
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-400 font-semibold text-slate-600"
                                        title="End Date"
                                    />
                                    <select
                                        value={filterType}
                                        onChange={(e) => setFilterType(e.target.value)}
                                        className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-400 font-semibold text-slate-600 cursor-pointer"
                                    >
                                        <option value="all">All Statuses</option>
                                        <option value="present">Present</option>
                                        <option value="late">Late</option>
                                        <option value="half_day">Half Day</option>
                                        <option value="on_leave">On Leave</option>
                                        <option value="absent">Absent</option>
                                        <option value="missed_clock_out">Missed Out</option>
                                    </select>
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                        <input 
                                            type="text" 
                                            placeholder="Search logs..." 
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-all w-32 sm:w-40"
                                        />
                                    </div>
                                    <button 
                                        onClick={handleExportCSV}
                                        title="Export to CSV"
                                        className="p-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 shadow-sm transition-colors"
                                    >
                                        <Download size={14} />
                                    </button>
                                    {isAdmin && activeTab === 'master' && (
                                        <button
                                            onClick={() => { setManualForm({ employee_id: '', date: startDate || todayStr, clock_in: '09:30', clock_out: '', status: 'PRESENT' }); setManualMsg(null); setShowManualEntry(true); }}
                                            title="Manual Entry"
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                                        >
                                            <PlusCircle size={14} /> Manual Entry
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
                                <table className="w-full relative">
                                    <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                                        <tr>
                                            {activeTab === 'master' && (
                                                <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Employee</th>
                                            )}
                                            <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Date</th>
                                            <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Punch In</th>
                                            <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Punch Out</th>
                                            <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Duration</th>
                                            <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {attendanceLogs
                                            .filter(log => 
                                                log.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                                log.date.includes(searchTerm)
                                            )
                                            .map((log) => (
                                            <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                                                {activeTab === 'master' && (
                                                    <td className="px-5 py-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center font-bold text-xs shadow-sm">
                                                                {log.employee_name?.[0]}
                                                            </div>
                                                            <div>
                                                                <p className="font-semibold text-slate-800 text-sm">{log.employee_name}</p>
                                                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{log.employee_id_display}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                )}
                                                <td className="px-5 py-3">
                                                    <span className="text-xs font-semibold text-slate-600">{log.date}</span>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-bold text-slate-800">
                                                                {log.clock_in ? 
                                                                    (() => {
                                                                        const [h, m] = log.clock_in.split(':');
                                                                        const hour = parseInt(h, 10);
                                                                        const ampm = hour >= 12 ? 'PM' : 'AM';
                                                                        return `${hour % 12 || 12}:${m} ${ampm}`;
                                                                    })()
                                                                : '--:--'}
                                                            </span>
                                                            {log.clock_in_latitude && (
                                                                <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-1 mt-0.5">
                                                                    <MapPin size={10} /> Loc Verified
                                                                </span>
                                                            )}
                                                            {log.is_face_verified && (
                                                                <span className="text-[10px] font-semibold text-indigo-600 flex items-center gap-1 mt-0.5">
                                                                    <CheckCircle2 size={10} /> Face Verified ({log.verification_confidence}%)
                                                                </span>
                                                            )}
                                                        </div>
                                                        {log.clock_in_photo && (
                                                            <div 
                                                                className="relative cursor-pointer"
                                                                onClick={() => setPreviewImage(log.clock_in_photo)}
                                                            >
                                                                <img 
                                                                    src={log.clock_in_photo} 
                                                                    alt="Clock in selfie" 
                                                                    className="w-8 h-8 rounded-full border-2 border-indigo-100 object-cover hover:border-indigo-400 transition-colors shadow-sm"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <span className="text-xs font-bold text-slate-800">
                                                        {log.clock_out ? 
                                                            (() => {
                                                                const [h, m] = log.clock_out.split(':');
                                                                const hour = parseInt(h, 10);
                                                                const ampm = hour >= 12 ? 'PM' : 'AM';
                                                                return `${hour % 12 || 12}:${m} ${ampm}`;
                                                            })()
                                                        : '--:--'}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <span className="text-xs font-semibold text-slate-600">
                                                        {(() => {
                                                            if (!log.clock_in || !log.clock_out) return '--';
                                                            const start = new Date(`2000-01-01T${log.clock_in}`);
                                                            const end = new Date(`2000-01-01T${log.clock_out}`);
                                                            const diffMs = end - start;
                                                            const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
                                                            const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                                                            return `${diffHrs}h ${diffMins}m`;
                                                        })()}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3">
                                                    {activeTab === 'master' ? (
                                                        <select 
                                                            value={log.status}
                                                            onChange={(e) => handleOverrideStatus(log.id, e.target.value)}
                                                            className={`px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-wider border outline-none cursor-pointer ${
                                                                log.status === 'PRESENT' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                                log.status === 'LATE' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                                                log.status === 'HALF_DAY' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                                                'bg-red-50 text-red-600 border-red-100'
                                                            }`}
                                                        >
                                                            <option value="PRESENT">Present</option>
                                                            <option value="LATE">Late</option>
                                                            <option value="HALF_DAY">Half Day</option>
                                                            <option value="ABSENT">Absent</option>
                                                        </select>
                                                    ) : (
                                                        <span className={`px-2.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${
                                                            log.status === 'PRESENT' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                            log.status === 'LATE' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                                            log.status === 'HALF_DAY' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                                            'bg-red-50 text-red-600 border-red-100'
                                                        }`}>
                                                            {log.status.replace('_', ' ')}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {attendanceLogs.length === 0 && (
                                            <tr>
                                                <td colSpan="6" className="px-5 py-8 text-center text-slate-400 font-semibold text-sm">
                                                    No attendance logs found for this period.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            
                            {!loading && attendanceLogs.length > 0 && (
                                <div className="p-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
                                    <span className="text-xs text-slate-500 font-semibold">
                                        Showing <span className="font-bold text-slate-800">{attendanceLogs.length}</span> of {pagination.count || attendanceLogs.length} logs
                                    </span>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => fetchAttendance(page - 1)}
                                            disabled={!pagination.previous}
                                            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                                        >
                                            Previous
                                        </button>
                                        <button 
                                            onClick={() => fetchAttendance(page + 1)}
                                            disabled={!pagination.next}
                                            className="px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-lg text-xs font-bold text-indigo-600 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const SettingsView = ({ location, requestLocation }) => {
    const [shift, setShift] = useState(null);
    const [loading, setLoading] = useState(false);
    const [addressSearch, setAddressSearch] = useState('');

    useEffect(() => {
        fetchShift();
    }, []);

    const fetchShift = async () => {
        try {
            const res = await api.get('hrms/shifts/');
            // Handle DRF pagination response which returns { count, results: [] }
            const shiftList = res.data.results ? res.data.results : res.data;
            
            const raw = shiftList[0] || {
                name: 'General Shift',
                start_time: '09:00',
                end_time: '18:00',
                grace_period_minutes: 15,
                office_latitude: 0,
                office_longitude: 0,
                allowed_radius_meters: 200
            };
            // HTML time inputs need HH:MM format — strip seconds if present
            setShift({
                ...raw,
                start_time: raw.start_time ? raw.start_time.slice(0, 5) : '09:00',
                end_time: raw.end_time ? raw.end_time.slice(0, 5) : '18:00',
            });
        } catch (err) {
            console.error(err);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            // Convert HH:MM back to HH:MM:SS for Django backend
            const payload = {
                ...shift,
                start_time: shift.start_time.length === 5 ? shift.start_time + ':00' : shift.start_time,
                end_time: shift.end_time.length === 5 ? shift.end_time + ':00' : shift.end_time,
                office_latitude: parseFloat(shift.office_latitude).toFixed(6),
                office_longitude: parseFloat(shift.office_longitude).toFixed(6),
            };
            if (shift.id) {
                await api.patch(`hrms/shifts/${shift.id}/`, payload);
            } else {
                await api.post('hrms/shifts/', payload);
            }
            alert("Shift settings saved successfully!");
            fetchShift();
        } catch (err) {
            alert("Failed to save settings. Please check all fields.");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const setOfficeToCurrent = () => {
        if (location.latitude) {
            setShift({ ...shift, office_latitude: location.latitude, office_longitude: location.longitude });
            alert("Office location set to your current GPS position!");
        } else {
            requestLocation();
        }
    };

    const handleAddressSearch = async () => {
        if (!addressSearch) return;
        
        setLoading(true);
        try {
            // Using free Nominatim API to get coordinates from address
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressSearch)}`);
            const data = await res.json();
            
            if (data && data.length > 0) {
                const { lat, lon } = data[0];
                setShift({ ...shift, office_latitude: parseFloat(lat), office_longitude: parseFloat(lon) });
                alert(`Location found: ${data[0].display_name}`);
            } else {
                alert("Could not find that address. Please be more specific or use 'Current Location'.");
            }
        } catch (err) {
            console.error("Geocoding error:", err);
            alert("Search failed. Please try again or enter coordinates manually.");
        } finally {
            setLoading(false);
        }
    };

    if (!shift) return <div className="p-8 text-center font-bold text-slate-400">Loading settings...</div>;

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8"
        >
            <div className="lg:col-span-4">
                <form onSubmit={handleSave} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-5">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-bold text-slate-800">Shift Settings</h3>
                        <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center text-white shadow-sm">
                            <MapPin size={16} />
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* Address Search Helper */}
                        <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100 mb-4">
                            <label className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wider mb-2 block">Locate Office by Address</label>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    placeholder="Enter office address..."
                                    value={addressSearch}
                                    onChange={(e) => setAddressSearch(e.target.value)}
                                    className="flex-1 px-3 py-1.5 bg-white border border-indigo-200 rounded-lg font-medium text-xs outline-none focus:border-indigo-400"
                                />
                                <button 
                                    type="button"
                                    onClick={handleAddressSearch}
                                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-semibold text-xs hover:bg-indigo-700 transition-all shadow-sm"
                                >
                                    Locate
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Shift Start</label>
                                <input 
                                    type="time" 
                                    value={shift.start_time}
                                    onChange={(e) => setShift({ ...shift, start_time: e.target.value })}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium text-sm outline-none focus:border-indigo-400"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Shift End</label>
                                <input 
                                    type="time" 
                                    value={shift.end_time}
                                    onChange={(e) => setShift({ ...shift, end_time: e.target.value })}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium text-sm outline-none focus:border-indigo-400"
                                />
                            </div>
                        </div>

                        <div className="pt-4 border-t border-slate-100">
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Office Latitude</label>
                                    <input 
                                        type="number" step="any"
                                        value={shift.office_latitude}
                                        onChange={(e) => setShift({ ...shift, office_latitude: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Office Longitude</label>
                                    <input 
                                        type="number" step="any"
                                        value={shift.office_longitude}
                                        onChange={(e) => setShift({ ...shift, office_longitude: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                    />
                                </div>
                            </div>
                            
                            <button 
                                type="button"
                                onClick={setOfficeToCurrent}
                                className="w-full py-2 bg-indigo-600 text-white rounded-lg font-semibold text-xs hover:bg-indigo-700 transition-all shadow-sm mb-4 flex items-center justify-center gap-2"
                            >
                                <MapPin size={14} />
                                Use My Current Location
                            </button>

                            <div>
                                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Allowed Geofence Radius (Meters)</label>
                                <input 
                                    type="number" 
                                    value={shift.allowed_radius_meters}
                                    onChange={(e) => setShift({ ...shift, allowed_radius_meters: e.target.value })}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                />
                            </div>
                        </div>
                    </div>

                    <button 
                        type="submit"
                        disabled={loading}
                        className="w-full py-2.5 bg-slate-800 text-white rounded-lg font-semibold text-sm shadow-sm hover:bg-slate-900 transition-all disabled:opacity-50"
                    >
                        {loading ? "Saving..." : "Save Geofence Configuration"}
                    </button>
                </form>
            </div>

            <div className="lg:col-span-8">
                <div className="bg-slate-50 rounded-xl border border-slate-200 shadow-sm h-full min-h-[500px] overflow-hidden relative group">
                    <iframe 
                        width="100%" 
                        height="100%" 
                        frameBorder="0" 
                        style={{ border: 0 }}
                        src={addressSearch 
                            ? `https://maps.google.com/maps?q=${encodeURIComponent(addressSearch)}&t=&z=15&ie=UTF8&iwloc=&output=embed`
                            : `https://maps.google.com/maps?q=${shift.office_latitude},${shift.office_longitude}&t=&z=15&ie=UTF8&iwloc=&output=embed`
                        }
                        allowFullScreen
                    ></iframe>
                    
                    {/* Floating Info Overlay */}
                    <div className="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur-xl p-4 rounded-xl border border-slate-200 shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-all duration-500">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
                                    <MapPin size={20} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Office Boundary Preview</p>
                                    <p className="text-sm font-bold text-slate-800">Radius: {shift.allowed_radius_meters}m</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Live Status</p>
                                <p className="text-[10px] font-bold text-emerald-600 flex items-center gap-1 justify-end">
                                    <CheckCircle2 size={10} /> Active Geofence
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default AttendanceModule;
