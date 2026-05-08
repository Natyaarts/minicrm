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

const AttendanceModule = () => {
    const { user: authUser } = useAuth();
    const [loading, setLoading] = useState(false);
    const [attendanceLogs, setAttendanceLogs] = useState([]);
    const [todayRecord, setTodayRecord] = useState(null);
    const [location, setLocation] = useState({ latitude: null, longitude: null, status: 'idle' });
    const [activeTab, setActiveTab] = useState('personal');
    const [searchTerm, setSearchTerm] = useState('');

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

    const handleClockIn = async () => {
        setLoading(true);
        try {
            await api.post('hrms/attendance/clock_in/', {
                latitude: location.latitude,
                longitude: location.longitude
            });
            fetchAttendance();
        } catch (err) {
            alert(err.response?.data?.error || "Clock-in failed");
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

    const isAdmin = authUser?.role === 'SUPER_ADMIN';

    return (
        <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-8 font-sans">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
                    <div>
                        <h2 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Attendance Hub</h2>
                        <p className="text-slate-500 font-bold flex items-center gap-2">
                            <Calendar size={16} className="text-rose-600" />
                            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                    </div>

                    <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm">
                        <button 
                            onClick={() => setActiveTab('personal')}
                            className={`px-6 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === 'personal' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-900'}`}
                        >
                            My Logs
                        </button>
                        {isAdmin && (
                            <>
                                <button 
                                    onClick={() => setActiveTab('master')}
                                    className={`px-6 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === 'master' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-900'}`}
                                >
                                    Master Sheet
                                </button>
                                <button 
                                    onClick={() => setActiveTab('settings')}
                                    className={`px-6 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === 'settings' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-900'}`}
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
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Clock In/Out Card */}
                    <div className="lg:col-span-4 space-y-6">
                        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-500" />
                            
                            <div className="relative z-10">
                                <div className="w-16 h-16 bg-rose-600 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg shadow-rose-200">
                                    <Clock size={32} />
                                </div>
                                
                                <h3 className="text-2xl font-black text-slate-900 mb-2">
                                    {todayRecord?.clock_out ? "Work Completed" : todayRecord?.clock_in ? "You're Logged In" : "Ready to Start?"}
                                </h3>
                                <p className="text-slate-500 font-bold text-sm mb-8">
                                    {todayRecord?.clock_out 
                                        ? "Great job today! See you tomorrow." 
                                        : todayRecord?.clock_in 
                                            ? `Clocked in at ${todayRecord.clock_in}` 
                                            : "Mark your attendance for today."
                                    }
                                </p>

                                <div className="space-y-4">
                                    {!todayRecord?.clock_in && (
                                        <button 
                                            onClick={handleClockIn}
                                            disabled={loading || location.status !== 'granted'}
                                            className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black hover:bg-rose-600 transition-all shadow-xl hover:-translate-y-1 disabled:opacity-50 disabled:translate-y-0"
                                        >
                                            {loading ? "Processing..." : "Clock In Now"}
                                        </button>
                                    )}
                                    
                                    {todayRecord?.clock_in && !todayRecord?.clock_out && (
                                        <button 
                                            onClick={handleClockOut}
                                            disabled={loading || location.status !== 'granted'}
                                            className="w-full py-5 bg-rose-600 text-white rounded-3xl font-black hover:bg-rose-700 transition-all shadow-xl hover:-translate-y-1 disabled:opacity-50 disabled:translate-y-0"
                                        >
                                            {loading ? "Processing..." : "Clock Out"}
                                        </button>
                                    )}

                                    {todayRecord?.clock_out && (
                                        <div className="p-4 bg-emerald-50 rounded-2xl flex items-center gap-3 border border-emerald-100">
                                            <CheckCircle2 className="text-emerald-500" />
                                            <span className="text-emerald-700 font-black text-sm uppercase tracking-tight">Shift Ended</span>
                                        </div>
                                    )}
                                </div>

                                {/* Location Status */}
                                <div className="mt-8 flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${location.status === 'granted' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                        <MapPin size={20} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Geo-Fence Status</p>
                                        <p className="text-xs font-black text-slate-700">
                                            {location.status === 'granted' ? 'Location Secured' : 'Location Required'}
                                        </p>
                                    </div>
                                    {location.status !== 'granted' && (
                                        <button onClick={requestLocation} className="text-[10px] font-black text-rose-600 uppercase underline">Retry</button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Working Stats */}
                        <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white">
                            <Timer className="text-rose-500 mb-4" size={24} />
                            <h4 className="text-slate-400 font-black text-[10px] uppercase tracking-widest mb-1">Weekly Progress</h4>
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
                                        <p className="text-2xl font-black mb-4">{totalHrs}h / 40h</p>
                                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-rose-500 transition-all duration-1000" 
                                                style={{ width: `${progress}%` }} 
                                            />
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>

                    {/* Data Table Area */}
                    <div className="lg:col-span-8">
                        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
                            <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
                                <h3 className="text-xl font-black text-slate-900">
                                    {activeTab === 'master' ? "Master Attendance Sheet" : "Your Recent Logs"}
                                </h3>
                                
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                        <input 
                                            type="text" 
                                            placeholder="Search by name or date..." 
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-rose-300 transition-all w-48 md:w-64"
                                        />
                                    </div>
                                    <button className="p-2 bg-slate-50 text-slate-400 hover:text-rose-600 transition-colors rounded-xl border border-slate-100">
                                        <Download size={20} />
                                    </button>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-slate-50/50">
                                            {activeTab === 'master' && (
                                                <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Employee</th>
                                            )}
                                            <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Date</th>
                                            <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Punch In</th>
                                            <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Punch Out</th>
                                            <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Duration</th>
                                            <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Compliance</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {attendanceLogs
                                            .filter(log => 
                                                log.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                                log.date.includes(searchTerm)
                                            )
                                            .map((log) => (
                                            <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                                                {activeTab === 'master' && (
                                                    <td className="px-8 py-5">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-black text-xs">
                                                                {log.employee_name?.[0]}
                                                            </div>
                                                            <div>
                                                                <p className="font-black text-slate-900 text-sm">{log.employee_name}</p>
                                                                <p className="text-[10px] font-bold text-slate-400 uppercase">{log.employee_id_display}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                )}
                                                <td className="px-8 py-5">
                                                    <span className="text-sm font-bold text-slate-600">{log.date}</span>
                                                </td>
                                                <td className="px-8 py-5">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-black text-slate-900">
                                                            {log.clock_in ? new Date(`2000-01-01T${log.clock_in}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                                        </span>
                                                        <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                                                            <MapPin size={10} /> Verified
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5">
                                                    <span className="text-sm font-black text-slate-900">
                                                        {log.clock_out ? new Date(`2000-01-01T${log.clock_out}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-5">
                                                    <span className="text-sm font-black text-slate-700">
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
                                                <td className="px-8 py-5">
                                                    <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tight shadow-sm border ${
                                                        log.status === 'PRESENT' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                        log.status === 'LATE' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                                        'bg-rose-50 text-rose-600 border-rose-100'
                                                    }`}>
                                                        {log.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                        {attendanceLogs.length === 0 && (
                                            <tr>
                                                <td colSpan="6" className="px-8 py-12 text-center text-slate-400 font-bold italic">
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
            <div className="lg:col-span-5">
                <form onSubmit={handleSave} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl space-y-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-2xl font-black text-slate-900">Shift Settings</h3>
                        <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white">
                            <MapPin size={20} />
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* Address Search Helper */}
                        <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 mb-6">
                            <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2 block">Locate Office by Address</label>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    placeholder="Enter office address..."
                                    value={addressSearch}
                                    onChange={(e) => setAddressSearch(e.target.value)}
                                    className="flex-1 px-4 py-2 bg-white border border-indigo-200 rounded-xl font-bold text-sm outline-none focus:border-indigo-500"
                                />
                                <button 
                                    type="button"
                                    onClick={handleAddressSearch}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-black text-xs hover:bg-indigo-700 transition-all"
                                >
                                    Locate
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Shift Start</label>
                                <input 
                                    type="time" 
                                    value={shift.start_time}
                                    onChange={(e) => setShift({ ...shift, start_time: e.target.value })}
                                    className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Shift End</label>
                                <input 
                                    type="time" 
                                    value={shift.end_time}
                                    onChange={(e) => setShift({ ...shift, end_time: e.target.value })}
                                    className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none"
                                />
                            </div>
                        </div>

                        <div className="pt-4 border-t border-slate-50">
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Office Latitude</label>
                                    <input 
                                        type="number" step="any"
                                        value={shift.office_latitude}
                                        onChange={(e) => setShift({ ...shift, office_latitude: e.target.value })}
                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl font-bold outline-none text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Office Longitude</label>
                                    <input 
                                        type="number" step="any"
                                        value={shift.office_longitude}
                                        onChange={(e) => setShift({ ...shift, office_longitude: e.target.value })}
                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl font-bold outline-none text-sm"
                                    />
                                </div>
                            </div>
                            
                            <button 
                                type="button"
                                onClick={setOfficeToCurrent}
                                className="w-full py-4 bg-rose-600 text-white rounded-2xl font-black text-sm hover:bg-rose-700 transition-all shadow-lg shadow-rose-200 mb-4 flex items-center justify-center gap-2"
                            >
                                <MapPin size={18} />
                                Use My Current Location
                            </button>

                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Allowed Geofence Radius (Meters)</label>
                                <input 
                                    type="number" 
                                    value={shift.allowed_radius_meters}
                                    onChange={(e) => setShift({ ...shift, allowed_radius_meters: e.target.value })}
                                    className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    <button 
                        type="submit"
                        disabled={loading}
                        className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black shadow-xl hover:bg-rose-600 transition-all transform hover:-translate-y-1"
                    >
                        {loading ? "Saving..." : "Save Geofence Configuration"}
                    </button>
                </form>
            </div>

            <div className="lg:col-span-7">
                <div className="bg-white p-4 rounded-[2.5rem] border border-slate-100 shadow-xl h-full min-h-[500px] overflow-hidden relative group">
                    <iframe 
                        width="100%" 
                        height="100%" 
                        frameBorder="0" 
                        style={{ border: 0, borderRadius: '1.5rem' }}
                        src={addressSearch 
                            ? `https://maps.google.com/maps?q=${encodeURIComponent(addressSearch)}&t=&z=15&ie=UTF8&iwloc=&output=embed`
                            : `https://maps.google.com/maps?q=${shift.office_latitude},${shift.office_longitude}&t=&z=15&ie=UTF8&iwloc=&output=embed`
                        }
                        allowFullScreen
                    ></iframe>
                    
                    {/* Floating Info Overlay */}
                    <div className="absolute bottom-8 left-8 right-8 bg-white/95 backdrop-blur-xl p-6 rounded-3xl border border-white shadow-2xl transform translate-y-2 group-hover:translate-y-0 transition-all duration-500">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center">
                                    <MapPin size={24} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Office Boundary Preview</p>
                                    <p className="text-lg font-black text-slate-900">Radius: {shift.allowed_radius_meters}m</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Live Status</p>
                                <p className="text-xs font-black text-emerald-600 flex items-center gap-1 justify-end">
                                    <CheckCircle2 size={12} /> Active Geofence
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
