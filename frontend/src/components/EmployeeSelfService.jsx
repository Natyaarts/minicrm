import React, { useState, useEffect } from 'react';
import { Clock, Play, Square, Coffee, Download, Calendar as CalIcon } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

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

    useEffect(() => {
        fetchData();
    }, []);

    const handleClock = async (action) => {
        try {
            if (action === 'in') {
                navigator.geolocation.getCurrentPosition(async (pos) => {
                    const payload = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
                    await api.post('hrms/attendance/clock_in/', payload);
                    fetchData();
                    alert("Clocked in successfully!");
                }, async (err) => {
                    await api.post('hrms/attendance/clock_in/', { latitude: 0, longitude: 0 });
                    fetchData();
                    alert("Clocked in (Geolocation disabled)");
                });
            } else {
                await api.post('hrms/attendance/clock_out/');
                fetchData();
                alert("Clocked out successfully!");
            }
        } catch (err) {
            alert(err.response?.data?.error || "Clock action failed");
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

    if (loading) return <div className="h-32 flex justify-center items-center bg-slate-900 rounded-[2.5rem] mb-8 text-white"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>;

    const isClockedIn = attendance && attendance.clock_in && !attendance.clock_out;
    const isClockedOut = attendance && attendance.clock_out;

    return (
        <div className="bg-gradient-to-r from-slate-900 to-indigo-900 rounded-[2.5rem] p-6 md:p-8 text-white shadow-2xl mb-8 relative">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl"></div>
            
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Clock Section */}
                <div className="flex flex-col justify-center items-start lg:border-r border-white/10 lg:pr-8">
                    <h2 className="text-sm font-black uppercase tracking-widest text-indigo-300 mb-2">Your Work Hub</h2>
                    <h3 className="text-4xl font-black tabular-nums tracking-tight mb-1">
                        {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </h3>
                    <p className="text-slate-300 font-bold mb-6">{currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                    
                    {isClockedIn && attendance?.clock_in && (
                        <div className="mb-6 p-4 bg-white/5 rounded-2xl border border-white/10 w-full md:w-auto">
                            <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1">Session Duration</p>
                            <div className="flex items-center gap-4">
                                <div className="text-xl font-black text-white">{attendance.clock_in.split('.')[0]}</div>
                                <div className="h-4 w-[1px] bg-white/20"></div>
                                <div className="text-xl font-black text-emerald-400 tabular-nums">
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
                        <div className="flex items-center gap-2 text-emerald-400 font-black bg-emerald-400/10 px-4 py-2 rounded-xl border border-emerald-400/20">
                            <Clock size={18} /> Shift Completed for Today
                        </div>
                    ) : (
                        <button 
                            onClick={() => handleClock(isClockedIn ? 'out' : 'in')}
                            className={`flex items-center justify-center w-full md:w-auto gap-3 px-8 py-4 rounded-2xl font-black text-lg transition-all shadow-xl hover:-translate-y-1 ${
                                isClockedIn 
                                    ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/30' 
                                    : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/30'
                            }`}
                        >
                            {isClockedIn ? <Square fill="currentColor" size={20} /> : <Play fill="currentColor" size={20} />}
                            {isClockedIn ? 'Clock Out' : 'Clock In Now'}
                        </button>
                    )}
                </div>

                {/* Balances Section */}
                <div className="flex flex-col justify-center lg:border-r border-white/10 lg:pr-8">
                    <h3 className="text-sm font-black uppercase tracking-widest text-indigo-300 mb-4 flex items-center gap-2"><Coffee size={16}/> Leave Balances</h3>
                    <div className="space-y-3">
                        {balances.map((bal, idx) => (
                            <div key={idx} className="bg-white/10 p-3 rounded-xl flex justify-between items-center backdrop-blur-sm">
                                <span className="font-bold text-sm text-slate-200">{bal.leave_type_name}</span>
                                <span className="font-black text-white px-2 py-1 bg-white/20 rounded-lg">{bal.remaining_days} left</span>
                            </div>
                        ))}
                        {balances.length === 0 && <p className="text-sm text-slate-400 italic bg-white/5 p-4 rounded-xl">No balances setup.</p>}
                    </div>
                </div>

                {/* Payslips Section */}
                <div className="flex flex-col justify-center">
                    <h3 className="text-sm font-black uppercase tracking-widest text-indigo-300 mb-4 flex items-center gap-2"><CalIcon size={16}/> Recent Payslips</h3>
                    <div className="space-y-3">
                        {payslips.map((slip, idx) => (
                            <div key={idx} className="bg-white/5 border border-white/10 p-3 rounded-xl flex justify-between items-center hover:bg-white/10 transition-colors">
                                <div>
                                    <p className="font-black text-sm text-white">Month {slip.month}, {slip.year}</p>
                                    <p className="text-xs text-indigo-200 font-bold">Net: ₹{Number(slip.net_salary).toLocaleString()}</p>
                                </div>
                                <button 
                                    onClick={() => downloadPayslip(slip.id, slip.employee, slip.month, slip.year)}
                                    className="p-2.5 bg-indigo-500 text-white hover:bg-indigo-400 rounded-lg transition-colors shadow-lg"
                                >
                                    <Download size={16} />
                                </button>
                            </div>
                        ))}
                        {payslips.length === 0 && <p className="text-sm text-slate-400 italic bg-white/5 p-4 rounded-xl">No payslips generated yet.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EmployeeSelfService;
