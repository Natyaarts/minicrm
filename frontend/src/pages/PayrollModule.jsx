import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { 
    Wallet, 
    CreditCard, 
    TrendingUp, 
    Calendar,
    Download,
    CheckCircle2,
    Clock,
    Plus,
    Search,
    ChevronLeft,
    ChevronRight,
    DollarSign,
    AlertCircle,
    FileText,
    Settings,
    Trash2,
    Edit2,
    Power
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

const PayrollModule = () => {
    const { user: authUser } = useAuth();
    const [loading, setLoading] = useState(false);
    const [payslips, setPayslips] = useState([]);
    const [salaryStructures, setSalaryStructures] = useState([]);
    const [adjustments, setAdjustments] = useState([]);
    const [loans, setLoans] = useState([]);
    const [activeTab, setActiveTab] = useState('payslips');
    const [searchTerm, setSearchTerm] = useState('');
    const [stats, setStats] = useState({
        totalDisbursed: 0,
        pendingSlips: 0,
        avgSalary: 0
    });

    const [genModal, setGenModal] = useState({ show: false, month: new Date().getMonth() + 1, year: new Date().getFullYear() });
    const [adjModal, setAdjModal] = useState({ show: false, employee: '', type: 'BONUS', amount: '', reason: '', month: new Date().getMonth() + 1, year: new Date().getFullYear() });
    const [loanModal, setLoanModal] = useState({ show: false, employee: '', amount: '', emi: '', reason: '', isOneTime: true });
    const [employees, setEmployees] = useState([]);

    const fetchData = async () => {
        setLoading(true);
        console.log("Fetching payroll data for tab:", activeTab);
        try {
            if (activeTab === 'payslips') {
                const res = await api.get('payroll/payslips/');
                const data = res.data.results || res.data || [];
                console.log("Payslips received:", data);
                setPayslips(data);
                
                const disbursed = data.filter(p => p.status === 'PAID').reduce((sum, p) => sum + Number(p.net_salary), 0);
                const pending = data.filter(p => p.status === 'PENDING').length;
                setStats({
                    totalDisbursed: disbursed,
                    pendingSlips: pending,
                    avgSalary: data.length ? disbursed / data.length : 0
                });
            } else if (activeTab === 'structures') {
                const res = await api.get('payroll/salary-structures/');
                const data = res.data.results || res.data || [];
                console.log("Structures received:", data);
                setSalaryStructures(data);
            } else if (activeTab === 'adjustments') {
                const res = await api.get('payroll/adjustments/');
                const data = res.data.results || res.data || [];
                console.log("Adjustments received:", data);
                setAdjustments(data);
            } else if (activeTab === 'loans') {
                const res = await api.get('payroll/loans/');
                const data = res.data.results || res.data || [];
                setLoans(data);
            }
        } catch (err) {
            console.error("Failed to fetch payroll data", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    const handleGenerate = async () => {
        setLoading(true);
        try {
            await api.post('payroll/payslips/generate_all/', {
                month: genModal.month,
                year: genModal.year
            });
            setGenModal({ ...genModal, show: false });
            fetchData();
            alert("Payslips generated successfully!");
        } catch (err) {
            alert(err.response?.data?.error || "Failed to generate payslips");
        } finally {
            setLoading(false);
        }
    };

    const [editStruct, setEditStruct] = useState(null);

    const handleUpdateStruct = async () => {
        setLoading(true);
        try {
            await api.put(`payroll/salary-structures/${editStruct.id}/`, editStruct);
            setEditStruct(null);
            fetchData();
            alert("Salary structure updated!");
        } catch (err) {
            alert("Update failed");
        } finally {
            setLoading(false);
        }
    };

    const fetchEmployees = async () => {
        try {
            const res = await api.get('hrms/employees/');
            setEmployees(res.data.results || res.data || []);
        } catch (err) {
            console.error("Failed to fetch employees", err);
        }
    };

    useEffect(() => {
        if (adjModal.show || loanModal.show) fetchEmployees();
    }, [adjModal.show, loanModal.show]);

    const handleCreateAdjustment = async () => {
        setLoading(true);
        try {
            await api.post('payroll/adjustments/', {
                employee: adjModal.employee,
                adjustment_type: adjModal.type,
                amount: adjModal.amount,
                reason: adjModal.reason,
                month: adjModal.month,
                year: adjModal.year
            });
            setAdjModal({ ...adjModal, show: false, employee: '', amount: '', reason: '' });
            fetchData();
            alert("Adjustment added!");
        } catch (err) {
            alert("Failed to add adjustment");
        } finally {
            setLoading(false);
        }
    };

    const handleCreateLoan = async () => {
        setLoading(true);
        const finalEmi = loanModal.isOneTime ? loanModal.amount : loanModal.emi;
        try {
            await api.post('payroll/loans/', {
                employee: loanModal.employee,
                loan_amount: loanModal.amount,
                monthly_repayment: finalEmi,
                balance_amount: loanModal.amount,
                reason: loanModal.reason
            });
            setLoanModal({ show: false, employee: '', amount: '', emi: '', reason: '', isOneTime: true });
            fetchData();
            alert("Advance/Loan recorded!");
        } catch (err) {
            alert("Failed to add loan");
        } finally {
            setLoading(false);
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
            console.error("Download failed", err);
            alert("Failed to download PDF");
        }
    };

    const handleDeleteLoan = async (id) => {
        if (!window.confirm("Are you sure you want to delete this loan/advance record?")) return;
        setLoading(true);
        try {
            await api.delete(`payroll/loans/${id}/`);
            fetchData();
            alert("Record deleted");
        } catch (err) {
            alert("Failed to delete record");
        } finally {
            setLoading(false);
        }
    };

    const handleToggleLoanStatus = async (loan) => {
        const action = loan.is_active ? "deactivate" : "activate";
        if (!window.confirm(`Are you sure you want to ${action} this loan?`)) return;
        setLoading(true);
        try {
            await api.patch(`payroll/loans/${loan.id}/`, { is_active: !loan.is_active });
            fetchData();
            alert(`Loan ${action}d successfully`);
        } catch (err) {
            alert("Failed to update status");
        } finally {
            setLoading(false);
        }
    };

    const markAsPaid = async (id) => {
        if (!window.confirm("Mark this payslip as PAID? This will record the payment date.")) return;
        setLoading(true);
        try {
            await api.post(`payroll/payslips/${id}/mark_as_paid/`);
            fetchData();
            alert("Status updated to PAID!");
        } catch (err) {
            console.error("Payment update failed", err);
            alert("Failed to update status");
        } finally {
            setLoading(false);
        }
    };

    const renderStats = () => (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {[
                { label: 'Total Disbursed', value: `₹${stats.totalDisbursed.toLocaleString()}`, icon: Wallet, color: 'rose' },
                { label: 'Pending Slips', value: stats.pendingSlips, icon: Clock, color: 'amber' },
                { label: 'Average Net Pay', value: `₹${Math.round(stats.avgSalary).toLocaleString()}`, icon: TrendingUp, color: 'emerald' }
            ].map((stat, idx) => (
                <motion.div 
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="bg-white/70 backdrop-blur-md p-6 rounded-[2rem] border border-white shadow-sm"
                >
                    <div className="flex items-center gap-4">
                        <div className={`p-4 bg-${stat.color}-50 text-${stat.color}-600 rounded-2xl`}>
                            <stat.icon size={24} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                            <h3 className="text-2xl font-black text-slate-900">{stat.value}</h3>
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    );

    return (
        <div className="min-h-screen bg-[#FDFCFB] pb-20 px-4 md:px-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 mt-8">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight">Payroll <span className="text-rose-600">Engine.</span></h1>
                    <p className="text-slate-500 font-bold mt-1">Manage employee compensation and payslips.</p>
                </div>

                {authUser?.role === 'SUPER_ADMIN' && (
                    <div className="flex gap-3">
                        <button 
                            onClick={() => setGenModal({ ...genModal, show: true })}
                            className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-rose-600 transition-all shadow-xl hover:-translate-y-1"
                        >
                            <Plus size={18} /> Generate Slips
                        </button>
                        {activeTab === 'adjustments' && (
                            <button 
                                onClick={() => setAdjModal({ ...adjModal, show: true })}
                                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl font-black text-sm hover:bg-emerald-700 transition-all shadow-xl hover:-translate-y-1"
                            >
                                <Plus size={18} /> Add Incentive/Adj
                            </button>
                        )}
                        {activeTab === 'loans' && (
                            <button 
                                onClick={() => setLoanModal({ ...loanModal, show: true })}
                                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 transition-all shadow-xl hover:-translate-y-1"
                            >
                                <Plus size={18} /> Record Loan
                            </button>
                        )}
                    </div>
                )}
            </div>

            {authUser?.role === 'SUPER_ADMIN' && renderStats()}

            {/* Tabs */}
            <div className="flex gap-2 mb-8 bg-slate-100/50 p-1.5 rounded-2xl w-fit border border-slate-200">
                {[
                    { id: 'payslips', label: 'Monthly Slips', icon: FileText },
                    { id: 'structures', label: 'Salary Structures', icon: Settings, adminOnly: true },
                    { id: 'adjustments', label: 'Adjustments & Incentives', icon: DollarSign, adminOnly: true },
                    { id: 'loans', label: 'Loans & Advances', icon: CreditCard, adminOnly: true },
                ].filter(tab => !tab.adminOnly || authUser?.role === 'SUPER_ADMIN').map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${
                            activeTab === tab.id 
                                ? 'bg-white text-slate-900 shadow-sm' 
                                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                        }`}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Table Area */}
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
                <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
                    <h3 className="text-xl font-black text-slate-900">
                        {activeTab === 'payslips' ? "Historical Payslips" : 
                         activeTab === 'structures' ? "Configured Salary Components" : 
                         activeTab === 'adjustments' ? "Monthly Adjustments & Incentives" : 
                         "Employee Loans & Advances"}
                    </h3>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={fetchData}
                            className="p-2.5 bg-slate-50 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-slate-100"
                            title="Refresh Data"
                        >
                            <motion.div whileTap={{ rotate: 180 }}>
                                <Settings size={18} />
                            </motion.div>
                        </button>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input 
                                type="text" 
                                placeholder="Search..." 
                                className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-rose-300 transition-all w-64"
                            />
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50">
                                <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Employee</th>
                                {activeTab === 'payslips' ? (
                                    <>
                                        <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Period</th>
                                        <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Paid Days</th>
                                        <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">LOP</th>
                                        <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Net Salary</th>
                                        <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Status</th>
                                        <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Actions</th>
                                    </>
                                ) : activeTab === 'structures' ? (
                                    <>
                                        <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Base Salary</th>
                                        <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Total Allowances</th>
                                        <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">PF / Tax</th>
                                        <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Edit</th>
                                    </>
                                ) : activeTab === 'adjustments' ? (
                                    <>
                                        <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Period</th>
                                        <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Type</th>
                                        <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Amount</th>
                                        <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Reason</th>
                                    </>
                                ) : (
                                    <>
                                        <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Loan Amount</th>
                                        <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Monthly EMI</th>
                                        <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Balance</th>
                                        <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Status</th>
                                        <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Actions</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {activeTab === 'payslips' ? (
                                payslips.map((slip) => (
                                    // ... existing slip row code ...
                                    <tr key={slip.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-8 py-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-xs font-bold">
                                                    {slip.employee_name?.[0]}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-900">{slip.employee_name}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase">{slip.employee_id}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5">
                                            <span className="text-sm font-bold text-slate-600">{new Date(slip.year, slip.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                                        </td>
                                        <td className="px-8 py-5 text-sm font-bold text-slate-600">{slip.paid_days} / {slip.total_working_days}</td>
                                        <td className={`px-8 py-5 text-sm font-bold ${Number(slip.lop_deduction) > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                                            -₹{Number(slip.lop_deduction).toLocaleString()}
                                        </td>
                                        <td className="px-8 py-5 text-sm font-black text-slate-900">₹{Number(slip.net_salary).toLocaleString()}</td>
                                        <td className="px-8 py-5">
                                            <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tight shadow-sm border ${
                                                slip.status === 'PAID' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                                            }`}>
                                                {slip.status}
                                            </span>
                                        </td>
                                        <td className="px-8 py-5 text-right">
                                            <div className="flex justify-end gap-2">
                                                {slip.status === 'PENDING' && authUser?.role === 'SUPER_ADMIN' && (
                                                    <button 
                                                        onClick={() => markAsPaid(slip.id)}
                                                        className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors"
                                                        title="Mark as Paid"
                                                    >
                                                        <CheckCircle2 size={16} />
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={() => downloadPayslip(slip.id, slip.employee_id, slip.month, slip.year)}
                                                    className="p-2 bg-slate-50 text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
                                                >
                                                    <Download size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : activeTab === 'structures' ? (
                                salaryStructures.map((struct) => (
                                    <tr key={struct.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-8 py-5 text-sm font-bold text-slate-900">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold">
                                                    {struct.employee_name?.[0]}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-900">{struct.employee_name}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Policy Configured</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5 text-sm font-black text-slate-900">₹{Number(struct.base_salary).toLocaleString()}</td>
                                        <td className="px-8 py-5 text-sm font-bold text-emerald-600">
                                            +₹{(Number(struct.hra) + Number(struct.conveyance) + Number(struct.medical) + Number(struct.special_allowance)).toLocaleString()}
                                        </td>
                                        <td className="px-8 py-5 text-sm font-bold text-rose-600">
                                            -₹{(Number(struct.provident_fund) + Number(struct.professional_tax)).toLocaleString()}
                                        </td>
                                        <td className="px-8 py-5 text-right">
                                            <button 
                                                onClick={() => setEditStruct(struct)}
                                                className="p-2 bg-slate-50 text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
                                            >
                                                <Settings size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : activeTab === 'adjustments' ? (
                                adjustments.map((adj) => (
                                    <tr key={adj.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-8 py-5 text-sm font-bold text-slate-900">{adj.employee_name}</td>
                                        <td className="px-8 py-5">
                                            <span className="text-sm font-bold text-slate-600">{new Date(adj.year, adj.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                                        </td>
                                        <td className="px-8 py-5">
                                            <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tight ${
                                                adj.adjustment_type === 'BONUS' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                                            }`}>
                                                {adj.adjustment_type}
                                            </span>
                                        </td>
                                        <td className={`px-8 py-5 text-sm font-black ${adj.adjustment_type === 'BONUS' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {adj.adjustment_type === 'BONUS' ? '+' : '-'}₹{Number(adj.amount).toLocaleString()}
                                        </td>
                                        <td className="px-8 py-5 text-sm font-bold text-slate-400 italic">"{adj.reason}"</td>
                                    </tr>
                                ))
                            ) : (
                                loans.map((loan) => (
                                    <tr key={loan.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-8 py-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
                                                    {loan.employee_name?.[0]}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-900">{loan.employee_name}</p>
                                                    <p className="text-[10px] font-bold text-slate-400">LOAN-REF-{loan.id}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5 text-sm font-black text-slate-900">₹{Number(loan.loan_amount).toLocaleString()}</td>
                                        <td className="px-8 py-5 text-sm font-bold text-rose-600">₹{Number(loan.monthly_repayment).toLocaleString()}/mo</td>
                                        <td className="px-8 py-5">
                                            <div className="flex flex-col gap-1">
                                                <p className="text-sm font-black text-indigo-600">₹{Number(loan.balance_amount).toLocaleString()}</p>
                                                <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div 
                                                        className="h-full bg-indigo-500 transition-all" 
                                                        style={{ width: `${((Number(loan.loan_amount) - Number(loan.balance_amount)) / Number(loan.loan_amount)) * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5">
                                            <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tight ${
                                                loan.is_active ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-slate-50 text-slate-400 border border-slate-100'
                                            }`}>
                                                {loan.is_active ? 'Active' : 'Cleared'}
                                            </span>
                                        </td>
                                        <td className="px-8 py-5 text-right">
                                            <button 
                                                onClick={() => handleToggleLoanStatus(loan)}
                                                className={`p-2 rounded-xl transition-colors ${loan.is_active ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                                                title={loan.is_active ? "Deactivate Loan" : "Activate Loan"}
                                            >
                                                <Power size={16} />
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteLoan(loan.id)}
                                                className="p-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Adjustments Modal */}
            <AnimatePresence>
                {adjModal.show && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
                            onClick={() => setAdjModal({ ...adjModal, show: false })}
                        />
                        <motion.div 
                            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                            className="bg-white rounded-[2.5rem] p-10 w-full max-w-md relative z-10 shadow-2xl"
                        >
                            <h3 className="text-2xl font-black text-slate-900 mb-6">Add Adjustment</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Select Employee</label>
                                    <select 
                                        value={adjModal.employee}
                                        onChange={(e) => setAdjModal({ ...adjModal, employee: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none"
                                    >
                                        <option value="">Choose Employee...</option>
                                        {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name || emp.display_username} ({emp.employee_id})</option>)}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Type</label>
                                        <select 
                                            value={adjModal.type}
                                            onChange={(e) => setAdjModal({ ...adjModal, type: e.target.value })}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none"
                                        >
                                            <option value="BONUS">Incentive</option>
                                            <option value="DEDUCTION">Deduction</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Amount</label>
                                        <input 
                                            type="number" 
                                            value={adjModal.amount}
                                            onChange={(e) => setAdjModal({ ...adjModal, amount: e.target.value })}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Reason</label>
                                    <input 
                                        type="text" 
                                        placeholder="Performance Bonus, Fine, etc."
                                        value={adjModal.reason}
                                        onChange={(e) => setAdjModal({ ...adjModal, reason: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none"
                                    />
                                </div>
                                <button 
                                    onClick={handleCreateAdjustment}
                                    disabled={loading || !adjModal.employee || !adjModal.amount}
                                    className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black hover:bg-emerald-600 transition-all shadow-xl mt-4"
                                >
                                    {loading ? "Adding..." : "Add Adjustment"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Edit Salary Structure Modal */}
            <AnimatePresence>
                {editStruct && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }} 
                            animate={{ opacity: 1 }} 
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
                            onClick={() => setEditStruct(null)}
                        />
                        <motion.div 
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="bg-white rounded-[2.5rem] p-8 w-full max-w-2xl relative z-10 shadow-2xl max-h-[90vh] overflow-y-auto"
                        >
                            <div className="flex justify-between items-center mb-8">
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900">Salary Components</h3>
                                    <p className="text-sm font-bold text-slate-500">Employee: {editStruct.employee_name}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Net Take Home</p>
                                    <h4 className="text-2xl font-black text-emerald-600">
                                        ₹{(Number(editStruct.base_salary) + Number(editStruct.hra) + Number(editStruct.conveyance) + Number(editStruct.medical) + Number(editStruct.special_allowance) - Number(editStruct.provident_fund) - Number(editStruct.professional_tax)).toLocaleString()}
                                    </h4>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    <h5 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> Fixed Earnings
                                    </h5>
                                    
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Basic Salary</label>
                                        <input 
                                            type="number" 
                                            value={editStruct.base_salary}
                                            onChange={(e) => setEditStruct({...editStruct, base_salary: e.target.value})}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:border-emerald-300 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">HRA (House Rent)</label>
                                        <input 
                                            type="number" 
                                            value={editStruct.hra}
                                            onChange={(e) => setEditStruct({...editStruct, hra: e.target.value})}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:border-emerald-300 transition-all"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Medical</label>
                                            <input 
                                                type="number" 
                                                value={editStruct.medical}
                                                onChange={(e) => setEditStruct({...editStruct, medical: e.target.value})}
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:border-emerald-300 transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Conveyance</label>
                                            <input 
                                                type="number" 
                                                value={editStruct.conveyance}
                                                onChange={(e) => setEditStruct({...editStruct, conveyance: e.target.value})}
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:border-emerald-300 transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Special Allowance</label>
                                        <input 
                                            type="number" 
                                            value={editStruct.special_allowance}
                                            onChange={(e) => setEditStruct({...editStruct, special_allowance: e.target.value})}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:border-emerald-300 transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <h5 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-rose-500 rounded-full" /> Statutory Deductions
                                    </h5>
                                    
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Provident Fund (PF)</label>
                                        <input 
                                            type="number" 
                                            value={editStruct.provident_fund}
                                            onChange={(e) => setEditStruct({...editStruct, provident_fund: e.target.value})}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:border-rose-300 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Professional Tax</label>
                                        <input 
                                            type="number" 
                                            value={editStruct.professional_tax}
                                            onChange={(e) => setEditStruct({...editStruct, professional_tax: e.target.value})}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:border-rose-300 transition-all"
                                        />
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={handleUpdateStruct}
                                disabled={loading}
                                className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black hover:bg-rose-600 transition-all shadow-xl mt-12 flex items-center justify-center gap-2"
                            >
                                {loading ? "Saving Changes..." : <><CheckCircle2 size={18} /> Update Compensation Policy</>}
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Generate Modal */}
            <AnimatePresence>
                {genModal.show && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }} 
                            animate={{ opacity: 1 }} 
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
                            onClick={() => setGenModal({ ...genModal, show: false })}
                        />
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white rounded-[2.5rem] p-10 w-full max-w-md relative z-10 shadow-2xl"
                        >
                            <h3 className="text-2xl font-black text-slate-900 mb-6">Generate Monthly Slips</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Select Month</label>
                                    <select 
                                        value={genModal.month}
                                        onChange={(e) => setGenModal({ ...genModal, month: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none"
                                    >
                                        {Array.from({ length: 12 }, (_, i) => (
                                            <option key={i + 1} value={i + 1}>
                                                {new Date(0, i).toLocaleString('default', { month: 'long' })}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Select Year</label>
                                    <select 
                                        value={genModal.year}
                                        onChange={(e) => setGenModal({ ...genModal, year: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none"
                                    >
                                        {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                                <button 
                                    onClick={handleGenerate}
                                    disabled={loading}
                                    className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black hover:bg-rose-600 transition-all shadow-xl mt-4"
                                >
                                    {loading ? "Calculating..." : "Start Generation"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Record Loan Modal */}
            <AnimatePresence>
                {loanModal.show && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
                            onClick={() => setLoanModal({ ...loanModal, show: false })}
                        />
                        <motion.div 
                            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                            className="bg-white rounded-[2.5rem] p-10 w-full max-w-md relative z-10 shadow-2xl"
                        >
                            <h3 className="text-2xl font-black text-slate-900 mb-6">Record New Loan</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Select Employee</label>
                                    <select 
                                        value={loanModal.employee}
                                        onChange={(e) => setLoanModal({ ...loanModal, employee: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none"
                                    >
                                        <option value="">Choose Employee...</option>
                                        {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name || emp.display_username} ({emp.employee_id})</option>)}
                                    </select>
                                </div>
                                <div className="flex items-center gap-3 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                                    <input 
                                        type="checkbox" 
                                        id="isOneTime"
                                        checked={loanModal.isOneTime}
                                        onChange={(e) => setLoanModal({ ...loanModal, isOneTime: e.target.checked })}
                                        className="w-5 h-5 accent-indigo-600 cursor-pointer"
                                    />
                                    <label htmlFor="isOneTime" className="text-sm font-black text-indigo-900 cursor-pointer">One-time Advance (Deduct fully next month)</label>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Advance Amount</label>
                                        <input 
                                            type="number" 
                                            placeholder="20000"
                                            value={loanModal.amount}
                                            onChange={(e) => setLoanModal({ ...loanModal, amount: e.target.value })}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Monthly EMI</label>
                                        <input 
                                            type="number" 
                                            placeholder="5000"
                                            disabled={loanModal.isOneTime}
                                            value={loanModal.isOneTime ? loanModal.amount : loanModal.emi}
                                            onChange={(e) => setLoanModal({ ...loanModal, emi: e.target.value })}
                                            className={`w-full px-4 py-3 border border-slate-100 rounded-2xl font-bold outline-none ${loanModal.isOneTime ? 'bg-indigo-50/50 text-indigo-400' : 'bg-slate-50 text-slate-900'}`}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Reason / Note</label>
                                    <input 
                                        type="text" 
                                        placeholder="Urgent Advance, Medical, etc."
                                        value={loanModal.reason}
                                        onChange={(e) => setLoanModal({ ...loanModal, reason: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none"
                                    />
                                </div>
                                <button 
                                    onClick={handleCreateLoan}
                                    disabled={loading || !loanModal.employee || !loanModal.amount || (!loanModal.isOneTime && !loanModal.emi)}
                                    className="w-full py-5 bg-indigo-600 text-white rounded-3xl font-black hover:bg-indigo-700 transition-all shadow-xl mt-4"
                                >
                                    {loading ? "Processing..." : "Issue Loan"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PayrollModule;
