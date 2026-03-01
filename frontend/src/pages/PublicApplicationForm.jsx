import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import {
    CheckCircle2, ArrowRight, User, Phone, Mail,
    BookOpen, GraduationCap, FileText, Send, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PublicApplicationForm = () => {
    const { programSlug } = useParams();
    const navigate = useNavigate();

    // Data states
    const [program, setProgram] = useState(null);
    const [subPrograms, setSubPrograms] = useState([]);
    const [courses, setCourses] = useState([]);
    const [customFields, setCustomFields] = useState([]);

    // UI State
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    // Form data
    const [formData, setFormData] = useState({
        first_name: '', last_name: '', email: '', mobile: '',
        gender: 'Male', dob: '', address: '',
        sub_program: '', course: '',
        dynamic_values: {}
    });

    useEffect(() => {
        fetchApplicationContext();
    }, [programSlug]);

    const fetchApplicationContext = async () => {
        setLoading(true);
        try {
            // 1. Fetch Hierarchy to find program by slug
            const hRes = await api.get('programs/hierarchy/');
            const prog = hRes.data.find(p => p.slug === programSlug || p.id.toString() === programSlug);

            if (!prog) throw new Error("Program not found");
            setProgram(prog);
            setSubPrograms(prog.sub_programs || []);

            // 2. Fetch Fields for this Program
            const fRes = await api.get(`forms/fields/?program=${prog.id}`);
            setCustomFields(fRes.data.sort((a, b) => a.order - b.order));
        } catch (err) {
            console.error("Link invalid", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSubProgramChange = (spId) => {
        const sp = subPrograms.find(s => s.id.toString() === spId);
        setCourses(sp?.courses || []);
        setFormData({ ...formData, sub_program: spId, course: '' });
    };

    const handleDynamicChange = (fieldId, value) => {
        setFormData({
            ...formData,
            dynamic_values: { ...formData.dynamic_values, [fieldId]: value }
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const payload = {
                ...formData,
                program_type: program.id,
                is_active: false // Critical: Set as inactive lead
            };
            await api.post('students/', payload);
            setSubmitted(true);
        } catch (err) {
            alert("Submission failed. Please check form data.");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
            <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Preparing Application...</p>
        </div>
    );

    if (submitted) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="bg-white p-12 rounded-[40px] shadow-2xl border border-slate-100 max-w-lg text-center"
            >
                <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-8">
                    <CheckCircle2 size={48} className="text-emerald-500" />
                </div>
                <h1 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Application Submitted!</h1>
                <p className="text-slate-500 font-medium leading-relaxed mb-8">
                    Thank you for applying to <b>{program?.name}</b>. Our admissions team has been notified and will contact you via mobile/email shortly.
                </p>
                <button
                    onClick={() => window.location.reload()}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black hover:bg-slate-800 transition shadow-xl"
                >
                    Apply for another course
                </button>
            </motion.div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
            {/* Header */}
            <header className="bg-white border-b border-slate-100 py-6 px-4 sticky top-0 z-10">
                <div className="max-w-3xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
                            <GraduationCap size={20} />
                        </div>
                        <h2 className="font-black text-xl tracking-tight">{program?.name}</h2>
                    </div>
                    <div className="flex gap-1">
                        {[1, 2, 3].map(i => (
                            <div key={i} className={`h-1.5 w-12 rounded-full transition-all ${step >= i ? 'bg-indigo-600' : 'bg-slate-100'}`} />
                        ))}
                    </div>
                </div>
            </header>

            <main className="max-w-3xl mx-auto py-12 px-4">
                <form onSubmit={handleSubmit} className="space-y-8">

                    {/* Step 1: Basic Info */}
                    {step === 1 && (
                        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                            <div className="mb-8">
                                <h1 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">Personal Details</h1>
                                <p className="text-slate-500 font-medium">Let's start with your basic identification</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">First Name</label>
                                    <div className="relative">
                                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                                        <input
                                            required
                                            className="w-full pl-12 pr-4 py-4 bg-white border border-slate-100 rounded-2xl focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 outline-none transition-all font-bold"
                                            value={formData.first_name}
                                            onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Last Name</label>
                                    <input
                                        required
                                        className="w-full px-4 py-4 bg-white border border-slate-100 rounded-2xl focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 outline-none transition-all font-bold"
                                        value={formData.last_name}
                                        onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Email ID</label>
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                                        <input
                                            type="email" required
                                            className="w-full pl-12 pr-4 py-4 bg-white border border-slate-100 rounded-2xl focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 outline-none transition-all font-bold"
                                            value={formData.email}
                                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Mobile Number</label>
                                    <div className="relative">
                                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                                        <input
                                            required
                                            className="w-full pl-12 pr-4 py-4 bg-white border border-slate-100 rounded-2xl focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 outline-none transition-all font-bold"
                                            value={formData.mobile}
                                            onChange={e => setFormData({ ...formData, mobile: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setStep(2)}
                                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg flex items-center justify-center gap-2 hover:bg-indigo-700 transition shadow-xl shadow-indigo-100"
                            >
                                Next Step <ArrowRight size={20} />
                            </button>
                        </motion.div>
                    )}

                    {/* Step 2: Course Selection */}
                    {step === 2 && (
                        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                            <div className="mb-8">
                                <h1 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">Select Course</h1>
                                <p className="text-slate-500 font-medium">Choose your preferred learning track</p>
                            </div>

                            <div className="space-y-6">
                                <div className="p-6 bg-white border border-slate-100 rounded-[32px] shadow-sm">
                                    <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">
                                        <BookOpen size={14} /> Category
                                    </label>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {subPrograms.map(sp => (
                                            <div
                                                key={sp.id}
                                                onClick={() => handleSubProgramChange(sp.id.toString())}
                                                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${formData.sub_program === sp.id.toString()
                                                        ? 'bg-indigo-50 border-indigo-500 scale-[1.02]'
                                                        : 'bg-white border-slate-50 hover:border-slate-200'
                                                    }`}
                                            >
                                                <p className="font-black text-sm">{sp.name}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <AnimatePresence>
                                    {courses.length > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                            className="p-6 bg-white border border-indigo-50 rounded-[32px] shadow-sm ring-4 ring-indigo-500/5"
                                        >
                                            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-4">
                                                <Sparkles size={14} /> Available Courses
                                            </label>
                                            <div className="grid grid-cols-1 gap-3">
                                                {courses.map(c => (
                                                    <div
                                                        key={c.id}
                                                        onClick={() => setFormData({ ...formData, course: c.id.toString() })}
                                                        className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex justify-between items-center ${formData.course === c.id.toString()
                                                                ? 'bg-indigo-600 border-transparent text-white shadow-lg'
                                                                : 'bg-white border-slate-50 hover:border-indigo-100 text-slate-700'
                                                            }`}
                                                    >
                                                        <span className="font-black">{c.name}</span>
                                                        {c.fee_amount > 0 && <span className="text-xs font-bold opacity-80">₹{c.fee_amount}</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <div className="flex gap-4">
                                <button type="button" onClick={() => setStep(1)} className="px-8 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black">Back</button>
                                <button
                                    type="button"
                                    disabled={!formData.course}
                                    onClick={() => setStep(3)}
                                    className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg disabled:opacity-50 transition shadow-xl shadow-indigo-100"
                                >
                                    Continue
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* Step 3: Custom Fields */}
                    {step === 3 && (
                        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                            <div className="mb-8">
                                <h1 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">Additional Info</h1>
                                <p className="text-slate-500 font-medium">Just a few more things we need to know</p>
                            </div>

                            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-8">
                                {customFields.length === 0 ? (
                                    <div className="text-center py-8">
                                        <p className="font-bold text-slate-400 uppercase tracking-widest text-xs mb-2">Almost Done!</p>
                                        <p className="text-slate-500 font-medium">No additional information required for this program.</p>
                                    </div>
                                ) : (
                                    customFields.map(field => (
                                        <div key={field.id} className="space-y-3">
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                                                {field.label} {field.is_required && <span className="text-red-500">*</span>}
                                            </label>

                                            {field.field_type === 'dropdown' ? (
                                                <select
                                                    required={field.is_required}
                                                    className="w-full p-4 rounded-2xl bg-slate-50 border border-transparent focus:bg-white focus:border-indigo-500 outline-none font-bold transition-all appearance-none"
                                                    onChange={e => handleDynamicChange(field.id, e.target.value)}
                                                >
                                                    <option value="">Select Option</option>
                                                    {(Array.isArray(field.options) ? field.options : field.options?.split(',') || []).map(opt => (
                                                        <option key={opt} value={opt}>{opt.trim()}</option>
                                                    ))}
                                                </select>
                                            ) : field.field_type === 'file' ? (
                                                <div className="relative group">
                                                    <input
                                                        type="file"
                                                        className="w-full p-4 rounded-2xl border-2 border-dashed border-slate-200 group-hover:border-indigo-300 transition-all cursor-pointer text-sm font-medium"
                                                        onChange={e => handleDynamicChange(field.id, e.target.files[0])}
                                                    />
                                                </div>
                                            ) : (
                                                <input
                                                    type={field.field_type}
                                                    required={field.is_required}
                                                    className="w-full p-4 rounded-2xl bg-slate-50 border border-transparent focus:bg-white focus:border-indigo-500 outline-none font-bold transition-all"
                                                    placeholder={`Enter ${field.label}`}
                                                    onChange={e => handleDynamicChange(field.id, e.target.value)}
                                                />
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="flex gap-4">
                                <button type="button" onClick={() => setStep(2)} className="px-8 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black">Back</button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition shadow-xl shadow-indigo-100"
                                >
                                    {submitting ? 'Submitting...' : <>Final Submission <Send size={20} /></>}
                                </button>
                            </div>
                        </motion.div>
                    )}

                </form>
            </main>

            <footer className="py-12 border-t border-slate-100 text-center">
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Secure Application Portal &bull; Natya CRM</p>
            </footer>
        </div>
    );
};

export default PublicApplicationForm;
