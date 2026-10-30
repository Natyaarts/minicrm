import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    CheckCircle2, Clock, AlertCircle, User, ArrowRight,
    RefreshCw, Search, Filter, Phone, Mail, ChevronRight,
    X, CheckSquare, Users, Calendar, ArrowLeftRight, ExternalLink,
    Plus, Upload, FileText, Download, Check, AlertTriangle, Trash2,
    Layers, CheckCircle
} from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const STATUS_CONFIG = {
    PENDING: { label: 'Pending', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
    IN_PROGRESS: { label: 'In Progress', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
    COMPLETED: { label: 'Completed', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

export default function LeadTasksManagement({ onLeadClick }) {
    const { user: authUser } = useAuth();
    const canManageTasks = ['SUPER_ADMIN', 'ADMIN', 'TEAM_LEAD', 'SALES_HEAD', 'SALES_MANAGER', 'MANAGER', 'SALES_LEAD'].includes(authUser?.role) || authUser?.is_manager;

    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [salesUsers, setSalesUsers] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');

    // Selected Task for Details View
    const [selectedTask, setSelectedTask] = useState(null);
    const [loadingTaskDetails, setLoadingTaskDetails] = useState(false);
    const [activeDetailTab, setActiveDetailTab] = useState('leads'); // 'leads' | 'history'

    // Whole Task Reassign Modal State
    const [reassignModalTask, setReassignModalTask] = useState(null);
    const [newAssigneeId, setNewAssigneeId] = useState('');
    const [reassignNotes, setReassignNotes] = useState('');
    const [reassigning, setReassigning] = useState(false);
    const [reassignError, setReassignError] = useState('');

    // Individual Lead Item Reassign Modal State
    const [reassignLeadModalItem, setReassignLeadModalItem] = useState(null);
    const [newLeadAssigneeId, setNewLeadAssigneeId] = useState('');
    const [reassignLeadNotes, setReassignLeadNotes] = useState('');
    const [reassigningLead, setReassigningLead] = useState(false);
    const [reassignLeadError, setReassignLeadError] = useState('');

    // Add New Task Modal State
    const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [csvFile, setCsvFile] = useState(null);
    const [csvValidating, setCsvValidating] = useState(false);
    const [csvResult, setCsvResult] = useState(null);
    const [csvError, setCsvError] = useState('');
    const [csvPreviewTab, setCsvPreviewTab] = useState('matched'); // 'matched' | 'unmatched' | 'duplicates'
    const [selectedBdeIds, setSelectedBdeIds] = useState([]);
    const [bdeSearchQuery, setBdeSearchQuery] = useState('');
    const [creatingTask, setCreatingTask] = useState(false);
    const [createTaskError, setCreateTaskError] = useState('');
    const fileInputRef = useRef(null);

    // Toggle Lead Item Completion State
    const [updatingLeadId, setUpdatingLeadId] = useState(null);
    const [expandedLeadHistory, setExpandedLeadHistory] = useState({});

    // Notification toast
    const [toastMessage, setToastMessage] = useState(null);

    const showToast = (msg, type = 'success') => {
        setToastMessage({ msg, type });
        setTimeout(() => setToastMessage(null), 3500);
    };

    useEffect(() => {
        fetchTasks();
        fetchSalesUsers();
    }, []);

    const fetchTasks = async () => {
        setLoading(true);
        try {
            const res = await api.get('/crm/lead-tasks/');
            const data = res.data?.results || res.data || [];
            setTasks(data);
        } catch (err) {
            console.error('Error fetching lead tasks:', err);
            showToast('Failed to load tasks', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchSalesUsers = async () => {
        try {
            const res = await api.get('/crm/sales-users/');
            setSalesUsers(res.data?.results || res.data || []);
        } catch (err) {
            console.error('Error fetching sales users:', err);
        }
    };

    const fetchTaskDetails = async (taskId) => {
        setLoadingTaskDetails(true);
        try {
            const res = await api.get(`/crm/lead-tasks/${taskId}/`);
            setSelectedTask(res.data);
        } catch (err) {
            console.error('Error loading task details:', err);
            showToast('Failed to load task details', 'error');
        } finally {
            setLoadingTaskDetails(false);
        }
    };

    const handleOpenTask = (task) => {
        fetchTaskDetails(task.id);
        setActiveDetailTab('leads');
    };

    const handleToggleLeadCompletion = async (taskId, leadId, currentStatus) => {
        setUpdatingLeadId(leadId);
        try {
            const res = await api.post(`/crm/lead-tasks/${taskId}/update-lead/`, {
                lead_id: leadId,
                is_completed: !currentStatus
            });
            setSelectedTask(res.data);
            setTasks(prev => prev.map(t => t.id === taskId ? {
                ...t,
                status: res.data.status,
                completed_leads: res.data.completed_leads,
                progress_percent: res.data.progress_percent,
                my_completed_leads: res.data.my_completed_leads,
                my_progress_percent: res.data.my_progress_percent
            } : t));
            showToast(currentStatus ? 'Lead marked pending' : 'Lead completed');
        } catch (err) {
            console.error('Error updating lead task status:', err);
            showToast('Failed to update lead status', 'error');
        } finally {
            setUpdatingLeadId(null);
        }
    };

    // Whole Task Reassignment
    const handleOpenReassignModal = (task, e) => {
        if (e) e.stopPropagation();
        setReassignModalTask(task);
        setNewAssigneeId('');
        setReassignNotes('');
        setReassignError('');
    };

    const handleExecuteReassign = async () => {
        if (!newAssigneeId) {
            setReassignError('Please select a new BDE executive');
            return;
        }

        setReassigning(true);
        setReassignError('');
        try {
            const res = await api.post(`/crm/lead-tasks/${reassignModalTask.id}/reassign/`, {
                new_assignee_id: newAssigneeId,
                notes: reassignNotes
            });

            showToast('Task successfully reassigned');
            setReassignModalTask(null);

            setTasks(prev => prev.map(t => t.id === res.data.id ? {
                ...t,
                assigned_to: res.data.assigned_to,
                assigned_to_name: res.data.assigned_to_name,
                assigned_bdes: res.data.assigned_bdes
            } : t));

            if (selectedTask && selectedTask.id === res.data.id) {
                setSelectedTask(res.data);
            }
        } catch (err) {
            console.error('Error reassigning task:', err);
            setReassignError(err.response?.data?.error || 'Failed to reassign task');
        } finally {
            setReassigning(false);
        }
    };

    // Individual Lead Reassignment
    const handleOpenLeadReassignModal = (item, e) => {
        if (e) e.stopPropagation();
        setReassignLeadModalItem(item);
        setNewLeadAssigneeId('');
        setReassignLeadNotes('');
        setReassignLeadError('');
    };

    const handleExecuteLeadReassign = async () => {
        if (!newLeadAssigneeId) {
            setReassignLeadError('Please select a new BDE executive for this lead');
            return;
        }

        setReassigningLead(true);
        setReassignLeadError('');
        try {
            const res = await api.post(`/crm/lead-tasks/${selectedTask.id}/reassign/`, {
                lead_id: reassignLeadModalItem.lead,
                new_assignee_id: newLeadAssigneeId,
                notes: reassignLeadNotes
            });

            showToast('Lead successfully reassigned');
            setReassignLeadModalItem(null);
            setSelectedTask(res.data);

            // Update in tasks list if needed
            setTasks(prev => prev.map(t => t.id === res.data.id ? {
                ...t,
                assigned_to_name: res.data.assigned_to_name,
                assigned_bdes: res.data.assigned_bdes
            } : t));
        } catch (err) {
            console.error('Error reassigning lead:', err);
            setReassignLeadError(err.response?.data?.error || 'Failed to reassign lead');
        } finally {
            setReassigningLead(false);
        }
    };

    // CSV Sample Download
    const handleDownloadSampleCsv = () => {
        const sampleHeaders = "lead_id,contact,name\n";
        const sampleRows = "NATYA-0001,9876543210,Aarav Sharma\nNATYA-0002,9876543211,Diya Patel\nNATYA-0003,9876543212,Rohan Verma\n";
        const blob = new Blob([sampleHeaders + sampleRows], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'sample_crm_leads_task_template.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // CSV File Select & Validation
    const handleFileSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.csv') && !file.name.toLowerCase().endsWith('.txt')) {
            setCsvError('Please upload a valid .csv file.');
            return;
        }

        setCsvFile(file);
        setCsvError('');
        setCsvResult(null);
        setCsvValidating(true);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await api.post('/crm/lead-tasks/validate-csv/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setCsvResult(res.data);
            if (res.data.unmatched_count > 0) {
                setCsvPreviewTab('unmatched');
            } else if (res.data.duplicate_count > 0) {
                setCsvPreviewTab('duplicates');
            } else {
                setCsvPreviewTab('matched');
            }
        } catch (err) {
            console.error('Error validating CSV:', err);
            setCsvError(err.response?.data?.error || 'Failed to validate CSV file. Please verify columns and file format.');
        } finally {
            setCsvValidating(false);
        }
    };

    const handleClearCsvFile = () => {
        setCsvFile(null);
        setCsvResult(null);
        setCsvError('');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // BDE Selection Helpers
    const filteredBdes = useMemo(() => {
        if (!bdeSearchQuery) return salesUsers;
        const q = bdeSearchQuery.toLowerCase();
        return salesUsers.filter(u =>
            u.username?.toLowerCase().includes(q) ||
            u.name?.toLowerCase().includes(q) ||
            `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase().includes(q)
        );
    }, [salesUsers, bdeSearchQuery]);

    const handleToggleBde = (userId) => {
        setSelectedBdeIds(prev =>
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    };

    const handleSelectAllBdes = () => {
        setSelectedBdeIds(filteredBdes.map(u => u.id));
    };

    const handleClearBdes = () => {
        setSelectedBdeIds([]);
    };

    // Calculate Workload Distribution Preview
    const distributionPreview = useMemo(() => {
        const leadsCount = csvResult?.matched_leads?.length || 0;
        const bdesCount = selectedBdeIds.length;
        if (leadsCount === 0 || bdesCount === 0) return [];

        const base = Math.floor(leadsCount / bdesCount);
        const remainder = leadsCount % bdesCount;

        return selectedBdeIds.map((bdeId, i) => {
            const bdeUser = salesUsers.find(u => u.id === bdeId);
            const count = base + (i < remainder ? 1 : 0);
            const name = bdeUser ? (bdeUser.name || `${bdeUser.first_name} ${bdeUser.last_name}`.trim() || bdeUser.username) : `Executive #${bdeId}`;
            return {
                bdeId,
                name,
                count,
                percent: Math.round((count / leadsCount) * 100)
            };
        });
    }, [csvResult, selectedBdeIds, salesUsers]);

    // Handle Create Task Submission
    const handleCreateTask = async (e) => {
        e.preventDefault();
        setCreateTaskError('');

        if (!newTaskTitle.trim()) {
            setCreateTaskError('Task Name is required.');
            return;
        }

        if (!csvResult || !csvResult.matched_leads || csvResult.matched_leads.length === 0) {
            setCreateTaskError('Please upload a CSV containing at least one valid CRM lead.');
            return;
        }

        if (selectedBdeIds.length === 0) {
            setCreateTaskError('Please select at least one BDE executive to assign.');
            return;
        }

        setCreatingTask(true);
        try {
            const leadIds = csvResult.matched_leads.map(m => m.id || m.lead_id);
            const payload = {
                title: newTaskTitle.trim(),
                lead_ids: leadIds,
                assigned_to_ids: selectedBdeIds
            };

            const res = await api.post('/crm/lead-tasks/', payload);
            showToast(`Task "${res.data.title}" created with ${leadIds.length} leads distributed across ${selectedBdeIds.length} executive(s)!`);

            // Close modal & reset
            setIsAddTaskModalOpen(false);
            setNewTaskTitle('');
            handleClearCsvFile();
            setSelectedBdeIds([]);
            setCreateTaskError('');

            // Refresh tasks list
            fetchTasks();
        } catch (err) {
            console.error('Error creating task:', err);
            setCreateTaskError(err.response?.data?.error || 'Failed to create task. Please try again.');
        } finally {
            setCreatingTask(false);
        }
    };

    // Filtered tasks
    const filteredTasks = useMemo(() => {
        return tasks.filter(task => {
            const matchesSearch = !searchQuery ||
                task.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                task.assigned_to_name?.toLowerCase().includes(searchQuery.toLowerCase());

            const matchesStatus = statusFilter === 'ALL' || task.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [tasks, searchQuery, statusFilter]);

    // Statistics
    const stats = useMemo(() => {
        const total = tasks.length;
        const pending = tasks.filter(t => t.status === 'PENDING').length;
        const inProgress = tasks.filter(t => t.status === 'IN_PROGRESS').length;
        const completed = tasks.filter(t => t.status === 'COMPLETED').length;
        const totalLeads = tasks.reduce((sum, t) => sum + (t.total_leads || 0), 0);
        return { total, pending, inProgress, completed, totalLeads };
    }, [tasks]);

    return (
        <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
            {/* Toast Notification */}
            {toastMessage && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all ${toastMessage.type === 'error'
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    }`}>
                    {toastMessage.msg}
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <CheckSquare className="text-indigo-600" size={24} />
                        Tasks Management
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        {canManageTasks
                            ? 'Monitor, create, and distribute multi-lead tasks across BDE executives.'
                            : 'View and execute multi-lead tasks assigned to you.'}
                    </p>
                </div>
                <div className="flex items-center gap-2.5">
                    <button
                        onClick={fetchTasks}
                        disabled={loading}
                        className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                    {canManageTasks && (
                        <button
                            id="add-new-task-btn"
                            onClick={() => {
                                setIsAddTaskModalOpen(true);
                                setCreateTaskError('');
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
                        >
                            <Plus size={16} />
                            Add New Task
                        </button>
                    )}
                </div>
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Tasks</p>
                    <p className="text-2xl font-bold text-slate-800 mt-1">{stats.total}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider">Pending</p>
                    <p className="text-2xl font-bold text-amber-700 mt-1">{stats.pending}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider">In Progress</p>
                    <p className="text-2xl font-bold text-blue-700 mt-1">{stats.inProgress}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">Completed</p>
                    <p className="text-2xl font-bold text-emerald-700 mt-1">{stats.completed}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm col-span-2 sm:col-span-1">
                    <p className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wider">Total Leads</p>
                    <p className="text-2xl font-bold text-indigo-700 mt-1">{stats.totalLeads}</p>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                    <input
                        type="text"
                        placeholder="Search tasks or BDE executive..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 rounded-lg text-xs border border-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white text-slate-800"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter size={14} className="text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500">Status:</span>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-500"
                    >
                        <option value="ALL">All Statuses</option>
                        <option value="PENDING">Pending</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="COMPLETED">Completed</option>
                    </select>
                </div>
            </div>

            {/* Tasks Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-sm text-slate-500 flex flex-col items-center gap-2">
                        <RefreshCw className="animate-spin text-indigo-600" size={24} />
                        Loading tasks...
                    </div>
                ) : filteredTasks.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">
                        <CheckSquare className="mx-auto text-slate-300 mb-2" size={36} />
                        <p className="text-sm font-semibold text-slate-700">No tasks found</p>
                        <p className="text-xs text-slate-400 mt-1">
                            {tasks.length === 0
                                ? 'Click "+ Add New Task" or select leads from Campaigns to create your first task.'
                                : 'No tasks match the active search and filter criteria.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-600">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase font-semibold text-[10px] tracking-wider">
                                <tr>
                                    <th className="py-3 px-4">Task Name</th>
                                    <th className="py-3 px-4">Assigned BDE Executives</th>
                                    <th className="py-3 px-4">Total Leads</th>
                                    <th className="py-3 px-4">Completed Leads</th>
                                    <th className="py-3 px-4">Progress</th>
                                    <th className="py-3 px-4">Status</th>
                                    <th className="py-3 px-4">Created Date</th>
                                    <th className="py-3 px-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredTasks.map(task => {
                                    const statusInfo = STATUS_CONFIG[task.status] || STATUS_CONFIG.PENDING;
                                    const percent = task.progress_percent || 0;
                                    const assignedBdes = task.assigned_bdes || [];

                                    return (
                                        <tr
                                            key={task.id}
                                            onClick={() => handleOpenTask(task)}
                                            className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                                        >
                                            <td className="py-3.5 px-4 font-semibold text-slate-800">
                                                {task.title}
                                            </td>
                                            <td className="py-3.5 px-4">
                                                {assignedBdes.length > 0 ? (
                                                    <div className="flex flex-wrap items-center gap-1.5 max-w-xs">
                                                        {assignedBdes.map(bde => (
                                                            <span
                                                                key={bde.id}
                                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100"
                                                            >
                                                                <User size={10} className="text-indigo-400" />
                                                                {bde.name}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">
                                                        <User size={12} className="text-slate-400" />
                                                        {task.assigned_to_name || 'Unassigned'}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 font-semibold text-slate-700">
                                                {task.total_leads || 0}
                                            </td>
                                            <td className="py-3.5 px-4 font-semibold text-emerald-700">
                                                {task.completed_leads || 0}
                                            </td>
                                            <td className="py-3.5 px-4 min-w-[140px]">
                                                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 mb-1">
                                                    <span>{percent}%</span>
                                                </div>
                                                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-300 ${percent === 100 ? 'bg-emerald-500' : 'bg-indigo-600'
                                                            }`}
                                                        style={{ width: `${percent}%` }}
                                                    />
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${statusInfo.badgeClass}`}>
                                                    {statusInfo.label}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                                                {new Date(task.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="py-3.5 px-4 text-right space-x-2" onClick={e => e.stopPropagation()}>
                                                <button
                                                    onClick={() => handleOpenTask(task)}
                                                    className="px-2.5 py-1 text-indigo-600 hover:bg-indigo-50 rounded-lg font-semibold text-[11px] transition-colors"
                                                >
                                                    View Details
                                                </button>
                                                {canManageTasks && (
                                                    <button
                                                        onClick={(e) => handleOpenReassignModal(task, e)}
                                                        className="px-2.5 py-1 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold text-[11px] transition-colors"
                                                        title="Reassign entire task"
                                                    >
                                                        Reassign
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Task Details Modal / Drawer */}
            {selectedTask && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        {/* Modal Header */}
                        <div className="p-5 border-b border-slate-100 bg-slate-50/80 flex items-start justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-lg font-bold text-slate-800">{selectedTask.title}</h2>
                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_CONFIG[selectedTask.status]?.badgeClass || STATUS_CONFIG.PENDING.badgeClass
                                        }`}>
                                        {STATUS_CONFIG[selectedTask.status]?.label || selectedTask.status}
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-500">
                                    <span>
                                        Assigned To:{' '}
                                        <strong className="text-slate-700">
                                            {selectedTask.assigned_to_name || 'Unassigned'}
                                        </strong>
                                    </span>
                                    <span>•</span>
                                    <span>
                                        Created By: <strong className="text-slate-700">{selectedTask.created_by_name || 'System'}</strong>
                                    </span>
                                    <span>•</span>
                                    <span>{new Date(selectedTask.created_at).toLocaleString()}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {canManageTasks && (
                                    <button
                                        onClick={() => handleOpenReassignModal(selectedTask)}
                                        className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-colors"
                                    >
                                        <ArrowLeftRight size={13} />
                                        Reassign Task
                                    </button>
                                )}
                                <button
                                    onClick={() => setSelectedTask(null)}
                                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Overall Task Progress Bar */}
                        <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div className="w-full sm:w-1/2">
                                <div className="flex justify-between items-center text-xs font-semibold text-slate-600 mb-1.5">
                                    <span>Overall Task Completion</span>
                                    <span>{selectedTask.completed_leads || 0} / {selectedTask.total_leads || 0} ({selectedTask.progress_percent || 0}%)</span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-300 ${selectedTask.progress_percent === 100 ? 'bg-emerald-500' : 'bg-indigo-600'
                                            }`}
                                        style={{ width: `${selectedTask.progress_percent || 0}%` }}
                                    />
                                </div>
                            </div>

                            {/* Tab Switcher */}
                            <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl text-xs font-semibold">
                                <button
                                    onClick={() => setActiveDetailTab('leads')}
                                    className={`px-3 py-1.5 rounded-lg transition-all ${activeDetailTab === 'leads' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                                        }`}
                                >
                                    Associated Leads ({selectedTask.items?.length || 0})
                                </button>
                                <button
                                    onClick={() => setActiveDetailTab('history')}
                                    className={`px-3 py-1.5 rounded-lg transition-all ${activeDetailTab === 'history' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                                        }`}
                                >
                                    Assignment History ({selectedTask.assignment_history?.length || 0})
                                </button>
                            </div>
                        </div>

                        {/* Individual Executive Progress Breakdown (For Managers) */}
                        {canManageTasks && selectedTask.bde_progress && selectedTask.bde_progress.length > 0 && (
                            <div className="px-6 py-3 bg-indigo-50/40 border-b border-indigo-100/60">
                                <p className="text-[11px] font-semibold text-indigo-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <Users size={12} className="text-indigo-600" />
                                    Progress by Assigned BDE Executive
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                                    {selectedTask.bde_progress.map(bp => (
                                        <div key={bp.bde_id} className="bg-white p-2.5 rounded-xl border border-indigo-100 shadow-xs">
                                            <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                                                <span className="flex items-center gap-1">
                                                    <User size={12} className="text-indigo-500" />
                                                    {bp.bde_name}
                                                </span>
                                                <span className="text-[11px] text-slate-500">
                                                    {bp.completed_leads}/{bp.total_leads} ({bp.progress_percent}%)
                                                </span>
                                            </div>
                                            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1.5 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${bp.progress_percent === 100 ? 'bg-emerald-500' : 'bg-indigo-600'}`}
                                                    style={{ width: `${bp.progress_percent}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto flex-1">
                            {activeDetailTab === 'leads' ? (
                                <div className="space-y-3">
                                    {!selectedTask.items || selectedTask.items.length === 0 ? (
                                        <p className="text-center text-xs text-slate-500 py-8">No leads associated with this task.</p>
                                    ) : (
                                        selectedTask.items.map(item => (
                                            <div
                                                key={item.id}
                                                className={`p-4 rounded-xl border transition-all ${item.is_completed
                                                    ? 'bg-emerald-50/30 border-emerald-200/80'
                                                    : 'bg-white border-slate-200 hover:border-slate-300'
                                                    }`}
                                            >
                                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                                    <div className="flex items-start gap-3 flex-1">
                                                        <input
                                                            type="checkbox"
                                                            checked={item.is_completed}
                                                            disabled={updatingLeadId === item.lead}
                                                            onChange={() => handleToggleLeadCompletion(selectedTask.id, item.lead, item.is_completed)}
                                                            className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                        />
                                                        <div className="flex-1">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className="font-semibold text-slate-800 text-sm">
                                                                    {item.lead_name}
                                                                </span>
                                                                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                                                    {item.crm_student_id}
                                                                </span>
                                                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                                                                    {item.lead_status || 'NEW'}
                                                                </span>
                                                                {item.assigned_to_name && (
                                                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                                                                        <User size={10} />
                                                                        Task BDE: {item.assigned_to_name}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-500">
                                                                {item.mobile && (
                                                                    <a href={`tel:${item.mobile}`} className="flex items-center gap-1 hover:text-indigo-600">
                                                                        <Phone size={12} /> {item.mobile}
                                                                    </a>
                                                                )}
                                                                {item.email && (
                                                                    <a href={`mailto:${item.email}`} className="flex items-center gap-1 hover:text-indigo-600">
                                                                        <Mail size={12} /> {item.email}
                                                                    </a>
                                                                )}
                                                                <span>Original Lead Owner: <strong className="text-slate-700">{item.owner_name}</strong></span>
                                                                {item.program_name && (
                                                                    <span className="text-slate-400">({item.program_name})</span>
                                                                )}
                                                            </div>

                                                            {/* Completion Status Note */}
                                                            {item.is_completed && item.completed_at && (
                                                                <div className="mt-2 text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                                                                    <CheckCircle2 size={12} />
                                                                    Completed on {new Date(item.completed_at).toLocaleString()}
                                                                    {item.completed_by_name && ` by ${item.completed_by_name}`}
                                                                </div>
                                                            )}

                                                            {/* Notes if any */}
                                                            {item.notes && (
                                                                <p className="mt-1 text-xs text-slate-600 bg-white/70 p-2 rounded-lg border border-slate-100">
                                                                    <strong>Note:</strong> {item.notes}
                                                                </p>
                                                            )}

                                                            {/* Recent Call Records & Notes History */}
                                                            {item.recent_interactions && item.recent_interactions.length > 0 && (
                                                                <div className="mt-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setExpandedLeadHistory(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                                                                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
                                                                    >
                                                                        <Clock size={11} />
                                                                        {expandedLeadHistory[item.id] ? 'Hide Call History' : `View Call History & Notes (${item.recent_interactions.length})`}
                                                                    </button>

                                                                    {expandedLeadHistory[item.id] && (
                                                                        <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-indigo-200">
                                                                            {item.recent_interactions.map((int, i) => (
                                                                                <div key={int.id || i} className="bg-slate-50 p-2 rounded-lg text-[11px] border border-slate-100">
                                                                                    <div className="flex items-center justify-between text-slate-500 font-medium">
                                                                                        <span className="font-semibold text-slate-700">
                                                                                            {int.interaction_type} {int.call_status ? `(${int.call_status})` : ''}
                                                                                        </span>
                                                                                        <span>{new Date(int.date).toLocaleString()}</span>
                                                                                    </div>
                                                                                    {int.call_duration > 0 && (
                                                                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                                                                            Duration: {int.call_duration}s • Author: {int.author_name}
                                                                                        </p>
                                                                                    )}
                                                                                    {int.notes && (
                                                                                        <p className="text-slate-600 mt-1 italic">"{int.notes}"</p>
                                                                                    )}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Actions per lead */}
                                                    <div className="flex items-center gap-2 self-end sm:self-center">
                                                        {canManageTasks && (
                                                            <button
                                                                onClick={(e) => handleOpenLeadReassignModal(item, e)}
                                                                className="flex items-center gap-1 px-2.5 py-1 text-slate-600 hover:bg-slate-100 rounded-lg text-[11px] font-semibold transition-colors"
                                                                title="Reassign this lead to another BDE"
                                                            >
                                                                <ArrowLeftRight size={11} />
                                                                Reassign Lead
                                                            </button>
                                                        )}
                                                        {onLeadClick && (
                                                            <button
                                                                onClick={() => {
                                                                    onLeadClick({
                                                                        id: item.lead,
                                                                        crm_student_id: item.crm_student_id,
                                                                        returnToTask: true,
                                                                    });
                                                                }}
                                                                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-xs whitespace-nowrap transition-colors"
                                                            >
                                                                <ExternalLink size={12} />
                                                                View Lead
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {!selectedTask.assignment_history || selectedTask.assignment_history.length === 0 ? (
                                        <p className="text-center text-xs text-slate-500 py-8">No assignment history recorded.</p>
                                    ) : (
                                        <div className="relative border-l-2 border-slate-200 pl-4 space-y-4 ml-2">
                                            {selectedTask.assignment_history.map((hist, idx) => (
                                                <div key={hist.id || idx} className="relative">
                                                    <div className="absolute -left-[23px] top-1.5 w-3 h-3 rounded-full bg-indigo-600 border-2 border-white" />
                                                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                                                        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                                                            <span>{new Date(hist.reassigned_at).toLocaleString()}</span>
                                                            {hist.reassigned_by_name && (
                                                                <span>By: <strong className="text-slate-700">{hist.reassigned_by_name}</strong></span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                                                            <span className="text-slate-500">
                                                                {hist.previous_assignee_name === 'None' ? 'Initial Creation' : hist.previous_assignee_name}
                                                            </span>
                                                            <ArrowRight size={13} className="text-slate-400" />
                                                            <span className="text-indigo-600">{hist.new_assignee_name}</span>
                                                            {hist.lead_name && (
                                                                <span className="text-slate-500 font-normal">
                                                                    (Lead: <strong>{hist.lead_name}</strong>)
                                                                </span>
                                                            )}
                                                        </div>
                                                        {hist.notes && (
                                                            <p className="text-xs text-slate-600 mt-2 bg-white p-2 rounded-lg border border-slate-100">
                                                                {hist.notes}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ADD NEW TASK MODAL */}
            {isAddTaskModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        {/* Modal Header */}
                        <div className="p-5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
                            <div>
                                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                    <Plus className="text-indigo-600" size={18} />
                                    Create New Task
                                </h2>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Upload existing CRM leads via CSV and distribute workload across BDE executives.
                                </p>
                            </div>
                            <button
                                onClick={() => setIsAddTaskModalOpen(false)}
                                disabled={creatingTask}
                                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Form */}
                        <form onSubmit={handleCreateTask} className="p-6 overflow-y-auto space-y-5 flex-1">
                            {createTaskError && (
                                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2.5">
                                    <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                                    <span>{createTaskError}</span>
                                </div>
                            )}

                            {/* A. Task Name */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                    Task Name <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={newTaskTitle}
                                    onChange={(e) => setNewTaskTitle(e.target.value)}
                                    placeholder="e.g. Follow-up - Not Answering Leads"
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
                                />
                            </div>

                            {/* B. Upload Leads CSV */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="block text-xs font-bold text-slate-700">
                                        Upload Leads CSV <span className="text-rose-500">*</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleDownloadSampleCsv}
                                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 transition-colors"
                                    >
                                        <Download size={13} />
                                        Download Sample CSV
                                    </button>
                                </div>

                                {!csvFile ? (
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className="border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30 rounded-2xl p-6 text-center cursor-pointer transition-all group"
                                    >
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept=".csv, text/csv, .txt"
                                            onChange={handleFileSelect}
                                            className="hidden"
                                        />
                                        <div className="w-12 h-12 bg-indigo-50 group-hover:bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-2 transition-colors">
                                            <Upload size={22} />
                                        </div>
                                        <p className="text-xs font-bold text-slate-700">Click to upload or drag & drop CSV</p>
                                        <p className="text-[11px] text-slate-400 mt-1">
                                            Must reference existing CRM leads via Lead ID, CRM Student ID, phone number, or email.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center">
                                                    <FileText size={20} />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-slate-800">{csvFile.name}</p>
                                                    <p className="text-[10px] text-slate-400">
                                                        {(csvFile.size / 1024).toFixed(1)} KB •{' '}
                                                        {csvValidating ? 'Validating against CRM leads...' : `${csvResult?.matched_count || 0} leads recognized`}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => fileInputRef.current?.click()}
                                                    disabled={csvValidating}
                                                    className="px-2.5 py-1 text-slate-600 hover:bg-slate-200 rounded-lg text-xs font-medium transition-colors"
                                                >
                                                    Replace
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleClearCsvFile}
                                                    disabled={csvValidating}
                                                    className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg transition-colors"
                                                    title="Remove file"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                                <input
                                                    ref={fileInputRef}
                                                    type="file"
                                                    accept=".csv, text/csv, .txt"
                                                    onChange={handleFileSelect}
                                                    className="hidden"
                                                />
                                            </div>
                                        </div>

                                        {csvValidating && (
                                            <div className="flex items-center gap-2 text-xs text-indigo-600 py-2">
                                                <RefreshCw size={14} className="animate-spin" />
                                                Validating lead records against database...
                                            </div>
                                        )}

                                        {/* CSV Validation Results Alert */}
                                        {csvResult && (
                                            <div className="space-y-2.5 pt-1">
                                                <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                                                    <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                                                        <Check size={13} />
                                                        {csvResult.matched_count} Matched Leads
                                                    </span>
                                                    {csvResult.unmatched_count > 0 && (
                                                        <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                                                            <AlertCircle size={13} />
                                                            {csvResult.unmatched_count} Unmatched Rows
                                                        </span>
                                                    )}
                                                    {csvResult.duplicate_count > 0 && (
                                                        <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                                                            <AlertTriangle size={13} />
                                                            {csvResult.duplicate_count} Internal Duplicates
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Notice for unmatched or duplicates */}
                                                {(csvResult.unmatched_count > 0 || csvResult.duplicate_count > 0) && (
                                                    <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-800 space-y-1">
                                                        <p className="font-semibold flex items-center gap-1.5">
                                                            <AlertTriangle size={14} className="text-amber-600" />
                                                            Attention Required Before Creating Task
                                                        </p>
                                                        <p className="text-[11px] text-amber-700">
                                                            {csvResult.unmatched_count > 0 && `${csvResult.unmatched_count} row(s) could not be matched with existing CRM leads. `}
                                                            {csvResult.duplicate_count > 0 && `${csvResult.duplicate_count} duplicate row(s) were detected. `}
                                                            Only the {csvResult.matched_count} valid unique matched lead(s) will be assigned.
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Tabs for preview: Matched / Unmatched / Duplicates */}
                                                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                                                    <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-semibold">
                                                        <button
                                                            type="button"
                                                            onClick={() => setCsvPreviewTab('matched')}
                                                            className={`px-3 py-1.5 border-b-2 transition-all ${csvPreviewTab === 'matched'
                                                                ? 'border-indigo-600 text-indigo-600 bg-white font-bold'
                                                                : 'border-transparent text-slate-500 hover:text-slate-800'
                                                                }`}
                                                        >
                                                            Matched Leads ({csvResult.matched_count})
                                                        </button>
                                                        {csvResult.unmatched_count > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setCsvPreviewTab('unmatched')}
                                                                className={`px-3 py-1.5 border-b-2 transition-all ${csvPreviewTab === 'unmatched'
                                                                    ? 'border-rose-600 text-rose-600 bg-white font-bold'
                                                                    : 'border-transparent text-slate-500 hover:text-slate-800'
                                                                    }`}
                                                            >
                                                                Unmatched Rows ({csvResult.unmatched_count})
                                                            </button>
                                                        )}
                                                        {csvResult.duplicate_count > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setCsvPreviewTab('duplicates')}
                                                                className={`px-3 py-1.5 border-b-2 transition-all ${csvPreviewTab === 'duplicates'
                                                                    ? 'border-amber-600 text-amber-600 bg-white font-bold'
                                                                    : 'border-transparent text-slate-500 hover:text-slate-800'
                                                                    }`}
                                                            >
                                                                Duplicates ({csvResult.duplicate_count})
                                                            </button>
                                                        )}
                                                    </div>

                                                    <div className="max-h-40 overflow-y-auto p-2">
                                                        {csvPreviewTab === 'matched' && (
                                                            <table className="w-full text-left text-[11px]">
                                                                <thead className="text-slate-500 border-b border-slate-100">
                                                                    <tr>
                                                                        <th className="py-1 px-2">CRM ID</th>
                                                                        <th className="py-1 px-2">Lead Name</th>
                                                                        <th className="py-1 px-2">Contact</th>
                                                                        <th className="py-1 px-2">Current Owner</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-100">
                                                                    {csvResult.matched_leads.slice(0, 15).map((l, i) => (
                                                                        <tr key={l.id || i} className="hover:bg-slate-50">
                                                                            <td className="py-1 px-2 font-mono text-slate-600">{l.crm_student_id}</td>
                                                                            <td className="py-1 px-2 font-semibold text-slate-800">{l.name}</td>
                                                                            <td className="py-1 px-2 text-slate-500">{l.mobile || l.email}</td>
                                                                            <td className="py-1 px-2 text-slate-600">{l.owner_name}</td>
                                                                        </tr>
                                                                    ))}
                                                                    {csvResult.matched_leads.length > 15 && (
                                                                        <tr>
                                                                            <td colSpan={4} className="py-1.5 px-2 text-center text-slate-400 italic">
                                                                                + {csvResult.matched_leads.length - 15} more matched leads...
                                                                            </td>
                                                                        </tr>
                                                                    )}
                                                                </tbody>
                                                            </table>
                                                        )}

                                                        {csvPreviewTab === 'unmatched' && (
                                                            <div className="space-y-1.5">
                                                                {csvResult.unmatched_rows?.map((rowErr, i) => (
                                                                    <div key={i} className="p-2 rounded bg-rose-50/60 border border-rose-100 text-[11px] text-rose-700 flex items-start gap-2">
                                                                        <span className="font-bold shrink-0">Row {rowErr.row_number || rowErr.row}:</span>
                                                                        <span>{rowErr.reason}</span>
                                                                        {rowErr.identifier && <span className="font-mono text-rose-900 bg-rose-100 px-1 rounded ml-auto">{rowErr.identifier}</span>}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {csvPreviewTab === 'duplicates' && (
                                                            <div className="space-y-1.5">
                                                                {csvResult.duplicate_rows?.map((dupErr, i) => (
                                                                    <div key={i} className="p-2 rounded bg-amber-50/60 border border-amber-100 text-[11px] text-amber-700 flex items-start gap-2">
                                                                        <span className="font-bold shrink-0">Row {dupErr.row_number || dupErr.row}:</span>
                                                                        <span>{dupErr.reason}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {csvError && (
                                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                                        <AlertCircle size={14} />
                                        {csvError}
                                    </div>
                                )}
                            </div>

                            {/* C. Assign to BDE Executives (Multi-Select) */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="block text-xs font-bold text-slate-700">
                                        Assign to BDE Executives <span className="text-rose-500">*</span>
                                    </label>
                                    <div className="flex items-center gap-2 text-[11px]">
                                        <button
                                            type="button"
                                            onClick={handleSelectAllBdes}
                                            className="text-indigo-600 hover:text-indigo-800 font-semibold"
                                        >
                                            Select All
                                        </button>
                                        <span>•</span>
                                        <button
                                            type="button"
                                            onClick={handleClearBdes}
                                            className="text-slate-500 hover:text-slate-700"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                </div>

                                {/* Selected BDE Chips */}
                                {selectedBdeIds.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                                        {selectedBdeIds.map(bdeId => {
                                            const u = salesUsers.find(user => user.id === bdeId);
                                            const name = u ? (u.name || `${u.first_name} ${u.last_name}`.trim() || u.username) : `ID #${bdeId}`;
                                            return (
                                                <span
                                                    key={bdeId}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-600 text-white shadow-2xs"
                                                >
                                                    <User size={11} />
                                                    {name}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleBde(bdeId)}
                                                        className="hover:bg-indigo-700 rounded-full p-0.5 ml-0.5 transition-colors"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Search Filter */}
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Search BDE executive..."
                                        value={bdeSearchQuery}
                                        onChange={(e) => setBdeSearchQuery(e.target.value)}
                                        className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
                                    />
                                </div>

                                {/* Scrollable BDE List */}
                                <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                                    {filteredBdes.length === 0 ? (
                                        <p className="text-center text-xs text-slate-400 py-4">No BDE executives found.</p>
                                    ) : (
                                        filteredBdes.map(u => {
                                            const isSelected = selectedBdeIds.includes(u.id);
                                            const name = u.name || `${u.first_name} ${u.last_name}`.trim() || u.username;
                                            return (
                                                <div
                                                    key={u.id}
                                                    onClick={() => handleToggleBde(u.id)}
                                                    className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => { }} // handled by parent onClick
                                                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                        />
                                                        <div>
                                                            <p className="text-xs font-semibold text-slate-800">{name}</p>
                                                            <p className="text-[10px] text-slate-400">{u.email || u.role}</p>
                                                        </div>
                                                    </div>
                                                    {isSelected && (
                                                        <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
                                                            Selected
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {/* D. Workload Distribution Preview */}
                            {distributionPreview.length > 0 && (
                                <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-2xl space-y-2.5">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-bold text-indigo-950 flex items-center gap-1.5">
                                            <Layers size={14} className="text-indigo-600" />
                                            Workload Distribution Preview
                                        </span>
                                        <span className="font-semibold text-indigo-700">
                                            {csvResult?.matched_leads?.length} leads ÷ {selectedBdeIds.length} executive(s)
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {distributionPreview.map(dp => (
                                            <div key={dp.bdeId} className="bg-white p-2.5 rounded-xl border border-indigo-100/80 flex items-center justify-between text-xs shadow-2xs">
                                                <span className="font-semibold text-slate-800 truncate mr-2">{dp.name}</span>
                                                <span className="font-bold text-indigo-600 shrink-0 bg-indigo-50 px-2 py-0.5 rounded-md">
                                                    {dp.count} leads ({dp.percent}%)
                                                </span>
                                            </div>
                                        ))}
                                    </div>

                                    <p className="text-[11px] text-indigo-700/80 italic">
                                        ℹ Deterministic distribution rule: Every lead is assigned exactly once. Original CRM lead ownership remains unchanged.
                                    </p>
                                </div>
                            )}

                            {/* Modal Footer Buttons */}
                            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsAddTaskModalOpen(false)}
                                    disabled={creatingTask}
                                    className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={creatingTask || !newTaskTitle.trim() || !csvResult?.matched_leads?.length || selectedBdeIds.length === 0}
                                    className={`px-5 py-2.5 text-xs font-bold text-white rounded-xl shadow-sm transition-all flex items-center gap-2 ${creatingTask || !newTaskTitle.trim() || !csvResult?.matched_leads?.length || selectedBdeIds.length === 0
                                        ? 'bg-indigo-300 cursor-not-allowed'
                                        : 'bg-indigo-600 hover:bg-indigo-700'
                                        }`}
                                >
                                    {creatingTask ? (
                                        <>
                                            <RefreshCw size={14} className="animate-spin" />
                                            Creating Task...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle size={15} />
                                            Create Task
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* WHOLE TASK REASSIGN MODAL */}
            {reassignModalTask && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                                <ArrowLeftRight className="text-indigo-600" size={16} />
                                Reassign Entire Task
                            </h3>
                            <button
                                onClick={() => setReassignModalTask(null)}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <p className="text-xs text-slate-500">Task:</p>
                                <p className="text-sm font-semibold text-slate-800">{reassignModalTask.title}</p>
                                <p className="text-xs text-slate-500 mt-1">
                                    Current Assignee: <strong className="text-slate-700">{reassignModalTask.assigned_to_name}</strong>
                                </p>
                            </div>

                            {reassignError && (
                                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                                    <AlertCircle size={14} />
                                    {reassignError}
                                </div>
                            )}

                            <div>
                                <label className="text-xs font-semibold text-slate-700 block mb-1">
                                    Assign to New BDE Executive *
                                </label>
                                <select
                                    value={newAssigneeId}
                                    onChange={(e) => setNewAssigneeId(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
                                >
                                    <option value="">Select BDE executive...</option>
                                    {salesUsers
                                        .filter(u => u.id !== reassignModalTask.assigned_to)
                                        .map(u => (
                                            <option key={u.id} value={u.id}>
                                                {u.name || `${u.first_name} ${u.last_name}`.trim() || u.username}
                                            </option>
                                        ))
                                    }
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-slate-700 block mb-1">
                                    Reason / Reassignment Notes (Optional)
                                </label>
                                <textarea
                                    rows={2}
                                    value={reassignNotes}
                                    onChange={(e) => setReassignNotes(e.target.value)}
                                    placeholder="e.g. Executive on leave, workload rebalancing..."
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                                />
                            </div>

                            <p className="text-[11px] text-slate-400">
                                ℹ All associated leads, task progress, existing call logs, and notes are preserved.
                            </p>

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    onClick={() => setReassignModalTask(null)}
                                    disabled={reassigning}
                                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleExecuteReassign}
                                    disabled={reassigning || !newAssigneeId}
                                    className={`px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors ${newAssigneeId && !reassigning
                                        ? 'bg-indigo-600 hover:bg-indigo-700 shadow-sm'
                                        : 'bg-indigo-300 cursor-not-allowed'
                                        }`}
                                >
                                    {reassigning ? 'Reassigning...' : 'Confirm Reassign'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* INDIVIDUAL LEAD REASSIGN MODAL */}
            {reassignLeadModalItem && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                                <ArrowLeftRight className="text-indigo-600" size={16} />
                                Reassign Lead
                            </h3>
                            <button
                                onClick={() => setReassignLeadModalItem(null)}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <p className="text-xs text-slate-500">Lead:</p>
                                <p className="text-sm font-semibold text-slate-800">
                                    {reassignLeadModalItem.lead_name} ({reassignLeadModalItem.crm_student_id})
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                    Current Task Assignee: <strong className="text-slate-700">{reassignLeadModalItem.assigned_to_name || 'Unassigned'}</strong>
                                </p>
                            </div>

                            {reassignLeadError && (
                                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                                    <AlertCircle size={14} />
                                    {reassignLeadError}
                                </div>
                            )}

                            <div>
                                <label className="text-xs font-semibold text-slate-700 block mb-1">
                                    Assign Lead to BDE Executive *
                                </label>
                                <select
                                    value={newLeadAssigneeId}
                                    onChange={(e) => setNewLeadAssigneeId(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
                                >
                                    <option value="">Select BDE executive...</option>
                                    {salesUsers
                                        .filter(u => u.id !== reassignLeadModalItem.assigned_to)
                                        .map(u => (
                                            <option key={u.id} value={u.id}>
                                                {u.name || `${u.first_name} ${u.last_name}`.trim() || u.username}
                                            </option>
                                        ))
                                    }
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-slate-700 block mb-1">
                                    Reassignment Notes (Optional)
                                </label>
                                <textarea
                                    rows={2}
                                    value={reassignLeadNotes}
                                    onChange={(e) => setReassignLeadNotes(e.target.value)}
                                    placeholder="e.g. Lead requested specific language speaker..."
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                                />
                            </div>

                            <p className="text-[11px] text-slate-400">
                                ℹ Lead history and original CRM ownership remain untouched. Only task responsibility is transferred.
                            </p>

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    onClick={() => setReassignLeadModalItem(null)}
                                    disabled={reassigningLead}
                                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleExecuteLeadReassign}
                                    disabled={reassigningLead || !newLeadAssigneeId}
                                    className={`px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors ${newLeadAssigneeId && !reassigningLead
                                        ? 'bg-indigo-600 hover:bg-indigo-700 shadow-sm'
                                        : 'bg-indigo-300 cursor-not-allowed'
                                        }`}
                                >
                                    {reassigningLead ? 'Reassigning...' : 'Confirm Reassign'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
