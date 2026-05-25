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
    Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import FaceSelfieCapture from '../components/FaceSelfieCapture';

const AttendanceModule = () => {
    const { user: authUser } = useAuth();
    const [loading, setLoading] = useState(false);
    const [attendanceLogs, setAttendanceLogs] = useState([]);
    const [todayRecord, setTodayRecord] = useState(null);
    const [location, setLocation] = useState({ latitude: null, longitude: null, status: 'idle' });
    const [activeTab, setActiveTab] = useState('personal');
    const [searchTerm, setSearchTerm] = useState('');
    const [showSelfieCapture, setShowSelfieCapture] = useState(false);
    const [previewImage, setPreviewImage] = useState(null);

    useEffect(() => {
        if (authUser?.role === 'SUPER_ADMIN') {
            setActiveTab('master');
        }
    }, [authUser]);

    useEffect(() => {
        fetchAttendance();
        requestLocation();
    }, [activeTab]);

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

    const fetchAttendance = async () => {
        setLoading(true);
        try {
            const res = await api.get('hrms/attendance/');
            const data = res.data.results || res.data || [];
            setAttendanceLogs(data);

            // Find today's record for current user
            const todayStr = new Date().toISOString().split('T')[0];
            const record = data.find(r => r.date === todayStr && Number(r.user_id) === Number(authUser?.id));
            setTodayRecord(record || null);
        } catch (err) {
            console.error("Failed to fetch attendance", err);
        } finally {
            setLoading(false);
        }
    };

    const handleClockIn = async (photoData = null) => {
        if (!photoData) {
            setShowSelfieCapture(true);
            return;
        }
        setShowSelfieCapture(false);
        setLoading(true);
        try {
            await api.post('hrms/attendance/clock_in/', {
                latitude: location.latitude,
                longitude: location.longitude,
                photo: photoData
            });
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

    const isAdmin = authUser?.role === 'SUPER_ADMIN';

    return (
        <div className="space-y-6 animate-fadeIn px-2 md:px-0 pb-20 relative">
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
                                
                                <div className="flex items-center gap-2">
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                        <input 
                                            type="text" 
                                            placeholder="Search logs..." 
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-all w-48"
                                        />
                                    </div>
                                    <button className="p-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 shadow-sm transition-colors">
                                        <Download size={14} />
                                    </button>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-slate-50">
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
                                                                {log.clock_in ? new Date(`2000-01-01T${log.clock_in}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                                            </span>
                                                            <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-1 mt-0.5">
                                                                <MapPin size={10} /> Verified
                                                            </span>
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
                                                        {log.clock_out ? new Date(`2000-01-01T${log.clock_out}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
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
            setShift(res.data[0] || {
                name: 'General Shift',
                start_time: '09:00:00',
                end_time: '18:00:00',
                grace_period_minutes: 15,
                office_latitude: 0,
                office_longitude: 0,
                allowed_radius_meters: 200
            });
        } catch (err) {
            console.error(err);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (shift.id) {
                await api.patch(`hrms/shifts/${shift.id}/`, shift);
            } else {
                await api.post('hrms/shifts/', shift);
            }
            alert("Settings saved successfully!");
            fetchShift();
        } catch (err) {
            alert("Failed to save settings");
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
