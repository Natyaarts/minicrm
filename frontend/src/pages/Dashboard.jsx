import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Users, GraduationCap, DollarSign, ArrowUpRight, ArrowDownRight, Calendar, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import EmployeeSelfService from '../components/EmployeeSelfService';

function Dashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();

    // Redirect Students to Student Portal if they land on the main dashboard
    useEffect(() => {
        if (user && user.role === 'STUDENT') {
            navigate('/student');
        }
    }, [user, navigate]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        students: 0,
        batches: 0,
        revenue: 0,
        leads: 0,
        revenue_distribution: [],
        this_month_expected: 0,
        this_month_collected: 0,
        this_month_due: 0
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
                    leads: 0,
                    revenue_distribution: res.data.revenue_distribution || [],
                    this_month_expected: res.data.this_month_expected || 0,
                    this_month_collected: res.data.this_month_collected || 0,
                    this_month_due: res.data.this_month_due || 0,
                    expenses: res.data.expenses || 0
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

    const canViewAnalytics = user?.role === 'SUPER_ADMIN' || user?.is_superuser || user?.permissions?.ANALYTICS?.view;
    const canViewSales = user?.role === 'SUPER_ADMIN' || user?.is_superuser || user?.permissions?.SALES?.view;
    const canViewAdmin = user?.role === 'SUPER_ADMIN' || user?.is_superuser || user?.permissions?.ADMIN?.view;
    const canViewAcademic = user?.role === 'SUPER_ADMIN' || user?.is_superuser || user?.permissions?.ACADEMIC?.view;

    const statCards = [
        { title: 'Total Students', value: stats.students.toLocaleString(), icon: Users, color: 'from-blue-500 to-blue-600', show: true },
        { title: 'Active Batches', value: stats.batches.toLocaleString(), icon: GraduationCap, color: 'from-indigo-500 to-indigo-600', show: true },
        { title: 'Total Revenue', value: `₹${stats.revenue.toLocaleString()}`, icon: DollarSign, color: 'from-emerald-500 to-emerald-600', show: canViewAnalytics },
        { title: 'Expected (This Month)', value: `₹${stats.this_month_expected.toLocaleString()}`, icon: DollarSign, color: 'from-sky-500 to-sky-600', show: canViewAnalytics },
        { title: 'Collected (This Month)', value: `₹${stats.this_month_collected.toLocaleString()}`, icon: DollarSign, color: 'from-teal-500 to-teal-600', show: canViewAnalytics },
        { title: 'Pending Dues (This Month)', value: `₹${stats.this_month_due.toLocaleString()}`, icon: DollarSign, color: 'from-amber-500 to-amber-600', show: canViewAnalytics },
        { title: 'Monthly Expenses', value: `₹${(stats.expenses || 0).toLocaleString()}`, icon: TrendingUp, color: 'from-rose-500 to-rose-600', show: canViewAnalytics },
        { title: 'Net Profit', value: `₹${(stats.revenue - (stats.expenses || 0)).toLocaleString()}`, icon: DollarSign, color: 'from-indigo-500 to-indigo-600', show: canViewAnalytics },
        { title: 'New Leads', value: (stats.leads || 0).toLocaleString(), icon: TrendingUp, color: 'from-pink-500 to-pink-600', show: canViewSales },
    ].filter(card => card.show);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fadeIn px-2 md:px-0">
            {user?.role !== 'STUDENT' && <EmployeeSelfService />}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">System <span className="text-indigo-600">Overview</span></h1>
                    <p className="text-slate-500 mt-1 text-xs font-normal">
                        {user?.first_name ? `Welcome back, ${user.first_name}!` : "Performance metrics and active records."}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    {canViewSales && (
                        <button
                            onClick={handleExport}
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 text-xs font-semibold shadow-sm hover:bg-slate-50 transition-colors"
                        >
                            <Download size={14} /> Export
                        </button>
                    )}
                    {canViewSales && (
                        <button
                            onClick={() => navigate('/sales')}
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                        >
                            + New Admission
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {statCards.map((card, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex items-center gap-4 cursor-default"
                    >
                        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${card.color} flex items-center justify-center text-white shrink-0 shadow-sm`}>
                            <card.icon size={20} />
                        </div>
                        <div>
                            <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-0.5">{card.title}</p>
                            <h3 className="text-lg font-bold text-slate-800">{card.value}</h3>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-base font-bold text-slate-800 mb-4">Program Distribution</h3>
                    <div className="space-y-4">
                        {distribution.map((item, i) => (
                            <div key={i}>
                                <div className="flex justify-between text-[10px] mb-1 font-semibold text-slate-500 uppercase tracking-wider">
                                    <span>{item.name || "Uncategorized"}</span>
                                    <span className="text-indigo-600">{item.value} Students</span>
                                </div>
                                <div className="w-full bg-slate-50 h-1.5 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${(item.value / stats.students) * 100}%` }}
                                        className="bg-indigo-600 h-full rounded-full"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    {canViewAnalytics && stats.revenue_distribution?.length > 0 && (
                        <div className="mt-8 pt-6 border-t border-slate-100">
                            <h3 className="text-base font-bold text-slate-800 mb-4">Revenue Breakdown</h3>
                            <div className="space-y-4">
                                {stats.revenue_distribution.map((item, i) => (
                                    <div key={i}>
                                        <div className="flex justify-between text-[10px] mb-1 font-semibold text-slate-500 uppercase tracking-wider">
                                            <span>{item.name || "General"}</span>
                                            <span className="text-emerald-600">₹{item.value?.toLocaleString()}</span>
                                        </div>
                                        <div className="w-full bg-slate-50 h-1.5 rounded-full overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${(item.value / stats.revenue) * 100}%` }}
                                                className="bg-emerald-500 h-full rounded-full shadow-sm"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-slate-900 p-5 rounded-xl text-white shadow-sm relative border border-slate-800 overflow-hidden">
                    <h3 className="text-base font-bold mb-4">Quick Actions</h3>
                    <div className="space-y-2 relative z-10">
                        {canViewAnalytics && (
                            <button
                                onClick={() => navigate('/analytics')}
                                className="w-full py-2.5 px-4 bg-slate-800/40 hover:bg-slate-800/80 rounded-lg flex items-center justify-between group transition-all border border-slate-800/60"
                            >
                                <span className="font-semibold text-xs text-slate-200">Deep Analytics</span>
                                <ArrowUpRight size={14} className="text-indigo-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            </button>
                        )}
                        {canViewAdmin && (
                            <button
                                onClick={() => navigate('/users')}
                                className="w-full py-2.5 px-4 bg-slate-800/40 hover:bg-slate-800/80 rounded-lg flex items-center justify-between group transition-all border border-slate-800/60"
                            >
                                <span className="font-semibold text-xs text-slate-200">Manage Staff</span>
                                <ArrowUpRight size={14} className="text-indigo-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            </button>
                        )}
                        {canViewAcademic && (
                            <button
                                onClick={() => navigate('/academic')}
                                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 rounded-lg flex items-center justify-between group transition-all mt-2"
                            >
                                <span className="font-semibold text-xs text-white">Academic Setup</span>
                                <ArrowUpRight size={14} className="text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            </button>
                        )}
                        {!canViewAnalytics && !canViewAdmin && !canViewAcademic && (
                            <div className="text-slate-500 italic text-xs py-2">
                                Contact admin for additional permissions.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
