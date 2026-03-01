import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import {
    Plus, Trash2, Edit2, AlertCircle, Save, X,
    ChevronRight, ChevronDown, Book, Layers, GraduationCap,
    Settings, ListPlus, Info, Eye, ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const CoursesModule = () => {
    // Hierarchical Data State
    const [hierarchy, setHierarchy] = useState([]);
    const [loading, setLoading] = useState(true);

    // UI State
    const [selectedNode, setSelectedNode] = useState(null); // { type, id, name, parentData? }
    const [expandedNodes, setExpandedNodes] = useState(new Set());
    const [fields, setFields] = useState([]);
    const [parentFields, setParentFields] = useState([]); // Inherited fields

    // Modal states
    const [activeModal, setActiveModal] = useState(null); // 'program', 'subprogram', 'course', 'field'
    const [editMode, setEditMode] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [previewStep, setPreviewStep] = useState(1);

    // Form states
    const [formData, setFormData] = useState({
        program: { name: '', description: '' },
        subprogram: { name: '', program: '' },
        course: { name: '', fee_amount: 0, sub_program: '' },
        field: { label: '', field_type: 'text', options: '', order: 0, is_required: true }
    });

    useEffect(() => {
        fetchHierarchy();
    }, []);

    useEffect(() => {
        if (selectedNode) {
            fetchFields(selectedNode);
        }
    }, [selectedNode]);

    // --- API Calls ---

    const fetchHierarchy = async () => {
        setLoading(true);
        try {
            const res = await api.get('programs/hierarchy/');
            setHierarchy(res.data);
            // Default select first program if none selected
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

    const fetchFields = async (node) => {
        if (node.type !== 'program') {
            setFields([]);
            return;
        }
        const params = new URLSearchParams();
        params.append('program', node.id);

        try {
            const res = await api.get(`forms/fields/?${params.toString()}`);
            setFields(res.data.sort((a, b) => a.order - b.order));
        } catch (err) {
            console.error("Failed to fetch fields", err);
        }
    };

    // --- Handlers ---

    const toggleNode = (id) => {
        const newExpanded = new Set(expandedNodes);
        if (newExpanded.has(id)) newExpanded.delete(id);
        else newExpanded.add(id);
        setExpandedNodes(newExpanded);
    };

    const handleAction = async (e) => {
        e.preventDefault();
        try {
            let endpoint = '';
            let payload = {};
            let isField = activeModal === 'field';

            if (isField) {
                endpoint = editMode ? `forms/fields/${formData.field.id}/` : 'forms/fields/';
                payload = { ...formData.field };
                if (!editMode) {
                    if (selectedNode.type === 'program') payload.program = selectedNode.id;
                    if (selectedNode.type === 'subprogram') payload.sub_program = selectedNode.id;
                    if (selectedNode.type === 'course') payload.course = selectedNode.id;
                }
                if (payload.field_type === 'dropdown' && typeof payload.options === 'string') {
                    payload.options = payload.options.split(',').map(s => s.trim());
                }
            } else {
                if (activeModal === 'program') {
                    endpoint = editMode ? `programs/${formData.program.id}/` : 'programs/';
                    payload = formData.program;
                } else if (activeModal === 'subprogram') {
                    endpoint = editMode ? `sub-programs/${formData.subprogram.id}/` : 'sub-programs/';
                    payload = { ...formData.subprogram, program: editMode ? formData.subprogram.program : selectedNode.id };
                } else if (activeModal === 'course') {
                    endpoint = editMode ? `courses/${formData.course.id}/` : 'courses/';
                    payload = { ...formData.course, sub_program: editMode ? formData.course.sub_program : selectedNode.id };
                }
            }

            if (editMode) {
                await api.patch(endpoint, payload);
            } else {
                await api.post(endpoint, payload);
            }

            setActiveModal(null);
            setEditMode(false);
            if (isField) fetchFields(selectedNode);
            else fetchHierarchy();
        } catch (err) {
            alert("Action failed. Please check inputs.");
        }
    };

    const openEditNode = () => {
        const type = selectedNode.type;
        const data = selectedNode.data;
        if (type === 'program') {
            setFormData(prev => ({ ...prev, program: { id: data.id, name: data.name, description: data.description } }));
        } else if (type === 'subprogram') {
            setFormData(prev => ({ ...prev, subprogram: { id: data.id, name: data.name, program: data.program_id } }));
        } else if (type === 'course') {
            setFormData(prev => ({ ...prev, course: { id: data.id, name: data.name, fee_amount: data.fee_amount, sub_program: data.sub_program_id } }));
        }
        setEditMode(true);
        setActiveModal(type);
    };

    const openEditField = (field) => {
        setFormData(prev => ({
            ...prev,
            field: {
                ...field,
                options: Array.isArray(field.options) ? field.options.join(', ') : (field.options || '')
            }
        }));
        setEditMode(true);
        setActiveModal('field');
    };

    const handleDeleteField = async (id) => {
        if (!window.confirm("Delete this field?")) return;
        try {
            await api.delete(`forms/fields/${id}/`);
            fetchFields(selectedNode);
        } catch (err) {
            alert("Delete failed.");
        }
    };

    const handleDeleteNode = async () => {
        if (!window.confirm(`Are you sure you want to delete this ${selectedNode.type}?`)) return;
        try {
            let endpoint = '';
            if (selectedNode.type === 'program') endpoint = `programs/${selectedNode.id}/`;
            if (selectedNode.type === 'subprogram') endpoint = `sub-programs/${selectedNode.id}/`;
            if (selectedNode.type === 'course') endpoint = `courses/${selectedNode.id}/`;

            await api.delete(endpoint);
            setSelectedNode(null);
            fetchHierarchy();
        } catch (err) {
            alert("Delete failed.");
        }
    };

    // --- Components ---

    const TreeItem = ({ node, type, level = 0 }) => {
        const isExpanded = expandedNodes.has(`${type}-${node.id}`);
        const isSelected = selectedNode?.type === type && selectedNode?.id === node.id;

        const getIcon = () => {
            if (type === 'program') return <Book size={16} className="text-indigo-500" />;
            if (type === 'subprogram') return <Layers size={16} className="text-pink-500" />;
            return <GraduationCap size={16} className="text-emerald-500" />;
        };

        return (
            <div className="select-none">
                <div
                    onClick={() => {
                        setSelectedNode({ type, id: node.id, name: node.name, data: node });
                        if (type !== 'course') toggleNode(`${type}-${node.id}`);
                    }}
                    className={`flex items-center gap-2 p-2.5 cursor-pointer rounded-xl transition-all mb-1 ${isSelected
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'hover:bg-slate-100 text-slate-600'
                        }`}
                    style={{ marginLeft: `${level * 16}px` }}
                >
                    {type !== 'course' ? (
                        <span className="transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                            <ChevronRight size={14} className={isSelected ? 'text-white' : 'text-slate-400'} />
                        </span>
                    ) : <span className="w-3" />}
                    {getIcon()}
                    <span className="text-sm font-bold truncate">{node.name}</span>
                </div>

                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            {type === 'program' && node.sub_programs?.map(sp => (
                                <TreeItem key={`sp-${sp.id}`} node={{ ...sp, program_id: node.id }} type="subprogram" level={level + 1} />
                            ))}
                            {type === 'subprogram' && node.courses?.map(c => (
                                <TreeItem key={`c-${c.id}`} node={{ ...c, program_id: node.program_id, sub_program_id: node.id }} type="course" level={level + 1} />
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    };

    return (
        <div className="h-[calc(100vh-140px)] flex gap-6 font-sans text-slate-900 overflow-hidden">
            {/* Left Sidebar: Explorer */}
            <div className="w-80 flex flex-col bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h2 className="text-lg font-extrabold text-slate-800">Brands & Structures</h2>
                    <button
                        onClick={() => setActiveModal('program')}
                        className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm"
                    >
                        <Plus size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {loading ? (
                        <div className="space-y-4 pt-4">
                            {[1, 2, 3].map(i => <div key={i} className="h-10 bg-slate-50 rounded-xl animate-pulse" />)}
                        </div>
                    ) : (
                        hierarchy.map(prog => (
                            <TreeItem key={`p-${prog.id}`} node={prog} type="program" />
                        ))
                    )}
                </div>
            </div>

            {/* Right Panel: Canvas */}
            <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                {selectedNode ? (
                    <>
                        {/* Header Statistics/Context */}
                        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex justify-between items-end">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${selectedNode.type === 'program' ? 'bg-indigo-100 text-indigo-600' :
                                        selectedNode.type === 'subprogram' ? 'bg-pink-100 text-pink-600' :
                                            'bg-emerald-100 text-emerald-600'
                                        }`}>
                                        {selectedNode.type}
                                    </span>
                                </div>
                                <h1 className="text-3xl font-black text-slate-900 leading-tight">
                                    {selectedNode.name}
                                </h1>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={openEditNode}
                                    className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition border border-transparent hover:border-indigo-100"
                                    title="Edit Details"
                                >
                                    <Edit2 size={18} />
                                </button>
                                {selectedNode.type !== 'course' && (
                                    <button
                                        onClick={() => {
                                            setFormData(prev => ({
                                                ...prev,
                                                subprogram: { name: '', program: selectedNode.id },
                                                course: { name: '', fee_amount: 0, sub_program: selectedNode.id }
                                            }));
                                            setEditMode(false);
                                            setActiveModal(selectedNode.type === 'program' ? 'subprogram' : 'course');
                                        }}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-100"
                                    >
                                        <Plus size={18} /> Add {selectedNode.type === 'program' ? 'Category' : 'Course'}
                                    </button>
                                )}
                                <button
                                    onClick={handleDeleteNode}
                                    className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition border border-transparent hover:border-red-100"
                                    title="Delete"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Content Grid */}
                        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden pb-4">
                            {/* Form Fields Section - Only for Programs */}
                            {selectedNode.type === 'program' ? (
                                <div className="lg:col-span-2 flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                                        <h3 className="font-extrabold text-slate-800 flex items-center gap-2 text-lg">
                                            <ListPlus size={20} className="text-indigo-500" />
                                            Brand Application Form
                                        </h3>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => {
                                                    const link = `${window.location.origin}/apply/${selectedNode.data.slug || selectedNode.id}`;
                                                    navigator.clipboard.writeText(link);
                                                    alert("Application link copied to clipboard!");
                                                }}
                                                className="text-emerald-600 font-bold text-sm bg-emerald-50 px-4 py-2 rounded-xl hover:bg-emerald-100 transition flex items-center gap-2"
                                            >
                                                <ExternalLink size={16} /> Copy URL
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setFormData(prev => ({ ...prev, field: { label: '', field_type: 'text', options: '', order: 0, is_required: true } }));
                                                    setEditMode(false);
                                                    setActiveModal('field');
                                                }}
                                                className="text-indigo-600 font-bold text-sm bg-indigo-50 px-4 py-2 rounded-xl hover:bg-indigo-100 transition"
                                            >
                                                + Add Field
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
                                        {fields.length === 0 ? (
                                            <div className="text-center py-12 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200">
                                                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100 shadow-sm">
                                                    <ListPlus className="text-slate-300" />
                                                </div>
                                                <p className="text-slate-500 font-bold">No custom fields for this brand</p>
                                                <p className="text-slate-400 text-sm mt-1">Fields here will appear on the public application form for {selectedNode.name}.</p>
                                            </div>
                                        ) : (
                                            fields.map(field => (
                                                <motion.div
                                                    layout
                                                    key={field.id}
                                                    className="group flex justify-between items-center p-4 bg-slate-50 hover:bg-white border border-slate-100 hover:border-indigo-200 rounded-2xl transition-all"
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-slate-100 shadow-sm font-black text-[10px] text-indigo-400 uppercase tracking-tighter">
                                                            {field.field_type.substring(0, 3)}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-slate-800 text-base">{field.label}</p>
                                                            <div className="flex gap-4 mt-0.5">
                                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Order: {field.order}</span>
                                                                {field.is_required && <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">Required</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1 items-center">
                                                        <button
                                                            onClick={() => openEditField(field)}
                                                            className="text-slate-300 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-all p-2 bg-white hover:bg-indigo-50 rounded-xl border border-transparent hover:border-indigo-100"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteField(field.id)}
                                                            className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-2 bg-white hover:bg-red-50 rounded-xl border border-transparent hover:border-red-100"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            ) : showPreview ? (
                                <div className="lg:col-span-2 max-w-2xl mx-auto w-full animate-fadeIn">
                                    <div className="flex justify-center gap-2 mb-8">
                                        {[1, 2, 3].map(i => (
                                            <div key={i} className={`h-1 w-12 rounded-full transition-all ${previewStep >= i ? 'bg-indigo-600' : 'bg-slate-200'}`} />
                                        ))}
                                    </div>

                                    <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-2xl relative overflow-hidden">
                                        <div className="absolute top-0 right-0 px-4 py-1.5 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-bl-2xl">
                                            Simulation
                                        </div>

                                        <AnimatePresence mode="wait">
                                            {previewStep === 1 && (
                                                <motion.div key="p1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
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
                                                        Next Step <ChevronRight size={18} />
                                                    </button>
                                                </motion.div>
                                            )}

                                            {previewStep === 2 && (
                                                <motion.div key="p2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                                                    <div>
                                                        <h4 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Track Selection</h4>
                                                        <p className="text-slate-400 font-medium text-sm">Step 2: Choose Course</p>
                                                    </div>
                                                    <div className="space-y-3">
                                                        <div className="p-4 bg-indigo-50 border-2 border-indigo-500 rounded-2xl">
                                                            <p className="font-bold text-indigo-700">Sample Category</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-4">
                                                        <button onClick={() => setPreviewStep(1)} className="px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black">Back</button>
                                                        <button onClick={() => setPreviewStep(3)} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg shadow-indigo-100">Continue</button>
                                                    </div>
                                                </motion.div>
                                            )}

                                            {previewStep === 3 && (
                                                <motion.div key="p3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
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
                                                                <div className="w-full h-14 bg-slate-50 rounded-2xl border border-slate-100 px-4 flex items-center">
                                                                    <span className="text-slate-300 font-bold">Mock Input...</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="flex gap-4">
                                                        <button onClick={() => setPreviewStep(2)} className="px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black">Back</button>
                                                        <div className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 cursor-pointer">
                                                            Submit Application <ExternalLink size={18} />
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                    <p className="text-center mt-6 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                                        Generated Preview for {selectedNode.name}
                                    </p>
                                </div>
                            ) : (
                                <div className="lg:col-span-2 flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm p-12 items-center justify-center text-center">
                                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                                        <Info size={40} className="text-slate-300" />
                                    </div>
                                    <h3 className="text-xl font-black text-slate-800 mb-2">Structure Settings</h3>
                                    <p className="text-slate-500 max-w-sm">
                                        Forms are managed at the <b>Brand (Program)</b> level to maintain consistency.
                                        Click on a Program in the sidebar to edit the application form.
                                    </p>
                                </div>
                            )}

                            {/* Info/Inheritance Right Card */}
                            <div className="flex flex-col gap-6">
                                {/* Inherited Knowledge */}
                                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                                    <h3 className="font-extrabold text-slate-800 mb-4 flex items-center gap-2">
                                        <Info size={18} className="text-pink-500" />
                                        Inheritance Rules
                                    </h3>
                                    <div className="p-4 bg-pink-50/50 rounded-2xl border border-pink-100">
                                        <p className="text-xs text-pink-700 leading-relaxed font-medium">
                                            {selectedNode.type === 'program' ?
                                                "This is the top level. Fields added here will be requested for EVERY student in this brand." :
                                                selectedNode.type === 'subprogram' ?
                                                    "Fields here apply to all courses in this category, plus fields inherited from the parent Program." :
                                                    "Final course level. Students will see fields from Program + Category + this Course."
                                            }
                                        </p>
                                    </div>
                                </div>

                                {/* Preview Button */}
                                <div
                                    onClick={() => setShowPreview(!showPreview)}
                                    className={`bg-gradient-to-br p-6 rounded-3xl shadow-xl transition-all cursor-pointer group transform hover:-translate-y-1 active:scale-95 ${showPreview ? 'from-slate-800 to-slate-900 shadow-slate-200' : 'from-indigo-500 to-indigo-700 shadow-indigo-100'}`}
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <Eye size={24} className="text-white" />
                                        <ExternalLink size={16} className="text-white/50 group-hover:text-white transition-colors" />
                                    </div>
                                    <h4 className="font-black text-lg mb-1 text-white">
                                        {showPreview ? 'Exit Preview' : 'Form Live Preview'}
                                    </h4>
                                    <p className="text-indigo-100 text-[10px] font-black uppercase tracking-widest opacity-80">
                                        {showPreview ? 'Click to return to editor' : 'Simulate Student View'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-[40px] border-2 border-dashed border-slate-200">
                        <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                            <Book size={40} className="text-slate-300" />
                        </div>
                        <h2 className="text-xl font-black text-slate-400">Select an item from the sidebar</h2>
                        <p className="text-slate-400 text-sm mt-2">Manage your institution's structure and application forms</p>
                    </div>
                )}
            </div>

            {/* --- Modals (Simplified) --- */}
            <AnimatePresence>
                {activeModal && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl overflow-hidden"
                        >
                            <div className="flex justify-between items-center mb-8">
                                <h2 className="text-2xl font-black text-slate-900 capitalize">
                                    {editMode ? 'Edit' : 'Add'} {activeModal === 'subprogram' ? 'Category' : activeModal}
                                </h2>
                                <button onClick={() => setActiveModal(null)} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition">
                                    <X size={20} />
                                </button>
                            </div>

                            <form onSubmit={handleAction} className="space-y-6">
                                {activeModal === 'field' ? (
                                    <>
                                        <div>
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Field Label</label>
                                            <input
                                                className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 outline-none font-bold transition-all"
                                                placeholder="e.g. Previous Experience"
                                                value={formData.field.label}
                                                onChange={e => setFormData({ ...formData, field: { ...formData.field, label: e.target.value } })}
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Input Type</label>
                                            <select
                                                className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 outline-none font-bold transition-all appearance-none"
                                                value={formData.field.field_type}
                                                onChange={e => setFormData({ ...formData, field: { ...formData.field, field_type: e.target.value } })}
                                            >
                                                <option value="text">Standard Text</option>
                                                <option value="number">Numeric Input</option>
                                                <option value="date">Date Picker</option>
                                                <option value="dropdown">Selection Dropdown</option>
                                                <option value="file">File Upload</option>
                                            </select>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div>
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Name</label>
                                            <input
                                                className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 outline-none font-bold transition-all"
                                                value={formData[activeModal].name}
                                                onChange={e => setFormData({ ...formData, [activeModal]: { ...formData[activeModal], name: e.target.value } })}
                                                placeholder={`Enter ${activeModal} name`}
                                                required
                                            />
                                        </div>
                                        {activeModal === 'course' && (
                                            <div>
                                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Base Fee (INR)</label>
                                                <input
                                                    type="number"
                                                    className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 outline-none font-bold transition-all"
                                                    value={formData.course.fee_amount}
                                                    onChange={e => setFormData({ ...formData, course: { ...formData.course, fee_amount: e.target.value } })}
                                                    required
                                                />
                                            </div>
                                        )}
                                    </>
                                )}

                                <button type="submit" className="w-full py-4 bg-indigo-600 rounded-2xl text-white font-black text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all hover:translate-y-[-2px] active:translate-y-0">
                                    {editMode ? 'Save Changes' : `Create ${activeModal}`}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CoursesModule;
