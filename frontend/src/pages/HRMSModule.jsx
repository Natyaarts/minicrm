import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../api/axios';
import { 
    Users, 
    Building2, 
    Briefcase, 
    Plus, 
    Search, 
    RefreshCw, 
    ChevronRight, 
    Edit2, 
    Trash2,
    CheckCircle2,
    UserPlus,
    Filter,
    X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import OrganizationChart from '../components/OrganizationChart';
import CompanyWall from '../components/CompanyWall';
import AssetManagement from '../components/AssetManagement';
import ExpenseManagement from '../components/ExpenseManagement';
import PerformanceReviews from '../components/PerformanceReviews';

const HRMSModule = () => {
    const { user: authUser } = useAuth();
    const [activeTab, setActiveTab] = useState('employees');
    const [loading, setLoading] = useState(false);
    
    // Data states
    const [employees, setEmployees] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [designations, setDesignations] = useState([]);
    const [customFields, setCustomFields] = useState([]);
    const [stats, setStats] = useState({ totalEmployees: 0, totalDepts: 0, activeStaff: 0 });

    // Filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDept, setSelectedDept] = useState('');

    // Modal states
    const [showAddDept, setShowAddDept] = useState(false);
    const [showAddDesignation, setShowAddDesignation] = useState(false);
    const [showAddEmployee, setShowAddEmployee] = useState(false);
    const [showViewProfile, setShowViewProfile] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [isEditMode, setIsEditMode] = useState(false);
    
    const [newDept, setNewDept] = useState({ name: '', description: '' });
    const [newDesignation, setNewDesignation] = useState({ name: '', department: '', description: '', permission_role: 'EMPLOYEE' });
    const [newEmployee, setNewEmployee] = useState({
        username: '', first_name: '', last_name: '', email: '', password: '',
        employee_id: `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
        department: '', designation: '', reporting_to: '', date_of_joining: new Date().toISOString().split('T')[0],
        base_salary: 0,
        additional_data: {}
    });
    
    const [newCustomField, setNewCustomField] = useState({ label: '', field_type: 'text', required: false });

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [empRes, deptRes, desigRes, fieldsRes] = await Promise.all([
                api.get('hrms/employees/?page_size=1000').catch(() => ({ data: [] })),
                api.get('hrms/departments/?page_size=1000').catch(() => ({ data: [] })),
                api.get('hrms/designations/?page_size=1000').catch(() => ({ data: [] })),
                api.get('hrms/custom-fields/?page_size=1000').catch(() => ({ data: [] }))
            ]);
            
            setEmployees(empRes.data.results || empRes.data || []);
            setDepartments(deptRes.data.results || deptRes.data || []);
            setDesignations(desigRes.data.results || desigRes.data || []);
            setCustomFields(fieldsRes.data.results || fieldsRes.data || []);
            
            const empList = empRes.data.results || empRes.data || [];
            const deptList = deptRes.data.results || deptRes.data || [];

            setStats({
                totalEmployees: empList.length,
                totalDepts: deptList.length,
                activeStaff: empList.filter(e => e.status === 'ACTIVE').length
            });
        } catch (err) {
            console.error("Failed to fetch HRMS data", err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddDept = async (e) => {
        e.preventDefault();
        try {
            await api.post('hrms/departments/', newDept);
            setShowAddDept(false);
            setNewDept({ name: '', description: '' });
            fetchData();
        } catch (err) {
            alert("Failed to add department");
        }
    };

    const handleAddDesignation = async (e) => {
        e.preventDefault();
        try {
            await api.post('hrms/designations/', newDesignation);
            setShowAddDesignation(false);
            setNewDesignation({ name: '', department: '', description: '' });
            fetchData();
        } catch (err) {
            alert("Failed to add designation");
        }
    };

    const handleAddEmployee = async (e) => {
        e.preventDefault();
        try {
            const payload = { ...newEmployee };
            if (!payload.reporting_to) payload.reporting_to = null;

            if (isEditMode) {
                await api.patch(`hrms/employees/${newEmployee.id}/`, payload);
            } else {
                await api.post('hrms/employees/', payload);
            }
            setShowAddEmployee(false);
            setIsEditMode(false);
            setNewEmployee({
                username: '', first_name: '', last_name: '', email: '', password: '',
                employee_id: `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
                department: '', designation: '', reporting_to: '', 
                date_of_joining: new Date().toISOString().split('T')[0],
                date_of_birth: '',
                base_salary: 0,
                additional_data: {}
            });
            fetchData();
        } catch (err) {
            console.error(err);
            alert("Failed to save employee. " + (err.response?.data?.error || "Check if username/email already exists."));
        }
    };

    const openEditEmployee = (emp) => {
        setNewEmployee({
            ...emp,
            password: '', // Don't prefill password for security
            reporting_to: emp.reporting_to || '',
            additional_data: emp.additional_data || {}
        });
        setIsEditMode(true);
        setShowAddEmployee(true);
        setShowViewProfile(false);
    };

    const handleAddCustomField = async (e) => {
        e.preventDefault();
        try {
            const name = newCustomField.label.toLowerCase().replace(/\s+/g, '_');
            await api.post('hrms/custom-fields/', { ...newCustomField, name });
            setNewCustomField({ label: '', field_type: 'text', required: false });
            fetchData();
        } catch (err) {
            alert("Failed to add field");
        }
    };

    const handleDeleteCustomField = async (id) => {
        if (!window.confirm("Remove this field? Existing employee data for this field won't be deleted but won't show in the form.")) return;
        try {
            await api.delete(`hrms/custom-fields/${id}/`);
            fetchData();
        } catch (err) {
            alert("Failed to delete field");
        }
    };

    const handleDocumentUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const docType = prompt("Enter document type (e.g. Resume, ID Proof):", "ID Proof");
        if (!docType) {
            e.target.value = '';
            return;
        }

        const formData = new FormData();
        formData.append('employee', newEmployee.id);
        formData.append('document_type', docType);
        formData.append('file', file);

        try {
            const res = await api.post('hrms/documents/', formData);
            setNewEmployee({
                ...newEmployee,
                documents: [...(newEmployee.documents || []), res.data]
            });
            alert("Document uploaded successfully!");
        } catch (err) {
            console.error("Upload error:", err.response?.data || err);
            alert("Failed to upload document. " + (err.response?.data?.file?.[0] || ""));
        } finally {
            e.target.value = '';
        }
    };

    const renderStats = () => (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-2">
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex items-center gap-4"
            >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center text-white shrink-0 shadow-sm">
                    <Users size={20} />
                </div>
                <div>
                    <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-0.5">Total Workforce</p>
                    <h3 className="text-lg font-bold text-slate-800">{stats.totalEmployees}</h3>
                </div>
            </motion.div>

            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex items-center gap-4"
            >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-white shrink-0 shadow-sm">
                    <Building2 size={20} />
                </div>
                <div>
                    <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-0.5">Departments</p>
                    <h3 className="text-lg font-bold text-slate-800">{stats.totalDepts}</h3>
                </div>
            </motion.div>

            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex items-center gap-4"
            >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shrink-0 shadow-sm">
                    <CheckCircle2 size={20} />
                </div>
                <div>
                    <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-0.5">Active Staff</p>
                    <h3 className="text-lg font-bold text-slate-800">{stats.activeStaff}</h3>
                </div>
            </motion.div>
        </div>
    );

    return (
        <div className="space-y-6 animate-fadeIn px-2 md:px-0 pb-20">
            {authUser?.role === 'SUPER_ADMIN' ? renderStats() : null}
            
            {/* Header Area */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">
                        {authUser?.role === 'SUPER_ADMIN' ? 'Workforce ' : 'My '}
                        <span className="text-indigo-600">Hub</span>
                    </h1>
                    <p className="text-slate-500 mt-1 text-xs font-normal">
                        {authUser?.role === 'SUPER_ADMIN' 
                            ? 'Manage departments, designations, and employee profiles.' 
                            : 'View and manage your personal employee profile.'}
                    </p>
                </div>

                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    {['employees', 'company wall', 'expenses', 'performance', 'departments', 'designations', 'organization chart', 'form builder'].map((tab) => {
                        // Permissions check for tabs
                        if (authUser?.role !== 'SUPER_ADMIN') {
                            if (tab === 'departments' || tab === 'designations' || tab === 'form builder') return null;
                        }
                        
                        return (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                                    activeTab === tab 
                                    ? 'bg-indigo-600 text-white shadow-sm' 
                                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm'
                                }`}
                            >
                                {tab === 'employees' && authUser?.role !== 'SUPER_ADMIN' ? 'My Profile' : tab}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm gap-4">
                <div className="relative w-full sm:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                        type="text" 
                        placeholder={`Search ${activeTab}...`}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-all text-xs font-medium text-slate-700"
                    />
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <button 
                        onClick={fetchData}
                        className="flex items-center justify-center p-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 shadow-sm transition-colors"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                    
                    {activeTab === 'employees' && (authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.WORKFORCE?.add) && (
                        <button 
                            onClick={() => setShowAddEmployee(true)}
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold shadow-sm hover:bg-indigo-700 transition-colors"
                        >
                            <UserPlus size={14} /> Add Employee
                        </button>
                    )}
                    {activeTab === 'departments' && (authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.WORKFORCE?.add) && (
                        <button 
                            onClick={() => setShowAddDept(true)}
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold shadow-sm hover:bg-indigo-700 transition-colors"
                        >
                            <Plus size={14} /> New Department
                        </button>
                    )}
                    {activeTab === 'designations' && (authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.WORKFORCE?.add) && (
                        <button 
                            onClick={() => setShowAddDesignation(true)}
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold shadow-sm hover:bg-indigo-700 transition-colors"
                        >
                            <Plus size={14} /> New Designation
                        </button>
                    )}
                </div>
            </div>

            {/* Content Area */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                >
                    {activeTab === 'employees' && (() => {
                        const filteredEmployees = employees.filter(emp => {
                            const term = searchTerm.toLowerCase();
                            return (
                                (emp.full_name || '').toLowerCase().includes(term) ||
                                (emp.display_username || '').toLowerCase().includes(term) ||
                                (emp.employee_id || '').toLowerCase().includes(term) ||
                                (emp.department_name || '').toLowerCase().includes(term)
                            );
                        });
                        return (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredEmployees.length > 0 ? filteredEmployees.map((emp) => (
                                <div key={emp.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all group">
                                    <div className="flex items-center gap-4 mb-5">
                                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-indigo-100 to-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-lg border border-indigo-100 shadow-sm">
                                            {emp.full_name?.[0] || emp.display_username?.[0].toUpperCase()}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{emp.full_name || emp.display_username}</h4>
                                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{emp.designation_name || 'No Designation'}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-2 mb-5">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-slate-500">Department</span>
                                            <span className="text-slate-700 font-medium">{emp.department_name || 'Unassigned'}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-slate-500">ID</span>
                                            <span className="text-indigo-600 font-semibold font-mono">{emp.employee_id}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-slate-500">Status</span>
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                                                emp.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-50 text-slate-500 border border-slate-200'
                                            }`}>
                                                {emp.status}
                                            </span>
                                        </div>
                                    </div>

                                    <button 
                                        onClick={() => {
                                            setSelectedEmployee(emp);
                                            setShowViewProfile(true);
                                        }}
                                        className="w-full py-2 bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-lg font-semibold text-xs transition-colors border border-slate-200 hover:border-indigo-200"
                                    >
                                        View Full Profile
                                    </button>
                                </div>
                            )) : (
                                <div className="col-span-full py-16 text-center bg-white rounded-xl border border-slate-200 shadow-sm">
                                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm border border-slate-100">
                                        <Users className="text-slate-400" size={24} />
                                    </div>
                                    <h3 className="text-base font-bold text-slate-800">No employees found</h3>
                                    <p className="text-xs text-slate-500 mt-1">Start by adding your first workforce member.</p>
                                </div>
                            )}
                        </div>
                        );
                    })()}

                    {activeTab === 'departments' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {departments.map((dept) => (
                                <div key={dept.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
                                    <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center mb-3 border border-indigo-100 shadow-sm">
                                        <Building2 size={20} />
                                    </div>
                                    <h4 className="font-bold text-slate-800 mb-1">{dept.name}</h4>
                                    <p className="text-[10px] text-slate-500 font-medium line-clamp-2 mb-4">{dept.description || 'No description provided.'}</p>
                                    <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                            {employees.filter(e => e.department === dept.id).length} Members
                                        </span>
                                        {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.WORKFORCE?.edit) && (
                                            <button className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors bg-slate-50 hover:bg-indigo-50 rounded border border-transparent hover:border-indigo-100">
                                                <Edit2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'designations' && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="px-5 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Designation Name</th>
                                        <th className="px-5 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Department</th>
                                        <th className="px-5 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Staff Count</th>
                                        <th className="px-5 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {designations.map((desig) => (
                                        <tr key={desig.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-5 py-3">
                                                <span className="text-sm font-semibold text-slate-800">{desig.name}</span>
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded text-[10px] font-semibold">
                                                    {desig.department_name}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className="text-xs font-semibold text-slate-600">
                                                    {employees.filter(e => e.designation === desig.id).length}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-right space-x-1">
                                                {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.WORKFORCE?.edit) && (
                                                    <button className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded border border-transparent hover:border-indigo-100 transition-colors"><Edit2 size={14} /></button>
                                                )}
                                                {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.WORKFORCE?.delete) && (
                                                    <button className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded border border-transparent hover:border-red-100 transition-colors"><Trash2 size={14} /></button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    
                    {activeTab === 'organization chart' && (
                        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-4 overflow-hidden">
                            <OrganizationChart employees={employees} />
                        </div>
                    )}

                    {activeTab === 'form builder' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* Create Field Form */}
                            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm h-fit">
                                <h3 className="text-xl font-black text-slate-900 mb-2">New Form Field</h3>
                                <p className="text-slate-500 text-sm mb-8">Add custom data points to your onboarding form.</p>
                                
                                <form onSubmit={handleAddCustomField} className="space-y-6">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Field Label</label>
                                        <input 
                                            required
                                            type="text" 
                                            className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-rose-300 transition-all font-bold"
                                            placeholder="e.g. Blood Group"
                                            value={newCustomField.label}
                                            onChange={(e) => setNewCustomField({...newCustomField, label: e.target.value})}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Input Type</label>
                                        <select 
                                            className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-rose-300 transition-all font-bold appearance-none"
                                            value={newCustomField.field_type}
                                            onChange={(e) => setNewCustomField({...newCustomField, field_type: e.target.value})}
                                        >
                                            <option value="text">Short Text</option>
                                            <option value="number">Number</option>
                                            <option value="date">Date Picker</option>
                                            <option value="file">Image / File Upload</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-3 p-2">
                                        <input 
                                            type="checkbox" 
                                            id="req"
                                            className="w-5 h-5 accent-rose-600 rounded-lg"
                                            checked={newCustomField.required}
                                            onChange={(e) => setNewCustomField({...newCustomField, required: e.target.checked})}
                                        />
                                        <label htmlFor="req" className="text-sm font-bold text-slate-600 cursor-pointer">Mark as Required</label>
                                    </div>
                                    <button 
                                        type="submit"
                                        className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 uppercase tracking-widest text-xs"
                                    >
                                        Add to Form
                                    </button>
                                </form>
                            </div>

                            {/* Active Fields List */}
                            <div className="lg:col-span-2 space-y-4">
                                <h3 className="text-xl font-black text-slate-900 px-2">Active Custom Fields</h3>
                                {customFields.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {customFields.map(field => (
                                            <div key={field.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex justify-between items-center group">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center">
                                                        <Plus size={20} />
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-slate-900">{field.label}</h4>
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{field.field_type} {field.required ? '• Required' : ''}</p>
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={() => handleDeleteCustomField(field.id)}
                                                    className="p-3 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-[2.5rem] p-12 text-center">
                                        <p className="text-slate-400 font-bold">No custom fields defined yet.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'company wall' && (
                        <CompanyWall authUser={authUser} />
                    )}

                    {activeTab === 'expenses' && (
                        <ExpenseManagement authUser={authUser} employees={employees} />
                    )}

                    {activeTab === 'performance' && (
                        <PerformanceReviews authUser={authUser} employees={employees} />
                    )}
                </motion.div>
            </AnimatePresence>

            {/* Modals (Dept) */}
            {showAddDept && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 sm:p-6">
                    <motion.div 
                        initial={{ scale: 0.95, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden flex flex-col"
                    >
                        {/* Header */}
                        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center shadow-sm">
                                    <Building2 size={24} strokeWidth={2.5} />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">New Department</h3>
                                    <p className="text-slate-500 text-xs font-medium mt-0.5">Group your workforce into functional teams.</p>
                                </div>
                            </div>
                            <button onClick={() => setShowAddDept(false)} className="w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 hover:border-rose-100 transition-all shadow-sm">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-8">
                            <form id="deptForm" onSubmit={handleAddDept} className="space-y-6">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Department Name</label>
                                    <input 
                                        required
                                        type="text" 
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all font-semibold text-slate-800 placeholder-slate-400 text-sm"
                                        placeholder="e.g. Finance & Accounts"
                                        value={newDept.name}
                                        onChange={(e) => setNewDept({...newDept, name: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description</label>
                                    <textarea 
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all font-medium text-slate-800 placeholder-slate-400 text-sm h-28 resize-none custom-scrollbar"
                                        placeholder="What does this team do?"
                                        value={newDept.description}
                                        onChange={(e) => setNewDept({...newDept, description: e.target.value})}
                                    />
                                </div>
                            </form>
                        </div>

                        {/* Footer */}
                        <div className="px-8 py-5 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                            <button 
                                type="button"
                                onClick={() => setShowAddDept(false)}
                                className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm text-sm"
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit"
                                form="deptForm"
                                className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 hover:shadow-indigo-300 transform hover:-translate-y-0.5 text-sm"
                            >
                                Create Dept
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Modals (Designation) */}
            {showAddDesignation && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 sm:p-6">
                    <motion.div 
                        initial={{ scale: 0.95, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden flex flex-col"
                    >
                        {/* Header */}
                        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center shadow-sm">
                                    <Briefcase size={24} strokeWidth={2.5} />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">New Designation</h3>
                                    <p className="text-slate-500 text-xs font-medium mt-0.5">Define roles within your departments.</p>
                                </div>
                            </div>
                            <button onClick={() => setShowAddDesignation(false)} className="w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 hover:border-rose-100 transition-all shadow-sm">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-8">
                            <form id="desigForm" onSubmit={handleAddDesignation} className="space-y-6">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Department</label>
                                    <select 
                                        required
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all font-semibold text-slate-800 text-sm appearance-none cursor-pointer"
                                        value={newDesignation.department}
                                        onChange={(e) => setNewDesignation({...newDesignation, department: e.target.value})}
                                    >
                                        <option value="" disabled>Select Department</option>
                                        {departments.map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Designation Title</label>
                                    <input 
                                        required
                                        type="text" 
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all font-semibold text-slate-800 placeholder-slate-400 text-sm"
                                        placeholder="e.g. Senior Accountant"
                                        value={newDesignation.name}
                                        onChange={(e) => setNewDesignation({...newDesignation, name: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Permission Role <span className="text-slate-400 font-normal">(Auto-Assign)</span></label>
                                    <select 
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all font-semibold text-slate-800 text-sm appearance-none cursor-pointer"
                                        value={newDesignation.permission_role}
                                        onChange={(e) => setNewDesignation({...newDesignation, permission_role: e.target.value})}
                                    >
                                        <option value="ADMIN">Admin</option>
                                        <option value="SALES">Sales</option>
                                        <option value="MENTOR">Mentor</option>
                                        <option value="ACADEMIC">Academic</option>
                                        <option value="ACADEMIC_COORDINATOR">Coordinator</option>
                                        <option value="TEACHER">Teacher</option>
                                        <option value="EMPLOYEE">General Employee</option>
                                    </select>
                                    <p className="text-[11px] text-slate-500 mt-2 font-medium">Staff with this designation will automatically inherit these module permissions.</p>
                                </div>
                            </form>
                        </div>

                        {/* Footer */}
                        <div className="px-8 py-5 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                            <button 
                                type="button"
                                onClick={() => setShowAddDesignation(false)}
                                className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm text-sm"
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit"
                                form="desigForm"
                                className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 hover:shadow-indigo-300 transform hover:-translate-y-0.5 text-sm"
                            >
                                Create Role
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Modal (Add Employee) */}
            {showAddEmployee && createPortal((
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 sm:p-6">
                    <motion.div 
                        initial={{ scale: 0.95, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        className="bg-white w-full max-w-3xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh]"
                    >
                        {/* Header */}
                        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 sticky top-0 z-20">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center shadow-sm">
                                    <UserPlus size={24} strokeWidth={2.5} />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">{isEditMode ? 'Edit Profile' : 'Onboard Employee'}</h3>
                                    <p className="text-slate-500 text-xs font-medium mt-0.5">{isEditMode ? 'Update existing credentials and HR data.' : 'Create login credentials and set up their HR profile.'}</p>
                                </div>
                            </div>
                            <button onClick={() => { setShowAddEmployee(false); setIsEditMode(false); }} className="w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 hover:border-rose-100 transition-all shadow-sm">
                                <X size={20} />
                            </button>
                        </div>
                        
                        {/* Scrollable Form Area */}
                        <div className="p-8 overflow-y-auto custom-scrollbar flex-1 bg-white">
                            <form id="employeeForm" onSubmit={handleAddEmployee} className="space-y-10">
                                
                                {/* Section 1: Credentials */}
                                <div>
                                    <div className="flex items-center gap-2 mb-6">
                                        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                                            <span className="font-bold text-sm">1</span>
                                        </div>
                                        <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Identity & Access</h4>
                                        <div className="h-px bg-slate-100 flex-1 ml-4"></div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5 px-2">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">First Name</label>
                                            <input required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all font-semibold text-slate-800 placeholder-slate-400 text-sm" 
                                                placeholder="e.g. John"
                                                value={newEmployee.first_name} onChange={(e) => setNewEmployee({...newEmployee, first_name: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Last Name</label>
                                            <input required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all font-semibold text-slate-800 placeholder-slate-400 text-sm" 
                                                placeholder="e.g. Doe"
                                                value={newEmployee.last_name} onChange={(e) => setNewEmployee({...newEmployee, last_name: e.target.value})} />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email Address</label>
                                            <input required type="email" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all font-semibold text-slate-800 placeholder-slate-400 text-sm" 
                                                placeholder="john.doe@company.com"
                                                value={newEmployee.email} onChange={(e) => setNewEmployee({...newEmployee, email: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Username</label>
                                            <input required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all font-semibold text-slate-800 placeholder-slate-400 text-sm" 
                                                placeholder="johndoe123"
                                                value={newEmployee.username} onChange={(e) => setNewEmployee({...newEmployee, username: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Password {isEditMode && <span className="text-slate-400 font-normal">(Leave blank to keep)</span>}</label>
                                            <input required={!isEditMode} type="password" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all font-semibold text-slate-800 placeholder-slate-400 text-sm" 
                                                placeholder="••••••••"
                                                value={newEmployee.password} onChange={(e) => setNewEmployee({...newEmployee, password: e.target.value})} />
                                        </div>
                                    </div>
                                </div>

                                {/* Section 2: HR Details */}
                                <div>
                                    <div className="flex items-center gap-2 mb-6">
                                        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                                            <span className="font-bold text-sm">2</span>
                                        </div>
                                        <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Workforce Setup</h4>
                                        <div className="h-px bg-slate-100 flex-1 ml-4"></div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5 px-2">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Employee ID</label>
                                            <input required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all font-bold text-indigo-600 font-mono text-sm" 
                                                value={newEmployee.employee_id} onChange={(e) => setNewEmployee({...newEmployee, employee_id: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Monthly Salary (INR)</label>
                                            <input required type="number" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all font-semibold text-slate-800 text-sm" 
                                                placeholder="0.00"
                                                value={newEmployee.base_salary} onChange={(e) => setNewEmployee({...newEmployee, base_salary: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Department</label>
                                            <select required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all font-semibold text-slate-800 text-sm appearance-none cursor-pointer" 
                                                value={newEmployee.department || ''} onChange={(e) => setNewEmployee({...newEmployee, department: e.target.value, designation: ''})}>
                                                <option value="" disabled>Select Department</option>
                                                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Designation / Role</label>
                                            <select required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all font-semibold text-slate-800 text-sm appearance-none cursor-pointer" 
                                                value={newEmployee.designation || ''} onChange={(e) => setNewEmployee({...newEmployee, designation: e.target.value})}>
                                                <option value="" disabled>Select Role</option>
                                                {designations.filter(d => String(d.department) === String(newEmployee.department)).map(d => (
                                                    <option key={d.id} value={d.id}>{d.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Reporting Manager <span className="text-slate-400 font-normal">(Optional)</span></label>
                                            <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all font-semibold text-slate-800 text-sm appearance-none cursor-pointer" 
                                                value={newEmployee.reporting_to || ''} onChange={(e) => setNewEmployee({...newEmployee, reporting_to: e.target.value})}>
                                                <option value="">None (Top Level / CEO)</option>
                                                {employees.map(e => {
                                                    if (e.id === newEmployee.id) return null;
                                                    return <option key={e.id} value={e.id}>{e.full_name || e.display_username} • {e.designation_name}</option>;
                                                })}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Date of Birth</label>
                                            <input required type="date" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all font-semibold text-slate-800 text-sm" 
                                                value={newEmployee.date_of_birth || ''} onChange={(e) => setNewEmployee({...newEmployee, date_of_birth: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Date of Joining</label>
                                            <input required type="date" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all font-semibold text-slate-800 text-sm" 
                                                value={newEmployee.date_of_joining || ''} onChange={(e) => setNewEmployee({...newEmployee, date_of_joining: e.target.value})} />
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Section 3: Custom Fields */}
                                {customFields.length > 0 && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-6">
                                            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                                                <span className="font-bold text-sm">3</span>
                                            </div>
                                            <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Additional Details</h4>
                                            <div className="h-px bg-slate-100 flex-1 ml-4"></div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5 px-2">
                                            {customFields.map(field => (
                                                <div key={field.id} className={field.field_type === 'file' ? "md:col-span-2" : ""}>
                                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                                                        {field.label} {field.required && <span className="text-rose-500">*</span>}
                                                    </label>
                                                    <input 
                                                        required={field.required}
                                                        type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : field.field_type === 'file' ? 'file' : 'text'}
                                                        className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all font-semibold text-slate-800 text-sm ${field.field_type === 'file' ? 'file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer bg-white' : ''}`}
                                                        value={field.field_type !== 'file' ? (newEmployee.additional_data?.[field.name] || '') : undefined}
                                                        onChange={(e) => {
                                                            if (field.field_type === 'file') {
                                                                // Basic file handling mock
                                                                setNewEmployee({
                                                                    ...newEmployee,
                                                                    additional_data: { ...newEmployee.additional_data, [field.name]: 'file_attached' }
                                                                });
                                                            } else {
                                                                setNewEmployee({
                                                                    ...newEmployee,
                                                                    additional_data: { ...newEmployee.additional_data, [field.name]: e.target.value }
                                                                });
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Section 4: Documents (Edit Mode Only) */}
                                {isEditMode && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-6">
                                            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                                                <span className="font-bold text-sm">4</span>
                                            </div>
                                            <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Documents Vault</h4>
                                            <div className="h-px bg-slate-100 flex-1 ml-4"></div>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center">
                                            <p className="text-sm text-slate-600 font-medium mb-3">Upload employee documents (Offer Letter, ID Proofs, Resumes, etc.)</p>
                                            
                                            {newEmployee.documents && newEmployee.documents.length > 0 && (
                                                <div className="mb-4 text-left space-y-2 max-h-40 overflow-y-auto">
                                                    {newEmployee.documents.map(doc => (
                                                        <div key={doc.id} className="flex justify-between items-center p-3 bg-white rounded-lg border border-slate-100 shadow-sm">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-[10px]">DOC</div>
                                                                <span className="text-xs font-bold text-slate-700">{doc.document_type}</span>
                                                            </div>
                                                            <a href={doc.file} target="_blank" rel="noreferrer" className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2 py-1 rounded">View</a>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            <label className="inline-block cursor-pointer px-4 py-2 bg-white border border-slate-200 shadow-sm rounded-lg text-sm font-bold text-indigo-600 hover:bg-indigo-50 transition-colors">
                                                + Upload Document
                                                <input type="file" className="hidden" onChange={handleDocumentUpload} accept=".pdf,.doc,.docx,.jpg,.png,.jpeg" />
                                            </label>
                                        </div>
                                    </div>
                                )}

                                {/* Section 5: Offboarding (Edit Mode Only) */}
                                {isEditMode && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-6">
                                            <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600 shrink-0">
                                                <span className="font-bold text-sm">5</span>
                                            </div>
                                            <h4 className="text-sm font-bold text-rose-600 uppercase tracking-wide">Offboarding & Separation</h4>
                                            <div className="h-px bg-slate-100 flex-1 ml-4"></div>
                                        </div>
                                        <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-6">
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <h5 className="font-bold text-slate-800">Initiate Offboarding</h5>
                                                    <p className="text-xs text-slate-500 mt-1">Begin the separation process (resignation, asset return, exit interview).</p>
                                                </div>
                                                <button type="button" onClick={() => alert("Initiating offboarding flow...")} className="px-4 py-2 bg-rose-600 shadow-sm rounded-lg text-sm font-bold text-white hover:bg-rose-700 transition-colors">
                                                    Start Offboarding
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </form>
                        </div>

                        {/* Footer / Actions */}
                        <div className="px-8 py-5 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3 rounded-b-[2rem]">
                            <button 
                                type="button"
                                onClick={() => { setShowAddEmployee(false); setIsEditMode(false); }}
                                className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm text-sm"
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit"
                                form="employeeForm"
                                className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 hover:shadow-indigo-300 transform hover:-translate-y-0.5 text-sm"
                            >
                                {isEditMode ? 'Save Changes' : 'Complete Onboarding'}
                            </button>
                        </div>
                    </motion.div>
                </div>
            ), document.body)}
            {/* Modal (View Profile) */}
            {showViewProfile && selectedEmployee && createPortal((
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                    >
                        <div className="p-8 overflow-y-auto flex-1 custom-scrollbar">
                            <div className="flex justify-between items-start mb-8">
                                <div className="flex items-center gap-4">
                                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-rose-600 to-rose-400 flex items-center justify-center text-white font-black text-3xl">
                                        {selectedEmployee.full_name?.[0] || selectedEmployee.display_username?.[0].toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black text-slate-900">{selectedEmployee.full_name || selectedEmployee.display_username}</h3>
                                        <p className="text-rose-600 font-bold uppercase tracking-widest text-xs">{selectedEmployee.designation_name}</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowViewProfile(false)} className="p-2 bg-slate-50 rounded-xl text-slate-400 hover:text-rose-600 transition-colors">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-6 mb-8">
                                <div className="bg-slate-50 p-4 rounded-2xl">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Employee ID</p>
                                    <p className="font-bold text-slate-900">{selectedEmployee.employee_id}</p>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-2xl">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Department</p>
                                    <p className="font-bold text-slate-900">{selectedEmployee.department_name}</p>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-2xl">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Username</p>
                                    <p className="font-bold text-slate-900">{selectedEmployee.username}</p>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-2xl">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Email Address</p>
                                    <p className="font-bold text-slate-900">{selectedEmployee.email}</p>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-2xl">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Joining Date</p>
                                    <p className="font-bold text-slate-900">{selectedEmployee.date_of_joining}</p>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-2xl">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Monthly Salary</p>
                                    <p className="font-bold text-emerald-600">₹{parseFloat(selectedEmployee.base_salary).toLocaleString()}</p>
                                </div>
                            </div>

                            {/* Custom Fields Data */}
                            {customFields.length > 0 && Object.keys(selectedEmployee.additional_data || {}).length > 0 && (
                                <div className="mb-8 space-y-4">
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">Additional Information</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        {customFields.map(field => selectedEmployee.additional_data?.[field.name] && (
                                            <div key={field.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{field.label}</p>
                                                <p className="font-bold text-slate-700">{selectedEmployee.additional_data[field.name]}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-4">
                                <div className="flex items-center gap-3 p-4 border border-slate-100 rounded-2xl">
                                    <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center">
                                        <CheckCircle2 size={20} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Current Status</p>
                                        <p className="font-bold text-emerald-600">Active & Operational</p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 flex gap-3">
                                <button onClick={() => setShowViewProfile(false)} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg">
                                    Close Profile
                                </button>
                                {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.WORKFORCE?.edit) && (
                                    <button 
                                        onClick={() => openEditEmployee(selectedEmployee)}
                                        className="flex-1 py-4 bg-rose-50 text-rose-600 rounded-2xl font-bold hover:bg-rose-100 transition-all"
                                    >
                                        Edit Profile
                                    </button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </div>
            ), document.body)}
        </div>
    );
};

export default HRMSModule;
