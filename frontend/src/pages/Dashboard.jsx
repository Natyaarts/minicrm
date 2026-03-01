import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Users, GraduationCap, DollarSign, ArrowUpRight, ArrowDownRight, Calendar, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

function Dashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        students: 0,
        batches: 0,
        revenue: 0,
        leads: 0
    });
    const [distribution, setDistribution] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await api.get('dashboard-stats/');
                setStats({
                    students: res.data.students || 0,
                    batches: res.data.batches || 0,
                    revenue: res.data.revenue || 0,
                    leads: 0
                });
                setDistribution(res.data.distribution || []);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        if (user) fetchData();
    }, [user]);

    const handleExport = async () => {
        try {
            const res = await api.get('students/export_csv/', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'student_report.csv');
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            console.error("Export failed", err);
            alert("Export failed. Please check if you have permissions.");
        }
    };

    const statCards = [
        { title: 'Total Students', value: stats.students.toLocaleString(), icon: Users, color: 'from-blue-500 to-blue-600' },
        { title: 'Active Batches', value: stats.batches.toLocaleString(), icon: GraduationCap, color: 'from-indigo-500 to-indigo-600' },
        { title: 'Total Revenue', value: `₹${stats.revenue.toLocaleString()}`, icon: DollarSign, color: 'from-emerald-500 to-emerald-600' },
        { title: 'New Leads', value: stats.leads.toLocaleString(), icon: TrendingUp, color: 'from-pink-500 to-pink-600' },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fadeIn">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">System <span className="text-indigo-600">Overview</span></h1>
                    <p className="text-slate-500 mt-1 font-medium italic">
                        {user?.first_name ? `Welcome back, ${user.first_name}!` : "Performance metrics and active records."}
                    </p>
                </div>
                <div className="flex flex-wrap gap-3 w-full md:w-auto">
                    <button
                        onClick={handleExport}
                        className="flex-1 md:flex-none px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 text-sm font-semibold shadow-sm hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                    >
                        <Download size={16} /> Export Report
                    </button>
                    <button
                        onClick={() => navigate('/campaigns')}
                        className="flex-1 md:flex-none px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-200 transition-all"
                    >
                        + New Campaign
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {statCards.map((card, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all group cursor-default"
                    >
                        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${card.color} flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform shadow-lg`}>
                            <card.icon size={24} />
                        </div>
                        <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">{card.title}</p>
                        <h3 className="text-2xl font-black text-slate-900">{card.value}</h3>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                    <h3 className="text-xl font-bold text-slate-900 mb-6">Program Distribution</h3>
                    <div className="space-y-6">
                        {distribution.map((item, i) => (
                            <div key={i}>
                                <div className="flex justify-between text-sm mb-2 font-bold text-slate-600 uppercase tracking-widest text-[10px]">
                                    <span>{item.name || "Uncategorized"}</span>
                                    <span className="text-indigo-600">{item.value} Students</span>
                                </div>
                                <div className="w-full bg-slate-50 h-2 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${(item.value / stats.students) * 100}%` }}
                                        className="bg-indigo-600 h-full rounded-full"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl"></div>
                    <h3 className="text-xl font-bold mb-6">Quick Actions</h3>
                    <div className="space-y-4 relative z-10">
                        <button
                            onClick={() => navigate('/analytics')}
                            className="w-full py-4 px-6 bg-white/10 hover:bg-white/20 rounded-2xl flex items-center justify-between group transition-all"
                        >
                            <span className="font-bold">Deep Analytics</span>
                            <ArrowUpRight className="text-indigo-400 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                        </button>
                        <button
                            onClick={() => navigate('/users')}
                            className="w-full py-4 px-6 bg-white/10 hover:bg-white/20 rounded-2xl flex items-center justify-between group transition-all"
                        >
                            <span className="font-bold">Manage Staff</span>
                            <ArrowUpRight className="text-indigo-400 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                        </button>
                        <button
                            onClick={() => navigate('/academic')}
                            className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-700 rounded-2xl flex items-center justify-between group transition-all mt-4"
                        >
                            <span className="font-bold">Academic Setup</span>
                            <ArrowUpRight className="text-white group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
