import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import {
    Plus, Trash2, Edit2, AlertCircle, Save, X,
    ChevronRight, ChevronDown, Book, Layers, GraduationCap,
    Settings, ListPlus, Info, Eye, ExternalLink, Search,
    UserCircle, Shield, Globe, Terminal, Box, Database,
    UserPlus, Users, Key, Settings2, ArrowRight, Send, FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const AdminModule = () => {
    const [activeTab, setActiveTab] = useState('fields');
    const [loading, setLoading] = useState(false);
    const [hierarchy, setHierarchy] = useState([]);
    const [expandedNodes, setExpandedNodes] = useState(new Set());
    const [selectedNode, setSelectedNode] = useState(null);
    const [showPreview, setShowPreview] = useState(false);
    const [previewStep, setPreviewStep] = useState(1);

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
        label: '', field_type: 'text', options: '', order: 0, is_required: true
    });
    const [newSubProgram, setNewSubProgram] = useState('');
    const [programModalOpen, setProgramModalOpen] = useState(false);
    const [newProgramName, setNewProgramName] = useState('');
    const [newCourse, setNewCourse] = useState({ name: '', fee_amount: 0 });

    // Permissions State
    const [selectedRoleForPerms, setSelectedRoleForPerms] = useState('SALES');
    const [rolePermissions, setRolePermissions] = useState([]);
    const modules = [
        { id: 'SALES', name: 'Sales Module' },
        { id: 'MENTOR', name: 'Mentor Module' },
        { id: 'STUDENT', name: 'Student Portal' },
        { id: 'ACADEMIC', name: 'Academic Module' },
        { id: 'ANALYTICS', name: 'Analytics & Reports' },
        { id: 'ADMIN', name: 'Admin Module' },
    ];

    useEffect(() => {
        if (activeTab === 'fields') fetchHierarchy();
        if (activeTab === 'permissions') fetchRolePermissions();
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
        if (!selectedNode || selectedNode.type !== 'program') return;

        const params = new URLSearchParams();
        params.append('program', selectedNode.id);

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
        const payload = { ...newField, program: selectedNode.id };

        if (payload.field_type === 'dropdown' && typeof payload.options === 'string') {
            payload.options = payload.options.split(',').map(s => s.trim());
        }

        try {
            await api.post('forms/fields/', payload);
            setFieldModalOpen(false);
            fetchFields();
            setNewField({ label: '', field_type: 'text', options: '', order: 0, is_required: true });
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
                setRolePermissions([...rolePermissions, res.data]);
            } else {
                const res = await api.patch(`auth/management/permissions/${permObj.id}/`, {
                    [key]: !currentVal
                });
                setRolePermissions(rolePermissions.map(p => p.id === permObj.id ? res.data : p));
            }
        } catch (err) {
            console.error(err);
        }
    };

    // Sync State
    const [syncStatus, setSyncStatus] = useState(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [wiseCourses, setWiseCourses] = useState([]);

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
        <div className="space-y-8 text-slate-900 min-h-[calc(100vh-160px)] flex flex-col">
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
            <div className="flex gap-2 p-1 bg-slate-100/50 rounded-2xl w-fit">
                {[
                    { id: 'fields', label: 'Form Builder', icon: <Database size={18} /> },
                    { id: 'permissions', label: 'Permissions', icon: <Shield size={18} /> },
                    { id: 'integrations', label: 'Integrations', icon: <Globe size={18} /> },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 py-2.5 px-6 font-black text-xs uppercase tracking-widest transition-all rounded-xl ${activeTab === tab.id
                            ? 'bg-white text-pink-600 shadow-sm ring-1 ring-slate-200'
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
                    <div className="w-80 flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-100 bg-slate-50/30 flex justify-between items-center">
                            <h3 className="font-black text-slate-800 text-sm uppercase tracking-[0.2em] flex items-center gap-3">
                                <Database size={16} className="text-pink-500" />
                                Brands
                            </h3>
                            <button
                                onClick={() => setProgramModalOpen(true)}
                                className="p-2 bg-pink-50 text-pink-600 rounded-xl hover:bg-pink-100 transition shadow-sm"
                                title="Add New Brand"
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
                            {hierarchy.map(program => (
                                <div key={program.id} className="space-y-1">
                                    <div
                                        className={`group relative flex items-center gap-3 p-3 rounded-2xl transition-all cursor-pointer ${selectedNode?.id === program.id && selectedNode?.type === 'program'
                                            ? 'bg-pink-600 text-white shadow-lg shadow-pink-100'
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
                                        <div className={`p-2 rounded-xl border ${selectedNode?.id === program.id && selectedNode?.type === 'program' ? 'bg-pink-500/50 border-white/20' : 'bg-white border-slate-100'}`}>
                                            <GraduationCap size={16} />
                                        </div>
                                        <span className="font-black text-xs uppercase tracking-tight truncate flex-1">{program.name}</span>

                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setSelectedNode({ type: 'program', id: program.id }); setSubProgramModalOpen(true); }}
                                                className={`p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${selectedNode?.id === program.id && selectedNode?.type === 'program' ? 'hover:bg-pink-500 text-white' : 'hover:bg-slate-200 text-slate-400'}`}
                                            >
                                                <ListPlus size={14} />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDeleteProgram(program.id); }}
                                                className={`p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${selectedNode?.id === program.id && selectedNode?.type === 'program' ? 'hover:bg-pink-500 text-white' : 'hover:bg-rose-50 text-rose-400'}`}
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
                    <div className="flex-1 flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                            <div>
                                <h3 className="font-black text-slate-800 flex items-center gap-2 text-xl tracking-tight">
                                    {selectedNode?.type === 'program' ? <ListPlus className="text-pink-500" /> : selectedNode?.type === 'subprogram' ? <Layers className="text-indigo-500" /> : <Settings2 className="text-slate-400" />}
                                    {selectedNode?.name || 'Explorer Canvas'}
                                </h3>
                                {selectedNode?.type === 'program' && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Brand-Level Custom Fields</p>}
                            </div>

                            {selectedNode?.type === 'program' && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setShowPreview(!showPreview)}
                                        className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl hover:shadow-2xl transform hover:-translate-y-0.5 active:scale-95 ${showPreview ? 'bg-slate-800 text-white shadow-slate-200' : 'bg-indigo-600 text-white shadow-indigo-200'}`}
                                    >
                                        <Eye size={16} />
                                        {showPreview ? 'Back to Editor' : 'Live Preview'}
                                    </button>
                                    {!showPreview && (
                                        <button
                                            onClick={() => setFieldModalOpen(true)}
                                            className="bg-pink-600 hover:bg-pink-700 text-white font-black text-xs uppercase tracking-widest px-6 py-3 rounded-2xl transition-all shadow-xl shadow-pink-500/20 transform hover:-translate-y-0.5 active:scale-95"
                                        >
                                            + Create Field
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-slate-50/20">
                            {!selectedNode ? (
                                <div className="h-full flex flex-col items-center justify-center text-center">
                                    <div className="w-24 h-24 bg-white rounded-[40px] flex items-center justify-center mb-8 border border-slate-100 shadow-2xl shadow-slate-200">
                                        <Database size={40} className="text-slate-200" />
                                    </div>
                                    <h4 className="text-2xl font-black text-slate-800 tracking-tight">Central Control Engine</h4>
                                    <p className="text-slate-400 max-w-sm mt-3 leading-relaxed text-sm">Use the hierarchy explorer on the left to navigate between brands, and manage their associated forms or settings.</p>
                                </div>
                            ) : showPreview ? (
                                <div className="max-w-2xl mx-auto animate-fadeIn">
                                    {/* Preview Steps Indicator */}
                                    <div className="flex justify-center gap-2 mb-10">
                                        {[1, 2, 3].map(i => (
                                            <div key={i} className={`h-1.5 w-16 rounded-full transition-all ${previewStep >= i ? 'bg-indigo-600' : 'bg-slate-200'}`} />
                                        ))}
                                    </div>

                                    <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-2xl relative overflow-hidden">
                                        <div className="absolute top-0 right-0 px-4 py-1.5 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-bl-2xl">
                                            Preview Mode
                                        </div>

                                        <AnimatePresence mode="wait">
                                            {previewStep === 1 && (
                                                <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                                                    <div>
                                                        <h4 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Basic Info</h4>
                                                        <p className="text-slate-400 font-medium text-sm">Step 1: Identity & Contact</p>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">First Name</label>
                                                            <div className="w-full h-14 bg-slate-50 rounded-2xl border border-slate-100" />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Last Name</label>
                                                            <div className="w-full h-14 bg-slate-50 rounded-2xl border border-slate-100" />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                                                        <div className="w-full h-14 bg-slate-50 rounded-2xl border border-slate-100" />
                                                    </div>
                                                    <button onClick={() => setPreviewStep(2)} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg shadow-indigo-100 flex items-center justify-center gap-2">
                                                        Next Step <ArrowRight size={18} />
                                                    </button>
                                                </motion.div>
                                            )}

                                            {previewStep === 2 && (
                                                <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                                                    <div>
                                                        <h4 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Track Selection</h4>
                                                        <p className="text-slate-400 font-medium text-sm">Step 2: Choose Course</p>
                                                    </div>
                                                    <div className="space-y-3">
                                                        <div className="p-4 bg-indigo-50 border-2 border-indigo-500 rounded-2xl">
                                                            <p className="font-bold text-indigo-700">Sample Category</p>
                                                        </div>
                                                        <div className="p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl">
                                                            <p className="font-bold text-slate-400">Other Track</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-4">
                                                        <button onClick={() => setPreviewStep(1)} className="px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black">Back</button>
                                                        <button onClick={() => setPreviewStep(3)} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg shadow-indigo-100">Continue</button>
                                                    </div>
                                                </motion.div>
                                            )}

                                            {previewStep === 3 && (
                                                <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                                                    <div>
                                                        <h4 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Additional Info</h4>
                                                        <p className="text-slate-400 font-medium text-sm">Step 3: Custom Data for {selectedNode.name}</p>
                                                    </div>
                                                    <div className="space-y-5">
                                                        {fields.map(field => (
                                                            <div key={field.id} className="space-y-2">
                                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                                                    {field.label} {field.is_required && <span className="text-red-500">*</span>}
                                                                </label>
                                                                {field.field_type === 'dropdown' ? (
                                                                    <div className="w-full h-14 bg-slate-50 rounded-2xl border border-slate-100 px-4 flex items-center justify-between">
                                                                        <span className="text-slate-300 font-bold">Select {field.label}...</span>
                                                                        <ChevronDown size={18} className="text-slate-300" />
                                                                    </div>
                                                                ) : field.field_type === 'file' ? (
                                                                    <div className="w-full py-8 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2">
                                                                        <FileText size={24} className="text-slate-300" />
                                                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Upload Required</span>
                                                                    </div>
                                                                ) : (
                                                                    <div className="w-full h-14 bg-slate-50 rounded-2xl border border-slate-100 px-4 flex items-center">
                                                                        <span className="text-slate-300 font-bold">Enter {field.label}...</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="flex gap-4">
                                                        <button onClick={() => setPreviewStep(2)} className="px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black">Back</button>
                                                        <div className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black shadow-lg shadow-emerald-100 flex items-center justify-center gap-2">
                                                            Submit Application <Send size={18} />
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                    <p className="text-center mt-8 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">
                                        This is a simulated preview of the student application link
                                    </p>
                                </div>
                            ) : selectedNode.type !== 'program' ? (
                                <div className="h-full flex flex-col items-center justify-center text-center bg-white/50 backdrop-blur-xl rounded-[40px] border-2 border-dashed border-slate-100 p-12">
                                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-slate-50">
                                        <Info size={32} className="text-indigo-400" />
                                    </div>
                                    <h4 className="text-xl font-black text-slate-800 tracking-tight">Structural Inheritance</h4>
                                    <p className="text-slate-500 max-w-sm mt-3 text-sm leading-relaxed">
                                        Fields are now inherited from the **Brand level**.
                                        To add or remove questions for <span className="text-indigo-600 font-bold">{selectedNode.name}</span>, please modify the parent Brand form.
                                    </p>
                                    <button
                                        onClick={() => {
                                            const parent = hierarchy.find(p => p.id === (selectedNode.data?.program || selectedNode.data?.program_id));
                                            if (parent) setSelectedNode({ type: 'program', id: parent.id, name: parent.name, data: parent });
                                        }}
                                        className="mt-8 text-xs font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-6 py-3 rounded-xl transition"
                                    >
                                        Go to Parent Brand
                                    </button>
                                </div>
                            ) : fields.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center border-2 border-dashed border-slate-100 rounded-[40px] bg-white/40 p-12">
                                    <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mb-6 border border-slate-100 shadow-sm relative overflow-hidden">
                                        <div className="absolute inset-0 bg-pink-500/5 pulse" />
                                        <ListPlus size={28} className="text-pink-300 relative z-10" />
                                    </div>
                                    <h4 className="font-black text-xl text-slate-800">Ready for construction</h4>
                                    <p className="text-slate-500 text-sm mt-2 max-w-xs">Define the data model for your brand. Add fields like "Education Background", "Referral Source", etc.</p>
                                    <button
                                        onClick={() => setFieldModalOpen(true)}
                                        className="mt-8 px-8 py-3 bg-white border border-slate-200 text-slate-700 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-slate-50 transition"
                                    >
                                        Start Building +
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-4 max-w-3xl mx-auto">
                                    {fields.map(field => (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                            key={field.id}
                                            className="group flex justify-between items-center p-6 bg-white border border-slate-100 rounded-[28px] hover:border-pink-200 hover:shadow-2xl hover:shadow-pink-500/5 transition-all relative overflow-hidden"
                                        >
                                            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-pink-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            <div className="flex items-center gap-6">
                                                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex flex-col items-center justify-center border border-slate-100 font-black text-[9px] text-pink-600 uppercase tracking-tighter shrink-0 group-hover:bg-pink-50 group-hover:border-pink-100 transition-colors">
                                                    <span className="opacity-40 text-[7px] mb-0.5 mt-1">TYPE</span>
                                                    {field.field_type.substring(0, 3)}
                                                </div>
                                                <div>
                                                    <p className="font-black text-slate-800 text-xl tracking-tight leading-none">{field.label}</p>
                                                    <div className="flex items-center gap-3 mt-3">
                                                        <div className="flex items-center gap-1.5 bg-slate-100/50 px-2.5 py-1 rounded-lg">
                                                            <Settings size={10} className="text-slate-400" />
                                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Order: {field.order}</span>
                                                        </div>
                                                        {field.is_required && (
                                                            <div className="flex items-center gap-1.5 bg-rose-50 px-2.5 py-1 rounded-lg">
                                                                <AlertCircle size={10} className="text-rose-400" />
                                                                <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Required</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                <button
                                                    onClick={() => handleDeleteField(field.id)}
                                                    className="text-slate-400 hover:text-rose-500 p-4 bg-slate-50 hover:bg-rose-50 rounded-2xl transition-colors"
                                                >
                                                    <Trash2 size={20} />
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
                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                        <label className="block text-sm mb-4 text-slate-500 font-bold uppercase tracking-wider">Configure Permissions for Role:</label>
                        <div className="flex gap-3 flex-wrap">
                            {['ADMIN', 'SALES', 'MENTOR', 'ACADEMIC', 'STUDENT'].map(role => (
                                <button
                                    key={role}
                                    onClick={() => setSelectedRoleForPerms(role)}
                                    className={`px-5 py-2 rounded-full text-xs font-bold transition-all shadow-sm ${selectedRoleForPerms === role ? 'bg-orange-500 text-white shadow-orange-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}
                                >
                                    {role}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-widest font-bold border-b border-slate-200">
                                <tr>
                                    <th className="p-5">Module / Section</th>
                                    <th className="p-5 text-center">View</th>
                                    <th className="p-5 text-center">Add</th>
                                    <th className="p-5 text-center">Edit</th>
                                    <th className="p-5 text-center">Delete</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {modules?.map(mod => {
                                    const p = Array.isArray(rolePermissions) ? rolePermissions.find(x => x.module === mod.id) || {} : {};
                                    return (
                                        <tr key={mod.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-5">
                                                <div className="font-bold text-slate-800 text-lg">{mod.name}</div>
                                                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mt-1">{mod.id}</div>
                                            </td>
                                            {['can_view', 'can_add', 'can_edit', 'can_delete'].map(key => (
                                                <td key={key} className="p-5 text-center">
                                                    <button
                                                        onClick={() => handleTogglePermission(mod.id, key, p[key] || false)}
                                                        className={`w-14 h-8 rounded-full transition-all relative shadow-inner ${p[key] ? 'bg-green-500' : 'bg-slate-200'}`}
                                                    >
                                                        <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all transform ${p[key] ? 'translate-x-7' : 'translate-x-1'}`}></div>
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
                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                        <h2 className="text-xl font-bold text-slate-800 mb-6">Wise LMS Integration</h2>

                        <div className="space-y-4">
                            <p className="text-slate-600">
                                Sync all students from the configured Wise LMS account. This process will:
                            </p>
                            <ul className="list-disc pl-5 text-sm text-slate-500 space-y-2">
                                <li>Scan all students in Wise (this may take time depending on the count).</li>
                                <li>Match students by their <b>mobile number</b> (last 10 digits).</li>
                                <li><b>Link</b> existing CRM students to their Wise profiles if not already linked.</li>
                                <li><b>Create</b> new student profiles in CRM for any Wise student not found here (marked as 'Wise Import' program).</li>
                            </ul>

                            <div className="pt-6 flex gap-4">
                                <button
                                    onClick={handleSyncWise}
                                    disabled={isSyncing}
                                    className={`px-8 py-4 rounded-xl font-bold text-white shadow-lg transition-all 
                                        ${isSyncing ? 'bg-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-200 transform hover:-translate-y-1'}`}
                                >
                                    {isSyncing ? 'Syncing in Progress...' : 'Start Full Sync'}
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
                                    className="px-8 py-4 rounded-xl font-bold text-indigo-600 border-2 border-indigo-600 hover:bg-indigo-50 transition-all"
                                >
                                    Fetch Wise Courses
                                </button>
                            </div>

                            {syncStatus && (
                                <div className={`mt-6 p-4 rounded-xl border font-bold text-sm
                                    ${syncStatus.includes('Failed') ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-700 border-green-100'}
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
                                                    ID: {course.id || course.itemId} | Sessions: {course.sessionsCount || 0}
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
                        <div className="bg-white rounded-2xl p-8 w-full max-w-md border border-slate-200 shadow-2xl transform transition-all scale-100">
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
        </div >
    );
};

export default AdminModule;
