import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Users, GraduationCap, DollarSign, ArrowUpRight, ArrowDownRight, Calendar } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

function Dashboard() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        students: 0,
        batches: 0,
        revenue: 0,
        leads: 0 // Placeholder as we don't have leads endpoint yet
    });
    const [distribution, setDistribution] = useState([]);
    const [programData, setProgramData] = useState([]);

    const [studentProfile, setStudentProfile] = useState(null);
    const [lmsData, setLmsData] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                if (user?.role === 'STUDENT') {
                    try {
                        const profileRes = await api.get('students/');
                        const studentData = profileRes.data.results || profileRes.data;
                        if (studentData.length > 0) {
                            setStudentProfile(studentData[0]);
                        }
                    } catch (err) {
                        console.error('Failed to fetch student profile:', err);
                    }

                    try {
                        const lmsRes = await api.get('integrations/details/');
                        setLmsData(lmsRes.data);
                    } catch (err) {
                        console.warn('LMS integrations skipped or 404:', err);
                    }
                } else {
                    // Fetch high-performance aggregated stats
                    const res = await api.get('dashboard-stats/');
                    const data = res.data;

                    const total = data.students || 1;
                    const finalDist = data.distribution.map(d => ({
                        ...d,
                        percentage: Math.round((d.value / total) * 100)
                    }));

                    setStats({
                        students: data.students,
                        batches: data.batches,
                        revenue: data.revenue,
                        leads: 0
                    });
                    setDistribution(finalDist);
                    setProgramData(finalDist);
                }
            } catch (err) {
                console.error("Dashboard data fetch failed", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [user]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (user?.role === 'STUDENT') {
        return (
            <div className="space-y-8 animate-fadeIn">
                <div className="flex justify-between items-end">
                    <div>
                        <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                            Student Dashboard
                        </h1>
                        <p className="text-slate-500 mt-2 font-medium">
                            Welcome back, {user?.first_name || 'Student'}. Here is your progress overview.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {/* Welcome Card */}
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-6">
                                <GraduationCap size={32} />
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900 mb-2">{studentProfile?.course_name || 'Enrollment Pending'}</h3>
                            <p className="text-slate-500">{studentProfile?.program_name}</p>
                        </div>
                        <div className="mt-8 pt-6 border-t border-slate-50 flex justify-between items-center text-sm">
                            <span className="text-slate-400">Batch Type</span>
                            <span className="font-bold text-indigo-600">{studentProfile?.batch_name || 'Not Assigned'}</span>
                        </div>
                    </div>

                    {/* Progress Card */}
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                        <h3 className="text-lg font-bold text-slate-800 mb-6">Curriculum Progress</h3>
                        <div className="flex items-center justify-between mb-4">
                            <div className="text-5xl font-extrabold text-blue-600">{lmsData?.course_progress || 0}%</div>
                        </div>
                        <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden shadow-inner">
                            <div
                                className="bg-blue-500 h-full rounded-full transition-all duration-1000"
                                style={{ width: `${lmsData?.course_progress || 0}%` }}
                            ></div>
                        </div>
                        <p className="mt-6 text-sm text-slate-500 leading-relaxed font-medium italic">
                            Keep going! You're making steady progress through your modules.
                        </p>
                    </div>

                    {/* Quick Fee Summary */}
                    <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-8 rounded-3xl shadow-xl text-white">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-white/20 rounded-lg">
                                <DollarSign size={20} />
                            </div>
                            <span className="font-bold uppercase tracking-wider text-xs opacity-90">Fee Status</span>
                        </div>
                        <div className="space-y-6">
                            <div>
                                <p className="text-teal-100 text-xs font-bold uppercase mb-1">Total Fee Paid</p>
                                <p className="text-3xl font-black">₹{lmsData?.fee_details?.paid_fee?.toLocaleString() || 0}</p>
                            </div>
                            <div className="pt-4 border-t border-white/10">
                                <p className="text-teal-100 text-xs font-bold uppercase mb-1">Outstanding Balance</p>
                                <p className="text-xl font-bold text-teal-200">₹{lmsData?.fee_details?.due_fee?.toLocaleString() || 0}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2 group-hover:bg-indigo-500/20 transition-all duration-500"></div>
                    <div className="max-w-xl relative z-10">
                        <h2 className="text-3xl font-bold mb-4">Ready to continue learning?</h2>
                        <p className="text-slate-400 text-lg mb-8 leading-relaxed">
                            Dive back into your latest session or check for new resources uploaded by your mentor.
                        </p>
                        <button
                            onClick={() => window.location.href = '/student'}
                            className="px-8 py-4 bg-white text-slate-900 rounded-2xl font-bold hover:bg-slate-100 transition-all shadow-xl shadow-black/20"
                        >
                            Go to Student Portal
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const statCards = [
        { title: 'Total Students', value: stats.students.toLocaleString(), icon: Users, color: 'from-blue-500 to-blue-600' },
        { title: 'Active Batches', value: stats.batches.toLocaleString(), icon: GraduationCap, color: 'from-violet-500 to-purple-600' },
        { title: 'Total Revenue', value: `₹${stats.revenue.toLocaleString()}`, icon: DollarSign, color: 'from-emerald-500 to-teal-600' },
        { title: 'New Leads', value: '0', icon: TrendingUp, color: 'from-orange-500 to-pink-600' },
    ];

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: {
            y: 0,
            opacity: 1,
            transition: {
                type: "spring",
                stiffness: 100
            }
        }
    };

    return (
        <div className="space-y-8 pb-10">
            {/* key metrics header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-600">
                        Dashboard
                    </h1>
                    <p className="text-slate-500 mt-2 font-medium">
                        Welcome back, {user?.first_name || 'Admin'}. Here is your real-time overview.
                    </p>
                </div>
                <div className="flex flex-wrap gap-3 w-full md:w-auto">
                    <button className="flex-1 md:flex-none px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 text-sm font-semibold shadow-sm hover:bg-slate-50 transition-colors">
                        Export Report
                    </button>
                    <button className="flex-1 md:flex-none px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-200 transition-all">
                        + New Campaign
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
            >
                {statCards.map((item, index) => (
                    <motion.div
                        key={index}
                        variants={itemVariants}
                        className="relative overflow-hidden bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl transition-shadow group"
                    >
                        <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity`}>
                            <item.icon size={64} />
                        </div>

                        <div className='flex items-center gap-4 mb-4'>
                            <div className={`p-3 rounded-2xl bg-gradient-to-br ${item.color} text-white shadow-lg`}>
                                <item.icon size={24} />
                            </div>
                        </div>

                        <div>
                            <p className="text-slate-500 text-sm font-bold uppercase tracking-wider mb-1">{item.title}</p>
                            <h3 className="text-3xl font-extrabold text-slate-900">{item.value}</h3>
                        </div>
                    </motion.div>
                ))}
            </motion.div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Program Distribution Chart */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm min-h-[400px]"
                >
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h3 className="text-xl font-bold text-slate-900">Program Enrollment</h3>
                            <p className="text-sm text-slate-500 mt-1">Student distribution across programs</p>
                        </div>
                    </div>

                    {/* CSS-only Bar Chart for Programs */}
                    {programData.length > 0 ? (
                        <div className="h-64 w-full flex items-end justify-start md:justify-around gap-6 md:gap-4 px-2 overflow-x-auto custom-scrollbar pt-4 pb-2">
                            {programData.map((prog, i) => {
                                // Normalize height: max value gets 100%
                                const maxVal = Math.max(...programData.map(p => p.value));
                                const heightPct = (prog.value / maxVal) * 100;

                                // Generate consistent color based on index
                                const colors = ['from-indigo-500 to-violet-500', 'from-pink-500 to-rose-500', 'from-blue-500 to-cyan-500', 'from-emerald-500 to-green-500'];
                                const colorClass = colors[i % colors.length];

                                return (
                                    <div key={i} className="w-24 flex flex-col items-center group cursor-pointer">
                                        <div className="relative w-full h-64 flex items-end bg-slate-50 rounded-t-xl overflow-hidden">
                                            <div
                                                className={`w-full mx-auto rounded-t-lg bg-gradient-to-t ${colorClass} transition-all duration-1000 shadow-lg`}
                                                style={{ height: `${heightPct}%`, width: '40%' }}
                                            >
                                            </div>
                                            <div className="absolute top-0 w-full text-center mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <span className="bg-slate-800 text-white text-xs py-1 px-2 rounded font-bold">{prog.value}</span>
                                            </div>
                                        </div>
                                        <p className="mt-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-center truncate w-full" title={prog.name}>{prog.name}</p>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="h-64 flex items-center justify-center text-slate-400 font-medium">
                            No enrollment data available yet.
                        </div>
                    )}
                </motion.div>

                {/* Side Panel: Donut Chart */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 }}
                    className="space-y-8"
                >
                    {/* Batch Distribution Card */}
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm h-full">
                        <h3 className="text-xl font-bold text-slate-900 mb-6">Distribution</h3>

                        {distribution.length > 0 ? (
                            <div className="flex flex-col items-center justify-center">
                                <div className="relative w-48 h-48">
                                    <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                                        <path className="text-slate-100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />

                                        {/* Simple visualization for the largest segment since SVG arcs are complex without math library */}
                                        {/* Showing the largest program as a segment for visual effect */}
                                        <path
                                            className="text-indigo-600 transition-all duration-1000"
                                            strokeDasharray={`${distribution[0]?.percentage || 0}, 100`}
                                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="4"
                                            strokeLinecap="round"
                                        />
                                    </svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="text-3xl font-extrabold text-slate-800">{distribution[0]?.percentage}%</span>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase max-w-[80px] truncate text-center">{distribution[0]?.name}</span>
                                    </div>
                                </div>

                                <div className="mt-8 space-y-3 w-full">
                                    {distribution.map((d, i) => (
                                        <div key={i} className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-3 h-3 rounded-full ${i === 0 ? 'bg-indigo-600' : 'bg-slate-300'}`}></span>
                                                <span className="text-sm font-medium text-slate-600 truncate max-w-[120px]">{d.name}</span>
                                            </div>
                                            <span className="text-sm font-bold text-slate-900">{d.percentage}%</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="h-48 flex items-center justify-center text-slate-400 font-medium">
                                No data to display.
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>

            {/* Recent Batches List instead of fake events */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                <h3 className="text-xl font-bold text-slate-900 mb-6">Recent Activity</h3>
                <div className="text-center py-8 text-slate-500">
                    <p>System initialized. Waiting for new admissions and batch creations.</p>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
