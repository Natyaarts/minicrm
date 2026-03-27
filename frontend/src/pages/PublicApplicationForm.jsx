import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import {
    CheckCircle2, ArrowRight, User, Phone, Mail,
    BookOpen, GraduationCap, FileText, Send, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { compressImage } from '../utils/fileCompressor';

const PublicApplicationForm = () => {
    const { programSlug } = useParams();
    const navigate = useNavigate();

    // Data states
    const [program, setProgram] = useState(null);
    const [subPrograms, setSubPrograms] = useState([]);
    const [courses, setCourses] = useState([]);
    const [activeFields, setActiveFields] = useState([]);
    const [formGroup, setFormGroup] = useState('INITIAL');

    // UI State
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    
    // Academic Phase States
    const [lookupMobile, setLookupMobile] = useState('');
    const [foundStudent, setFoundStudent] = useState(null);
    const [lookupError, setLookupError] = useState('');

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
    }, [programSlug, window.location.search]);

    const updatePaymentConfig = (spId, cId, currentFields, currentProg, currentSps) => {
        // Use provided values or fallback to current state
        const targetProg = currentProg || program;
        const targetSps = currentSps || subPrograms;
        const targetSpId = spId || formData.sub_program;
        const targetCId = cId || formData.course;
        const fieldsToCheck = currentFields || activeFields;

        let finalAmt = 0;
        let finalReq = false;

        // 1. BASE LEVEL: Program
        if (targetProg?.require_payment) {
            finalReq = true;
            finalAmt = Number(targetProg.registration_fee) || 0;
        }

        // 2. CATEGORY LEVEL: Sub-program
        if (targetSpId) {
            const sp = targetSps.find(s => s.id.toString() === targetSpId.toString());
            if (sp) {
                if (sp.require_payment && Number(sp.registration_fee) > 0) {
                    finalReq = true;
                    finalAmt = Number(sp.registration_fee);
                }

                // 3. COURSE LEVEL: Course
                if (targetCId) {
                    const c = (sp.courses || []).find(course => course.id.toString() === targetCId.toString());
                    if (c && c.require_payment) {
                        finalReq = true;
                        // Use course specific fee if available
                        const cFee = Number(c.registration_fee) > 0 ? c.registration_fee : c.fee_amount;
                        if (Number(cFee) > 0) {
                            finalAmt = Number(cFee);
                        }
                    }
                }
            }
        }

        // 4. OVERRIDE: If payment widget is manually added, force requirement
        if (fieldsToCheck.some(f => f.field_type === 'payment')) {
            finalReq = true;
        }

        console.log("Payment Calculated:", { finalAmt, finalReq, targetSpId, targetCId }); // Debug helper
        
        setPaymentConfig({
            required: finalReq,
            amount: finalAmt
        });
    };

    const processFields = (fieldData, spId, cId) => {
        const sorted = fieldData.sort((a, b) => a.order - b.order);
        setActiveFields(sorted);
        updatePaymentConfig(spId, cId, sorted);
    };

    const fetchApplicationContext = async () => {
        setLoading(true);
        try {
            // 1. Fetch Hierarchy to find program by slug
            const hRes = await api.get('programs/hierarchy/');
            const prog = hRes.data.find(p => p.slug === programSlug || p.id.toString() === programSlug);

            if (!prog) throw new Error("Program not found");
            setProgram(prog);
            const currentSubPrograms = prog.sub_programs || [];
            setSubPrograms(currentSubPrograms);

            // Pre-fill from URL params
            const params = new URLSearchParams(window.location.search);
            const spId = params.get('sp');
            const cId = params.get('c');
            const sid = params.get('sid');
            const requestedGroup = params.get('group') || 'INITIAL';
            const isAcademic = requestedGroup === 'ACADEMIC';
            setFormGroup(requestedGroup);

            // Fetch Student Profile if SID is present (Skip Lookup)
            let studentInfo = null;
            if (sid && isAcademic) {
                try {
                    const res = await api.get(`students/public_lookup/?sid=${sid}`);
                    studentInfo = res.data;
                    setFoundStudent(studentInfo);
                } catch (err) {
                    console.error("Direct student fetch failed", err);
                }
            }

            // Sync Category/Course context
            const finalSpId = studentInfo?.sub_program_id || spId;
            const finalCId = studentInfo?.course_id || cId;

            let currentFieldParams = `program=${prog.id}&group=${requestedGroup}`;
            if (finalSpId) currentFieldParams += `&sub_program=${finalSpId}`;
            if (finalCId) currentFieldParams += `&course=${finalCId}`;

            let newFormData = {
                first_name: studentInfo?.first_name || '', 
                last_name: studentInfo?.last_name || '', 
                email: studentInfo?.email || '', 
                mobile: studentInfo?.mobile || '',
                gender: studentInfo?.gender || 'Male', dob: studentInfo?.dob || '', 
                address: studentInfo?.address || '',
                sub_program: finalSpId || '', course: finalCId || '',
                dynamic_values: {}
            };

            if (finalSpId) {
                const sp = currentSubPrograms.find(s => s.id.toString() === finalSpId.toString());
                if (sp) {
                    setCourses(sp.courses || []);
                }
            }

            setFormData(prev => ({ ...prev, ...newFormData }));

            // 2. Fetch Fields based on group & Sync Payment
            const fRes = await api.get(`forms/fields/?${currentFieldParams}&field_group=${requestedGroup}`);
            const fieldData = Array.isArray(fRes.data) ? fRes.data : (fRes.data?.results || []);
            const sortedFields = fieldData.sort((a, b) => a.order - b.order);
            setActiveFields(sortedFields);
            
            // Manual sync for initial load - Fee only applies to INITIAL applications
            if (requestedGroup === 'INITIAL') {
                updatePaymentConfig(spId, cId, sortedFields, prog, currentSubPrograms);
            } else {
                setPaymentConfig({ required: false, amount: 0 });
            }
        } catch (err) {
            console.error("Link invalid", err);
        } finally {
            setLoading(false);
        }
    };

    const handleStudentLookup = async () => {
        if (!lookupMobile) return;
        setSubmitting(true);
        setLookupError('');
        try {
            // Find student by mobile number
            const res = await api.get(`students/public_lookup/?mobile=${lookupMobile}`);
            setFoundStudent(res.data);
            
            // Auto-populate form from found record
            setFormData(prev => ({
                ...prev,
                first_name: res.data.first_name,
                last_name: res.data.last_name,
                mobile: res.data.mobile,
                email: res.data.email || ''
            }));
        } catch (err) {
            console.error("Lookup failed", err);
            setLookupError(err.response?.data?.error || "Profile not found. Please check your mobile number.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubProgramChange = async (spId) => {
        const sp = subPrograms.find(s => s.id.toString() === spId);
        const currentCourses = sp?.courses || [];
        setCourses(currentCourses);
        setFormData(prev => ({ ...prev, sub_program: spId, course: '' }));

        if (spId) {
            try {
                const res = await api.get(`forms/fields/?sub_program=${spId}&field_group=${formGroup}`);
                processFields(Array.isArray(res.data) ? res.data : (res.data?.results || []), spId, '');
            } catch (err) {
                console.error("Failed to fetch sub-program fields", err);
            }
        } else {
            fetchApplicationContext();
        }
    };

    const loadRazorpay = () => {
        return new Promise((resolve) => {
            if (window.Razorpay) {
                resolve(true);
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.body.appendChild(script);
        });
    };

    const handlePayment = async () => {
        // Validation: Try to find name/mobile in dynamic values if not set directly
        let finalName = formData.first_name;
        let finalMobile = formData.mobile;

        if (!finalName || !finalMobile) {
            activeFields.forEach(f => {
                const label = f.label.toLowerCase();
                const val = formData.dynamic_values[f.id];
                if (!val) return;

                if ((label.includes('name')) && !finalName) finalName = val;
                if ((label.includes('mobile') || label.includes('phone') || label.includes('contact')) && !finalMobile) finalMobile = val;
            });
        }

        if (!finalName || !finalMobile) {
            alert("Please fill in your basic details (Name & Mobile) before payment.");
            return;
        }

        setSubmitting(true);
        try {
            const isLoaded = await loadRazorpay();
            if (!isLoaded) {
                alert("Razorpay SDK failed to load. Please check your internet connection.");
                setSubmitting(false);
                return;
            }

            // Create Order on Backend
            const orderRes = await api.post('integrations/razorpay/order/', {
                amount: paymentConfig.amount
            });

            const { order_id, key_id, amount, currency } = orderRes.data;

            const options = {
                key: key_id,
                amount: amount,
                currency: currency,
                name: "Natya Arts",
                description: `Registration for ${program?.name || 'Program'}`,
                order_id: order_id,
                handler: function (response) {
                    // Payment Success
                    setTransactionId(response.razorpay_payment_id);
                    setPaymentDone(true);
                    setSubmitting(false);
                },
                prefill: {
                    name: `${formData.first_name} ${formData.last_name}`,
                    email: formData.email,
                    contact: formData.mobile
                },
                theme: {
                    color: "#6366f1"
                },
                modal: {
                    ondismiss: function() {
                        setSubmitting(false);
                    }
                }
            };

            const rzp = new window.Razorpay(options);
            rzp.open();
        } catch (err) {
            console.error("Payment initiation failed", err);
            const errorMsg = err.response?.data?.error || "Failed to start payment gateway. Please ensure keys are correctly set in Admin > Integrations.";
            alert(errorMsg);
            setSubmitting(false);
        }
    };

    const handleCourseChange = async (cId) => {
        const currentSpId = formData.sub_program; 
        setFormData(prev => ({ ...prev, course: cId }));
        
        if (cId) {
            try {
                const res = await api.get(`forms/fields/?course=${cId}&field_group=${formGroup}`);
                const fields = Array.isArray(res.data) ? res.data : (res.data?.results || []);
                setActiveFields(fields.sort((a, b) => a.order - b.order));
                if (formGroup === 'INITIAL') {
                    updatePaymentConfig(currentSpId, cId, fields);
                }
            } catch (err) {
                console.error("Failed to fetch course fields", err);
                if (formGroup === 'INITIAL') {
                    updatePaymentConfig(currentSpId, cId);
                }
            }
        } else {
            if (currentSpId) handleSubProgramChange(currentSpId);
        }
    };

    const handleDynamicChange = async (fieldId, value) => {
        const field = activeFields.find(f => f.id === fieldId);
        
        // Handle File Uploads (Compress & Size Check)
        if (value instanceof File) {
            let processedFile = value;
            if (value.type.startsWith('image/')) {
                // Keep file name and extension consistent but compress/resize
                processedFile = await compressImage(value, { maxWidth: 1024, maxHeight: 1024, quality: 0.7 });
            }

            if (processedFile.size > 10 * 1024 * 1024) {
                alert(`File "${processedFile.name}" is too large even after compression. Max limit is 10MB.`);
                return;
            }
            value = processedFile;
        }

        let updates = { dynamic_values: { ...formData.dynamic_values, [fieldId]: value } };

        if (field) {
            const label = field.label.toLowerCase();
            if (label.includes('name')) updates.first_name = value;
            if (label.includes('mobile') || label.includes('phone') || label.includes('contact')) updates.mobile = value;
            if (label.includes('email')) updates.email = value;
        }

        setFormData(prev => ({ ...prev, ...updates }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const formDataObj = new FormData();
            
            if (!foundStudent) {
                // Creation Mode (INITIAL)
                const allFields = activeFields;
                const dynamicValues = formData.dynamic_values;

                allFields.forEach(f => {
                    const label = f.label.toLowerCase();
                    const val = dynamicValues[f.id];
                    if (!val) return;

                    if ((label.includes('name') || label === 'name') && !formDataObj.has('first_name')) {
                        const parts = String(val).trim().split(' ');
                        formDataObj.append('first_name', parts[0]);
                        formDataObj.append('last_name', parts.slice(1).join(' ') || 'Student');
                    }
                    if (label.includes('email') && !formDataObj.has('email')) {
                        formDataObj.append('email', val);
                    }
                    if ((label.includes('mobile') || label.includes('phone') || label.includes('mob') || label.includes('contact')) && !formDataObj.has('mobile')) {
                        formDataObj.append('mobile', val);
                    }
                });
                
                formDataObj.append('program_type', program.id);
                if (!formDataObj.has('first_name')) {
                    formDataObj.append('first_name', 'Student');
                    formDataObj.append('last_name', 'Applicant');
                }
                formDataObj.append('is_active', 'true');
                if (formData.sub_program) formDataObj.append('sub_program', formData.sub_program);
                if (formData.course) formDataObj.append('course', formData.course);
            }

            // Dynamic Values Logic (Both Modes)
            const dynamicTextValue = {};
            Object.entries(formData.dynamic_values).forEach(([fieldId, value]) => {
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

            if (foundStudent) {
                // Update Mode (ACADEMIC)
                await api.patch(`students/${foundStudent.id}/`, formDataObj, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            } else {
                // Creation Mode
                await api.post('students/', formDataObj, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            }
            setSubmitted(true);
        } catch (err) {
            console.error("Submission error:", err);
            const errorMsg = err.response?.data ? JSON.stringify(err.response.data) : "Submission failed. Please try again.";
            alert(errorMsg);
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
                <h1 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">
                    {formGroup === 'ACADEMIC' ? 'Details Updated!' : 'Application Submitted!'}
                </h1>
                <p className="text-slate-500 font-medium leading-relaxed mb-8">
                    {formGroup === 'ACADEMIC' 
                        ? `Thank you, ${foundStudent?.name}. Your academic records have been successfully submitted for coordination.`
                        : `Thank you for applying to ${program?.name}. Our admissions team will contact you shortly.`
                    }
                </p>
                <button
                    onClick={() => window.location.reload()}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black hover:bg-slate-800 transition shadow-xl"
                >
                    {formGroup === 'ACADEMIC' ? 'Submit another section' : 'Apply for another course'}
                </button>
            </motion.div>
        </div>
    );

    // Initial lookup for Academic forms
    if (formGroup === 'ACADEMIC' && !foundStudent) {
        return (
            <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
                <header className="bg-white border-b border-slate-100 py-6 px-4 sticky top-0 z-10">
                    <div className="max-w-3xl mx-auto flex items-center justify-between">
                        <div className="flex items-center gap-5">
                            <div className="h-20 w-auto flex items-center justify-center">
                                <img src="/logo.png" alt="Logo" className="h-full w-auto object-contain" />
                            </div>
                            <h2 className="font-black text-xl tracking-tight leading-tight">{program?.name}<br/><span className="text-xs text-indigo-500 uppercase tracking-widest">Section 2: Academic Details</span></h2>
                        </div>
                    </div>
                </header>

                <main className="flex-1 flex items-center justify-center p-6">
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                        className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-2xl max-w-md w-full text-center"
                    >
                        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                            <User className="text-indigo-500" size={28} />
                        </div>
                        <h1 className="text-2xl font-black text-slate-900 mb-2">Find Your Account</h1>
                        <p className="text-slate-500 text-sm font-medium mb-8">Enter the mobile number you used during initial application to continue.</p>
                        
                        <div className="space-y-4">
                            <div className="text-left">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Mobile Number</label>
                                <input
                                    type="tel"
                                    className={`w-full p-4 mt-2 rounded-2xl bg-slate-50 border-2 outline-none font-bold transition-all ${lookupError ? 'border-red-200 focus:border-red-500' : 'border-slate-100 focus:border-indigo-500'}`}
                                    placeholder="e.g. 9876543210"
                                    value={lookupMobile}
                                    onChange={(e) => setLookupMobile(e.target.value)}
                                />
                                {lookupError && <p className="text-red-500 text-[10px] font-black uppercase mt-2 ml-1">{lookupError}</p>}
                            </div>
                            <button
                                onClick={handleStudentLookup}
                                disabled={submitting || !lookupMobile}
                                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 transition shadow-lg disabled:opacity-50"
                            >
                                {submitting ? 'Searching...' : 'Find My Profile'}
                            </button>
                        </div>
                    </motion.div>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
            {/* Header */}
            <header className="bg-white border-b border-slate-100 py-6 px-4 sticky top-0 z-10">
                <div className="max-w-3xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-5">
                        <div className="h-20 w-auto flex items-center justify-center">
                            <img src="/logo.png" alt="Logo" className="h-full w-auto object-contain" />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="font-black text-xl tracking-tight leading-tight">{program?.name}</h2>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">
                                Form Section: {formGroup === 'ACADEMIC' ? 'ACADEMIC DETAILS' : 'INITIAL APPLICATION'}
                            </p>
                        </div>
                    </div>
                    {foundStudent && (
                        <div className="flex items-center gap-3 px-4 py-2 bg-emerald-50 rounded-xl border border-emerald-100">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">{foundStudent.name}</span>
                        </div>
                    )}
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
                            <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">
                                {formGroup === 'ACADEMIC' ? 'Academic Details' : 'Application Form'}
                            </h1>
                            <p className="text-slate-500 font-medium">
                                {formGroup === 'ACADEMIC' 
                                    ? 'Please provide your post-admission academic details and documents.' 
                                    : 'Please provide the details required for your enrollment.'
                                }
                            </p>
                        </div>

                        {/* Category & Course Selection - Hidden if profile found since they are already enrolled */}
                        {!foundStudent && (
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
                        )}

                        {activeFields.length === 0 ? (
                            <div className="text-center py-20 bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-100">
                                <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-slate-200">
                                    <Sparkles className="text-indigo-400" />
                                </div>
                                <h3 className="text-lg font-black text-slate-800">No Fields Required</h3>
                                <p className="text-slate-400 max-w-xs mx-auto mt-2 text-sm">There are no additional fields to fill in this section.</p>
                                <button type="submit" className="mt-8 px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black">Skip & Complete</button>
                            </div>
                        ) : (
                            activeFields.map(field => (
                                <div key={field.id} className="space-y-3">
                                    <label className="block text-xs font-black uppercase tracking-widest text-slate-400 ml-1">
                                        {field.label} {field.is_required && !['name', 'mobile', 'phone', 'contact'].some(k => field.label.toLowerCase().includes(k)) && <span className="text-red-500">*</span>}
                                    </label>

                                    {field.field_type === 'dropdown' ? (
                                        <select
                                            required={field.is_required && !['name', 'mobile', 'phone', 'contact'].some(k => field.label.toLowerCase().includes(k))}
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
                                                required={field.is_required && !['name', 'mobile', 'phone', 'contact'].some(k => field.label.toLowerCase().includes(k))}
                                                className="w-full p-5 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 group-hover:border-indigo-300 transition-all cursor-pointer text-sm font-medium"
                                                onChange={e => handleDynamicChange(field.id, e.target.files[0])}
                                            />
                                        </div>
                                    ) : (
                                        <input
                                            type={field.field_type}
                                            required={field.is_required && !['name', 'mobile', 'phone', 'contact'].some(k => field.label.toLowerCase().includes(k))}
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
                                                onClick={handlePayment}
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
                                        {submitting ? "Processing..." : <>{formGroup === 'ACADEMIC' ? 'Submit Academic Profile' : 'Final Submission'} <Send size={24} /></>}
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
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Secure Application Portal &bull; Natya ERP</p>
            </footer>
        </div>
    );
};

export default PublicApplicationForm;
