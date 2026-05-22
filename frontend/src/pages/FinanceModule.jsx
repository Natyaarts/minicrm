import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { 
    Wallet, 
    ArrowUpRight, 
    ArrowDownRight, 
    Plus, 
    Search, 
    Filter, 
    Download,
    CreditCard,
    DollarSign,
    PieChart,
    Calendar,
    FileText,
    TrendingDown,
    Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const FinanceModule = () => {
    const [loading, setLoading] = useState(true);
    const [expenses, setExpenses] = useState([]);
    const [categories, setCategories] = useState([]);
    const [summary, setSummary] = useState({ monthly_total: 0, all_time_total: 0, breakdown: [] });
    const [revenue, setRevenue] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        category: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        payment_method: 'BANK_TRANSFER',
        description: ''
    });

    const fetchData = async () => {
        setLoading(true);
        try {
            const [expRes, catRes, sumRes, revRes] = await Promise.all([
                api.get('finance/expenses/'),
                api.get('finance/categories/'),
                api.get('finance/expenses/summary/'),
                api.get('dashboard-stats/')
            ]);
            
            setExpenses(expRes.data.results || expRes.data || []);
            setCategories(catRes.data.results || catRes.data || []);
            setSummary(sumRes.data);
            setRevenue(revRes.data.revenue || 0);
        } catch (err) {
            console.error("Failed to fetch finance data", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleCreateExpense = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.post('finance/expenses/', formData);
            setShowModal(false);
            setFormData({
                title: '',
                category: '',
                amount: '',
                date: new Date().toISOString().split('T')[0],
                payment_method: 'BANK_TRANSFER',
                description: ''
            });
            fetchData();
        } catch (err) {
            alert("Failed to record expense");
            setLoading(false);
        }
    };

    const handleDeleteExpense = async (id) => {
        if (!window.confirm("Delete this expense record?")) return;
        try {
            await api.delete(`finance/expenses/${id}/`);
            fetchData();
        } catch (err) {
            alert("Failed to delete");
        }
    };

    const netProfit = revenue - summary.monthly_total;

    return (
        <div className="min-h-screen bg-[#FDFCFB] pb-20 px-4 md:px-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Finance Manager</h1>
                    <p className="text-slate-500 text-sm mt-1">Track company spending and profitability.</p>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setShowModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg font-semibold text-sm hover:bg-slate-900 transition-all shadow-sm"
                    >
                        <Plus size={16} /> Log Expense
                    </button>
                </div>
            </div>

            {/* Financial Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {[
                    { label: 'Total Revenue', value: revenue, icon: DollarSign, color: 'emerald', trend: 'UP' },
                    { label: 'Total Expenses', value: summary.monthly_total, icon: TrendingDown, color: 'rose', trend: 'DOWN' },
                    { label: 'Net Profit', value: netProfit, icon: Wallet, color: 'indigo', trend: netProfit >= 0 ? 'UP' : 'DOWN' }
                ].map((stat, idx) => (
                    <motion.div 
                        key={idx}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group"
                    >
                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-4">
                                <div className={`w-10 h-10 bg-${stat.color}-50 text-${stat.color}-600 rounded-lg flex items-center justify-center`}>
                                    <stat.icon size={20} />
                                </div>
                                <div className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded bg-${stat.color}-50 ${stat.trend === 'UP' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {stat.trend === 'UP' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                    This Month
                                </div>
                            </div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{stat.label}</p>
                            <h3 className="text-2xl font-bold text-slate-800">₹{Number(stat.value).toLocaleString()}</h3>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Spending Breakdown */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-slate-800 p-6 rounded-xl text-white shadow-sm relative overflow-hidden">
                        <h3 className="text-lg font-bold mb-5 flex items-center gap-2"><PieChart size={18}/> Spending Breakdown</h3>
                        <div className="space-y-5">
                            {summary.breakdown.map((item, idx) => (
                                <div key={idx}>
                                    <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1.5">
                                        <span>{item.name}</span>
                                        <span className="text-white">₹{item.value.toLocaleString()}</span>
                                    </div>
                                    <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                        <motion.div 
                                            initial={{ width: 0 }}
                                            animate={{ width: `${(item.value / summary.monthly_total) * 100}%` }}
                                            className="bg-emerald-500 h-full rounded-full"
                                        />
                                    </div>
                                </div>
                            ))}
                            {summary.breakdown.length === 0 && <p className="text-slate-400 text-sm py-2">No expenses recorded yet.</p>}
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><CreditCard size={18}/> Payment Methods</h3>
                        <div className="flex flex-wrap gap-2">
                            {['CASH', 'BANK_TRANSFER', 'CARD', 'UPI'].map(method => (
                                <span key={method} className="px-3 py-1 bg-slate-50 text-slate-600 rounded-md text-xs font-semibold border border-slate-200 uppercase">
                                    {method.replace('_', ' ')}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Expense List */}
                <div className="lg:col-span-8">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
                            <h3 className="text-lg font-bold text-slate-800">Recent Transactions</h3>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input 
                                    type="text" 
                                    placeholder="Search expenses..." 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium outline-none focus:border-emerald-400 transition-all w-64"
                                />
                            </div>
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-slate-50">
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Transaction</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Category</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Date</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Amount</th>
                                        <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {expenses
                                        .filter(exp => exp.title.toLowerCase().includes(searchTerm.toLowerCase()))
                                        .map(exp => (
                                        <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                                                        <FileText size={16} />
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-slate-800 text-sm">{exp.title}</p>
                                                        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{exp.payment_method}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-md text-[10px] font-semibold uppercase border border-emerald-100">
                                                    {exp.category_name}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-1.5 text-slate-600 font-medium text-sm">
                                                    <Calendar size={14} />
                                                    {exp.date}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-sm font-semibold text-rose-600">- ₹{Number(exp.amount).toLocaleString()}</span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button 
                                                    onClick={() => handleDeleteExpense(exp.id)}
                                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {expenses.length === 0 && (
                                        <tr>
                                            <td colSpan="5" className="px-6 py-8 text-center text-slate-500 text-sm">No expenses recorded. Click 'Log Expense' to start.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal */}
            <AnimatePresence>
                {showModal && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-xl p-6 w-full max-w-xl shadow-xl border border-slate-200"
                        >
                            <h2 className="text-xl font-bold text-slate-800 mb-6">Record New Expense</h2>
                            
                            <form onSubmit={handleCreateExpense} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Title / Vendor</label>
                                    <input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm font-medium focus:border-emerald-400 outline-none" placeholder="e.g., Office Electricity Bill" />
                                </div>
                                
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Category</label>
                                    <select required value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm font-medium focus:border-emerald-400 outline-none">
                                        <option value="">Select Category</option>
                                        {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Amount (₹)</label>
                                    <input type="number" required value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm font-medium focus:border-emerald-400 outline-none" placeholder="0.00" />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Date</label>
                                    <input type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm font-medium focus:border-emerald-400 outline-none" />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Payment Method</label>
                                    <select value={formData.payment_method} onChange={e => setFormData({...formData, payment_method: e.target.value})} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm font-medium focus:border-emerald-400 outline-none">
                                        <option value="BANK_TRANSFER">Bank Transfer</option>
                                        <option value="CASH">Cash</option>
                                        <option value="CARD">Card</option>
                                        <option value="UPI">UPI</option>
                                    </select>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Notes</label>
                                    <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm font-medium focus:border-emerald-400 outline-none min-h-[100px]" placeholder="Add any details..." />
                                </div>

                                <div className="md:col-span-2 flex gap-3 pt-4">
                                    <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2 border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 rounded-lg text-sm transition-all">Cancel</button>
                                    <button type="submit" disabled={loading} className="flex-1 py-2 bg-slate-800 text-white font-semibold rounded-lg shadow-sm hover:bg-slate-900 transition-all text-sm disabled:opacity-50">
                                        {loading ? 'Processing...' : 'Save Transaction'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default FinanceModule;
