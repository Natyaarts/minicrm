import React, { useState, useEffect } from 'react';
import { Clock, Play, Square, Coffee, Download, Calendar as CalIcon } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import FaceSelfieCapture from './FaceSelfieCapture';

const EmployeeSelfService = () => {
    const { user } = useAuth();
    const [currentTime, setCurrentTime] = useState(new Date());
    const [attendance, setAttendance] = useState(null);
    const [balances, setBalances] = useState([]);
    const [payslips, setPayslips] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const fetchData = async () => {
        try {
            // Fetch today's attendance
            const attRes = await api.get('hrms/attendance/');
            const todayStr = new Date().toISOString().split('T')[0];
            const attData = attRes.data.results || attRes.data || [];
            // Filter to only show the current user's attendance for today
            const todayAtt = attData.find(a => a.date === todayStr && a.user_id === user?.id);
            setAttendance(todayAtt || null);

            // Fetch balances
            const balRes = await api.get('leaves/balances/');
            const balData = balRes.data.results || balRes.data || [];
            // Filter to only show the current user's balances
            setBalances(balData.filter(b => b.user_id === user?.id));

            // Fetch payslips
            const payRes = await api.get('payroll/payslips/');
            const payData = payRes.data.results || payRes.data || [];
            // Filter to only show the current user's payslips
            setPayslips(payData.filter(p => p.user_id === user?.id).slice(0, 3));
        } catch (err) {
            console.error("Failed to fetch employee data", err);
        } finally {
            setLoading(false);
        }
    };

    const [showSelfieCapture, setShowSelfieCapture] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const handleClock = async (action, photoData = null) => {
        try {
            if (action === 'in') {
                if (!photoData) {
                    setShowSelfieCapture(true);
                    return;
                }
                setShowSelfieCapture(false);
                
                navigator.geolocation.getCurrentPosition(async (pos) => {
                    const payload = { 
                        latitude: pos.coords.latitude, 
                        longitude: pos.coords.longitude,
                        photo: photoData 
                    };
                    await api.post('hrms/attendance/clock_in/', payload);
                    fetchData();
                    alert("Clocked in successfully!");
                }, async (err) => {
                    await api.post('hrms/attendance/clock_in/', { 
                        latitude: 0, 
                        longitude: 0,
                        photo: photoData
                    });
                    fetchData();
                    alert("Clocked in (Geolocation disabled)");
                });
            } else {
                await api.post('hrms/attendance/clock_out/');
                fetchData();
                alert("Clocked out successfully!");
            }
        } catch (err) {
            console.error("Clock In Error:", err);
            alert(err.response?.data?.error || `Clock-in failed: ${err.message || 'Unknown error'}`);
        }
    };

    const downloadPayslip = async (id, empId, month, year) => {
        try {
            const response = await api.get(`payroll/payslips/${id}/download_pdf/`, {
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Payslip_${empId}_${month}_${year}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            alert("Failed to download PDF");
        }
    };

    if (loading) return <div className="h-28 flex justify-center items-center bg-slate-900 rounded-xl mb-6 text-white border border-slate-800"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div></div>;

    const isClockedIn = attendance && attendance.clock_in && !attendance.clock_out;
    const isClockedOut = attendance && attendance.clock_out;

    return (
        <>
            {showSelfieCapture && (
                <FaceSelfieCapture 
                    onCapture={(photoData) => handleClock('in', photoData)}
                    onCancel={() => setShowSelfieCapture(false)}
                />
            )}
            <div className="bg-slate-900 rounded-xl p-5 text-white shadow-sm mb-6 relative border border-slate-800">
                <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Clock Section */}
                <div className="flex flex-col justify-center items-start lg:border-r border-slate-800 lg:pr-6">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Your Work Hub</h2>
                    <h3 className="text-2xl font-bold tabular-nums tracking-tight mb-0.5">
                        {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </h3>
                    <p className="text-xs text-slate-400 font-medium mb-4">{currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                    
                    {isClockedIn && attendance?.clock_in && (
                        <div className="mb-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 w-full">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Session Duration</p>
                            <div className="flex items-center gap-3">
                                <div className="text-base font-bold text-white">{attendance.clock_in.split('.')[0]}</div>
                                <div className="h-3 w-[1px] bg-slate-700"></div>
                                <div className="text-base font-bold text-emerald-400 tabular-nums">
                                    {(() => {
                                        const now = new Date();
                                        const [h, m, s] = attendance.clock_in.split(':');
                                        const start = new Date();
                                        start.setHours(h, m, s);
                                        const diff = Math.max(0, now - start);
                                        const hh = Math.floor(diff / 3600000);
                                        const mm = Math.floor((diff % 3600000) / 60000);
                                        const ss = Math.floor((diff % 60000) / 1000);
                                        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}

                    {isClockedOut ? (
                        <div className="flex items-center gap-1.5 text-emerald-400 font-semibold bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20 text-xs">
                            <Clock size={16} /> Shift Completed for Today
                        </div>
                    ) : (
                        <button 
                            onClick={() => handleClock(isClockedIn ? 'out' : 'in')}
                            className={`flex items-center justify-center w-full md:w-auto gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-colors shadow-sm ${
                                isClockedIn 
                                    ? 'bg-rose-600 hover:bg-rose-700 text-white' 
                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            }`}
                        >
                            {isClockedIn ? <Square fill="currentColor" size={14} /> : <Play fill="currentColor" size={14} />}
                            {isClockedIn ? 'Clock Out' : 'Clock In Now'}
                        </button>
                    )}
                </div>

                {/* Balances Section */}
                <div className="flex flex-col justify-center lg:border-r border-slate-800 lg:pr-6">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5"><Coffee size={14}/> Leave Balances</h3>
                    <div className="space-y-2">
                        {balances.map((bal, idx) => (
                            <div key={idx} className="bg-slate-800/40 p-2.5 rounded-lg flex justify-between items-center border border-slate-800/60">
                                <span className="font-medium text-xs text-slate-300">{bal.leave_type_name}</span>
                                <span className="font-semibold text-white text-[10px] px-2 py-0.5 bg-slate-700 rounded-md">{bal.remaining_days} left</span>
                            </div>
                        ))}
                        {balances.length === 0 && <p className="text-xs text-slate-500 italic bg-slate-800/20 p-3 rounded-lg border border-slate-800/40">No balances setup.</p>}
                    </div>
                </div>

                {/* Payslips Section */}
                <div className="flex flex-col justify-center">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5"><CalIcon size={14}/> Recent Payslips</h3>
                    <div className="space-y-2">
                        {payslips.map((slip, idx) => (
                            <div key={idx} className="bg-slate-800/40 border border-slate-800/60 p-2.5 rounded-lg flex justify-between items-center hover:bg-slate-800/80 transition-colors">
                                <div>
                                    <p className="font-semibold text-xs text-white">Month {slip.month}, {slip.year}</p>
                                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">Net: ₹{Number(slip.net_salary).toLocaleString()}</p>
                                </div>
                                <button 
                                    onClick={() => downloadPayslip(slip.id, slip.employee, slip.month, slip.year)}
                                    className="p-1.5 bg-indigo-600 text-white hover:bg-indigo-500 rounded-md transition-colors shadow-sm"
                                >
                                    <Download size={14} />
                                </button>
                            </div>
                        ))}
                        {payslips.length === 0 && <p className="text-xs text-slate-500 italic bg-slate-800/20 p-3 rounded-lg border border-slate-800/40">No payslips generated yet.</p>}
                    </div>
                </div>
            </div>
        </div>
        </>
    );
};

export default EmployeeSelfService;
