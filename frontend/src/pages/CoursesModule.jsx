import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { Plus, Trash2, Edit2, AlertCircle, Save, X } from 'lucide-react';

const CoursesModule = () => {
    // Stage Management
    const [programs, setPrograms] = useState([]);
    const [subPrograms, setSubPrograms] = useState([]);
    const [courses, setCourses] = useState([]);
    const [fields, setFields] = useState([]);

    // Selection state
    const [selectedProgram, setSelectedProgram] = useState('');
    const [selectedSubProgram, setSelectedSubProgram] = useState('');
    const [selectedCourse, setSelectedCourse] = useState('');

    // Modal states
    const [programModalOpen, setProgramModalOpen] = useState(false);
    const [subProgramModalOpen, setSubProgramModalOpen] = useState(false);
    const [courseModalOpen, setCourseModalOpen] = useState(false);
    const [fieldModalOpen, setFieldModalOpen] = useState(false);

    // Form states
    const [newProgram, setNewProgram] = useState({ name: '', description: '' });
    const [newSubProgram, setNewSubProgram] = useState('');
    const [newCourse, setNewCourse] = useState({ name: '', fee_amount: 0 });
    const [newField, setNewField] = useState({
        label: '', field_type: 'text', options: '', order: 0, is_required: true
    });

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchPrograms();
    }, []);

    useEffect(() => {
        if (selectedProgram) {
            fetchSubPrograms(selectedProgram);
            fetchFields();
        } else {
            setSubPrograms([]);
            setCourses([]);
        }
    }, [selectedProgram]);

    useEffect(() => {
        if (selectedSubProgram) {
            fetchCourses(selectedSubProgram);
        } else {
            setCourses([]);
        }
        if (selectedProgram) fetchFields();
    }, [selectedSubProgram]);

    useEffect(() => {
        if (selectedProgram) fetchFields();
    }, [selectedCourse]);


    // --- API Calls ---

    const fetchPrograms = async () => {
        try {
            const res = await api.get('programs/');
            setPrograms(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchSubPrograms = async (progId) => {
        try {
            const res = await api.get(`sub-programs/?program=${progId}`);
            setSubPrograms(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchCourses = async (subProgId) => {
        try {
            const res = await api.get(`courses/?sub_program=${subProgId}`);
            setCourses(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchFields = async () => {
        const params = new URLSearchParams();
        if (selectedProgram) params.append('program', selectedProgram);
        if (selectedSubProgram) params.append('sub_program', selectedSubProgram);
        if (selectedCourse) params.append('course', selectedCourse);

        try {
            const res = await api.get(`forms/fields/?${params.toString()}`);
            setFields(res.data.sort((a, b) => a.order - b.order));
        } catch (err) {
            console.error(err);
        }
    };

    // --- Create Handlers ---

    const handleCreateProgram = async (e) => {
        e.preventDefault();
        try {
            await api.post('programs/', newProgram);
            setProgramModalOpen(false);
            fetchPrograms();
            setNewProgram({ name: '', description: '' });
        } catch (err) {
            console.error(err);
            alert("Failed to create program");
        }
    };

    const handleCreateSubProgram = async (e) => {
        e.preventDefault();
        try {
            await api.post('sub-programs/', {
                program: selectedProgram,
                name: newSubProgram
            });
            setSubProgramModalOpen(false);
            fetchSubPrograms(selectedProgram);
            setNewSubProgram('');
        } catch (err) {
            console.error(err);
            alert("Failed to create sub-program");
        }
    };

    const handleCreateCourse = async (e) => {
        e.preventDefault();
        try {
            await api.post('courses/', {
                name: newCourse.name,
                fee_amount: newCourse.fee_amount,
                sub_program: selectedSubProgram
            });
            setCourseModalOpen(false);
            fetchCourses(selectedSubProgram);
            setNewCourse({ name: '', fee_amount: 0 });
        } catch (err) {
            console.error(err);
            alert("Failed to create course");
        }
    };

    const handleCreateField = async (e) => {
        e.preventDefault();
        const payload = { ...newField };
        if (selectedProgram) payload.program = selectedProgram;
        if (selectedSubProgram) payload.sub_program = selectedSubProgram;
        if (selectedCourse) payload.course = selectedCourse;

        if (payload.field_type === 'dropdown' && typeof payload.options === 'string') {
            payload.options = payload.options.split(',').map(s => s.trim());
        } else if (payload.field_type !== 'dropdown') {
            payload.options = null;
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

    const handleDeleteField = async (id) => {
        if (!window.confirm("Delete this field?")) return;
        try {
            await api.delete(`forms/fields/${id}/`);
            fetchFields();
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="space-y-8 text-slate-900 font-sans">
            <div className="flex justify-between items-center pb-6 border-b border-slate-200">
                <div>
                    <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-pink-600 to-orange-500">
                        Course Management
                    </h1>
                    <p className="text-slate-500 mt-1">Manage programs, courses, and custom application forms.</p>
                </div>
            </div>

            {/* Selection Area */}
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm animate-fadeIn">
                <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center text-sm">1</span>
                    Structure Configuration
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Program Select */}
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Program</label>
                        <div className="flex gap-2">
                            <select
                                className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:ring-2 focus:ring-pink-100 focus:border-pink-500 outline-none transition-all font-medium"
                                value={selectedProgram}
                                onChange={e => {
                                    setSelectedProgram(e.target.value);
                                    setSelectedSubProgram('');
                                    setSelectedCourse('');
                                }}
                            >
                                <option value="">-- Select Program --</option>
                                {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <button
                                onClick={() => setProgramModalOpen(true)}
                                className="px-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition border border-indigo-200"
                                title="Add New Program"
                            >
                                <Plus size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Sub-Program Select */}
                    {selectedProgram && (
                        <div className="animate-fadeIn">
                            <label className="block text-sm font-bold text-slate-700 mb-2">Sub-Program / Category</label>
                            <div className="flex gap-2">
                                <select
                                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:ring-2 focus:ring-pink-100 focus:border-pink-500 outline-none transition-all font-medium"
                                    value={selectedSubProgram}
                                    onChange={e => {
                                        setSelectedSubProgram(e.target.value);
                                        setSelectedCourse('');
                                    }}
                                >
                                    <option value="">-- Select Category --</option>
                                    {subPrograms.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                                </select>
                                <button
                                    onClick={() => setSubProgramModalOpen(true)}
                                    className="px-3 bg-pink-50 text-pink-600 rounded-xl hover:bg-pink-100 transition border border-pink-200"
                                    title="Add New Category"
                                >
                                    <Plus size={20} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Course Select */}
                    {selectedSubProgram && (
                        <div className="animate-fadeIn">
                            <label className="block text-sm font-bold text-slate-700 mb-2">Course</label>
                            <div className="flex gap-2">
                                <select
                                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:ring-2 focus:ring-pink-100 focus:border-pink-500 outline-none transition-all font-medium"
                                    value={selectedCourse}
                                    onChange={e => setSelectedCourse(e.target.value)}
                                >
                                    <option value="">-- Select Course --</option>
                                    {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                                <button
                                    onClick={() => setCourseModalOpen(true)}
                                    className="px-3 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition border border-green-200"
                                    title="Add New Course"
                                >
                                    <Plus size={20} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Dynamic Form Builder */}
            {(selectedProgram || selectedSubProgram || selectedCourse) && (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm animate-fadeIn">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm">2</span>
                            Form Field Configuration
                            <span className="ml-2 text-xs font-normal text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                                Context: {selectedCourse ? 'Course Specific' : selectedSubProgram ? 'Category Specific' : 'Program Wide'}
                            </span>
                        </h2>
                        <button
                            onClick={() => setFieldModalOpen(true)}
                            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-white font-bold shadow-md transition-all flex items-center gap-2"
                        >
                            <Plus size={18} /> Add Form Field
                        </button>
                    </div>

                    {fields.length === 0 ? (
                        <div className="text-center py-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                            <p className="text-slate-400 font-medium">No custom form fields defined for this selection.</p>
                            <p className="text-slate-400 text-sm mt-1">Add fields to collect specific information during enrollment.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {fields.map(field => (
                                <div key={field.id} className="flex justify-between items-center p-5 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs uppercase">
                                            {field.field_type.substring(0, 3)}
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                                                {field.label}
                                                {field.is_required && <span className="text-red-500 text-xs bg-red-50 px-2 py-0.5 rounded-full">* Required</span>}
                                            </div>
                                            <div className="text-xs text-slate-400 mt-1 font-medium flex gap-3">
                                                <span>Order: {field.order}</span>
                                                {field.options && <span>Options: {Array.isArray(field.options) ? field.options.join(', ') : field.options}</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteField(field.id)}
                                        className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                        title="Delete Field"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* --- Modals --- */}

            {/* Program Modal */}
            {programModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-white rounded-2xl p-8 w-full max-w-md border border-slate-200 shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-slate-900">Add New Program</h2>
                            <button onClick={() => setProgramModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
                        </div>
                        <form onSubmit={handleCreateProgram} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Program Name</label>
                                <input
                                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none font-medium"
                                    value={newProgram.name}
                                    onChange={e => setNewProgram({ ...newProgram, name: e.target.value })}
                                    placeholder="e.g. Natya Arts, Career Academy"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Description</label>
                                <textarea
                                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none font-medium"
                                    value={newProgram.description}
                                    onChange={e => setNewProgram({ ...newProgram, description: e.target.value })}
                                    placeholder="Brief description of the program"
                                    rows="3"
                                />
                            </div>
                            <button type="submit" className="w-full py-3 bg-indigo-600 rounded-xl hover:bg-indigo-700 text-white font-bold shadow-md transition-all">
                                Create Program
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Sub-Program Modal */}
            {subProgramModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-white rounded-2xl p-8 w-full max-w-md border border-slate-200 shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-slate-900">Add Category</h2>
                            <button onClick={() => setSubProgramModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
                        </div>
                        <form onSubmit={handleCreateSubProgram} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Category Name</label>
                                <input
                                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-pink-100 focus:border-pink-500 outline-none font-medium"
                                    value={newSubProgram}
                                    onChange={e => setNewSubProgram(e.target.value)}
                                    placeholder="e.g. Dance, Music, Yoga"
                                    required
                                />
                            </div>
                            <button type="submit" className="w-full py-3 bg-pink-600 rounded-xl hover:bg-pink-700 text-white font-bold shadow-md transition-all">
                                Create Category
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Course Modal */}
            {courseModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-white rounded-2xl p-8 w-full max-w-md border border-slate-200 shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-slate-900">Add New Course</h2>
                            <button onClick={() => setCourseModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
                        </div>
                        <form onSubmit={handleCreateCourse} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Course Name</label>
                                <input
                                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-green-100 focus:border-green-500 outline-none font-medium"
                                    value={newCourse.name}
                                    onChange={e => setNewCourse({ ...newCourse, name: e.target.value })}
                                    placeholder="e.g. Bharatanatyam Beginner"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Fee Amount (₹)</label>
                                <input
                                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-green-100 focus:border-green-500 outline-none font-medium"
                                    type="number"
                                    value={newCourse.fee_amount}
                                    onChange={e => setNewCourse({ ...newCourse, fee_amount: e.target.value })}
                                    required
                                />
                            </div>
                            <button type="submit" className="w-full py-3 bg-green-600 rounded-xl hover:bg-green-700 text-white font-bold shadow-md transition-all">
                                Create Course
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Field Modal */}
            {fieldModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-white rounded-2xl p-8 w-full max-w-md border border-slate-200 shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-slate-900">Add Custom Field</h2>
                            <button onClick={() => setFieldModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
                        </div>
                        <form onSubmit={handleCreateField} className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Field Label</label>
                                <input className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none font-medium" value={newField.label} onChange={e => setNewField({ ...newField, label: e.target.value })} required placeholder="e.g. Previous Experience" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Type</label>
                                <select className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none font-medium" value={newField.field_type} onChange={e => setNewField({ ...newField, field_type: e.target.value })}>
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
                                    <input className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none font-medium" placeholder="Option 1, Option 2" value={newField.options} onChange={e => setNewField({ ...newField, options: e.target.value })} />
                                </div>
                            )}
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Order</label>
                                    <input type="number" className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none font-medium" value={newField.order} onChange={e => setNewField({ ...newField, order: parseInt(e.target.value) })} />
                                </div>
                                <div className="flex items-center pt-6">
                                    <input type="checkbox" className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300 mr-3" checked={newField.is_required} onChange={e => setNewField({ ...newField, is_required: e.target.checked })} />
                                    <label className="text-sm font-bold text-slate-700">Is Required</label>
                                </div>
                            </div>
                            <button type="submit" className="w-full py-3 bg-indigo-600 rounded-xl hover:bg-indigo-700 text-white font-bold shadow-md transition-all">Add Field</button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CoursesModule;
