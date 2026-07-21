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

    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ count: 0, next: null, previous: null });
    const [genModal, setGenModal] = useState({ show: false, month: new Date().getMonth() + 1, year: new Date().getFullYear() });
    const [adjModal, setAdjModal] = useState({ show: false, employee: '', type: 'BONUS', amount: '', reason: '', month: new Date().getMonth() + 1, year: new Date().getFullYear() });
    const [loanModal, setLoanModal] = useState({ show: false, employee: '', amount: '', emi: '', reason: '', isOneTime: true });
    const [employees, setEmployees] = useState([]);

    useEffect(() => {
        setPage(1);
    }, [activeTab]);

    const fetchData = async (pageNum = page) => {
        setLoading(true);
        try {
            let res;
            if (activeTab === 'payslips') {
                res = await api.get(`payroll/payslips/?page=${pageNum}`);
                const data = res.data.results || res.data || [];
                setPayslips(data);
                
                const disbursed = data.filter(p => p.status === 'PAID').reduce((sum, p) => sum + Number(p.net_salary), 0);
                const pending = data.filter(p => p.status === 'PENDING').length;
                setStats({
                    totalDisbursed: disbursed,
                    pendingSlips: pending,
                    avgSalary: data.length ? disbursed / data.length : 0
                });
            } else if (activeTab === 'structures') {
                res = await api.get(`payroll/salary-structures/?page=${pageNum}`);
                const data = res.data.results || res.data || [];
                setSalaryStructures(data);
            } else if (activeTab === 'adjustments') {
                res = await api.get(`payroll/adjustments/?page=${pageNum}`);
                const data = res.data.results || res.data || [];
                setAdjustments(data);
            } else if (activeTab === 'loans') {
                res = await api.get(`payroll/loans/?page=${pageNum}`);
                const data = res.data.results || res.data || [];
                setLoans(data);
            } else if (activeTab === 'declarations') {
                res = await api.get(`payroll/tax-declarations/?page=${pageNum}`);
                const data = res.data.results || res.data || [];
                setDeclarations(data);
            }

            if (res && res.data && res.data.count !== undefined) {
                setPagination({ count: res.data.count, next: res.data.next, previous: res.data.previous });
            } else {
                setPagination({ count: 0, next: null, previous: null });
            }
        } catch (err) {
            console.error("Failed to fetch payroll data", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData(page);
    }, [activeTab, page]);

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

    const [declarations, setDeclarations] = useState([]);
    const [decModal, setDecModal] = useState({
        show: false,
        regime: 'NEW',
        sec_80c: '',
        sec_80d: '',
        sec_24b: '',
        sec_80ccd_1b: '',
        sec_80e: '',
        sec_80g: '',
        sec_80tta: '',
        annual_rent: '',
        landlord_pan: '',
        financial_year: '2026-2027',
        file: null
    });

    const handleCreateDeclaration = async () => {
        setLoading(true);
        const formData = new FormData();
        formData.append('regime', decModal.regime);
        formData.append('sec_80c', decModal.sec_80c || '0.00');
        formData.append('sec_80d', decModal.sec_80d || '0.00');
        formData.append('sec_24b', decModal.sec_24b || '0.00');
        formData.append('sec_80ccd_1b', decModal.sec_80ccd_1b || '0.00');
        formData.append('sec_80e', decModal.sec_80e || '0.00');
        formData.append('sec_80g', decModal.sec_80g || '0.00');
        formData.append('sec_80tta', decModal.sec_80tta || '0.00');
        formData.append('annual_rent', decModal.annual_rent || '0.00');
        formData.append('landlord_pan', decModal.landlord_pan || '');
        formData.append('financial_year', decModal.financial_year);
        if (decModal.file) {
            formData.append('proof_file', decModal.file);
        }
        try {
            await api.post('payroll/tax-declarations/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setDecModal({
                show: false,
                regime: 'NEW',
                sec_80c: '',
                sec_80d: '',
                sec_24b: '',
                sec_80ccd_1b: '',
                sec_80e: '',
                sec_80g: '',
                sec_80tta: '',
                annual_rent: '',
                landlord_pan: '',
                financial_year: '2026-2027',
                file: null
            });
            fetchData();
            alert("Tax declaration submitted!");
        } catch (err) {
            alert(err.response?.data?.error || "Failed to submit declaration");
        } finally {
            setLoading(false);
        }
    };

    const handleExportPayslipsCSV = (type) => {
        let filteredPayslips = payslips;
        if (type === 'WFO') {
            filteredPayslips = payslips.filter(p => p.work_location !== 'REMOTE');
        } else if (type === 'WFH') {
            filteredPayslips = payslips.filter(p => p.work_location === 'REMOTE');
        }

        if (!filteredPayslips || filteredPayslips.length === 0) return alert(`No ${type} payslips to export`);
        
        const headers = ["Employee", "Employee ID", "Location", "Period", "Paid Days", "LOP", "Basic", "HRA", "LTA", "Bonus", "Gross Salary", "PF", "ESI", "PT", "TDS", "Total Deductions", "Net Salary", "Status"];
        
        const rows = filteredPayslips.map(p => [
            p.employee_name,
            p.employee_id_display,
            p.work_location === 'REMOTE' ? 'WFH' : 'WFO',
            `${p.month}/${p.year}`,
            `${p.paid_days} / ${p.total_days}`,
            p.lop_amount,
            p.basic_salary,
            p.hra,
            p.lta,
            p.bonus,
            p.gross_salary,
            p.pf_deduction,
            p.esi_deduction,
            p.pt_deduction,
            p.tds_deduction,
            p.total_deductions,
            p.net_salary,
            p.status
        ]);

        let csvContent = "data:text/csv;charset=utf-8," 
            + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(','))].join('\n');
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `historical_payslips_${type}_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const verifyDeclaration = async (id, status, notes) => {
        setLoading(true);
        try {
            await api.post(`payroll/tax-declarations/${id}/verify/`, { status, notes });
            fetchData();
            alert(`Declaration ${status.toLowerCase()} successfully!`);
        } catch (err) {
            alert("Failed to verify declaration");
        } finally {
            setLoading(false);
        }
    };

    const downloadPayslip = async (id, empId, month, year) => {
        try {
            const response = await api.get(`payroll/payslips/${id}/download_pdf/`, {
                responseType: 'blob',
            });
            const blob = new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Payslip_${empId}_${month}_${year}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[
                { label: 'Total Disbursed', value: `₹${stats.totalDisbursed.toLocaleString()}`, icon: Wallet, color: 'indigo' },
                { label: 'Pending Slips', value: stats.pendingSlips, icon: Clock, color: 'indigo' },
                { label: 'Average Net Pay', value: `₹${Math.round(stats.avgSalary).toLocaleString()}`, icon: TrendingUp, color: 'indigo' }
            ].map((stat, idx) => (
                <motion.div 
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm"
                >
                    <div className="flex items-center gap-4">
                        <div className={`p-3 bg-${stat.color}-50 text-${stat.color}-600 rounded-lg`}>
                            <stat.icon size={20} />
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{stat.label}</p>
                            <h3 className="text-xl font-bold text-slate-800">{stat.value}</h3>
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    );

    return (
        <div className="min-h-screen bg-[#FDFCFB] pb-20 px-4 md:px-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Payroll Engine</h1>
                    <p className="text-slate-500 text-sm mt-1">Manage employee compensation and payslips.</p>
                </div>

                {authUser?.role === 'SUPER_ADMIN' && (
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setGenModal({ ...genModal, show: true })}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg font-semibold text-xs hover:bg-slate-900 transition-all shadow-sm"
                        >
                            <Plus size={14} /> Generate Slips
                        </button>
                        {activeTab === 'adjustments' && (
                            <button 
                                onClick={() => setAdjModal({ ...adjModal, show: true })}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold text-xs hover:bg-indigo-700 transition-all shadow-sm"
                            >
                                <Plus size={14} /> Add Incentive/Adj
                            </button>
                        )}
                        {activeTab === 'loans' && (
                            <button 
                                onClick={() => setLoanModal({ ...loanModal, show: true })}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold text-xs hover:bg-indigo-700 transition-all shadow-sm"
                            >
                                <Plus size={14} /> Record Loan
                            </button>
                        )}
                        {activeTab === 'declarations' && (
                            <button 
                                onClick={() => setDecModal({ ...decModal, show: true })}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold text-xs hover:bg-indigo-700 transition-all shadow-sm"
                            >
                                <Plus size={14} /> Submit Declaration
                            </button>
                        )}
                    </div>
                )}
            </div>

            {authUser?.role === 'SUPER_ADMIN' && renderStats()}

            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-lg w-fit">
                {[
                    { id: 'payslips', label: 'Monthly Slips', icon: FileText },
                    { id: 'structures', label: 'Salary Structures', icon: Settings, adminOnly: true },
                    { id: 'adjustments', label: 'Adjustments & Incentives', icon: DollarSign, adminOnly: true },
                    { id: 'loans', label: 'Loans & Advances', icon: CreditCard, adminOnly: true },
                    { id: 'declarations', label: 'Tax Declarations', icon: FileText },
                ].filter(tab => !tab.adminOnly || authUser?.role === 'SUPER_ADMIN').map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
                            activeTab === tab.id 
                                ? 'bg-white text-slate-800 shadow-sm' 
                                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                        }`}
                    >
                        <tab.icon size={14} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Table Area */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
                    <h3 className="text-lg font-bold text-slate-800">
                        {activeTab === 'payslips' ? "Historical Payslips" : 
                         activeTab === 'structures' ? "Configured Salary Components" : 
                         activeTab === 'adjustments' ? "Monthly Adjustments & Incentives" : 
                         activeTab === 'loans' ? "Employee Loans & Advances" :
                         "Tax Investment Declarations"}
                    </h3>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={fetchData}
                            className="p-2 bg-slate-50 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all border border-slate-200"
                            title="Refresh Data"
                        >
                            <motion.div whileTap={{ rotate: 180 }}>
                                <Settings size={16} />
                            </motion.div>
                        </button>
                        {activeTab === 'payslips' && (
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => handleExportPayslipsCSV('WFO')}
                                    className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-all border border-emerald-200 text-xs font-semibold"
                                    title="Download WFO CSV"
                                >
                                    <Download size={14} />
                                    WFO CSV
                                </button>
                                <button 
                                    onClick={() => handleExportPayslipsCSV('WFH')}
                                    className="flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-all border border-indigo-200 text-xs font-semibold"
                                    title="Download WFH CSV"
                                >
                                    <Download size={14} />
                                    WFH CSV
                                </button>
                            </div>
                        )}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <input 
                                type="text" 
                                placeholder="Search..." 
                                className="pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium outline-none focus:border-indigo-400 transition-all w-64"
                            />
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Employee</th>
                                {activeTab === 'payslips' ? (
                                    <>
                                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Period</th>
                                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Paid Days</th>
                                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">LOP</th>
                                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Net Salary</th>
                                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                        <th className="px-5 py-3 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                                    </>
                                ) : activeTab === 'structures' ? (
                                    <>
                                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Base Salary</th>
                                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Total Allowances</th>
                                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">PF / Tax</th>
                                        <th className="px-5 py-3 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Edit</th>
                                    </>
                                ) : activeTab === 'adjustments' ? (
                                    <>
                                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Period</th>
                                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Reason</th>
                                    </>
                                ) : activeTab === 'loans' ? (
                                    <>
                                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Loan Amount</th>
                                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Monthly EMI</th>
                                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Balance</th>
                                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                        <th className="px-5 py-3 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                                    </>
                                ) : (
                                    <>
                                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Financial Year</th>
                                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Regime</th>
                                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Deductions (80C / 80D / Rent)</th>
                                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                        <th className="px-5 py-3 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {activeTab === 'payslips' ? (
                                payslips.map((slip) => (
                                    <tr key={slip.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold">
                                                    {slip.employee_name?.[0]}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-800">{slip.employee_name}</p>
                                                    <p className="text-[10px] font-medium text-slate-500 uppercase">{slip.employee_id}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className="text-sm font-medium text-slate-600">{new Date(slip.year, slip.month - 1).toLocaleString('default', { month: 'short', year: 'numeric' })}</span>
                                        </td>
                                        <td className="px-5 py-3 text-sm font-medium text-slate-600">{slip.paid_days} / {slip.total_working_days}</td>
                                        <td className={`px-5 py-3 text-sm font-medium ${Number(slip.lop_deduction) > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                                            -₹{Number(slip.lop_deduction).toLocaleString()}
                                        </td>
                                        <td className="px-5 py-3 text-sm font-semibold text-slate-800">₹{Number(slip.net_salary).toLocaleString()}</td>
                                        <td className="px-5 py-3">
                                            <span className={`px-2.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${
                                                slip.status === 'PAID' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                                            }`}>
                                                {slip.status}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <div className="flex justify-end gap-2">
                                                {slip.status === 'PENDING' && authUser?.role === 'SUPER_ADMIN' && (
                                                    <button 
                                                        onClick={() => markAsPaid(slip.id)}
                                                        className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
                                                        title="Mark as Paid"
                                                    >
                                                        <CheckCircle2 size={14} />
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={() => downloadPayslip(slip.id, slip.employee_id, slip.month, slip.year)}
                                                    className="p-1.5 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors border border-slate-200"
                                                >
                                                    <Download size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : activeTab === 'structures' ? (
                                salaryStructures.map((struct) => (
                                    <tr key={struct.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-5 py-3 text-sm font-semibold text-slate-800">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold">
                                                    {struct.employee_name?.[0]}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-800">{struct.employee_name}</p>
                                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${struct.tax_regime === 'OLD' ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-indigo-50 text-indigo-600 border border-indigo-100'}`}>
                                                        {struct.tax_regime === 'OLD' ? 'Old Regime' : 'New Regime'}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-sm font-semibold text-slate-800">₹{Number(struct.base_salary).toLocaleString()}</td>
                                        <td className="px-5 py-3 text-sm font-medium text-emerald-600">
                                            +₹{(Number(struct.hra) + Number(struct.conveyance) + Number(struct.medical) + Number(struct.special_allowance)).toLocaleString()}
                                        </td>
                                        <td className="px-5 py-3 text-sm font-medium text-rose-600">
                                            -₹{(Number(struct.provident_fund) + Number(struct.professional_tax)).toLocaleString()}
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <button 
                                                onClick={() => setEditStruct(struct)}
                                                className="p-1.5 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors border border-slate-200"
                                            >
                                                <Settings size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : activeTab === 'adjustments' ? (
                                adjustments.map((adj) => (
                                    <tr key={adj.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-5 py-3 text-sm font-semibold text-slate-800">{adj.employee_name}</td>
                                        <td className="px-5 py-3">
                                            <span className="text-sm font-medium text-slate-600">{new Date(adj.year, adj.month - 1).toLocaleString('default', { month: 'short', year: 'numeric' })}</span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className={`px-2.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${
                                                adj.adjustment_type === 'BONUS' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'
                                            }`}>
                                                {adj.adjustment_type}
                                            </span>
                                        </td>
                                        <td className={`px-5 py-3 text-sm font-semibold ${adj.adjustment_type === 'BONUS' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {adj.adjustment_type === 'BONUS' ? '+' : '-'}₹{Number(adj.amount).toLocaleString()}
                                        </td>
                                        <td className="px-5 py-3 text-sm font-medium text-slate-500 italic">"{adj.reason}"</td>
                                    </tr>
                                ))
                            ) : activeTab === 'loans' ? (
                                loans.map((loan) => (
                                    <tr key={loan.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold">
                                                    {loan.employee_name?.[0]}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-800">{loan.employee_name}</p>
                                                    <p className="text-[10px] font-medium text-slate-500">LOAN-REF-{loan.id}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-sm font-semibold text-slate-800">₹{Number(loan.loan_amount).toLocaleString()}</td>
                                        <td className="px-5 py-3 text-sm font-medium text-rose-600">₹{Number(loan.monthly_repayment).toLocaleString()}/mo</td>
                                        <td className="px-5 py-3">
                                            <div className="flex flex-col gap-1">
                                                <p className="text-xs font-semibold text-indigo-600">₹{Number(loan.balance_amount).toLocaleString()}</p>
                                                <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                    <div 
                                                        className="h-full bg-indigo-500 transition-all" 
                                                        style={{ width: `${((Number(loan.loan_amount) - Number(loan.balance_amount)) / Number(loan.loan_amount)) * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className={`px-2.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${
                                                loan.is_active ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-50 text-slate-500 border-slate-200'
                                            }`}>
                                                {loan.is_active ? 'Active' : 'Cleared'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button 
                                                    onClick={() => handleToggleLoanStatus(loan)}
                                                    className={`p-1.5 rounded-lg transition-colors border ${loan.is_active ? 'bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100'}`}
                                                    title={loan.is_active ? "Deactivate Loan" : "Activate Loan"}
                                                >
                                                    <Power size={14} />
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteLoan(loan.id)}
                                                    className="p-1.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-lg hover:bg-rose-100 transition-colors"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                declarations.map((dec) => (
                                    <tr key={dec.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold">
                                                    {dec.employee_name?.[0]}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-800">{dec.employee_name}</p>
                                                    <p className="text-[10px] font-medium text-slate-500 uppercase">{dec.employee_id}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-sm font-medium text-slate-600">{dec.financial_year}</td>
                                        <td className="px-5 py-3">
                                            <span className={`px-2.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${
                                                dec.regime === 'NEW' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                                            }`}>
                                                {dec.regime === 'NEW' ? 'New Regime' : 'Old Regime'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-xs text-slate-600">
                                            <div className="flex flex-col gap-0.5 font-medium">
                                                <p>80C: ₹{Number(dec.sec_80c).toLocaleString()}</p>
                                                <p>80D: ₹{Number(dec.sec_80d).toLocaleString()}</p>
                                                <p>Rent: ₹{Number(dec.annual_rent).toLocaleString()}/yr</p>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-sm">
                                            <div className="flex flex-col gap-1">
                                                <span className={`w-fit px-2.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${
                                                    dec.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                                    dec.status === 'REJECTED' ? 'bg-rose-50 text-rose-600 border-rose-100' : 
                                                    'bg-amber-50 text-amber-600 border-amber-100'
                                                }`}>
                                                    {dec.status}
                                                </span>
                                                {dec.notes && <p className="text-[10px] text-slate-500 italic mt-0.5">Note: "{dec.notes}"</p>}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <div className="flex justify-end gap-2 items-center">
                                                {dec.proof_file && (
                                                    <a 
                                                        href={dec.proof_file} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="px-2.5 py-1.5 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors border border-slate-200 text-xs font-semibold"
                                                        title="View Proof File"
                                                    >
                                                        Proof File
                                                    </a>
                                                )}
                                                {dec.status === 'PENDING' && authUser?.role === 'SUPER_ADMIN' && (
                                                    <>
                                                        <button 
                                                            onClick={() => {
                                                                const note = prompt("Enter verification note (optional):");
                                                                verifyDeclaration(dec.id, 'APPROVED', note || '');
                                                            }}
                                                            className="px-2.5 py-1 bg-emerald-500 text-white rounded text-xs font-semibold hover:bg-emerald-600"
                                                        >
                                                            Approve
                                                        </button>
                                                        <button 
                                                            onClick={() => {
                                                                const note = prompt("Enter rejection reason (required):");
                                                                if (note) verifyDeclaration(dec.id, 'REJECTED', note);
                                                            }}
                                                            className="px-2.5 py-1 bg-rose-500 text-white rounded text-xs font-semibold hover:bg-rose-600"
                                                        >
                                                            Reject
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                
                {/* Pagination Controls */}
                {!loading && pagination.count > 0 && (
                    <div className="p-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
                        <span className="text-xs text-slate-500 font-semibold">
                            Showing <span className="font-bold text-slate-800">Page {page}</span> (Total: {pagination.count} records)
                        </span>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setPage(page - 1)}
                                disabled={!pagination.previous}
                                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                            >
                                Previous
                            </button>
                            <button 
                                onClick={() => setPage(page + 1)}
                                disabled={!pagination.next}
                                className="px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-lg text-xs font-bold text-indigo-600 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
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
                            className="bg-white rounded-xl p-6 w-full max-w-md relative z-10 shadow-2xl"
                        >
                            <h3 className="text-xl font-bold text-slate-800 mb-4">Add Adjustment</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Select Employee</label>
                                    <select 
                                        value={adjModal.employee}
                                        onChange={(e) => setAdjModal({ ...adjModal, employee: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                    >
                                        <option value="">Choose Employee...</option>
                                        {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name || emp.display_username} ({emp.employee_id})</option>)}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Type</label>
                                        <select 
                                            value={adjModal.type}
                                            onChange={(e) => setAdjModal({ ...adjModal, type: e.target.value })}
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                        >
                                            <option value="BONUS">Incentive</option>
                                            <option value="DEDUCTION">Deduction</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Amount</label>
                                        <input 
                                            type="number" 
                                            value={adjModal.amount}
                                            onChange={(e) => setAdjModal({ ...adjModal, amount: e.target.value })}
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Reason</label>
                                    <input 
                                        type="text" 
                                        placeholder="Performance Bonus, Fine, etc."
                                        value={adjModal.reason}
                                        onChange={(e) => setAdjModal({ ...adjModal, reason: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                    />
                                </div>
                                <button 
                                    onClick={handleCreateAdjustment}
                                    disabled={loading || !adjModal.employee || !adjModal.amount}
                                    className="w-full py-2.5 bg-slate-800 text-white rounded-lg font-semibold text-sm hover:bg-slate-900 transition-all shadow-sm mt-4 disabled:opacity-50"
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
                            className="bg-white rounded-xl p-6 w-full max-w-2xl relative z-10 shadow-2xl max-h-[90vh] overflow-y-auto"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-xl font-bold text-slate-800">Salary Components</h3>
                                    <p className="text-sm font-medium text-slate-500">Employee: {editStruct.employee_name}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Net Take Home</p>
                                    <h4 className="text-xl font-bold text-emerald-600">
                                        ₹{(Number(editStruct.base_salary) + Number(editStruct.hra) + Number(editStruct.conveyance) + Number(editStruct.medical) + Number(editStruct.special_allowance) - Number(editStruct.provident_fund) - Number(editStruct.professional_tax)).toLocaleString()}
                                    </h4>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <h5 className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> Fixed Earnings
                                    </h5>
                                    
                                    <div>
                                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Basic Salary</label>
                                        <input 
                                            type="number" 
                                            value={editStruct.base_salary}
                                            onChange={(e) => setEditStruct({...editStruct, base_salary: e.target.value})}
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">HRA (House Rent)</label>
                                        <input 
                                            type="number" 
                                            value={editStruct.hra}
                                            onChange={(e) => setEditStruct({...editStruct, hra: e.target.value})}
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Medical</label>
                                            <input 
                                                type="number" 
                                                value={editStruct.medical}
                                                onChange={(e) => setEditStruct({...editStruct, medical: e.target.value})}
                                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Conveyance</label>
                                            <input 
                                                type="number" 
                                                value={editStruct.conveyance}
                                                onChange={(e) => setEditStruct({...editStruct, conveyance: e.target.value})}
                                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Special Allowance</label>
                                        <input 
                                            type="number" 
                                            value={editStruct.special_allowance}
                                            onChange={(e) => setEditStruct({...editStruct, special_allowance: e.target.value})}
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h5 className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-rose-500 rounded-full" /> Statutory Deductions
                                    </h5>
                                    
                                    <div>
                                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Provident Fund (PF)</label>
                                        <input 
                                            type="number" 
                                            value={editStruct.provident_fund}
                                            onChange={(e) => setEditStruct({...editStruct, provident_fund: e.target.value})}
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Professional Tax</label>
                                        <input 
                                            type="number" 
                                            value={editStruct.professional_tax}
                                            onChange={(e) => setEditStruct({...editStruct, professional_tax: e.target.value})}
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Tax Regime</label>
                                        <select 
                                            value={editStruct.tax_regime || 'NEW'}
                                            onChange={(e) => setEditStruct({...editStruct, tax_regime: e.target.value})}
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                        >
                                            <option value="NEW">New Regime</option>
                                            <option value="OLD">Old Regime</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={handleUpdateStruct}
                                disabled={loading}
                                className="w-full py-2.5 bg-slate-800 text-white rounded-lg font-semibold text-sm hover:bg-slate-900 transition-all shadow-sm mt-6 flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {loading ? "Saving Changes..." : <><CheckCircle2 size={16} /> Update Compensation Policy</>}
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
                            className="bg-white rounded-xl p-6 w-full max-w-md relative z-10 shadow-2xl"
                        >
                            <h3 className="text-xl font-bold text-slate-800 mb-4">Generate Monthly Slips</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Select Month</label>
                                    <select 
                                        value={genModal.month}
                                        onChange={(e) => setGenModal({ ...genModal, month: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                    >
                                        {Array.from({ length: 12 }, (_, i) => (
                                            <option key={i + 1} value={i + 1}>
                                                {new Date(0, i).toLocaleString('default', { month: 'long' })}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Select Year</label>
                                    <select 
                                        value={genModal.year}
                                        onChange={(e) => setGenModal({ ...genModal, year: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                    >
                                        {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                                <button 
                                    onClick={handleGenerate}
                                    disabled={loading}
                                    className="w-full py-2.5 bg-slate-800 text-white rounded-lg font-semibold text-sm hover:bg-slate-900 transition-all shadow-sm mt-4 disabled:opacity-50"
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
                            className="bg-white rounded-xl p-6 w-full max-w-md relative z-10 shadow-2xl"
                        >
                            <h3 className="text-xl font-bold text-slate-800 mb-4">Record New Loan</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Select Employee</label>
                                    <select 
                                        value={loanModal.employee}
                                        onChange={(e) => setLoanModal({ ...loanModal, employee: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                    >
                                        <option value="">Choose Employee...</option>
                                        {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name || emp.display_username} ({emp.employee_id})</option>)}
                                    </select>
                                </div>
                                <div className="flex items-center gap-3 p-3 bg-indigo-50/50 rounded-lg border border-indigo-100">
                                    <input 
                                        type="checkbox" 
                                        id="isOneTime"
                                        checked={loanModal.isOneTime}
                                        onChange={(e) => setLoanModal({ ...loanModal, isOneTime: e.target.checked })}
                                        className="w-4 h-4 accent-indigo-600 cursor-pointer rounded"
                                    />
                                    <label htmlFor="isOneTime" className="text-xs font-semibold text-indigo-900 cursor-pointer">One-time Advance (Deduct fully next month)</label>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Advance Amount</label>
                                        <input 
                                            type="number" 
                                            placeholder="20000"
                                            value={loanModal.amount}
                                            onChange={(e) => setLoanModal({ ...loanModal, amount: e.target.value })}
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Monthly EMI</label>
                                        <input 
                                            type="number" 
                                            placeholder="5000"
                                            disabled={loanModal.isOneTime}
                                            value={loanModal.isOneTime ? loanModal.amount : loanModal.emi}
                                            onChange={(e) => setLoanModal({ ...loanModal, emi: e.target.value })}
                                            className={`w-full px-3 py-2 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400 ${loanModal.isOneTime ? 'bg-indigo-50/50 text-indigo-400' : 'bg-slate-50 text-slate-800'}`}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Reason / Note</label>
                                    <input 
                                        type="text" 
                                        placeholder="Urgent Advance, Medical, etc."
                                        value={loanModal.reason}
                                        onChange={(e) => setLoanModal({ ...loanModal, reason: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                    />
                                </div>
                                <button 
                                    onClick={handleCreateLoan}
                                    disabled={loading || !loanModal.employee || !loanModal.amount || (!loanModal.isOneTime && !loanModal.emi)}
                                    className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-semibold text-sm hover:bg-indigo-700 transition-all shadow-sm mt-4 disabled:opacity-50"
                                >
                                    {loading ? "Processing..." : "Issue Loan"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Submit Declaration Modal */}
            <AnimatePresence>
                {decModal.show && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
                            onClick={() => setDecModal({ ...decModal, show: false })}
                        />
                        <motion.div 
                            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                            className="bg-white rounded-xl p-6 w-full max-w-xl relative z-10 shadow-2xl max-h-[90vh] overflow-y-auto"
                        >
                            <h3 className="text-xl font-bold text-slate-800 mb-1">Submit Investment Declaration</h3>
                            <p className="text-xs font-semibold text-slate-500 mb-4">Provide annual investment declarations for tax calculations.</p>
                            
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Financial Year</label>
                                        <select 
                                            value={decModal.financial_year}
                                            onChange={(e) => setDecModal({ ...decModal, financial_year: e.target.value })}
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                        >
                                            <option value="2025-2026">2025-2026</option>
                                            <option value="2026-2027">2026-2027</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Tax Regime Choice</label>
                                        <select 
                                            value={decModal.regime}
                                            onChange={(e) => setDecModal({ ...decModal, regime: e.target.value })}
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                        >
                                            <option value="NEW">New Regime (No deductions)</option>
                                            <option value="OLD">Old Regime (With deductions)</option>
                                        </select>
                                    </div>
                                </div>

                                {decModal.regime === 'OLD' && (
                                    <>
                                        <div className="border-t border-slate-100 pt-4">
                                            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Section 80 Deductions</h4>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-[10px] font-semibold text-slate-500 block mb-1">Section 80C (PPF, LIC, ELSS, etc. - Max 1.5L)</label>
                                                    <input 
                                                        type="number" 
                                                        placeholder="150000"
                                                        value={decModal.sec_80c}
                                                        onChange={(e) => setDecModal({ ...decModal, sec_80c: e.target.value })}
                                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-semibold text-slate-500 block mb-1">Section 80D (Medical Insurance - Max 25k/50k)</label>
                                                    <input 
                                                        type="number" 
                                                        placeholder="25000"
                                                        value={decModal.sec_80d}
                                                        onChange={(e) => setDecModal({ ...decModal, sec_80d: e.target.value })}
                                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Section 24(b) (Home Loan Int. - Max 2L)</label>
                                                <input 
                                                    type="number" 
                                                    placeholder="200000"
                                                    value={decModal.sec_24b}
                                                    onChange={(e) => setDecModal({ ...decModal, sec_24b: e.target.value })}
                                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Section 80CCD(1B) (NPS - Max 50k)</label>
                                                <input 
                                                    type="number" 
                                                    placeholder="50000"
                                                    value={decModal.sec_80ccd_1b}
                                                    onChange={(e) => setDecModal({ ...decModal, sec_80ccd_1b: e.target.value })}
                                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-3">
                                            <div>
                                                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Sec 80E (Ed. Loan)</label>
                                                <input 
                                                    type="number" 
                                                    value={decModal.sec_80e}
                                                    onChange={(e) => setDecModal({ ...decModal, sec_80e: e.target.value })}
                                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Sec 80G (Donations)</label>
                                                <input 
                                                    type="number" 
                                                    value={decModal.sec_80g}
                                                    onChange={(e) => setDecModal({ ...decModal, sec_80g: e.target.value })}
                                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Sec 80TTA (Savings Int)</label>
                                                <input 
                                                    type="number" 
                                                    value={decModal.sec_80tta}
                                                    onChange={(e) => setDecModal({ ...decModal, sec_80tta: e.target.value })}
                                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                                />
                                            </div>
                                        </div>

                                        <div className="border-t border-slate-100 pt-4">
                                            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">House Rent Allowance (HRA) Details</h4>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-[10px] font-semibold text-slate-500 block mb-1">Annual Rent Paid</label>
                                                    <input 
                                                        type="number" 
                                                        placeholder="120000"
                                                        value={decModal.annual_rent}
                                                        onChange={(e) => setDecModal({ ...decModal, annual_rent: e.target.value })}
                                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-semibold text-slate-500 block mb-1">Landlord PAN (If Rent &gt; 1L/yr)</label>
                                                    <input 
                                                        type="text" 
                                                        placeholder="ABCDE1234F"
                                                        value={decModal.landlord_pan}
                                                        onChange={(e) => setDecModal({ ...decModal, landlord_pan: e.target.value })}
                                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium outline-none text-sm focus:border-indigo-400"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}

                                <div className="border-t border-slate-100 pt-4">
                                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Upload Investment Proofs (PDF / Images)</label>
                                    <input 
                                        type="file" 
                                        accept=".pdf,image/*"
                                        onChange={(e) => setDecModal({ ...decModal, file: e.target.files[0] })}
                                        className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer animate-none"
                                    />
                                </div>

                                <button 
                                    onClick={handleCreateDeclaration}
                                    disabled={loading}
                                    className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-semibold text-sm hover:bg-indigo-700 transition-all shadow-sm mt-4 disabled:opacity-50"
                                >
                                    {loading ? "Submitting..." : "Submit Investment Declaration"}
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
