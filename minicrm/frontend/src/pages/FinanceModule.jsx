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
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 mt-8">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight">Finance <span className="text-emerald-600">Manager.</span></h1>
                    <p className="text-slate-500 font-bold mt-1">Track company spending and profitability.</p>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setShowModal(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-emerald-600 transition-all shadow-xl hover:-translate-y-1"
                    >
                        <Plus size={18} /> Log Expense
                    </button>
                </div>
            </div>

            {/* Financial Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
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
                        className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm relative overflow-hidden group"
                    >
                        <div className={`absolute -right-4 -top-4 w-24 h-24 bg-${stat.color}-50 rounded-full blur-2xl group-hover:bg-${stat.color}-100 transition-colors`}></div>
                        <div className="relative z-10">
                            <div className={`w-12 h-12 bg-${stat.color}-50 text-${stat.color}-600 rounded-2xl flex items-center justify-center mb-4`}>
                                <stat.icon size={24} />
                            </div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                            <h3 className="text-3xl font-black text-slate-900">₹{Number(stat.value).toLocaleString()}</h3>
                            <div className={`mt-2 flex items-center gap-1 text-[10px] font-black ${stat.trend === 'UP' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {stat.trend === 'UP' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                This Month
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Spending Breakdown */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/20 rounded-full blur-3xl"></div>
                        <h3 className="text-xl font-black mb-6 flex items-center gap-2"><PieChart size={20}/> Spending Breakdown</h3>
                        <div className="space-y-6">
                            {summary.breakdown.map((item, idx) => (
                                <div key={idx}>
                                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                                        <span>{item.name}</span>
                                        <span className="text-white">₹{item.value.toLocaleString()}</span>
                                    </div>
                                    <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                                        <motion.div 
                                            initial={{ width: 0 }}
                                            animate={{ width: `${(item.value / summary.monthly_total) * 100}%` }}
                                            className="bg-emerald-500 h-full rounded-full"
                                        />
                                    </div>
                                </div>
                            ))}
                            {summary.breakdown.length === 0 && <p className="text-slate-500 italic text-sm py-4">No expenses recorded yet.</p>}
                        </div>
                    </div>

                    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                        <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2"><CreditCard size={20}/> Payment Methods</h3>
                        <div className="flex flex-wrap gap-2">
                            {['CASH', 'BANK_TRANSFER', 'CARD', 'UPI'].map(method => (
                                <span key={method} className="px-4 py-2 bg-slate-50 text-slate-600 rounded-xl text-xs font-black border border-slate-100 uppercase tracking-tight">
                                    {method.replace('_', ' ')}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Expense List */}
                <div className="lg:col-span-8">
                    <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
                        <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
                            <h3 className="text-xl font-black text-slate-900">Recent Transactions</h3>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input 
                                    type="text" 
                                    placeholder="Search expenses..." 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-emerald-300 transition-all w-64"
                                />
                            </div>
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-slate-50/50">
                                        <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Transaction</th>
                                        <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Category</th>
                                        <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Date</th>
                                        <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Amount</th>
                                        <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {expenses
                                        .filter(exp => exp.title.toLowerCase().includes(searchTerm.toLowerCase()))
                                        .map(exp => (
                                        <tr key={exp.id} className="hover:bg-slate-50/50 transition-colors group">
                                            <td className="px-8 py-5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
                                                        <FileText size={18} />
                                                    </div>
                                                    <div>
                                                        <p className="font-black text-slate-900 text-sm">{exp.title}</p>
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase">{exp.payment_method}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-5">
                                                <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase border border-emerald-100">
                                                    {exp.category_name}
                                                </span>
                                            </td>
                                            <td className="px-8 py-5">
                                                <div className="flex items-center gap-2 text-slate-500 font-bold text-sm">
                                                    <Calendar size={14} />
                                                    {exp.date}
                                                </div>
                                            </td>
                                            <td className="px-8 py-5">
                                                <span className="text-sm font-black text-rose-600">- ₹{Number(exp.amount).toLocaleString()}</span>
                                            </td>
                                            <td className="px-8 py-5 text-right">
                                                <button 
                                                    onClick={() => handleDeleteExpense(exp.id)}
                                                    className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {expenses.length === 0 && (
                                        <tr>
                                            <td colSpan="5" className="px-8 py-12 text-center text-slate-400 font-bold italic">No expenses recorded. Click 'Log Expense' to start.</td>
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
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-[2.5rem] p-10 w-full max-w-xl shadow-2xl relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full blur-3xl -z-10"></div>
                            
                            <h2 className="text-3xl font-black text-slate-900 mb-8">Record New Expense</h2>
                            
                            <form onSubmit={handleCreateExpense} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Title / Vendor</label>
                                    <input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold focus:border-emerald-500 outline-none transition-all" placeholder="e.g., Office Electricity Bill" />
                                </div>
                                
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Category</label>
                                    <select required value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold focus:border-emerald-500 outline-none transition-all appearance-none">
                                        <option value="">Select Category</option>
                                        {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Amount (₹)</label>
                                    <input type="number" required value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold focus:border-emerald-500 outline-none transition-all" placeholder="0.00" />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Date</label>
                                    <input type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold focus:border-emerald-500 outline-none transition-all" />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Payment Method</label>
                                    <select value={formData.payment_method} onChange={e => setFormData({...formData, payment_method: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold focus:border-emerald-500 outline-none transition-all appearance-none">
                                        <option value="BANK_TRANSFER">Bank Transfer</option>
                                        <option value="CASH">Cash</option>
                                        <option value="CARD">Card</option>
                                        <option value="UPI">UPI</option>
                                    </select>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Notes</label>
                                    <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold focus:border-emerald-500 outline-none transition-all min-h-[100px]" placeholder="Add any details..." />
                                </div>

                                <div className="md:col-span-2 flex gap-4 pt-4">
                                    <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-4 text-slate-500 font-bold hover:bg-slate-50 rounded-2xl transition-all">Cancel</button>
                                    <button type="submit" disabled={loading} className="flex-1 py-4 bg-emerald-600 text-white font-black rounded-2xl shadow-xl shadow-emerald-200 hover:-translate-y-1 transition-all">
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
