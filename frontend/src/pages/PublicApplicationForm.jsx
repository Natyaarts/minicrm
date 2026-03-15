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
    const [activeFields, setActiveFields] = useState([]);

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

    const [paymentConfig, setPaymentConfig] = useState({ required: false, amount: 0 });
    const [paymentDone, setPaymentDone] = useState(false);
    const [transactionId, setTransactionId] = useState('');

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

            // Pre-fill from URL params
            const params = new URLSearchParams(window.location.search);
            const spId = params.get('sp');
            const cId = params.get('c');

            let currentFieldParams = `program=${prog.id}`;
            let newFormData = {
                first_name: '', last_name: '', email: '', mobile: '',
                gender: 'Male', dob: '', address: '',
                sub_program: '', course: '',
                dynamic_values: {}
            };
            let currentCourses = [];

            if (spId) {
                const sp = (prog.sub_programs || []).find(s => s.id.toString() === spId);
                if (sp) {
                    newFormData.sub_program = spId;
                    currentCourses = sp.courses || [];
                    setCourses(currentCourses);
                    currentFieldParams = `sub_program=${spId}`;

                    if (cId) {
                        const course = currentCourses.find(c => c.id.toString() === cId);
                        if (course) {
                            newFormData.course = cId;
                            currentFieldParams = `course=${cId}`;
                        }
                    }
                }
            }

            setFormData(prev => ({ ...prev, ...newFormData }));

            // 2. Determine Payment Requirement
            let payReq = prog.require_payment;
            let payAmt = prog.registration_fee;

            if (spId) {
                const sp = (prog.sub_programs || []).find(s => s.id.toString() === spId);
                if (sp && sp.require_payment) {
                    payReq = true;
                    payAmt = sp.registration_fee;
                }
                if (cId) {
                    const c = (sp?.courses || []).find(course => course.id.toString() === cId);
                    if (c && c.require_payment) {
                        payReq = true;
                        payAmt = c.registration_fee;
                    }
                }
            }
            setPaymentConfig({ required: payReq, amount: payAmt });

            // 3. Fetch Initial Fields (Based on deepest selected level)
            const fRes = await api.get(`forms/fields/?${currentFieldParams}&field_group=INITIAL`);
            const fieldData = Array.isArray(fRes.data) ? fRes.data : (fRes.data?.results || []);
            setActiveFields(fieldData.sort((a, b) => a.order - b.order));
        } catch (err) {
            console.error("Link invalid", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSubProgramChange = async (spId) => {
        const sp = subPrograms.find(s => s.id.toString() === spId);
        setCourses(sp?.courses || []);
        setFormData({ ...formData, sub_program: spId, course: '' });

        // Update Payment Config
        if (sp) {
            setPaymentConfig({ 
                required: sp.require_payment || program.require_payment, 
                amount: sp.require_payment ? sp.registration_fee : program.registration_fee 
            });
        }

        if (spId) {
            try {
                const res = await api.get(`forms/fields/?sub_program=${spId}&field_group=INITIAL`);
                const fieldData = Array.isArray(res.data) ? res.data : (res.data?.results || []);
                setActiveFields(fieldData.sort((a, b) => a.order - b.order));
            } catch (err) {
                console.error("Failed to fetch sub-program fields", err);
            }
        } else {
            // Revert to program fields
            fetchApplicationContext();
        }
    };

    const handleCourseChange = async (cId) => {
        setFormData({ ...formData, course: cId });
        const c = courses.find(course => course.id.toString() === cId);
        if (c) {
            setPaymentConfig({ 
                required: c.require_payment || paymentConfig.required,
                amount: c.require_payment ? c.registration_fee : paymentConfig.amount
            });
        }

        if (cId) {
            try {
                const res = await api.get(`forms/fields/?course=${cId}&field_group=INITIAL`);
                const fieldData = Array.isArray(res.data) ? res.data : (res.data?.results || []);
                setActiveFields(fieldData.sort((a, b) => a.order - b.order));
            } catch (err) {
                console.error("Failed to fetch course fields", err);
            }
        } else {
            // Revert to sub-program fields if course deselected
            if (formData.sub_program) handleSubProgramChange(formData.sub_program);
        }
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
            const formDataObj = new FormData();
            const allFields = activeFields;
            const dynamicValues = formData.dynamic_values;

            // --- SMART MAPPING LOGIC ---
            // We search for fields you created manually and map them to standard system fields
            allFields.forEach(f => {
                const label = f.label.toLowerCase();
                const val = dynamicValues[f.id];
                if (!val) return;

                // Map Name
                if ((label.includes('name') || label === 'name') && !formDataObj.has('first_name')) {
                    const parts = String(val).trim().split(' ');
                    formDataObj.append('first_name', parts[0]);
                    formDataObj.append('last_name', parts.slice(1).join(' ') || 'Student');
                }
                // Map Email
                if (label.includes('email') && !formDataObj.has('email')) {
                    formDataObj.append('email', val);
                }
                // Map Mobile (Improved keywords: mob, phone, contact, tel)
                if ((label.includes('mobile') || label.includes('phone') || label.includes('mob') || label.includes('contact')) && !formDataObj.has('mobile')) {
                    formDataObj.append('mobile', val);
                }
            });

            // Standard Defaults
            formDataObj.append('program_type', program.id);
            formDataObj.append('is_active', 'true');
            if (formData.sub_program) formDataObj.append('sub_program', formData.sub_program);
            if (formData.course) formDataObj.append('course', formData.course);

            // Dynamic Values Logic
            const dynamicTextValue = {};
            Object.entries(dynamicValues).forEach(([fieldId, value]) => {
                if (value instanceof File) {
                    formDataObj.append(`dynamic_file_${fieldId}`, value);
                } else {
                    dynamicTextValue[fieldId] = value;
                }
            });

            formDataObj.append('dynamic_values', JSON.stringify(dynamicTextValue));

            if (paymentDone && transactionId) {
                formDataObj.append('transaction_details', JSON.stringify({
                    transaction_id: transactionId,
                    amount: paymentConfig.amount
                }));
            }

            await api.post('students/', formDataObj, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setSubmitted(true);
        } catch (err) {
            console.error("Submission error:", err);
            alert("Submission failed. Please check if you have added Name and Mobile fields.");
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
                        {[1, 2].map(i => (
                            <div key={i} className={`h-1.5 w-12 rounded-full transition-all ${step >= i ? 'bg-indigo-600' : 'bg-slate-100'}`} />
                        ))}
                    </div>
                </div>
            </header>

            <main className="max-w-3xl mx-auto py-12 px-4">
                <form onSubmit={handleSubmit} className="space-y-8">

                    <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-2xl space-y-8 animate-fadeIn">
                        <div className="mb-4">
                            <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Application Form</h1>
                            <p className="text-slate-500 font-medium">Please provide the details required for your enrollment.</p>
                        </div>

                        {/* Category & Course Selection */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-slate-50 rounded-[30px] border border-slate-100">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Select Category</label>
                                <select
                                    className="w-full p-4 rounded-2xl bg-white border border-slate-200 outline-none font-bold text-sm shadow-sm"
                                    value={formData.sub_program}
                                    onChange={(e) => handleSubProgramChange(e.target.value)}
                                    required
                                >
                                    <option value="">Select Category</option>
                                    {subPrograms.map(sp => (
                                        <option key={sp.id} value={sp.id}>{sp.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Select Course</label>
                                <select
                                    className="w-full p-4 rounded-2xl bg-white border border-slate-200 outline-none font-bold text-sm shadow-sm"
                                    value={formData.course}
                                    onChange={(e) => handleCourseChange(e.target.value)}
                                    required
                                    disabled={!formData.sub_program}
                                >
                                    <option value="">Select Course</option>
                                    {courses.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {activeFields.length === 0 ? (
                            <div className="text-center py-20 bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-100">
                                <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-slate-200">
                                    <Sparkles className="text-indigo-400" />
                                </div>
                                <h3 className="text-lg font-black text-slate-800">No Fields Created Yet</h3>
                                <p className="text-slate-400 max-w-xs mx-auto mt-2 text-sm">Use the form builder in your dashboard to add fields to this brand.</p>
                            </div>
                        ) : (
                            activeFields.map(field => (
                                <div key={field.id} className="space-y-3">
                                    <label className="block text-xs font-black uppercase tracking-widest text-slate-400 ml-1">
                                        {field.label} {field.is_required && <span className="text-red-500">*</span>}
                                    </label>

                                    {field.field_type === 'dropdown' ? (
                                        <select
                                            required={field.is_required}
                                            className="w-full p-5 rounded-2xl bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 outline-none font-bold transition-all appearance-none cursor-pointer"
                                            onChange={e => handleDynamicChange(field.id, e.target.value)}
                                        >
                                            <option value="">Select Option</option>
                                            {(Array.isArray(field.options) ? field.options : field.options?.split(',') || []).map(opt => (
                                                <option key={opt} value={opt}>{opt.trim()}</option>
                                            ))}
                                        </select>
                                    ) : field.field_type === 'file' ? (
                                        <div className="relative">
                                            <input
                                                type="file"
                                                required={field.is_required}
                                                className="w-full p-5 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 group-hover:border-indigo-300 transition-all cursor-pointer text-sm font-medium"
                                                onChange={e => handleDynamicChange(field.id, e.target.files[0])}
                                            />
                                        </div>
                                    ) : (
                                        <input
                                            type={field.field_type}
                                            required={field.is_required}
                                            className="w-full p-5 rounded-2xl bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 outline-none font-bold transition-all"
                                            placeholder={`Your ${field.label}`}
                                            onChange={e => handleDynamicChange(field.id, e.target.value)}
                                        />
                                    )}
                                </div>
                            ))
                        )}

                        {activeFields.length > 0 && (
                            <div className="pt-8 border-t border-slate-100">
                                {paymentConfig.required && !paymentDone ? (
                                    <div className="p-8 bg-slate-900 rounded-[40px] text-white shadow-2xl relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -mr-32 -mt-32" />
                                        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Registration Fee Required</p>
                                                <h3 className="text-4xl font-black tracking-tight">₹{paymentConfig.amount}</h3>
                                            </div>
                                            <button 
                                                type="button"
                                                onClick={() => {
                                                    setSubmitting(true);
                                                    // Simulation: In real app, this triggers Razorpay
                                                    setTimeout(() => {
                                                        const fakeId = "pay_" + Math.random().toString(36).substr(2, 9).toUpperCase();
                                                        setTransactionId(fakeId);
                                                        setSubmitting(false);
                                                        setPaymentDone(true);
                                                    }, 1500);
                                                }}
                                                disabled={submitting}
                                                className="w-full md:w-auto px-10 py-5 bg-indigo-500 text-white rounded-[24px] font-black text-xl hover:bg-indigo-600 transition shadow-xl flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                                            >
                                                {submitting ? "Processing..." : <>Pay & Proceed <Sparkles size={20} /></>}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        type="submit"
                                        disabled={submitting}
                                        className="w-full py-6 bg-indigo-600 text-white rounded-[32px] font-black text-xl shadow-2xl shadow-indigo-200 hover:bg-indigo-700 hover:translate-y-[-2px] active:translate-y-0 transition-all flex items-center justify-center gap-4 group disabled:opacity-50"
                                    >
                                        {submitting ? "Processing..." : <>Final Submission <Send size={24} /></>}
                                    </button>
                                )}
                                {paymentDone && (
                                    <div className="mt-4 flex items-center gap-2 justify-center text-emerald-500 font-bold text-sm animate-bounce">
                                        <CheckCircle2 size={16} /> Payment Verified - You can now submit your application.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                </form>
            </main>

            <footer className="py-12 border-t border-slate-100 text-center">
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Secure Application Portal &bull; Natya CRM</p>
            </footer>
        </div>
    );
};

export default PublicApplicationForm;
