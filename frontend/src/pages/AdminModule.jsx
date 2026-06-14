import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import {
    Plus, Trash2, Edit2, AlertCircle, Save, X,
    ChevronRight, ChevronDown, Book, Layers, GraduationCap,
    Settings, ListPlus, Info, Eye, ExternalLink, Search,
    UserCircle, Shield, Globe, Terminal, Box, Database,
    UserPlus, Users, Key, Settings2, ArrowRight, Send, FileText, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { copyToClipboard } from '../utils/clipboard';

const AdminModule = () => {
    const [activeTab, setActiveTab] = useState('fields');
    const [loading, setLoading] = useState(false);
    const [hierarchy, setHierarchy] = useState([]);
    const [expandedNodes, setExpandedNodes] = useState(new Set());
    const [selectedNode, setSelectedNode] = useState(null);
    const [showPreview, setShowPreview] = useState(false);
    const [previewStep, setPreviewStep] = useState(1);
    const [toast, setToast] = useState(null);

    // Fields State
    const [programs, setPrograms] = useState([]);
    const [subPrograms, setSubPrograms] = useState([]);
    const [selectedProgram, setSelectedProgram] = useState('');
    const [selectedSubProgram, setSelectedSubProgram] = useState('');
    const [courses, setCourses] = useState([]);
    const [selectedCourse, setSelectedCourse] = useState('');
    const [fields, setFields] = useState([]);
    const [fieldModalOpen, setFieldModalOpen] = useState(false);
    const [subProgramModalOpen, setSubProgramModalOpen] = useState(false);
    const [courseModalOpen, setCourseModalOpen] = useState(false);
    const [newField, setNewField] = useState({
        label: '', field_type: 'text', field_group: 'INITIAL', options: '', order: 0, is_required: true,
        validation_pattern: '', validation_message: '', conditional_depends_on: '', conditional_value: ''
    });
    const [newSubProgram, setNewSubProgram] = useState('');
    const [programModalOpen, setProgramModalOpen] = useState(false);
    const [newProgramName, setNewProgramName] = useState('');
    const [newCourse, setNewCourse] = useState({ name: '', fee_amount: 0 });

    // Permissions State
    const [selectedRoleForPerms, setSelectedRoleForPerms] = useState('SALES');
    const [rolePermissions, setRolePermissions] = useState([]);
    const modules = [
        { id: 'SALES', name: 'Sales & Leads' },
        { id: 'MENTOR', name: 'Mentor Module' },
        { id: 'STUDENT', name: 'Student Portal' },
        { id: 'ACADEMIC_HIERARCHY', name: 'Academic Hierarchy' },
        { id: 'COORDINATOR', name: 'Coordinator Module' },
        { id: 'TEACHER', name: 'Teacher Module' },
        { id: 'COURSES', name: 'Courses & Batches' },
        { id: 'ANALYTICS', name: 'Analytics & Reports' },
        { id: 'WORKFORCE', name: 'HRMS: Workforce Hub' },
        { id: 'ATTENDANCE', name: 'HRMS: Attendance' },
        { id: 'PAYROLL', name: 'HRMS: Payroll' },
        { id: 'STAFF_DIRECTORY', name: 'Staff Directory' },
        { id: 'ADMIN', name: 'Administrator Portal' },
    ];

    // Razorpay Integration State
    const [razorpayConfig, setRazorpayConfig] = useState({ key_id: '', key_secret: '', is_active: false });
    const [isSavingRazorpay, setIsSavingRazorpay] = useState(false);
    const [razorpayModalOpen, setRazorpayModalOpen] = useState(false);

    useEffect(() => {
        if (activeTab === 'fields') fetchHierarchy();
        if (activeTab === 'permissions') fetchRolePermissions();
        if (activeTab === 'integrations') fetchRazorpayConfig();
    }, [activeTab, selectedRoleForPerms]);

    useEffect(() => {
        if (selectedNode) {
            fetchFields();
        }
    }, [selectedNode]);

    const fetchHierarchy = async () => {
        setLoading(true);
        try {
            const res = await api.get('programs/hierarchy/');
            setHierarchy(res.data);
            if (!selectedNode && res.data.length > 0) {
                const first = res.data[0];
                setSelectedNode({ type: 'program', id: first.id, name: first.name, data: first });
            }
        } catch (err) {
            console.error("Failed to fetch hierarchy", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedSubProgram) {
            fetchCourses(selectedSubProgram);
        } else {
            setCourses([]);
            setSelectedCourse('');
        }
    }, [selectedSubProgram]);

    // --- User Logic Removed (Moved to UsersModule) ---

    // --- Field Logic ---
    const fetchPrograms = async () => {
        try {
            const res = await api.get('programs/');
            setPrograms(Array.isArray(res.data) ? res.data : (res.data?.results || []));
        } catch (err) {
            console.error(err);
        }
    };

    const fetchSubPrograms = async (progId) => {
        try {
            const res = await api.get(`sub-programs/?program=${progId}`);
            setSubPrograms(Array.isArray(res.data) ? res.data : (res.data?.results || []));
        } catch (err) {
            console.error(err);
        }
    };

    const handleCreateProgram = async (e) => {
        e.preventDefault();
        try {
            await api.post('programs/', { name: newProgramName });
            setProgramModalOpen(false);
            setNewProgramName('');
            fetchHierarchy();
        } catch (err) {
            console.error(err);
            alert("Failed to create program");
        }
    };

    const handleDeleteProgram = async (id) => {
        if (!window.confirm("Delete program and all its contents?")) return;
        try {
            await api.delete(`programs/${id}/`);
            fetchHierarchy();
            if (selectedNode?.id === id) setSelectedNode(null);
        } catch (err) {
            console.error(err);
        }
    };

    const handleCreateSubProgram = async (e) => {
        e.preventDefault();
        try {
            await api.post('sub-programs/', {
                program: selectedNode.id,
                name: newSubProgram
            });
            setSubProgramModalOpen(false);
            setNewSubProgram('');
            fetchHierarchy();
        } catch (err) {
            console.error(err);
            alert("Failed to create sub-program");
        }
    };

    const handleDeleteSubProgram = async (id) => {
        if (!window.confirm("Delete this category?")) return;
        try {
            await api.delete(`sub-programs/${id}/`);
            fetchHierarchy();
            if (selectedNode?.id === id) setSelectedNode(null);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchCourses = async (subProgId) => {
        try {
            const res = await api.get(`courses/?sub_program=${subProgId}`);
            setCourses(Array.isArray(res.data) ? res.data : (res.data?.results || []));
        } catch (err) {
            console.error(err);
        }
    };

    const fetchFields = async () => {
        if (!selectedNode) return;

        const params = new URLSearchParams();
        if (selectedNode.type === 'program') params.append('program', selectedNode.id);
        else if (selectedNode.type === 'subprogram') params.append('sub_program', selectedNode.id);
        else if (selectedNode.type === 'course') params.append('course', selectedNode.id);

        try {
            const res = await api.get(`forms/fields/?${params.toString()}`);
            const data = Array.isArray(res.data) ? res.data : (res.data?.results || []);
            setFields(data.sort((a, b) => a.order - b.order));
        } catch (err) {
            console.error(err);
        }
    };

    const handleCreateField = async (e) => {
        e.preventDefault();
        const payload = { ...newField };

        if (selectedNode.type === 'program') payload.program = selectedNode.id;
        else if (selectedNode.type === 'subprogram') payload.sub_program = selectedNode.id;
        else if (selectedNode.type === 'course') payload.course = selectedNode.id;

        if (payload.field_type === 'dropdown' && typeof payload.options === 'string') {
            payload.options = payload.options.split(',').map(s => s.trim());
        }

        if (payload.validation_pattern) {
            payload.validation_rules = {
                pattern: payload.validation_pattern,
                message: payload.validation_message || `Invalid ${payload.label}`
            };
        }

        if (payload.conditional_depends_on && payload.conditional_value) {
            payload.conditional_rule = {
                depends_on: parseInt(payload.conditional_depends_on),
                value: payload.conditional_value
            };
        } else {
            payload.conditional_rule = null;
        }

        try {
            await api.post('forms/fields/', payload);
            setFieldModalOpen(false);
            fetchFields();
            setNewField({ label: '', field_type: 'text', field_group: 'INITIAL', options: '', order: 0, is_required: true, validation_pattern: '', validation_message: '', conditional_depends_on: '', conditional_value: '' });
        } catch (err) {
            console.error(err);
            alert("Failed to create field");
        }
    };

    const handleCreateCourse = async (e) => {
        e.preventDefault();
        try {
            await api.post('courses/', {
                name: newCourse.name,
                fee_amount: newCourse.fee_amount,
                sub_program: selectedNode.id
            });
            setCourseModalOpen(false);
            setNewCourse({ name: '', fee_amount: 0 });
            fetchHierarchy();
        } catch (err) {
            console.error(err);
            alert("Failed to create course");
        }
    };

    const handleDeleteField = async (id) => {
        if (!window.confirm("Delete this field?")) return;
        try {
            await api.delete(`forms/fields/${id}/`);
            fetchFields();
        } catch (err) {
            console.error(err);
        }
    };

    // --- Permission Logic ---
    const fetchRolePermissions = async () => {
        try {
            const res = await api.get(`auth/management/permissions/?role=${selectedRoleForPerms}`);
            setRolePermissions(Array.isArray(res.data) ? res.data : (res.data?.results || []));
        } catch (err) {
            console.error(err);
        }
    };

    const handleTogglePermission = async (moduleCode, key, currentVal) => {
        let permObj = rolePermissions.find(p => p.module === moduleCode);

        try {
            if (!permObj) {
                const res = await api.post('auth/management/permissions/', {
                    role: selectedRoleForPerms,
                    module: moduleCode,
                    [key]: !currentVal
                });
                setRolePermissions(prev => [...prev, res.data]);
            } else {
                const res = await api.patch(`auth/management/permissions/${permObj.id}/`, {
                    [key]: !currentVal
                });
                setRolePermissions(prev => prev.map(p => p.id === permObj.id ? res.data : p));
            }
        } catch (err) {
            console.error(err);
            alert("Failed to save permission. Check console for details.");
        }
    };

    // Sync State
    const [syncStatus, setSyncStatus] = useState(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [wiseCourses, setWiseCourses] = useState([]);

    const fetchRazorpayConfig = async () => {
        try {
            const res = await api.get('integrations/settings/?name=razorpay');
            if (res.data && res.data.config) {
                setRazorpayConfig({
                    key_id: res.data.config.key_id || '',
                    key_secret: res.data.config.key_secret || '',
                    is_active: res.data.is_active || false
                });
            } else {
                setRazorpayConfig({ key_id: '', key_secret: '', is_active: false });
            }
        } catch (err) {
            console.error("Failed to fetch Razorpay config", err);
        }
    };

    const handleSaveRazorpay = async (e) => {
        e.preventDefault();
        setIsSavingRazorpay(true);
        try {
            await api.post('integrations/settings/', {
                name: 'razorpay',
                config: {
                    key_id: razorpayConfig.key_id,
                    key_secret: razorpayConfig.key_secret
                },
                is_active: razorpayConfig.is_active
            });
            setRazorpayModalOpen(false);
            setToast({ message: 'Razorpay Settings Saved!' });
            setTimeout(() => setToast(null), 3000);
        } catch (err) {
            alert("Failed to save settings");
        } finally {
            setIsSavingRazorpay(false);
        }
    };

    const handleSyncWise = async () => {
        setIsSyncing(true);
        setSyncStatus("Scanning Wise Students... This may take a while.");
        try {
            const res = await api.post('integrations/sync-students/');
            const stats = res.data.stats;
            setSyncStatus(`Sync Complete! Scanned: ${stats.scanned}, Created: ${stats.created}, Linked: ${stats.linked}, Updated: ${stats.updated}, Errors: ${stats.errors}`);
        } catch (err) {
            console.error(err);
            setSyncStatus("Sync Failed: " + (err.response?.data?.error || err.message));
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="space-y-8 text-slate-900 min-h-[calc(100vh-160px)] flex flex-col relative">
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl bg-slate-900 text-white shadow-2xl flex items-center gap-3 font-bold text-sm whitespace-nowrap border border-slate-700/50 backdrop-blur-md"
                    >
                        <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                            <Check size={14} />
                        </div>
                        {toast.message}
                    </motion.div>
                )}
            </AnimatePresence>
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-black tracking-tight text-slate-800">
                    Administrator <span className="text-pink-600">Portal</span>
                </h1>
                <div className="flex items-center gap-4 text-xs font-bold text-slate-400 uppercase tracking-widest bg-white px-4 py-2 rounded-xl border border-slate-100 shadow-sm">
                    <Terminal size={14} className="text-pink-500" />
                    v2.4.0 Live Engine
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 p-1 bg-slate-100/50 rounded-lg w-fit">
                {[
                    { id: 'fields', label: 'Form Builder', icon: <Database size={16} /> },
                    { id: 'permissions', label: 'Permissions', icon: <Shield size={16} /> },
                    { id: 'integrations', label: 'Integrations', icon: <Globe size={16} /> },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 py-2 px-4 font-semibold text-sm transition-all rounded-md ${activeTab === tab.id
                            ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200'
                            : 'text-slate-500 hover:text-slate-800'
                            }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab content logic (Users tab removed) */}

            {/* Fields Tab Content - Explorer Integration */}
            {activeTab === 'fields' && (
                <div className="flex-1 flex gap-6 overflow-hidden animate-fadeIn h-[700px]">
                    {/* Explorer Sidebar */}
                    <div className="w-80 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 bg-slate-50/30 flex justify-between items-center">
                            <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                                <Database size={16} className="text-slate-500" />
                                Brands
                            </h3>
                            <button
                                onClick={() => setProgramModalOpen(true)}
                                className="p-1.5 bg-slate-100 text-slate-600 rounded-md hover:bg-slate-200 transition shadow-sm"
                                title="Add New Brand"
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-2">
                            {hierarchy.map(program => (
                                <div key={program.id} className="space-y-1">
                                    <div
                                        className={`group relative flex items-center gap-2 p-2 rounded-lg transition-all cursor-pointer ${selectedNode?.id === program.id && selectedNode?.type === 'program'
                                            ? 'bg-slate-800 text-white shadow-sm'
                                            : 'hover:bg-slate-50 text-slate-700'
                                            }`}
                                        onClick={() => {
                                            setSelectedNode({ type: 'program', id: program.id, name: program.name, data: program });
                                            const newExpanded = new Set(expandedNodes);
                                            if (newExpanded.has(`p-${program.id}`)) newExpanded.delete(`p-${program.id}`);
                                            else newExpanded.add(`p-${program.id}`);
                                            setExpandedNodes(newExpanded);
                                        }}
                                    >
                                        <div className={`p-1.5 rounded-md border ${selectedNode?.id === program.id && selectedNode?.type === 'program' ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-200'}`}>
                                            <GraduationCap size={16} />
                                        </div>
                                        <span className="font-semibold text-sm truncate flex-1">{program.name}</span>

                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setSelectedNode({ type: 'program', id: program.id }); setSubProgramModalOpen(true); }}
                                                className={`p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-all ${selectedNode?.id === program.id && selectedNode?.type === 'program' ? 'hover:bg-slate-600 text-slate-200' : 'hover:bg-slate-200 text-slate-500'}`}
                                            >
                                                <ListPlus size={14} />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDeleteProgram(program.id); }}
                                                className={`p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-all ${selectedNode?.id === program.id && selectedNode?.type === 'program' ? 'hover:bg-rose-500 hover:text-white text-slate-200' : 'hover:bg-rose-50 hover:text-rose-500 text-slate-300'}`}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    <AnimatePresence>
                                        {expandedNodes.has(`p-${program.id}`) && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="ml-6 space-y-1 overflow-hidden"
                                            >
                                                {program.sub_programs?.map(sub => (
                                                    <div key={sub.id} className="space-y-1">
                                                        <div
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedNode({ type: 'subprogram', id: sub.id, name: sub.name, data: sub });
                                                                const newExpanded = new Set(expandedNodes);
                                                                if (newExpanded.has(`s-${sub.id}`)) newExpanded.delete(`s-${sub.id}`);
                                                                else newExpanded.add(`s-${sub.id}`);
                                                                setExpandedNodes(newExpanded);
                                                            }}
                                                            className={`group flex items-center gap-3 p-2.5 rounded-xl transition-all cursor-pointer ${selectedNode?.id === sub.id && selectedNode?.type === 'subprogram'
                                                                ? 'bg-indigo-600 text-white shadow-md'
                                                                : 'hover:bg-slate-50 text-slate-600'
                                                                }`}
                                                        >
                                                            <Layers size={14} />
                                                            <span className="font-bold text-[11px] truncate flex-1">{sub.name}</span>
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setSelectedNode({ type: 'subprogram', id: sub.id, name: sub.name }); setCourseModalOpen(true); }}
                                                                    className={`p-1 rounded-md opacity-0 group-hover:opacity-100 transition-all ${selectedNode?.id === sub.id && selectedNode?.type === 'subprogram' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-400 hover:text-indigo-600'}`}
                                                                >
                                                                    <Plus size={12} />
                                                                </button>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleDeleteSubProgram(sub.id); }}
                                                                    className={`p-1 rounded-md opacity-0 group-hover:opacity-100 transition-all ${selectedNode?.id === sub.id && selectedNode?.type === 'subprogram' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-400 hover:text-rose-600'}`}
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {expandedNodes.has(`s-${sub.id}`) && sub.courses?.map(course => (
                                                            <motion.div
                                                                key={course.id}
                                                                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedNode({ type: 'course', id: course.id, name: course.name, data: course });
                                                                }}
                                                                className={`group ml-6 flex items-center justify-between p-2 rounded-lg transition-all cursor-pointer ${selectedNode?.id === course.id && selectedNode?.type === 'course'
                                                                    ? 'bg-emerald-600 text-white font-bold'
                                                                    : 'hover:bg-emerald-50 text-slate-500'
                                                                    }`}
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <Book size={12} />
                                                                    <span className="text-[10px] uppercase tracking-tight truncate">{course.name}</span>
                                                                </div>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (window.confirm("Delete course?")) {
                                                                            api.delete(`courses/${course.id}/`).then(() => fetchHierarchy());
                                                                        }
                                                                    }}
                                                                    className={`opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/20`}
                                                                >
                                                                    <Trash2 size={10} />
                                                                </button>
                                                            </motion.div>
                                                        ))}
                                                    </div>
                                                ))}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Canvas Area */}
                    <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white">
                            <div>
                                <h3 className="font-semibold text-slate-800 flex items-center gap-2 text-lg">
                                    {selectedNode?.type === 'program' ? <ListPlus size={18} className="text-slate-500" /> : selectedNode?.type === 'subprogram' ? <Layers size={18} className="text-slate-500" /> : <Settings2 size={18} className="text-slate-400" />}
                                    {selectedNode?.name || 'Explorer Canvas'}
                                </h3>
                                {selectedNode?.type === 'program' && <p className="text-xs text-slate-500 mt-0.5">Brand-Level Custom Fields</p>}
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={async () => {
                                        let slug = '';
                                        if (selectedNode.type === 'program') {
                                            slug = selectedNode.data?.slug || selectedNode.id;
                                        } else {
                                            // Find parent program slug from hierarchy
                                            const findProg = (nodeId, type) => {
                                                if (type === 'program') return hierarchy.find(p => p.id === nodeId);
                                                // If node is course or subprogram, we need to traverse hierarchy
                                                for (let p of hierarchy) {
                                                    if (type === 'subprogram' && p.id === selectedNode.parentId) return p;
                                                    if (p.sub_programs?.some(sp => {
                                                        if (type === 'course' && sp.id === selectedNode.parentId) return true;
                                                        if (type === 'subprogram' && sp.id === nodeId) return true;
                                                        return false;
                                                    })) return p;
                                                }
                                                return null;
                                            };
                                            const parentProg = findProg(selectedNode.id, selectedNode.type);
                                            slug = parentProg?.slug || parentProg?.id || selectedNode.parentId || selectedNode.id;
                                        }

                                        const link = `${window.location.origin}/apply/${slug}`;
                                        const success = await copyToClipboard(link);
                                        if (success) {
                                            setToast({ message: 'Enrollment Link Copied!' });
                                            setTimeout(() => setToast(null), 3000);
                                        } else {
                                            window.prompt("Automatic copy blocked by browser. Please manually copy this:", link);
                                        }
                                    }}
                                    className="bg-emerald-50 text-emerald-700 font-semibold text-sm px-3 py-1.5 rounded-lg border border-emerald-200 flex items-center gap-1.5 hover:bg-emerald-100 transition-all"
                                >
                                    <ExternalLink size={14} /> Copy Share Link
                                </button>
                                <button
                                    onClick={() => setShowPreview(!showPreview)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-sm transition-all shadow-sm border ${showPreview ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}`}
                                >
                                    <Eye size={14} />
                                    {showPreview ? 'Back to Editor' : 'Live Preview'}
                                </button>
                                {!showPreview && (
                                    <button
                                        onClick={() => setFieldModalOpen(true)}
                                        className="bg-slate-800 hover:bg-slate-900 text-white font-semibold text-sm px-3 py-1.5 rounded-lg transition-all shadow-sm flex items-center gap-1.5"
                                    >
                                        <Plus size={14} /> Create Field
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-slate-50/50">
                            {!selectedNode ? (
                                <div className="h-full flex flex-col items-center justify-center text-center">
                                    <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mb-6 border border-slate-200 shadow-sm">
                                        <Database size={32} className="text-slate-300" />
                                    </div>
                                    <h4 className="text-xl font-bold text-slate-800">Central Control Engine</h4>
                                    <p className="text-slate-500 max-w-sm mt-2 text-sm">Use the hierarchy explorer on the left to navigate between brands, and manage their associated forms or settings.</p>
                                </div>
                            ) : showPreview ? (
                                <div className="max-w-2xl mx-auto animate-fadeIn">
                                    {/* Preview Steps Indicator */}
                                    <div className="flex justify-center gap-2 mb-8">
                                        {[1, 2, 3].map(i => (
                                            <div key={i} className={`h-1.5 w-16 rounded-full transition-all ${previewStep >= i ? 'bg-slate-800' : 'bg-slate-200'}`} />
                                        ))}
                                    </div>

                                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                                        <div className="absolute top-0 right-0 px-3 py-1 bg-slate-800 text-white text-[10px] font-semibold uppercase tracking-wider rounded-bl-lg">
                                            Preview Mode
                                        </div>

                                        <AnimatePresence mode="wait">
                                            {previewStep === 1 && (
                                                <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                                                    <div>
                                                        <h4 className="text-xl font-bold text-slate-800 mb-1">Basic Info</h4>
                                                        <p className="text-slate-500 text-sm">Step 1: Identity & Contact</p>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-1.5">
                                                            <label className="text-xs font-semibold text-slate-500 uppercase">First Name</label>
                                                            <div className="w-full h-10 bg-slate-50 rounded-lg border border-slate-200" />
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <label className="text-xs font-semibold text-slate-500 uppercase">Last Name</label>
                                                            <div className="w-full h-10 bg-slate-50 rounded-lg border border-slate-200" />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-xs font-semibold text-slate-500 uppercase">Email Address</label>
                                                        <div className="w-full h-10 bg-slate-50 rounded-lg border border-slate-200" />
                                                    </div>
                                                    <button onClick={() => setPreviewStep(2)} className="w-full py-2.5 bg-slate-800 text-white rounded-lg font-semibold shadow-sm flex items-center justify-center gap-2 hover:bg-slate-900 transition-colors">
                                                        Next Step <ArrowRight size={16} />
                                                    </button>
                                                </motion.div>
                                            )}

                                            {previewStep === 2 && (
                                                <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                                                    <div>
                                                        <h4 className="text-xl font-bold text-slate-800 mb-1">Track Selection</h4>
                                                        <p className="text-slate-500 text-sm">Step 2: Choose Course</p>
                                                    </div>
                                                    <div className="space-y-3">
                                                        <div className="p-3 bg-slate-100 border border-slate-300 rounded-lg">
                                                            <p className="font-semibold text-slate-800">Sample Category</p>
                                                        </div>
                                                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                                                            <p className="font-semibold text-slate-500">Other Track</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-3">
                                                        <button onClick={() => setPreviewStep(1)} className="px-6 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition-colors">Back</button>
                                                        <button onClick={() => setPreviewStep(3)} className="flex-1 py-2.5 bg-slate-800 text-white rounded-lg font-semibold shadow-sm hover:bg-slate-900 transition-colors">Continue</button>
                                                    </div>
                                                </motion.div>
                                            )}

                                            {previewStep === 3 && (
                                                <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                                                    <div>
                                                        <h4 className="text-xl font-bold text-slate-800 mb-1">Additional Info</h4>
                                                        <p className="text-slate-500 text-sm">Step 3: Custom Data for {selectedNode.name}</p>
                                                    </div>
                                                    <div className="space-y-4">
                                                        {fields.map(field => (
                                                            <div key={field.id} className="space-y-1.5">
                                                                <label className="text-xs font-semibold text-slate-500 uppercase">
                                                                    {field.label} {field.is_required && <span className="text-rose-500">*</span>}
                                                                </label>
                                                                {field.field_type === 'dropdown' ? (
                                                                    <div className="w-full h-10 bg-slate-50 rounded-lg border border-slate-200 px-3 flex items-center justify-between">
                                                                        <span className="text-slate-400 font-medium text-sm">Select {field.label}...</span>
                                                                        <ChevronDown size={16} className="text-slate-400" />
                                                                    </div>
                                                                ) : field.field_type === 'file' ? (
                                                                    <div className="w-full py-6 bg-slate-50 rounded-lg border border-dashed border-slate-300 flex flex-col items-center justify-center gap-2">
                                                                        <FileText size={20} className="text-slate-400" />
                                                                        <span className="text-[10px] font-semibold text-slate-500 uppercase">Upload Required</span>
                                                                    </div>
                                                                ) : (
                                                                    <div className="w-full h-10 bg-slate-50 rounded-lg border border-slate-200 px-3 flex items-center">
                                                                        <span className="text-slate-400 font-medium text-sm">Enter {field.label}...</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="flex gap-3">
                                                        <button onClick={() => setPreviewStep(2)} className="px-6 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition-colors">Back</button>
                                                        <div className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shadow-sm flex items-center justify-center gap-2 transition-colors cursor-pointer">
                                                            Submit Application <Send size={16} />
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                    <p className="text-center mt-6 text-slate-500 text-xs italic">
                                        This is a simulated preview of the student application link
                                    </p>
                                </div>
                            ) : fields.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center border border-dashed border-slate-200 rounded-2xl bg-white/50 p-10">
                                    <div className="w-16 h-16 bg-slate-50 rounded-xl flex items-center justify-center mb-5 border border-slate-200 shadow-sm relative overflow-hidden">
                                        <ListPlus size={24} className="text-slate-400 relative z-10" />
                                    </div>
                                    <h4 className="font-bold text-lg text-slate-800">Ready for construction</h4>
                                    <p className="text-slate-500 text-sm mt-1.5 max-w-xs">Define the data model for your brand. Add fields like "Education Background", "Referral Source", etc.</p>
                                    <button
                                        onClick={() => setFieldModalOpen(true)}
                                        className="mt-6 px-6 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold text-sm rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
                                    >
                                        Start Building +
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3 max-w-3xl mx-auto">
                                    {fields.map(field => (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                            key={field.id}
                                            className="group flex justify-between items-center p-4 bg-white border border-slate-200 rounded-xl hover:shadow-md transition-all relative overflow-hidden"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-slate-50 rounded-lg flex flex-col items-center justify-center border border-slate-200 font-bold text-[10px] text-slate-600 uppercase tracking-tighter shrink-0 transition-colors">
                                                    <span className="opacity-50 text-[8px] mb-0.5 mt-0.5">TYPE</span>
                                                    {field.field_type.substring(0, 3)}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-800 text-base">{field.label}</p>
                                                    <div className="flex items-center gap-2 mt-1.5">
                                                        <div className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded text-[10px] font-semibold text-slate-500 uppercase">
                                                            <Settings size={10} className="text-slate-400" />
                                                            Order: {field.order}
                                                        </div>
                                                        {field.is_required && (
                                                            <div className="flex items-center gap-1 bg-rose-50 px-2 py-0.5 rounded text-[10px] font-semibold text-rose-600 uppercase border border-rose-100">
                                                                <AlertCircle size={10} className="text-rose-500" />
                                                                Required
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                <button
                                                    onClick={() => handleDeleteField(field.id)}
                                                    className="text-slate-400 hover:text-rose-600 p-2 hover:bg-rose-50 rounded-lg transition-colors"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Permissions Tab Content */}
            {activeTab === 'permissions' && (
                <div className="space-y-6 animate-fadeIn">
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <label className="block text-xs mb-3 text-slate-500 font-semibold uppercase tracking-wider">Configure Permissions for Role:</label>
                        <div className="flex gap-2 flex-wrap">
                            {['ADMIN', 'SALES', 'MENTOR', 'ACADEMIC', 'ACADEMIC_COORDINATOR', 'TEACHER', 'STUDENT', 'EMPLOYEE'].map(role => (
                                <button
                                    key={role}
                                    onClick={() => setSelectedRoleForPerms(role)}
                                    className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all shadow-sm border border-transparent ${selectedRoleForPerms === role ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200'}`}
                                >
                                    {role}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider font-semibold border-b border-slate-200">
                                <tr>
                                    <th className="p-4">Module / Section</th>
                                    <th className="p-4 text-center">View</th>
                                    <th className="p-4 text-center">Add</th>
                                    <th className="p-4 text-center">Edit</th>
                                    <th className="p-4 text-center">Delete</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {modules?.map(mod => {
                                    const p = Array.isArray(rolePermissions) ? rolePermissions.find(x => x.module === mod.id) || {} : {};
                                    return (
                                        <tr key={mod.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-4">
                                                <div className="font-semibold text-slate-800 text-sm">{mod.name}</div>
                                                <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">{mod.id}</div>
                                            </td>
                                            {['can_view', 'can_add', 'can_edit', 'can_delete'].map(key => (
                                                <td key={key} className="p-4 text-center">
                                                    <button
                                                        onClick={() => handleTogglePermission(mod.id, key, p[key] || false)}
                                                        className={`w-10 h-6 rounded-full transition-all relative border border-slate-200 ${p[key] ? 'bg-slate-800 border-slate-800' : 'bg-slate-100'}`}
                                                    >
                                                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all transform ${p[key] ? 'translate-x-5' : 'translate-x-1'}`}></div>
                                                    </button>
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Integrations Tab */}
            {activeTab === 'integrations' && (
                <div className="space-y-6 animate-fadeIn">
                    {/* Razorpay Integration Card */}
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">Payment Gateway</h3>
                                <p className="text-slate-500 text-sm mt-0.5">Receive learner payments directly into your account</p>
                            </div>
                            <button
                                onClick={() => setRazorpayModalOpen(true)}
                                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-semibold text-xs uppercase tracking-wider rounded-lg hover:bg-slate-50 transition shadow-sm"
                            >
                                {razorpayConfig.key_id && razorpayConfig.key_secret ? 'Change' : 'Connect'}
                            </button>
                        </div>

                        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-white rounded-lg border border-slate-200 flex items-center justify-center p-1.5 shadow-sm">
                                    <img src="https://razorpay.com/favicon.png" alt="Razorpay" className="w-full h-full object-contain" />
                                </div>
                                <div>
                                    <p className="font-semibold text-slate-800 text-sm">Razorpay</p>
                                    <p className={`text-[10px] font-semibold uppercase tracking-wider mt-0.5 ${(razorpayConfig.key_id && razorpayConfig.key_secret) ? 'text-emerald-600' : 'text-slate-400'}`}>
                                        {(razorpayConfig.key_id && razorpayConfig.key_secret) ? 'Connected' : 'Not Configured'}
                                    </p>
                                </div>
                            </div>
                            {razorpayConfig.key_id && razorpayConfig.key_secret && (
                                <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-[10px] font-semibold uppercase tracking-wider border border-emerald-100">
                                    <Check size={12} /> Active
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <h2 className="text-lg font-bold text-slate-800 mb-4">Wise LMS Integration</h2>

                        <div className="space-y-4">
                            <p className="text-slate-600 text-sm">
                                Sync all students from the configured Wise LMS account. This process will:
                            </p>
                            <ul className="list-disc pl-5 text-sm text-slate-500 space-y-1.5">
                                <li>Scan all students in Wise (this may take time depending on the count).</li>
                                <li>Match students by their <b>mobile number</b> (last 10 digits).</li>
                                <li><b>Link</b> existing CRM students to their Wise profiles if not already linked.</li>
                                <li><b>Create</b> new student profiles in CRM for any Wise student not found here.</li>
                            </ul>

                            <div className="pt-4 flex gap-3">
                                <button
                                    onClick={handleSyncWise}
                                    disabled={isSyncing}
                                    className={`px-6 py-2.5 rounded-lg font-semibold text-sm transition-all shadow-sm 
                                        ${isSyncing ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-800 text-white hover:bg-slate-900'}`}
                                >
                                    {isSyncing ? 'Syncing...' : 'Start Full Sync'}
                                </button>

                                <button
                                    onClick={async () => {
                                        try {
                                            const res = await api.get('integrations/courses/');
                                            setWiseCourses(res.data);
                                        } catch (err) {
                                            alert("Failed to fetch Wise courses");
                                        }
                                    }}
                                    className="px-6 py-2.5 rounded-lg font-semibold text-sm text-slate-700 border border-slate-200 hover:bg-slate-50 transition-all shadow-sm"
                                >
                                    Fetch Wise Courses
                                </button>

                                {wiseCourses.length > 0 && (
                                    <button
                                        onClick={async () => {
                                            if (!window.confirm(`This will sync all ${wiseCourses.length} courses and their students. Continue?`)) return;
                                            setIsSyncing(true);
                                            let count = 0;
                                            for (const course of wiseCourses) {
                                                setSyncStatus(`Syncing (${++count}/${wiseCourses.length}): ${course.name}...`);
                                                try {
                                                    await api.post('integrations/sync-batch/', { 
                                                        class_id: course.id,
                                                        class_name: course.name 
                                                    });
                                                } catch (err) {
                                                    console.error(`Failed to sync ${course.name}`, err);
                                                }
                                            }
                                            setIsSyncing(false);
                                            setSyncStatus(`Successfully processed all ${wiseCourses.length} courses!`);
                                        }}
                                        disabled={isSyncing}
                                        className={`px-6 py-2.5 rounded-lg font-semibold text-sm transition-all shadow-sm 
                                            ${isSyncing ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                                    >
                                        {isSyncing ? 'Syncing All...' : 'Sync All Batches'}
                                    </button>
                                )}
                            </div>

                            {syncStatus && (
                                <div className={`mt-4 p-3 rounded-lg border font-semibold text-xs
                                    ${syncStatus.includes('Failed') ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}
                                `}>
                                    {syncStatus}
                                </div>

                            )}

                            {/* Wise Courses Display */}
                            {wiseCourses.length > 0 && (
                                <div className="mt-10">
                                    <h3 className="text-lg font-bold text-slate-800 mb-4">Available Courses on Wise LMS</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {wiseCourses.map(course => (
                                            <div key={course.id || course.itemId} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                                <div className="font-bold text-slate-900">{course.name || course.title}</div>
                                                <div className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-bold">
                                                    ID: {course.id || course.itemId} | Learners: {course.sessionsCount || 0}
                                                </div>
                                                <div className="mt-2 flex gap-2">
                                                    <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                                                        {course.type || 'LIVE'}
                                                    </span>
                                                    {course.fee && (
                                                        <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
                                                            Fee Configured
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="mt-4">
                                                    <button
                                                        onClick={async () => {
                                                            if (!window.confirm(`Sync all students from "${course.name}" into the CRM?`)) return;
                                                            setSyncStatus(`Syncing students for ${course.name}...`);
                                                            try {
                                                                const res = await api.post('integrations/sync-batch/', { 
                                                                    class_id: course.id,
                                                                    class_name: course.name 
                                                                });
                                                                setSyncStatus(res.data.message);
                                                            } catch (err) {
                                                                setSyncStatus("Sync Failed: " + (err.response?.data?.error || err.message));
                                                            }
                                                        }}
                                                        className="w-full py-2 bg-indigo-600 text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-md active:scale-95"
                                                    >
                                                        Sync Students
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* User Modal Removed (Moved to UsersModule) */}
            {
                fieldModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                        <div className="bg-white rounded-2xl p-8 w-full max-w-md border border-slate-200 shadow-2xl transform transition-all scale-100 max-h-[90vh] overflow-y-auto">
                            <h2 className="text-2xl font-bold mb-6 text-slate-900">Add Custom Field</h2>
                            <form onSubmit={handleCreateField} className="space-y-5">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Field Label</label>
                                    <input className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium" value={newField.label} onChange={e => setNewField({ ...newField, label: e.target.value })} required />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Type</label>
                                    <select className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium" value={newField.field_type} onChange={e => setNewField({ ...newField, field_type: e.target.value })}>
                                        <option value="text">Text</option>
                                        <option value="number">Number</option>
                                        <option value="date">Date</option>
                                        <option value="dropdown">Dropdown</option>
                                        <option value="file">File Upload</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1 text-teal-600">Form Section / Responsibility</label>
                                    <select 
                                        className="w-full p-3 rounded-xl bg-teal-50 border border-teal-100 text-teal-900 focus:ring-2 focus:ring-teal-100 focus:border-teal-500 outline-none transition-all font-bold" 
                                        value={newField.field_group} 
                                        onChange={e => setNewField({ ...newField, field_group: e.target.value })}
                                    >
                                        <option value="INITIAL">Retail/Sales Team (Initial Application)</option>
                                        <option value="ACADEMIC">Academic Coordinator (Post-Admission)</option>
                                    </select>
                                    <p className="text-[10px] text-teal-500/70 mt-1 ml-1 font-medium">Determines who will fill this field in their module.</p>
                                </div>
                                {newField.field_type === 'dropdown' && (
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Options (comma separated)</label>
                                        <input className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium" placeholder="Option 1, Option 2" value={newField.options} onChange={e => setNewField({ ...newField, options: e.target.value })} />
                                    </div>
                                )}
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Order</label>
                                        <input type="number" className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium" value={newField.order} onChange={e => setNewField({ ...newField, order: parseInt(e.target.value) })} />
                                    </div>
                                    <div className="flex items-center pt-6">
                                         <input type="checkbox" className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300 mr-3" checked={newField.is_required} onChange={e => setNewField({ ...newField, is_required: e.target.checked })} />
                                         <label className="text-sm font-bold text-slate-700">Is Required</label>
                                     </div>
                                 </div>
                                 <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                                     <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Optional Validation</p>
                                     <div className="grid grid-cols-1 gap-3">
                                         <input 
                                             className="w-full p-3 rounded-xl bg-white border border-slate-200 text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all text-xs font-mono" 
                                             placeholder="Regex Pattern (e.g. ^[0-9]{10}$)" 
                                             value={newField.validation_pattern} 
                                             onChange={e => setNewField({ ...newField, validation_pattern: e.target.value })} 
                                         />
                                         <input 
                                             className="w-full p-3 rounded-xl bg-white border border-slate-200 text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all text-xs" 
                                             placeholder="Error Message" 
                                             value={newField.validation_message} 
                                             onChange={e => setNewField({ ...newField, validation_message: e.target.value })} 
                                         />
                                     </div>
                                 </div>
                                 <div className="mt-4 pt-4 border-t border-slate-100">
                                    <p className="text-xs font-bold text-slate-500 mb-3">Conditional Visibility (Optional)</p>
                                    <div className="grid grid-cols-2 gap-4">
                                        <select
                                            className="w-full p-3 rounded-xl bg-white border border-slate-200 text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all text-sm font-bold"
                                            value={newField.conditional_depends_on}
                                            onChange={e => setNewField({ ...newField, conditional_depends_on: e.target.value })}
                                        >
                                            <option value="">-- Always Visible --</option>
                                            {fields.filter(f => f.field_type === 'dropdown').map(f => (
                                                <option key={f.id} value={f.id}>Depends on: {f.label}</option>
                                            ))}
                                        </select>
                                        {newField.conditional_depends_on && (
                                            <input
                                                className="w-full p-3 rounded-xl bg-white border border-slate-200 text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all text-sm font-bold"
                                                placeholder="Required Value (e.g. Yes)"
                                                value={newField.conditional_value}
                                                onChange={e => setNewField({ ...newField, conditional_value: e.target.value })}
                                            />
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-4 pt-4">
                                    <button type="button" onClick={() => setFieldModalOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition">Cancel</button>
                                    <button type="submit" className="flex-1 py-3 bg-indigo-600 rounded-xl hover:bg-indigo-700 text-white font-bold transition shadow-md">Add Field</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
            {/* Add Program Modal */}
            {programModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[60] animate-fadeIn">
                    <div className="bg-white rounded-3xl p-8 w-full max-w-md border border-slate-200 shadow-2xl scale-100 group">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-black text-slate-900">New Brand</h2>
                            <button onClick={() => setProgramModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X /></button>
                        </div>
                        <form onSubmit={handleCreateProgram} className="space-y-4">
                            <div>
                                <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-1.5 ml-1">Brand Name</label>
                                <input
                                    className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-4 focus:ring-pink-100 focus:border-pink-600 outline-none transition-all font-bold placeholder:text-slate-300"
                                    placeholder="e.g. Natya Arts"
                                    value={newProgramName}
                                    onChange={e => setNewProgramName(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setProgramModalOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-200 transition">Cancel</button>
                                <button type="submit" className="flex-1 py-4 bg-pink-600 rounded-2xl hover:bg-pink-700 text-white font-black text-xs uppercase tracking-widest transition shadow-xl shadow-pink-100">Create Brand</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {
                subProgramModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[60] animate-fadeIn">
                        <div className="bg-white rounded-3xl p-8 w-full max-w-md border border-slate-200 shadow-2xl scale-100">
                            <h2 className="text-2xl font-black mb-6 text-slate-900">Add Category</h2>
                            <form onSubmit={handleCreateSubProgram} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-1.5 ml-1">Category Name</label>
                                    <input
                                        className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition-all font-bold"
                                        value={newSubProgram}
                                        onChange={e => setNewSubProgram(e.target.value)}
                                        required
                                    />
                                    <p className="text-[10px] text-slate-400 mt-2 ml-1">This category will be added to <b>{selectedNode?.name}</b></p>
                                </div>
                                <div className="flex gap-4 pt-4">
                                    <button type="button" onClick={() => setSubProgramModalOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition">Cancel</button>
                                    <button type="submit" className="flex-1 py-4 bg-indigo-600 rounded-2xl hover:bg-indigo-700 text-white font-bold transition shadow-md">Create Category</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {
                courseModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[60] animate-fadeIn">
                        <div className="bg-white rounded-3xl p-8 w-full max-w-md border border-slate-200 shadow-2xl scale-100">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-2xl font-black text-slate-900">Add Course</h2>
                                <button onClick={() => setCourseModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X /></button>
                            </div>
                            <form onSubmit={handleCreateCourse} className="space-y-5">
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-2 ml-1">Course Title</label>
                                    <input
                                        className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-4 focus:ring-emerald-100 focus:border-emerald-600 outline-none transition-all font-bold"
                                        placeholder="e.g. Bharatanatyam Certification"
                                        value={newCourse.name}
                                        onChange={e => setNewCourse({ ...newCourse, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-2 ml-1">Course Fee (₹)</label>
                                    <input
                                        type="number"
                                        className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-4 focus:ring-emerald-100 focus:border-emerald-600 outline-none transition-all font-bold"
                                        value={newCourse.fee_amount}
                                        onChange={e => setNewCourse({ ...newCourse, fee_amount: parseFloat(e.target.value) })}
                                        required
                                    />
                                    <p className="text-[10px] text-slate-400 mt-2 ml-1 italic font-medium">Adding to category: <span className="text-emerald-600">{selectedNode?.name}</span></p>
                                </div>
                                <div className="flex gap-3 pt-4">
                                    <button type="button" onClick={() => setCourseModalOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-200 transition">Discard</button>
                                    <button type="submit" className="flex-1 py-4 bg-emerald-600 rounded-2xl hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-widest transition shadow-xl shadow-emerald-100">Deploy Course</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Razorpay Config Modal */}
            {razorpayModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[70] animate-fadeIn">
                    <div className="bg-white rounded-3xl p-8 w-full max-w-lg border border-slate-200 shadow-2xl scale-100 group">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-black text-slate-900">Razorpay Integration</h2>
                            <button onClick={() => setRazorpayModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X /></button>
                        </div>
                        <form onSubmit={handleSaveRazorpay} className="space-y-6">
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Key ID</label>
                                <input
                                    className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-bold"
                                    placeholder="rzp_live_..."
                                    value={razorpayConfig.key_id}
                                    onChange={e => setRazorpayConfig({ ...razorpayConfig, key_id: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Key Secret</label>
                                <input
                                    type="password"
                                    className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-bold"
                                    placeholder="••••••••••••••••"
                                    value={razorpayConfig.key_secret}
                                    onChange={e => setRazorpayConfig({ ...razorpayConfig, key_secret: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 cursor-pointer" onClick={() => setRazorpayConfig({ ...razorpayConfig, is_active: !razorpayConfig.is_active })}>
                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center border-2 transition-all ${razorpayConfig.is_active ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-200'}`}>
                                    {razorpayConfig.is_active && <Check size={14} className="text-white" />}
                                </div>
                                <span className="text-sm font-bold text-slate-700">Enable Payment Processing</span>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setRazorpayModalOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-200 transition">Discard</button>
                                <button type="submit" disabled={isSavingRazorpay} className="flex-1 py-4 bg-slate-900 rounded-2xl hover:bg-slate-800 text-white font-black text-xs uppercase tracking-widest transition shadow-xl disabled:opacity-50">
                                    {isSavingRazorpay ? 'Saving...' : 'Save Settings'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div >
    );
};

export default AdminModule;
