import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
    BookOpen,
    Users,
    Calendar,
    CheckCircle2,
    Plus,
    ClipboardCheck,
    ChevronRight,
    ChevronLeft,
    Search,
    Layers,
    Clock,
    X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const TeacherModule = () => {
    const { user } = useAuth();
    const [batches, setBatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Selection State
    const [selectedBatch, setSelectedBatch] = useState(null);
    const [activeTab, setActiveTab] = useState('STUDENTS'); // STUDENTS, SYLLABUS, SESSION, HISTORY
    
    // Batch Details Data
    const [batchStudents, setBatchStudents] = useState([]);
    const [syllabusParts, setSyllabusParts] = useState([]);
    const [classSessions, setClassSessions] = useState([]);
    
    // Syllabus Form State
    const [showAddSyllabus, setShowAddSyllabus] = useState(false);
    const [newSyllabus, setNewSyllabus] = useState({ title: '', weight_percentage: '' });
    
    // Session Logging State
    const [sessionData, setSessionData] = useState({
        date: new Date().toISOString().split('T')[0],
        teacher_summary: '',
        completed_parts: [],
        attendance: {}
    });
    const [savingSession, setSavingSession] = useState(false);
    const [toast, setToast] = useState(null);

    // --------------------------------------------------------------------------------
    // Data Fetching
    // --------------------------------------------------------------------------------
    const fetchBatches = async () => {
        setLoading(true);
        try {
            const res = await api.get(`batches/?search=${searchTerm}`);
            const data = Array.isArray(res.data) ? res.data : (res.data?.results || []);
            setBatches(data);
            
            // Refresh selected batch data if one is selected
            if (selectedBatch) {
                const updated = data.find(b => b.id === selectedBatch.id);
                if (updated) setSelectedBatch(updated);
            }
        } catch (err) {
            console.error("Error fetching batches", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => fetchBatches(), 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const fetchBatchDetails = async (batchId) => {
        try {
            const [studentsRes, partsRes, sessionsRes] = await Promise.all([
                api.get(`students/?batch=${batchId}`),
                api.get(`syllabus-parts/?batch=${batchId}`),
                api.get(`class-sessions/?batch=${batchId}`)
            ]);
            
            const stds = Array.isArray(studentsRes.data) ? studentsRes.data : (studentsRes.data?.results || []);
            setBatchStudents(stds);
            setSyllabusParts(Array.isArray(partsRes.data) ? partsRes.data : (partsRes.data?.results || []));
            setClassSessions(Array.isArray(sessionsRes.data) ? sessionsRes.data : (sessionsRes.data?.results || []));
            
            // Initialize Session Attendance to True for all students
            const initialAtt = {};
            stds.forEach(s => initialAtt[s.id] = true);
            setSessionData(prev => ({ ...prev, attendance: initialAtt }));
        } catch (err) {
            console.error("Error fetching batch details", err);
        }
    };

    useEffect(() => {
        if (selectedBatch) {
            fetchBatchDetails(selectedBatch.id);
        }
    }, [selectedBatch?.id]);

    // --------------------------------------------------------------------------------
    // Handlers
    // --------------------------------------------------------------------------------
    const handleAddSyllabus = async (e) => {
        e.preventDefault();
        if (!newSyllabus.title || !newSyllabus.weight_percentage) return;
        try {
            await api.post('syllabus-parts/', {
                batch: selectedBatch.id,
                title: newSyllabus.title,
                weight_percentage: parseFloat(newSyllabus.weight_percentage)
            });
            setNewSyllabus({ title: '', weight_percentage: '' });
            setShowAddSyllabus(false);
            fetchBatchDetails(selectedBatch.id);
            fetchBatches();
        } catch (err) {
            console.error("Error adding syllabus", err);
            alert("Failed to add syllabus part");
        }
    };

    const handleLogSession = async (e) => {
        e.preventDefault();
        setSavingSession(true);
        try {
            await api.post(`batches/${selectedBatch.id}/log_session/`, sessionData);
            setToast({ type: 'success', message: 'Class Session Logged Successfully!' });
            setTimeout(() => setToast(null), 3000);
            
            // Reset Form
            setSessionData(prev => ({
                ...prev,
                teacher_summary: '',
                completed_parts: [],
            }));
            setActiveTab('STUDENTS');
            fetchBatchDetails(selectedBatch.id);
            fetchBatches();
        } catch (err) {
            console.error("Error logging session", err);
            alert("Failed to log session");
        } finally {
            setSavingSession(false);
        }
    };

    // --------------------------------------------------------------------------------
    // Render Views
    // --------------------------------------------------------------------------------
    if (selectedBatch) {
        const progress = selectedBatch.syllabus_progress || 0;
        
        return (
            <div className="min-h-screen w-full bg-slate-50 py-8 px-4 sm:px-6 lg:px-8 font-sans">
                <div className="max-w-6xl mx-auto w-full">
                    <button
                        onClick={() => setSelectedBatch(null)}
                        className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold text-sm mb-6 transition-colors"
                    >
                        <ChevronLeft size={16} /> Back to Batches
                    </button>
                    
                    <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100 flex flex-col md:flex-row">
                        <div className="w-full md:w-1/3 bg-indigo-600 text-white p-8">
                            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-6">
                                <BookOpen size={24} className="text-white" />
                            </div>
                            <h2 className="text-3xl font-black mb-2">{selectedBatch.name}</h2>
                            <p className="text-indigo-200 font-medium mb-6">{selectedBatch.course_name}</p>
                            
                            <div className="space-y-4">
                                <div className="bg-white/10 rounded-2xl p-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-bold text-indigo-200 uppercase tracking-widest">Syllabus Progress</span>
                                        <span className="text-sm font-black">{progress}%</span>
                                    </div>
                                    <div className="w-full bg-indigo-900/50 rounded-full h-2.5 overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }} animate={{ width: `${progress}%` }}
                                            className="bg-emerald-400 h-2.5 rounded-full"
                                        />
                                    </div>
                                </div>
                                
                                <div className="bg-white/10 rounded-2xl p-4 flex justify-between items-center">
                                    <span className="text-xs font-bold text-indigo-200 uppercase tracking-widest">Students</span>
                                    <span className="text-xl font-black">{batchStudents.length}</span>
                                </div>
                                <div className="bg-white/10 rounded-2xl p-4 flex justify-between items-center">
                                    <span className="text-xs font-bold text-indigo-200 uppercase tracking-widest">Classes Held</span>
                                    <span className="text-xl font-black">{classSessions.length}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div className="w-full md:w-2/3 flex flex-col">
                            <div className="flex border-b border-slate-100 px-2 pt-2">
                                {[ 
                                    { id: 'STUDENTS', label: 'Students', icon: Users },
                                    { id: 'SYLLABUS', label: 'Syllabus Planner', icon: Layers },
                                    { id: 'SESSION', label: 'Log Class Record', icon: ClipboardCheck },
                                    { id: 'HISTORY', label: 'Class History', icon: Calendar },
                                ].map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => setActiveTab(t.id)}
                                        className={`flex-1 py-4 px-4 flex justify-center items-center gap-2 text-sm font-bold border-b-2 transition-all ${activeTab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                                    >
                                        <t.icon size={16} />
                                        <span>{t.label}</span>
                                    </button>
                                ))}
                            </div>
                            
                            <div className="flex-1 p-6 md:p-8 bg-slate-50/50 overflow-y-auto">
                                <AnimatePresence mode="wait">
                                    {toast && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                                            className="mb-6 px-6 py-3 rounded-2xl bg-emerald-500 text-white shadow-lg flex items-center gap-3 font-bold text-sm"
                                        >
                                            <CheckCircle2 size={16} /> {toast.message}
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {activeTab === 'STUDENTS' && (
                                    <div className="space-y-4 animate-fadeIn">
                                        <h3 className="text-lg font-black text-slate-800 mb-4">Enrolled Students</h3>
                                        {batchStudents.length === 0 ? (
                                            <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-slate-200">
                                                <p className="text-sm text-slate-400 font-medium italic">No students assigned to this batch yet.</p>
                                            </div>
                                        ) : (
                                            batchStudents.map(student => (
                                                <div key={student.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex justify-between items-center">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600">
                                                            {student.first_name[0]}
                                                        </div>
                                                        <div>
                                                            <h4 className="font-bold text-slate-800">{student.first_name} {student.last_name}</h4>
                                                            <p className="text-xs font-mono text-slate-500">{student.crm_student_id}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-xs text-slate-400 font-bold uppercase">Contact</p>
                                                        <p className="text-sm text-slate-700 font-medium">{student.mobile || '-'}</p>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}

                                {activeTab === 'SYLLABUS' && (
                                    <div className="space-y-6 animate-fadeIn">
                                        <div className="flex justify-between items-center">
                                            <h3 className="text-lg font-black text-slate-800">Syllabus Parts</h3>
                                            <button
                                                onClick={() => setShowAddSyllabus(!showAddSyllabus)}
                                                className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-sm hover:bg-indigo-100 transition-colors"
                                            >
                                                {showAddSyllabus ? <X size={16} /> : <Plus size={16} />}
                                                {showAddSyllabus ? 'Cancel' : 'Add Part'}
                                            </button>
                                        </div>
                                        
                                        {showAddSyllabus && (
                                            <form onSubmit={handleAddSyllabus} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-end animate-fadeIn">
                                                <div className="flex-1 space-y-1">
                                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Part Title</label>
                                                    <input 
                                                        type="text" required placeholder="e.g., Module 1: Introduction to Adavus"
                                                        value={newSyllabus.title} onChange={e => setNewSyllabus({...newSyllabus, title: e.target.value})}
                                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 outline-none font-medium"
                                                    />
                                                </div>
                                                <div className="w-32 space-y-1">
                                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Weight %</label>
                                                    <input 
                                                        type="number" required min="1" max="100" step="0.1" placeholder="5.0"
                                                        value={newSyllabus.weight_percentage} onChange={e => setNewSyllabus({...newSyllabus, weight_percentage: e.target.value})}
                                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 outline-none font-medium"
                                                    />
                                                </div>
                                                <button type="submit" className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition">
                                                    Add
                                                </button>
                                            </form>
                                        )}

                                        <div className="space-y-3">
                                            {syllabusParts.length === 0 ? (
                                                <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-slate-200">
                                                    <p className="text-sm text-slate-400 font-medium italic">No syllabus parts defined. Break down your course into parts (e.g. 20 parts of 5%).</p>
                                                </div>
                                            ) : (
                                                syllabusParts.map(part => (
                                                    <div key={part.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex justify-between items-center">
                                                        <div className="flex items-center gap-4">
                                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${part.is_completed ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                                                {part.is_completed ? <CheckCircle2 size={16} /> : <BookOpen size={14} />}
                                                            </div>
                                                            <div>
                                                                <h4 className={`font-bold ${part.is_completed ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{part.title}</h4>
                                                            </div>
                                                        </div>
                                                        <div className="text-right bg-slate-50 py-1 px-3 rounded-lg border border-slate-100">
                                                            <p className="text-xs font-black text-indigo-600">{part.weight_percentage}%</p>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'SESSION' && (
                                    <form onSubmit={handleLogSession} className="space-y-8 animate-fadeIn">
                                        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-4">
                                            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><Clock size={18}/> Class Details</h3>
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Date of Class</label>
                                                <input 
                                                    type="date" required
                                                    value={sessionData.date} onChange={e => setSessionData({...sessionData, date: e.target.value})}
                                                    className="w-full max-w-sm px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 outline-none font-medium"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Teacher's Summary</label>
                                                <textarea 
                                                    required placeholder="What was covered in this class?"
                                                    rows={4}
                                                    value={sessionData.teacher_summary} onChange={e => setSessionData({...sessionData, teacher_summary: e.target.value})}
                                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 outline-none font-medium resize-none"
                                                />
                                            </div>
                                        </div>

                                        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-4">
                                            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><Users size={18}/> Mark Attendance</h3>
                                            {batchStudents.length === 0 ? (
                                                <p className="text-sm text-slate-400 italic">No students to mark.</p>
                                            ) : (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    {batchStudents.map(student => (
                                                        <div key={student.id} onClick={() => {
                                                            setSessionData(prev => ({...prev, attendance: {...prev.attendance, [student.id]: !prev.attendance[student.id]}}));
                                                        }} className={`cursor-pointer rounded-xl p-3 border-2 transition-all flex items-center justify-between ${sessionData.attendance[student.id] ? 'border-emerald-500 bg-emerald-50/50' : 'border-rose-200 bg-rose-50/30'}`}>
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${sessionData.attendance[student.id] ? 'bg-emerald-500 text-white' : 'bg-rose-200 text-rose-700'}`}>
                                                                    {sessionData.attendance[student.id] ? 'P' : 'A'}
                                                                </div>
                                                                <div>
                                                                    <p className="font-bold text-slate-800 text-sm">{student.first_name} {student.last_name}</p>
                                                                    <p className="font-mono text-xs text-slate-500">{student.crm_student_id}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-4">
                                            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><CheckCircle2 size={18}/> Update Syllabus Progress</h3>
                                            <p className="text-sm text-slate-500">Select any syllabus parts completed during this class session.</p>
                                            {syllabusParts.filter(p => !p.is_completed).length === 0 ? (
                                                <p className="text-sm text-slate-400 italic">All defined syllabus parts are already completed!</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {syllabusParts.filter(p => !p.is_completed).map(part => (
                                                        <label key={part.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:bg-indigo-50/50 transition-colors">
                                                            <input 
                                                                type="checkbox" 
                                                                className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                                                                checked={sessionData.completed_parts.includes(part.id)}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) setSessionData(prev => ({...prev, completed_parts: [...prev.completed_parts, part.id]}));
                                                                    else setSessionData(prev => ({...prev, completed_parts: prev.completed_parts.filter(id => id !== part.id)}));
                                                                }}
                                                            />
                                                            <div className="flex-1">
                                                                <span className="font-bold text-slate-700 text-sm">{part.title}</span>
                                                            </div>
                                                            <div className="bg-indigo-100 text-indigo-700 text-[10px] font-black px-2 py-1 rounded-md">
                                                                +{part.weight_percentage}%
                                                            </div>
                                                        </label>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <button disabled={savingSession} type="submit" className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition disabled:opacity-50">
                                            {savingSession ? 'Saving Session Record...' : 'Submit Class Record'}
                                        </button>
                                    </form>
                                )}

                                {activeTab === 'HISTORY' && (
                                    <div className="space-y-6 animate-fadeIn">
                                        <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><Calendar size={18}/> Past Class Sessions</h3>
                                        {classSessions.length === 0 ? (
                                            <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200">
                                                <Calendar size={48} className="mx-auto text-slate-200 mb-4" />
                                                <p className="text-slate-400 font-medium italic">No class sessions recorded yet for this batch.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                {[...classSessions].sort((a, b) => new Date(b.date) - new Date(a.date)).map(session => (
                                                    <div key={session.id} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className="bg-indigo-50 text-indigo-600 p-2 rounded-xl">
                                                                    <Calendar size={20} />
                                                                </div>
                                                                <div>
                                                                    <h4 className="font-black text-slate-800">
                                                                        {new Date(session.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                                                    </h4>
                                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Session Log ID: #{session.id}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-4">
                                                                <div className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-black uppercase tracking-widest flex items-center gap-1.5">
                                                                    <Users size={12}/> {session.attendances?.filter(a => a.is_present).length || 0} Present
                                                                </div>
                                                                <div className="px-3 py-1 bg-rose-50 text-rose-600 rounded-lg text-xs font-black uppercase tracking-widest flex items-center gap-1.5">
                                                                    <Users size={12}/> {session.attendances?.filter(a => !a.is_present).length || 0} Absent
                                                                </div>
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 mb-4">
                                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Teacher's Summary</p>
                                                            <p className="text-sm text-slate-700 font-medium leading-relaxed whitespace-pre-wrap">{session.teacher_summary}</p>
                                                        </div>

                                                        <div>
                                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Attendance Detailed List</p>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                                                {session.attendances?.map(att => (
                                                                    <div key={att.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[11px] font-bold ${att.is_present ? 'border-emerald-100 bg-emerald-50/20 text-emerald-700' : 'border-rose-100 bg-rose-50/20 text-rose-700'}`}>
                                                                        <div className={`w-1.5 h-1.5 rounded-full ${att.is_present ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                                                        <span className="truncate">{att.student_name}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
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
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen w-full bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
            <div className="max-w-6xl mx-auto w-full">
                <motion.div
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    className="mb-8 flex flex-col md:flex-row justify-between items-center"
                >
                    <div>
                        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 mb-2">
                            Teacher Portal
                        </h1>
                        <p className="text-sm text-slate-500 max-w-2xl">
                            Manage your assigned batches, track class attendance, and update syllabus completion.
                        </p>
                    </div>
                    <div className="relative mt-4 md:mt-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text" placeholder="Search batches..."
                            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:border-indigo-500 outline-none text-sm w-64"
                        />
                    </div>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {loading ? (
                        [1,2,3].map(i => (
                            <div key={i} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 h-48 animate-pulse flex flex-col justify-between">
                                <div className="w-1/2 h-6 bg-slate-200 rounded-lg"></div>
                                <div className="space-y-3">
                                    <div className="w-3/4 h-4 bg-slate-100 rounded"></div>
                                    <div className="w-full h-8 bg-slate-50 rounded-xl"></div>
                                </div>
                            </div>
                        ))
                    ) : batches.length > 0 ? (
                        batches.map(batch => (
                            <motion.div 
                                key={batch.id} 
                                whileHover={{ y: -5, scale: 1.02 }}
                                onClick={() => setSelectedBatch(batch)}
                                className="bg-white rounded-3xl p-6 shadow-md hover:shadow-xl border border-slate-100 cursor-pointer transition-all duration-300 relative overflow-hidden group"
                            >
                                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-indigo-100 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-full pointer-events-none"></div>
                                
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h3 className="text-xl font-black text-slate-800 mb-1">{batch.name}</h3>
                                        <p className="text-xs font-bold text-indigo-600">{batch.course_name}</p>
                                    </div>
                                    <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600">
                                        <BookOpen size={18} />
                                    </div>
                                </div>
                                
                                <div className="mb-6 space-y-3">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-500 font-medium flex items-center gap-2"><Users size={14}/> Students</span>
                                        <span className="font-bold text-slate-800">{batch.student_count}</span>
                                    </div>
                                    <div>
                                        <div className="flex justify-between items-center text-sm mb-1">
                                            <span className="text-slate-500 font-medium flex items-center gap-2"><CheckCircle2 size={14}/> Progress</span>
                                            <span className="font-bold text-slate-800">{batch.syllabus_progress || 0}%</span>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                                            <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${batch.syllabus_progress || 0}%` }}></div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="pt-4 border-t border-slate-100 flex justify-between items-center text-indigo-600 font-bold text-sm group-hover:text-indigo-700">
                                    Manage Batch <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                                </div>
                            </motion.div>
                        ))
                    ) : (
                        <div className="col-span-full py-16 text-center bg-white rounded-3xl border border-dashed border-slate-300">
                            <BookOpen size={48} className="mx-auto text-slate-300 mb-4" />
                            <h3 className="text-xl font-black text-slate-700 mb-2">No Batches Assigned</h3>
                            <p className="text-slate-500 max-w-md mx-auto">You haven't been assigned to any batches yet, or no batches match your search criteria.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TeacherModule;
