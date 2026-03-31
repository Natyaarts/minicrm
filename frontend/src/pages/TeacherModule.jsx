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
    const [showSyllabusForm, setShowSyllabusForm] = useState(false);
    const [editingPart, setEditingPart] = useState(null);
    const [syllabusData, setSyllabusData] = useState({
        title: '', weight_percentage: 5, semester: '', module: '', subject: ''
    });
    
    // Session Logging State
    const [sessionData, setSessionData] = useState({
        date: new Date().toISOString().split('T')[0],
        teacher_summary: '',
        completed_parts: [],
        attendance: {}
    });

    // Exam State
    const [showExamForm, setShowExamForm] = useState(false);
    const [examData, setExamData] = useState({
        title: '', date: new Date().toISOString().split('T')[0], total_marks: 100, passing_marks: 40, description: '', exam_type: 'UNIT'
    });
    const [selectedExam, setSelectedExam] = useState(null);
    const [examViewMode, setExamViewMode] = useState('MARKS'); // 'MARKS' or 'QUESTIONS'
    const [marksData, setMarksData] = useState({}); // student_id -> {marks, remarks, is_present}
    const [newQuestion, setNewQuestion] = useState({ text: '', question_type: 'MCQ', marks: 1, options: [{option_text: '', is_correct: false}] });
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
        try {
            if (editingPart) {
                await api.patch(`syllabus-parts/${editingPart.id}/`, syllabusData);
            } else {
                await api.post('syllabus-parts/', { ...syllabusData, batch: selectedBatch.id });
            }
            fetchBatchDetails(selectedBatch.id);
            setShowSyllabusForm(false);
            setEditingPart(null);
            setSyllabusData({ title: '', weight_percentage: 5, semester: '', module: '', subject: '' });
            setToast({ type: 'success', message: editingPart ? 'Syllabus Updated!' : 'Syllabus Part Added!' });
            setTimeout(() => setToast(null), 3000);
        } catch (err) {
            console.error(err);
            alert("Failed to save syllabus part");
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
                    <div className="flex justify-between items-center mb-6">
                        <button
                            onClick={() => setSelectedBatch(null)}
                            className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold text-sm transition-colors"
                        >
                            <ChevronLeft size={16} /> Back to Batches
                        </button>
                        <button
                            onClick={() => window.print()}
                            className="flex items-center gap-2 px-4 py-2 bg-white text-slate-600 rounded-xl font-bold text-sm border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
                        >
                            <Clock size={16} /> Download Progress Report
                        </button>
                    </div>
                    
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
                                    { id: 'EXAMS', label: 'Exams & Results', icon: Layers },
                                    { id: 'HISTORY', label: 'Class History', icon: Calendar },
                                    { id: 'RESOURCES', label: 'Resources', icon: BookOpen },
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
                                        <div className="flex justify-between items-center mb-4">
                                            <h3 className="text-lg font-black text-slate-800">Enrolled Students</h3>
                                            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                                Attendance Performance
                                            </div>
                                        </div>
                                        {batchStudents.length === 0 ? (
                                            <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-slate-200">
                                                <p className="text-sm text-slate-400 font-medium italic">No students assigned to this batch yet.</p>
                                            </div>
                                        ) : (
                                            batchStudents.map(student => {
                                                const totalSessions = classSessions.length;
                                                const sessionsPresent = classSessions.filter(s => s.attendances?.some(a => a.student_id === student.id && a.is_present)).length;
                                                const percentage = totalSessions > 0 ? (sessionsPresent / totalSessions) * 100 : 100;
                                                const isLowAttendance = totalSessions > 3 && percentage < 75;

                                                return (
                                                    <div key={student.id} className={`bg-white rounded-2xl p-4 border shadow-sm flex justify-between items-center transition-all ${isLowAttendance ? 'border-rose-200 bg-rose-50/20' : 'border-slate-100'}`}>
                                                        <div className="flex items-center gap-4">
                                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${isLowAttendance ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                                                {student.first_name[0]}
                                                            </div>
                                                            <div>
                                                                <h4 className="font-bold text-slate-800">{student.first_name} {student.last_name}</h4>
                                                                <p className="text-xs font-mono text-slate-500 line-clamp-1">{student.crm_student_id}</p>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="flex flex-col items-end">
                                                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${isLowAttendance ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                                                    {percentage.toFixed(0)}% Attendance
                                                                </span>
                                                                <p className="text-xs text-slate-400 font-medium mt-1">{student.mobile || '-'}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}

                                {activeTab === 'SYLLABUS' && (
                                    <div className="space-y-6 animate-fadeIn">
                                        <div className="flex justify-between items-center mb-6">
                                            <h3 className="text-xl font-black text-slate-800">Syllabus Parts</h3>
                                            <button 
                                                onClick={() => {
                                                    setEditingPart(null);
                                                    setSyllabusData({ title: '', weight_percentage: 5, semester: '', module: '', subject: '' });
                                                    setShowSyllabusForm(!showSyllabusForm);
                                                }}
                                                className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-sm hover:bg-indigo-100 transition-colors"
                                            >
                                                <Plus size={16} /> {showSyllabusForm ? 'Cancel' : 'Add Part'}
                                            </button>
                                        </div>

                                        {showSyllabusForm && (
                                            <form onSubmit={handleAddSyllabus} className="bg-slate-50 p-6 rounded-3xl border border-slate-200 mb-6 space-y-4 animate-fadeIn shadow-inner">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                                                    <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest">{editingPart ? 'Editing Topic' : 'Add New Curriculum Topic'}</h4>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                    <div className="space-y-1">
                                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Semester</label>
                                                        <input 
                                                            type="text" placeholder="e.g., Semester 1"
                                                            value={syllabusData.semester} onChange={e => setSyllabusData({...syllabusData, semester: e.target.value})}
                                                            className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:border-indigo-500 outline-none font-medium"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Module</label>
                                                        <input 
                                                            type="text" placeholder="e.g., Module A"
                                                            value={syllabusData.module} onChange={e => setSyllabusData({...syllabusData, module: e.target.value})}
                                                            className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:border-indigo-500 outline-none font-medium"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Subject</label>
                                                        <input 
                                                            type="text" placeholder="e.g., Carnatic Theory"
                                                            value={syllabusData.subject} onChange={e => setSyllabusData({...syllabusData, subject: e.target.value})}
                                                            className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:border-indigo-500 outline-none font-medium"
                                                        />
                                                    </div>
                                                </div>
                                                
                                                <div className="flex flex-col md:flex-row gap-4 items-end">
                                                    <div className="flex-1 space-y-1">
                                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Topic/Part Title</label>
                                                        <input 
                                                            type="text" required placeholder="e.g., Introduction to Adavus"
                                                            value={syllabusData.title} onChange={e => setSyllabusData({...syllabusData, title: e.target.value})}
                                                            className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:border-indigo-500 outline-none font-medium"
                                                        />
                                                    </div>
                                                    <div className="w-full md:w-32 space-y-1">
                                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Weight %</label>
                                                        <input 
                                                            type="number" required min="1" max="100" step="0.1" placeholder="5.0"
                                                            value={syllabusData.weight_percentage} onChange={e => setSyllabusData({...syllabusData, weight_percentage: e.target.value})}
                                                            className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:border-indigo-500 outline-none font-medium"
                                                        />
                                                    </div>
                                                    <button 
                                                        type="submit" 
                                                        className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-100"
                                                    >
                                                        {editingPart ? 'Save Changes' : 'Create Topic'}
                                                    </button>
                                                </div>
                                            </form>
                                        )}

                                        <div className="space-y-6">
                                            {syllabusParts.length === 0 ? (
                                                <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-slate-200">
                                                    <p className="text-sm text-slate-400 font-medium italic">No parts defined. Start adding Semester-wise modules!</p>
                                                </div>
                                            ) : (
                                                // Group syllabus by Semester
                                                Object.entries(
                                                    syllabusParts.reduce((acc, part) => {
                                                        const group = part.semester || 'Ungrouped';
                                                        if (!acc[group]) acc[group] = [];
                                                        acc[group].push(part);
                                                        return acc;
                                                    }, {})
                                                ).map(([semester, parts]) => (
                                                    <div key={semester} className="space-y-3 bg-white/50 p-4 rounded-3xl border border-slate-100">
                                                        <h4 className="px-4 text-xs font-black text-indigo-600 uppercase tracking-widest mb-1">{semester}</h4>
                                                        {parts.map(part => (
                                                            <div key={part.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex justify-between items-center group/part">
                                                                <div className="flex items-center gap-4">
                                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${part.is_completed ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                                                        {part.is_completed ? <CheckCircle2 size={16} /> : <BookOpen size={14} />}
                                                                    </div>
                                                                    <div>
                                                                        <div className="flex gap-2 mb-0.5">
                                                                            {part.module && <span className="text-[10px] font-black bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-md uppercase tracking-tighter">{part.module}</span>}
                                                                            {part.subject && <span className="text-[10px] font-black bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-md uppercase tracking-tighter">{part.subject}</span>}
                                                                        </div>
                                                                        <h4 className={`font-bold ${part.is_completed ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{part.title}</h4>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-1.5">
                                                                    <p className="text-xs font-black text-indigo-600 bg-slate-50 px-2 py-1 rounded-lg">
                                                                        {part.weight_percentage}%
                                                                    </p>
                                                                    <button 
                                                                        onClick={() => {
                                                                            setEditingPart(part);
                                                                            setSyllabusData({
                                                                                title: part.title,
                                                                                weight_percentage: part.weight_percentage,
                                                                                semester: part.semester || '',
                                                                                module: part.module || '',
                                                                                subject: part.subject || ''
                                                                            });
                                                                            setShowSyllabusForm(true);
                                                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                                                        }}
                                                                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors opacity-0 group-hover/part:opacity-100"
                                                                        title="Edit Topic"
                                                                    >
                                                                        <Layers size={14} />
                                                                    </button>
                                                                    <button 
                                                                        onClick={async () => {
                                                                            if (window.confirm("Permanently delete this syllabus part?")) {
                                                                                await api.delete(`syllabus-parts/${part.id}/`);
                                                                                fetchBatchDetails(selectedBatch.id);
                                                                                fetchBatches();
                                                                            }
                                                                        }}
                                                                        className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover/part:opacity-100"
                                                                        title="Delete Topic"
                                                                    >
                                                                        <X size={14} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
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
                                            <div className="flex justify-between items-center">
                                                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><Users size={18}/> Mark Attendance</h3>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const allPresent = {};
                                                        batchStudents.forEach(s => allPresent[s.id] = true);
                                                        setSessionData(prev => ({...prev, attendance: allPresent}));
                                                    }}
                                                    className="text-[10px] font-black text-indigo-600 uppercase bg-indigo-50 px-2 py-1 rounded-md hover:bg-indigo-100 transition-colors"
                                                >
                                                    Mark All Present
                                                </button>
                                            </div>
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
                                                                    <p className="font-bold text-slate-800 text-sm truncate max-w-[120px]">{student.first_name} {student.last_name}</p>
                                                                    <p className="font-mono text-xs text-slate-500 line-clamp-1">{student.crm_student_id}</p>
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
                                                                <div className="flex gap-1.5 mb-1">
                                                                    {part.semester && <span className="text-[8px] font-black bg-indigo-50 text-indigo-500 px-1 py-0.2 rounded uppercase tracking-tighter">{part.semester}</span>}
                                                                    {part.module && <span className="text-[8px] font-black bg-purple-50 text-purple-500 px-1 py-0.2 rounded uppercase tracking-tighter">{part.module}</span>}
                                                                    {part.subject && <span className="text-[8px] font-black bg-amber-50 text-amber-500 px-1 py-0.2 rounded uppercase tracking-tighter">{part.subject}</span>}
                                                                </div>
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

                                {activeTab === 'EXAMS' && (
                                    <div className="space-y-6 animate-fadeIn">
                                        {!selectedExam ? (
                                            <>
                                                <div className="flex justify-between items-center mb-6">
                                                    <h3 className="text-xl font-black text-slate-800 flex items-center gap-2"><Layers size={20}/> Batch Exams</h3>
                                                    <button 
                                                        onClick={() => setShowExamForm(!showExamForm)}
                                                        className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition shadow-lg shadow-indigo-100 flex items-center gap-2"
                                                    >
                                                        {showExamForm ? <X size={16}/> : <Plus size={16}/>}
                                                        {showExamForm ? 'Cancel' : 'Create New Exam'}
                                                    </button>
                                                </div>

                                                {showExamForm && (
                                                    <form onSubmit={async (e) => {
                                                        e.preventDefault();
                                                        await api.post('exams/', { ...examData, batch: selectedBatch.id });
                                                        setShowExamForm(false);
                                                        fetchBatchDetails(selectedBatch.id);
                                                    }} className="bg-slate-50 p-6 rounded-3xl border border-slate-200 mb-8 space-y-4 animate-fadeIn shadow-inner">
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-slate-500 uppercase">Exam Title</label>
                                                                <input type="text" required placeholder="e.g., Monthly Test March" value={examData.title} onChange={e=>setExamData({...examData, title: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none"/>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-slate-500 uppercase">Exam Date</label>
                                                                <input type="date" required value={examData.date} onChange={e=>setExamData({...examData, date: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none"/>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-slate-500 uppercase">Total Marks</label>
                                                                <input type="number" required value={examData.total_marks} onChange={e=>setExamData({...examData, total_marks: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none"/>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-slate-500 uppercase">Passing Marks</label>
                                                                <input type="number" required value={examData.passing_marks} onChange={e=>setExamData({...examData, passing_marks: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none"/>
                                                                <div className="space-y-1 md:col-span-2">
                                                                <label className="text-xs font-bold text-slate-500 uppercase">Exam Type</label>
                                                                <select value={examData.exam_type} onChange={e=>setExamData({...examData, exam_type: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none font-bold text-slate-700">
                                                                    <option value="UNIT">Unit Test</option>
                                                                    <option value="PERIODIC">Periodic Assessment</option>
                                                                    <option value="MIDTERM">Midterm Examination</option>
                                                                    <option value="FINAL">Final Examination</option>
                                                                    <option value="ASSIGNMENT">Assignment/Project</option>
                                                                    <option value="VIVA">Viva Voce</option>
                                                                </select>
                                                            </div>
                                                        </div>
                                                        </div>
                                                        <button type="submit" className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition">Create Exam</button>
                                                    </form>
                                                )}

                                                <div className="grid grid-cols-1 gap-4">
                                                    {(!selectedBatch.exams || selectedBatch.exams.length === 0) ? (
                                                        <div className="py-16 text-center bg-white rounded-3xl border border-dashed border-slate-200">
                                                            <Layers size={48} className="mx-auto text-slate-100 mb-4" />
                                                            <p className="text-slate-400 font-medium font-mono text-xs uppercase tracking-widest">No exams created for this batch</p>
                                                        </div>
                                                    ) : (
                                                        selectedBatch.exams.map(exam => (
                                                            <div key={exam.id} onClick={() => {
                                                                setSelectedExam(exam);
                                                                const initialMarks = {};
                                                                batchStudents.forEach(s => {
                                                                    const existing = exam.results?.find(r => r.student === s.id);
                                                                    initialMarks[s.id] = existing ? { marks: existing.marks_obtained, remarks: existing.remarks, is_present: existing.is_present } : { marks: 0, remarks: '', is_present: true };
                                                                });
                                                                setMarksData(initialMarks);
                                                            }} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer group flex justify-between items-center">
                                                                <div className="flex items-center gap-4">
                                                                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black">
                                                                        {exam.pass_percentage}%
                                                                    </div>
                                                                    <div>
                                                                        <h4 className="font-black text-slate-800 text-lg">{exam.title}</h4>
                                                                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{new Date(exam.date).toLocaleDateString()} • {exam.total_marks} Marks</p>
                                                                    </div>
                                                                </div>
                                                                <button className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-black uppercase hover:bg-indigo-600 hover:text-white transition-colors">Enter Marks</button>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="space-y-6 animate-fadeIn">
                                                <div className="flex justify-between items-center mb-6">
                                                    <div className="flex items-center gap-4">
                                                        <button onClick={() => setSelectedExam(null)} className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold text-sm">
                                                            <ChevronLeft size={16}/> Back
                                                        </button>
                                                        <div className="flex bg-slate-100 p-1 rounded-xl">
                                                            <button onClick={() => setExamViewMode('MARKS')} className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${examViewMode === 'MARKS' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Marks Entry</button>
                                                            <button onClick={() => setExamViewMode('QUESTIONS')} className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${examViewMode === 'QUESTIONS' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Questions</button>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-4">
                                                        {examViewMode === 'MARKS' && (
                                                            <button 
                                                                onClick={async () => {
                                                                    try {
                                                                        const newStatus = !selectedExam.is_published;
                                                                        await api.patch(`exams/${selectedExam.id}/`, { is_published: newStatus });
                                                                        setToast({ type: 'success', message: newStatus ? 'Results Published to Students!' : 'Results Hidden from Students' });
                                                                        setTimeout(() => setToast(null), 3000);
                                                                        fetchBatchDetails(selectedBatch.id);
                                                                        setSelectedExam(prev => ({...prev, is_published: newStatus}));
                                                                    } catch (err) { alert("Failed to toggle status"); }
                                                                }}
                                                                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${selectedExam.is_published ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                                                            >
                                                                {selectedExam.is_published ? 'Unpublish Results' : 'Publish Results'}
                                                            </button>
                                                        )}
                                                        <div className="text-right">
                                                            <h4 className="font-black text-slate-800">{selectedExam.title}</h4>
                                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{selectedExam.total_marks} Total Marks • Passing: {selectedExam.passing_marks}</p>
                                                        </div>
                                                    </div>
                                                </div>

                                                {examViewMode === 'MARKS' ? (
                                                    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden animate-fadeIn">
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-left">
                                                                <thead className="bg-slate-50 border-b border-slate-100">
                                                                    <tr>
                                                                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Student</th>
                                                                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Status</th>
                                                                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Marks</th>
                                                                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Remarks</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-100">
                                                                    {batchStudents.map(student => (
                                                                        <tr key={student.id}>
                                                                            <td className="px-6 py-4">
                                                                                <p className="font-bold text-slate-800">{student.first_name} {student.last_name}</p>
                                                                                <p className="text-[10px] font-mono text-slate-400">{student.crm_student_id}</p>
                                                                            </td>
                                                                            <td className="px-6 py-4">
                                                                                <button onClick={() => setMarksData({...marksData, [student.id]: {...marksData[student.id], is_present: !marksData[student.id].is_present}})} className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter ${marksData[student.id]?.is_present ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                                                                                    {marksData[student.id]?.is_present ? 'Present' : 'Absent'}
                                                                                </button>
                                                                            </td>
                                                                            <td className="px-6 py-4">
                                                                                <input disabled={!marksData[student.id]?.is_present} type="number" value={marksData[student.id]?.marks} onChange={e=>setMarksData({...marksData, [student.id]: {...marksData[student.id], marks: e.target.value}})} className="w-20 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-bold text-center disabled:opacity-30"/>
                                                                            </td>
                                                                            <td className="px-6 py-4">
                                                                                <input disabled={!marksData[student.id]?.is_present} type="text" placeholder="..." value={marksData[student.id]?.remarks} onChange={e=>setMarksData({...marksData, [student.id]: {...marksData[student.id], remarks: e.target.value}})} className="w-full min-w-[150px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-sm disabled:opacity-30"/>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                        <div className="p-6">
                                                            <button onClick={async () => {
                                                                try {
                                                                    await api.post('exam-results/bulk_submit/', { exam_id: selectedExam.id, results: marksData });
                                                                    setToast({ type: 'success', message: 'Exam Marks Saved!' });
                                                                    setTimeout(() => setToast(null), 3000);
                                                                    setSelectedExam(null);
                                                                    fetchBatchDetails(selectedBatch.id);
                                                                } catch (err) { alert("Failed to save marks"); }
                                                            }} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-lg shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition">Save Results</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-6 animate-fadeIn">
                                                        <div className="bg-slate-50 p-6 rounded-3xl border border-dashed border-slate-200">
                                                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Add New Question</h4>
                                                            <div className="space-y-4">
                                                                <textarea value={newQuestion.text} onChange={e=>setNewQuestion({...newQuestion, text:e.target.value})} placeholder="Type your question here..." className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none min-h-[100px] text-sm font-medium"/>
                                                                
                                                                <div className="grid grid-cols-2 gap-4">
                                                                    <div>
                                                                        <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Type</label>
                                                                        <select value={newQuestion.question_type} onChange={e=>setNewQuestion({...newQuestion, question_type:e.target.value})} className="w-full p-2 bg-white border border-slate-200 rounded-xl outline-none text-xs font-bold">
                                                                            <option value="MCQ">Multiple Choice</option>
                                                                            <option value="THEORY">Theory / Long Answer</option>
                                                                            <option value="TRUEFALSE">True / False</option>
                                                                        </select>
                                                                    </div>
                                                                    <div>
                                                                        <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Marks</label>
                                                                        <input type="number" value={newQuestion.marks} onChange={e=>setNewQuestion({...newQuestion, marks:e.target.value})} className="w-full p-2 bg-white border border-slate-200 rounded-xl outline-none text-xs font-bold"/>
                                                                    </div>
                                                                </div>

                                                                {newQuestion.question_type === 'MCQ' && (
                                                                    <div className="space-y-3">
                                                                        <label className="text-[10px] font-black text-slate-400 uppercase block">Options</label>
                                                                        {newQuestion.options.map((opt, oidx) => (
                                                                            <div key={oidx} className="flex gap-2">
                                                                                <input type="text" value={opt.option_text} onChange={e => {
                                                                                    const updatedOpts = [...newQuestion.options];
                                                                                    updatedOpts[oidx].option_text = e.target.value;
                                                                                    setNewQuestion({...newQuestion, options: updatedOpts});
                                                                                }} placeholder={`Option ${oidx+1}`} className="flex-1 p-2 bg-white border border-slate-200 rounded-xl outline-none text-xs"/>
                                                                                <button onClick={() => {
                                                                                    const updatedOpts = newQuestion.options.map((o, i) => ({...o, is_correct: i === oidx}));
                                                                                    setNewQuestion({...newQuestion, options: updatedOpts});
                                                                                }} className={`px-2 rounded-xl text-[8px] font-black tracking-widest uppercase transition-all ${opt.is_correct ? 'bg-emerald-500 text-white shadow-sm' : 'bg-slate-100 text-slate-400'}`}>
                                                                                    {opt.is_correct ? 'Correct' : 'Incorrect'}
                                                                                </button>
                                                                            </div>
                                                                        ))}
                                                                        <button onClick={() => setNewQuestion({...newQuestion, options: [...newQuestion.options, {option_text: '', is_correct: false}]})} className="text-[10px] font-black text-indigo-600 hover:underline">+ Add Option</button>
                                                                    </div>
                                                                )}

                                                                <button onClick={async () => {
                                                                    try {
                                                                        await api.post('questions/', { ...newQuestion, exam: selectedExam.id });
                                                                        setNewQuestion({ text: '', question_type: 'MCQ', marks: 1, options: [{option_text: '', is_correct: false}] });
                                                                        fetchBatchDetails(selectedBatch.id);
                                                                        const updatedBatch = await api.get(`batches/${selectedBatch.id}/`);
                                                                        const upExam = updatedBatch.data.exams.find(e => e.id === selectedExam.id);
                                                                        setSelectedExam(upExam);
                                                                        setToast({ type: 'success', message: 'Question Added!' });
                                                                        setTimeout(() => setToast(null), 3000);
                                                                    } catch (err) { alert("Failed to add question"); }
                                                                }} className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition">Save Question</button>
                                                            </div>
                                                        </div>

                                                        <div className="space-y-4">
                                                            {selectedExam.questions?.map((q, idx) => (
                                                                <div key={q.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative group overflow-hidden">
                                                                    <div className="flex justify-between items-start mb-3">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="w-6 h-6 bg-slate-900 text-white text-[10px] font-black rounded-lg flex items-center justify-center">Q{idx+1}</span>
                                                                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[8px] font-black uppercase rounded tracking-widest">{q.question_type}</span>
                                                                        </div>
                                                                        <span className="text-xs font-black text-slate-400">{q.marks} Marks</span>
                                                                    </div>
                                                                    <p className="text-sm font-bold text-slate-700 leading-relaxed">{q.text}</p>
                                                                    {q.question_type === 'MCQ' && (
                                                                        <div className="mt-4 grid grid-cols-2 gap-2">
                                                                            {q.options?.map(o => (
                                                                                <div key={o.id} className={`p-2 rounded-xl text-[10px] font-bold border transition-all ${o.is_correct ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-slate-50 border-slate-50 text-slate-500'}`}>
                                                                                    {o.option_text}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    <button 
                                                                        onClick={async () => {
                                                                            if (window.confirm("Delete question?")) {
                                                                                await api.delete(`questions/${q.id}/`);
                                                                                fetchBatchDetails(selectedBatch.id);
                                                                                const updatedBatch = await api.get(`batches/${selectedBatch.id}/`);
                                                                                const upExam = updatedBatch.data.exams.find(e => e.id === selectedExam.id);
                                                                                setSelectedExam(upExam);
                                                                            }
                                                                        }}
                                                                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-2 text-rose-300 hover:text-rose-600 transition-all"
                                                                    >
                                                                        <X size={14} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'RESOURCES' && (
                                    <div className="space-y-6 animate-fadeIn">
                                        <div className="flex justify-between items-center">
                                            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><BookOpen size={18}/> Batch Materials</h3>
                                            <label className="cursor-pointer px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-lg shadow-indigo-100">
                                                <Plus size={16} /> Upload Resources
                                                <input 
                                                    type="file" className="hidden" 
                                                    onChange={async (e) => {
                                                        const file = e.target.files[0];
                                                        if (!file) return;
                                                        const formData = new FormData();
                                                        formData.append('batch', selectedBatch.id);
                                                        formData.append('title', file.name.split('.')[0]);
                                                        formData.append('file', file);
                                                        try {
                                                            await api.post('batch-resources/', formData, {
                                                                headers: { 'Content-Type': 'multipart/form-data' }
                                                            });
                                                            const updatedBatchRes = await api.get(`batches/${selectedBatch.id}/`);
                                                            setSelectedBatch(updatedBatchRes.data);
                                                            setToast({ type: 'success', message: 'Resource Uploaded Successfully!' });
                                                            setTimeout(() => setToast(null), 3000);
                                                        } catch (err) { alert("Failed to upload"); }
                                                    }}
                                                />
                                            </label>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {(!selectedBatch.resources || selectedBatch.resources.length === 0) ? (
                                                <div className="col-span-full py-16 text-center bg-white rounded-3xl border border-dashed border-slate-200">
                                                    <BookOpen size={32} className="mx-auto text-slate-200 mb-2" />
                                                    <p className="text-slate-400 font-medium italic">No shared materials for this batch yet.</p>
                                                </div>
                                            ) : (
                                                selectedBatch.resources.map(res => (
                                                    <div key={res.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center justify-between group">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                                                                <BookOpen size={20} />
                                                            </div>
                                                            <div className="max-w-[150px]">
                                                                <p className="text-sm font-bold text-slate-800 truncate">{res.title}</p>
                                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                                                    {new Date(res.uploaded_at).toLocaleDateString()}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <a href={res.file} target="_blank" rel="noreferrer" className="p-2 bg-slate-50 text-slate-400 rounded-lg hover:bg-slate-100 hover:text-indigo-600 transition-colors">
                                                                <Search size={14} />
                                                            </a>
                                                            <button 
                                                                onClick={async () => {
                                                                    if (window.confirm("Delete this material?")) {
                                                                        await api.delete(`batch-resources/${res.id}/`);
                                                                        const updatedBatchRes = await api.get(`batches/${selectedBatch.id}/`);
                                                                        setSelectedBatch(updatedBatchRes.data);
                                                                    }
                                                                }}
                                                                className="opacity-0 group-hover:opacity-100 p-2 text-rose-300 hover:text-rose-600 transition-all"
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
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
