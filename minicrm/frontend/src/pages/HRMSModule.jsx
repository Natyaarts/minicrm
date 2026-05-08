import React, { useState, useEffect } from 'react';
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
        department: '', designation: '', date_of_joining: new Date().toISOString().split('T')[0],
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
                api.get('hrms/employees/').catch(() => ({ data: [] })),
                api.get('hrms/departments/').catch(() => ({ data: [] })),
                api.get('hrms/designations/').catch(() => ({ data: [] })),
                api.get('hrms/custom-fields/').catch(() => ({ data: [] }))
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
            if (isEditMode) {
                await api.patch(`hrms/employees/${newEmployee.id}/`, newEmployee);
            } else {
                await api.post('hrms/employees/', newEmployee);
            }
            setShowAddEmployee(false);
            setIsEditMode(false);
            setNewEmployee({
                username: '', first_name: '', last_name: '', email: '', password: '',
                employee_id: `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
                department: '', designation: '', date_of_joining: new Date().toISOString().split('T')[0],
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

    const renderStats = () => (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/70 backdrop-blur-md p-6 rounded-3xl border border-white shadow-sm"
            >
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
                        <Users size={24} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Total Workforce</p>
                        <h3 className="text-3xl font-black text-slate-900">{stats.totalEmployees}</h3>
                    </div>
                </div>
            </motion.div>

            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white/70 backdrop-blur-md p-6 rounded-3xl border border-white shadow-sm"
            >
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                        <Building2 size={24} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Departments</p>
                        <h3 className="text-3xl font-black text-slate-900">{stats.totalDepts}</h3>
                    </div>
                </div>
            </motion.div>

            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white/70 backdrop-blur-md p-6 rounded-3xl border border-white shadow-sm"
            >
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                        <CheckCircle2 size={24} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Active Staff</p>
                        <h3 className="text-3xl font-black text-slate-900">{stats.activeStaff}</h3>
                    </div>
                </div>
            </motion.div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#FDFCFB] pb-20 px-4 md:px-8">
            {authUser?.role === 'SUPER_ADMIN' ? renderStats() : null}
            
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 mt-8">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight">
                        {authUser?.role === 'SUPER_ADMIN' ? 'Workforce ' : 'My '}
                        <span className="text-rose-600">Hub.</span>
                    </h1>
                    <p className="text-slate-500 font-medium mt-1">
                        {authUser?.role === 'SUPER_ADMIN' 
                            ? 'Manage departments, designations, and employee profiles.' 
                            : 'View and manage your personal employee profile.'}
                    </p>
                </div>

                <div className="flex bg-white/80 backdrop-blur-md p-1.5 rounded-2xl border border-white shadow-sm overflow-x-auto">
                    {['employees', 'departments', 'designations', 'form builder'].map((tab) => {
                        // Permissions check for tabs
                        if (authUser?.role !== 'SUPER_ADMIN') {
                            if (tab === 'departments' || tab === 'designations') return null;
                            if (tab === 'form builder' && !authUser?.permissions?.WORKFORCE?.edit) return null;
                        }
                        
                        return (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-6 py-2.5 rounded-xl text-sm font-bold capitalize transition-all whitespace-nowrap ${
                                    activeTab === tab 
                                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-200' 
                                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                            >
                                {tab === 'employees' && authUser?.role !== 'SUPER_ADMIN' ? 'My Profile' : tab}
                            </button>
                        );
                    })}
                </div>
            </div>

            {renderStats()}

            {/* Action Bar */}
            <div className="flex flex-col md:flex-row justify-between items-center bg-white/70 backdrop-blur-md p-4 rounded-3xl border border-white shadow-sm mb-8 gap-4">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                        type="text" 
                        placeholder={`Search ${activeTab}...`}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-white/50 border border-slate-100 rounded-2xl outline-none focus:border-rose-300 focus:ring-4 focus:ring-rose-50 transition-all font-medium text-slate-700"
                    />
                </div>

                <div className="flex gap-3 w-full md:w-auto">
                    <button 
                        onClick={fetchData}
                        className="p-3 bg-white border border-slate-100 text-slate-600 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-all shadow-sm"
                    >
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                    </button>
                    
                    {activeTab === 'employees' && (authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.WORKFORCE?.add) && (
                        <button 
                            onClick={() => setShowAddEmployee(true)}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                        >
                            <UserPlus size={20} />
                            Add Employee
                        </button>
                    )}
                    {activeTab === 'departments' && (authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.WORKFORCE?.add) && (
                        <button 
                            onClick={() => setShowAddDept(true)}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-rose-600 text-white rounded-2xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-200"
                        >
                            <Plus size={20} />
                            New Department
                        </button>
                    )}
                    {activeTab === 'designations' && (authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.WORKFORCE?.add) && (
                        <button 
                            onClick={() => setShowAddDesignation(true)}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-amber-500 text-white rounded-2xl font-bold hover:bg-amber-600 transition-all shadow-lg shadow-amber-200"
                        >
                            <Plus size={20} />
                            New Designation
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
                    {activeTab === 'employees' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {employees.length > 0 ? employees.map((emp) => (
                                <div key={emp.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group">
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-rose-100 to-rose-50 flex items-center justify-center text-rose-600 font-black text-2xl border border-rose-100">
                                            {emp.full_name?.[0] || emp.display_username?.[0].toUpperCase()}
                                        </div>
                                        <div>
                                            <h4 className="font-black text-slate-900 group-hover:text-rose-600 transition-colors">{emp.full_name || emp.display_username}</h4>
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{emp.designation_name || 'No Designation'}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-3 mb-6">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-400 font-bold">Department</span>
                                            <span className="text-slate-700 font-bold">{emp.department_name || 'Unassigned'}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-400 font-bold">ID</span>
                                            <span className="text-rose-600 font-black font-mono">{emp.employee_id}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-400 font-bold">Status</span>
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                                                emp.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
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
                                        className="w-full py-3 bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-2xl font-bold text-sm transition-all border border-transparent hover:border-rose-100"
                                    >
                                        View Full Profile
                                    </button>
                                </div>
                            )) : (
                                <div className="col-span-full py-20 text-center">
                                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Users className="text-slate-300" size={32} />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-900">No employees found</h3>
                                    <p className="text-slate-500">Start by adding your first workforce member.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'departments' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {departments.map((dept) => (
                                <div key={dept.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
                                    <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-4">
                                        <Building2 size={24} />
                                    </div>
                                    <h4 className="font-black text-slate-900 mb-2">{dept.name}</h4>
                                    <p className="text-xs text-slate-500 font-medium line-clamp-2 mb-4">{dept.description || 'No description provided.'}</p>
                                    <div className="flex justify-between items-center pt-4 border-t border-slate-50">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                            {employees.filter(e => e.department === dept.id).length} Members
                                        </span>
                                        {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.WORKFORCE?.edit) && (
                                            <button className="p-2 text-slate-400 hover:text-rose-600 transition-colors">
                                                <Edit2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'designations' && (
                        <div className="overflow-hidden bg-white/70 backdrop-blur-md rounded-3xl border border-white shadow-sm">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50/50 border-b border-slate-100">
                                    <tr>
                                        <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Designation Name</th>
                                        <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Department</th>
                                        <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Staff Count</th>
                                        <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {designations.map((desig) => (
                                        <tr key={desig.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-8 py-5">
                                                <span className="font-bold text-slate-900">{desig.name}</span>
                                            </td>
                                            <td className="px-8 py-5">
                                                <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-lg text-xs font-bold border border-amber-100">
                                                    {desig.department_name}
                                                </span>
                                            </td>
                                            <td className="px-8 py-5">
                                                <span className="text-sm font-bold text-slate-500">
                                                    {employees.filter(e => e.designation === desig.id).length}
                                                </span>
                                            </td>
                                            <td className="px-8 py-5 text-right space-x-2">
                                                {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.WORKFORCE?.edit) && (
                                                    <button className="p-2 text-slate-400 hover:text-rose-600 transition-colors"><Edit2 size={18} /></button>
                                                )}
                                                {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.WORKFORCE?.delete) && (
                                                    <button className="p-2 text-slate-400 hover:text-rose-600 transition-colors"><Trash2 size={18} /></button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
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
                </motion.div>
            </AnimatePresence>

            {/* Modals (Dept) */}
            {showAddDept && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
                    >
                        <div className="p-8">
                            <h3 className="text-2xl font-black text-slate-900 mb-2">New Department</h3>
                            <p className="text-slate-500 text-sm mb-6">Group your workforce into functional teams.</p>
                            
                            <form onSubmit={handleAddDept} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Department Name</label>
                                    <input 
                                        required
                                        type="text" 
                                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-rose-300 focus:ring-4 focus:ring-rose-50 transition-all font-bold"
                                        placeholder="e.g. Finance & Accounts"
                                        value={newDept.name}
                                        onChange={(e) => setNewDept({...newDept, name: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Description</label>
                                    <textarea 
                                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-rose-300 focus:ring-4 focus:ring-rose-50 transition-all font-medium h-24 resize-none"
                                        placeholder="What does this team do?"
                                        value={newDept.description}
                                        onChange={(e) => setNewDept({...newDept, description: e.target.value})}
                                    />
                                </div>
                                <div className="flex gap-3 pt-4">
                                    <button 
                                        type="button"
                                        onClick={() => setShowAddDept(false)}
                                        className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit"
                                        className="flex-1 py-4 bg-rose-600 text-white rounded-2xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-200"
                                    >
                                        Create Dept
                                    </button>
                                </div>
                            </form>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Modals (Designation) */}
            {showAddDesignation && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
                    >
                        <div className="p-8">
                            <h3 className="text-2xl font-black text-slate-900 mb-2">New Designation</h3>
                            <p className="text-slate-500 text-sm mb-6">Define roles within your departments.</p>
                            
                            <form onSubmit={handleAddDesignation} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Department</label>
                                    <select 
                                        required
                                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-50 transition-all font-bold"
                                        value={newDesignation.department}
                                        onChange={(e) => setNewDesignation({...newDesignation, department: e.target.value})}
                                    >
                                        <option value="">Select Department</option>
                                        {departments.map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Designation Title</label>
                                    <input 
                                        required
                                        type="text" 
                                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-50 transition-all font-bold"
                                        placeholder="e.g. Senior Accountant"
                                        value={newDesignation.name}
                                        onChange={(e) => setNewDesignation({...newDesignation, name: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Permission Role (Auto-Assign)</label>
                                    <select 
                                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-50 transition-all font-bold appearance-none"
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
                                    <p className="text-[10px] text-slate-400 mt-2 ml-1">Staff with this designation will automatically get these permissions.</p>
                                </div>
                                <div className="flex gap-3 pt-4">
                                    <button 
                                        type="button"
                                        onClick={() => setShowAddDesignation(false)}
                                        className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit"
                                        className="flex-1 py-4 bg-amber-500 text-white rounded-2xl font-bold hover:bg-amber-600 transition-all shadow-lg shadow-amber-200"
                                    >
                                        Create Role
                                    </button>
                                </div>
                            </form>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Modal (Add Employee) */}
            {showAddEmployee && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
                    >
                        <div className="p-8">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900">{isEditMode ? 'Edit Employee Profile' : 'Onboard New Employee'}</h3>
                                    <p className="text-slate-500 text-sm">{isEditMode ? 'Update existing credentials and HR data.' : 'Create login credentials and HR profile.'}</p>
                                </div>
                                <button onClick={() => { setShowAddEmployee(false); setIsEditMode(false); }} className="p-2 bg-slate-50 rounded-xl text-slate-400 hover:text-rose-600 transition-colors">
                                    <X size={20} />
                                </button>
                            </div>
                            
                            <form onSubmit={handleAddEmployee} className="space-y-6">
                                {/* Section 1: Credentials */}
                                <div className="bg-slate-50 p-6 rounded-2xl space-y-4">
                                    <h4 className="text-xs font-black text-rose-600 uppercase tracking-widest">1. Login Credentials</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Username</label>
                                            <input required className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl outline-none focus:border-rose-300 transition-all font-bold text-sm" 
                                                value={newEmployee.username} onChange={(e) => setNewEmployee({...newEmployee, username: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Password {isEditMode && '(Leave blank to keep current)'}</label>
                                            <input required={!isEditMode} type="password" className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl outline-none focus:border-rose-300 transition-all font-bold text-sm" 
                                                value={newEmployee.password} onChange={(e) => setNewEmployee({...newEmployee, password: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">First Name</label>
                                            <input required className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl outline-none focus:border-rose-300 transition-all font-bold text-sm" 
                                                value={newEmployee.first_name} onChange={(e) => setNewEmployee({...newEmployee, first_name: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Last Name</label>
                                            <input required className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl outline-none focus:border-rose-300 transition-all font-bold text-sm" 
                                                value={newEmployee.last_name} onChange={(e) => setNewEmployee({...newEmployee, last_name: e.target.value})} />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Email Address</label>
                                            <input required type="email" className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl outline-none focus:border-rose-300 transition-all font-bold text-sm" 
                                                value={newEmployee.email} onChange={(e) => setNewEmployee({...newEmployee, email: e.target.value})} />
                                        </div>
                                    </div>
                                </div>

                                {/* Section 2: HR Details */}
                                <div className="bg-amber-50/50 p-6 rounded-2xl space-y-4">
                                    <h4 className="text-xs font-black text-amber-600 uppercase tracking-widest">2. Employment Details</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Employee ID</label>
                                            <input required className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl outline-none focus:border-amber-300 transition-all font-bold text-sm" 
                                                value={newEmployee.employee_id} onChange={(e) => setNewEmployee({...newEmployee, employee_id: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Monthly Salary (INR)</label>
                                            <input required type="number" className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl outline-none focus:border-amber-300 transition-all font-bold text-sm" 
                                                value={newEmployee.base_salary} onChange={(e) => setNewEmployee({...newEmployee, base_salary: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Department</label>
                                            <select required className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl outline-none focus:border-amber-300 transition-all font-bold text-sm" 
                                                value={newEmployee.department} onChange={(e) => setNewEmployee({...newEmployee, department: e.target.value})}>
                                                <option value="">Select Dept</option>
                                                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Designation</label>
                                            <select required className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl outline-none focus:border-amber-300 transition-all font-bold text-sm" 
                                                value={newEmployee.designation} onChange={(e) => setNewEmployee({...newEmployee, designation: e.target.value})}>
                                                <option value="">Select Designation</option>
                                                {designations.filter(d => d.department == newEmployee.department).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Section 3: Custom Fields */}
                                {customFields.length > 0 && (
                                    <div className="bg-slate-50 p-6 rounded-2xl space-y-4">
                                        <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest">3. Additional Information</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {customFields.map(field => (
                                                <div key={field.id}>
                                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                                        {field.label} {field.required && <span className="text-rose-600">*</span>}
                                                    </label>
                                                    <input 
                                                        type={field.field_type === 'file' ? 'file' : field.field_type} 
                                                        required={field.required}
                                                        className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl outline-none focus:border-rose-300 transition-all font-bold text-sm" 
                                                        placeholder={`Enter ${field.label}`}
                                                        value={newEmployee.additional_data?.[field.name] || ''}
                                                        onChange={(e) => {
                                                            const value = field.field_type === 'file' ? e.target.files[0]?.name : e.target.value;
                                                            setNewEmployee({
                                                                ...newEmployee, 
                                                                additional_data: {
                                                                    ...newEmployee.additional_data,
                                                                    [field.name]: value
                                                                }
                                                            })
                                                        }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-3 pt-4">
                                    <button type="button" onClick={() => { setShowAddEmployee(false); setIsEditMode(false); }} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all">Cancel</button>
                                    <button type="submit" className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg">
                                        {isEditMode ? 'Update Profile' : 'Onboard Employee'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </motion.div>
                </div>
            )}
            {/* Modal (View Profile) */}
            {showViewProfile && selectedEmployee && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden"
                    >
                        <div className="p-8">
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
            )}
        </div>
    );
};

export default HRMSModule;
