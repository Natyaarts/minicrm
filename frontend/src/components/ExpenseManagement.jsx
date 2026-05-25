import React, { useState, useEffect } from 'react';
import { Receipt, CheckCircle, XCircle, Clock, Plus, X, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api/axios';

const ExpenseManagement = ({ authUser, employees }) => {
    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [newExpense, setNewExpense] = useState({ amount: '', category: 'Travel', description: '' });

    useEffect(() => {
        fetchExpenses();
    }, []);

    const fetchExpenses = async () => {
        setLoading(true);
        try {
            const res = await api.get('hrms/expenses/');
            setExpenses(res.data.results || res.data || []);
        } catch (error) {
            console.error("Failed to fetch expenses", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitExpense = async (e) => {
        e.preventDefault();
        try {
            // Need the auth user's employee ID. 
            // In a real app, the backend should auto-assign the user based on request.user,
            // but we'll try to find the employee profile from the `employees` prop.
            const empProfile = employees.find(emp => emp.user_id === authUser.id || emp.display_username === authUser.username);
            if (!empProfile && authUser.role !== 'SUPER_ADMIN') {
                alert("You don't have an employee profile.");
                return;
            }

            const payload = {
                ...newExpense,
                employee: empProfile ? empProfile.id : employees[0].id // Fallback for Super Admins testing
            };

            await api.post('hrms/expenses/', payload);
            setShowModal(false);
            setNewExpense({ amount: '', category: 'Travel', description: '' });
            fetchExpenses();
        } catch (error) {
            console.error("Failed to submit expense", error);
            alert("Failed to submit expense.");
        }
    };

    const updateStatus = async (id, status) => {
        try {
            await api.patch(`hrms/expenses/${id}/`, { status });
            fetchExpenses();
        } catch (error) {
            alert("Failed to update status");
        }
    };

    const getStatusBadge = (status) => {
        switch(status) {
            case 'APPROVED': return <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-1"><CheckCircle size={12}/> Approved</span>;
            case 'REJECTED': return <span className="px-2.5 py-1 bg-rose-50 text-rose-600 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-1"><XCircle size={12}/> Rejected</span>;
            case 'PAID': return <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-1"><CheckCircle size={12}/> Paid</span>;
            default: return <span className="px-2.5 py-1 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-1"><Clock size={12}/> Pending</span>;
        }
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex justify-between items-center bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                    <h2 className="text-lg font-bold text-slate-800">Expenses & Reimbursements</h2>
                    <p className="text-xs text-slate-500 mt-1">Submit bills and track reimbursement status.</p>
                </div>
                <button onClick={() => setShowModal(true)} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-sm hover:bg-emerald-700 transition-all flex items-center gap-2">
                    <Plus size={16} /> Submit Expense
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center p-10"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div></div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                                <th className="p-4">Employee</th>
                                <th className="p-4">Category</th>
                                <th className="p-4">Amount</th>
                                <th className="p-4">Date Submitted</th>
                                <th className="p-4">Status</th>
                                {(authUser.role === 'SUPER_ADMIN' || authUser.role === 'ADMIN') && <th className="p-4 text-right">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="text-sm">
                            {expenses.length === 0 ? (
                                <tr><td colSpan="6" className="text-center p-8 text-slate-400">No expenses submitted yet.</td></tr>
                            ) : (
                                expenses.map(exp => (
                                    <tr key={exp.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                        <td className="p-4 font-bold text-slate-800">{exp.employee_name}</td>
                                        <td className="p-4 font-medium text-slate-600">
                                            <div className="flex items-center gap-2">
                                                <Receipt size={14} className="text-slate-400" />
                                                {exp.category}
                                            </div>
                                        </td>
                                        <td className="p-4 font-black text-slate-900">${exp.amount}</td>
                                        <td className="p-4 text-slate-500 font-medium">{new Date(exp.submitted_date).toLocaleDateString()}</td>
                                        <td className="p-4">{getStatusBadge(exp.status)}</td>
                                        {(authUser.role === 'SUPER_ADMIN' || authUser.role === 'ADMIN') && (
                                            <td className="p-4 text-right space-x-2">
                                                {exp.status === 'PENDING' && (
                                                    <>
                                                        <button onClick={() => updateStatus(exp.id, 'APPROVED')} className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg hover:bg-emerald-100 transition-colors">Approve</button>
                                                        <button onClick={() => updateStatus(exp.id, 'REJECTED')} className="text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1 rounded-lg hover:bg-rose-100 transition-colors">Reject</button>
                                                    </>
                                                )}
                                                {exp.status === 'APPROVED' && (
                                                    <button onClick={() => updateStatus(exp.id, 'PAID')} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg hover:bg-indigo-100 transition-colors">Mark Paid</button>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Submit Expense Modal */}
            <AnimatePresence>
                {showModal && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden flex flex-col">
                            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <h3 className="text-xl font-black text-slate-900">Submit Expense</h3>
                                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-rose-500 transition-colors"><X size={20} /></button>
                            </div>
                            <div className="p-8">
                                <form onSubmit={handleSubmitExpense} className="space-y-5">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Amount ($)</label>
                                            <input required type="number" step="0.01" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-400 focus:bg-white text-sm font-medium" value={newExpense.amount} onChange={e => setNewExpense({...newExpense, amount: e.target.value})} placeholder="0.00" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Category</label>
                                            <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-400 focus:bg-white text-sm font-medium" value={newExpense.category} onChange={e => setNewExpense({...newExpense, category: e.target.value})}>
                                                <option>Travel</option>
                                                <option>Meals</option>
                                                <option>Internet/Office</option>
                                                <option>Other</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description / Reason</label>
                                        <textarea required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-400 focus:bg-white text-sm font-medium resize-none h-24" value={newExpense.description} onChange={e => setNewExpense({...newExpense, description: e.target.value})} placeholder="Describe the expense..." />
                                    </div>
                                    <div className="pt-4 border-t border-slate-100 flex justify-end">
                                        <button type="submit" className="bg-emerald-600 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-sm shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center gap-2">
                                            <Upload size={16} /> Submit
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ExpenseManagement;
