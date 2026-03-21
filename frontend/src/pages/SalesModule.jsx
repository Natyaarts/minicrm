import React, { useState, useEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import api from '../api/axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, Search, FileText, User, Trash2, Edit2, RotateCcw, Trash, X } from 'lucide-react';
import { copyToClipboard } from '../utils/clipboard';

const SalesModule = () => {
    // URL Params
    const [searchParams, setSearchParams] = useSearchParams();
    const location = useLocation();
    const isPublicView = location.pathname === '/apply';

    // Stage Management
    const [programs, setPrograms] = useState([]);
    const [subPrograms, setSubPrograms] = useState([]);
    const [courses, setCourses] = useState([]);
    const [dynamicFields, setDynamicFields] = useState([]);

    const [selectedProgram, setSelectedProgram] = useState('');
    const [selectedSubProgram, setSelectedSubProgram] = useState('');
    const [selectedCourse, setSelectedCourse] = useState('');

    // Form Data
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        father_husband_name: '',
        mother_name: '',
        email: '',
        mobile: '',
        dob: '',
        gender: '',
        marital_status: '',
        perm_address: '',
        perm_city: '',
        perm_district: '',
        perm_state: '',
        perm_pincode: '',
        corr_address: '',
        corr_city: '',
        corr_district: '',
        corr_state: '',
        corr_pincode: '',
    });

    const [dynamicValues, setDynamicValues] = useState({});
    const [files, setFiles] = useState({});
    const [transactionData, setTransactionData] = useState({ amount: '', transaction_id: '', transaction_link: '' });

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);

    // Auth State for Bulk Upload Visibility
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [activeTab, setActiveTab] = useState('single');
    const [bulkFile, setBulkFile] = useState(null);
    const [bulkResponse, setBulkResponse] = useState(null);

    // Student List Data
    const [studentList, setStudentList] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [toast, setToast] = useState(null);
    const [selectedStudentProfile, setSelectedStudentProfile] = useState(null);
    const [isTrashView, setIsTrashView] = useState(false);
    const [editingStudent, setEditingStudent] = useState(null);
    const [editFormData, setEditFormData] = useState({});
    const [editSubPrograms, setEditSubPrograms] = useState([]);
    const [editCourses, setEditCourses] = useState([]);
    const [studentPage, setStudentPage] = useState(1);
    const [studentPagination, setStudentPagination] = useState({ count: 0, next: null, previous: null });

    // Helper: Load Program Details
    const loadProgramDetails = async (progId) => {
        // We need to find the program object to know its type (Academy vs Natya)
        // Since programs state might not be populated if this is called immediately on mount, 
        // we might need to rely on the fetched data or wait.
        // However, this is mainly called from handleProgramChange where programs exist.
        // For the useEffect case, we handle it inside the effect.

        const prog = programs.find(p => p.id === parseInt(progId));
        if (prog) {
            try {
                const res = await api.get(`sub-programs/?program=${progId}`);
                setSubPrograms(res.data);

                // Fetch fields for this program context
                fetchDynamicFields('program', progId);
            } catch (err) {
                console.error(err);
            }
        }
    };

    // Initial Fetch & URL Param handling
    useEffect(() => {
        const token = localStorage.getItem('token');
        setIsAuthenticated(!!token);

        const fetchProgramsAndInit = async () => {
            try {
                const res = await api.get('programs/');
                setPrograms(res.data);

                // Check URL Param (Support both Slug and ID for backward compatibility)
                const urlProg = searchParams.get('program') || searchParams.get('p');
                const urlSubProg = searchParams.get('sp');
                const urlCourse = searchParams.get('c');

                if (urlProg) {
                    const progExists = res.data.find(p => p.slug === urlProg || p.id === parseInt(urlProg));
                    if (progExists) {
                        setSelectedProgram(progExists.id.toString());

                        // Valid program found, load its specific sub-programs
                        const subRes = await api.get(`sub-programs/?program=${progExists.id}`);
                        setSubPrograms(subRes.data);

                        let fieldsParam = `program=${progExists.id}`;
                        
                        if (urlSubProg) {
                            setSelectedSubProgram(urlSubProg);
                            fieldsParam = `sub_program=${urlSubProg}`;
                            
                            // Fetch courses for this sub-program
                            const courseRes = await api.get(`courses/?sub_program=${urlSubProg}`);
                            setCourses(courseRes.data);

                            if (urlCourse) {
                                setSelectedCourse(urlCourse);
                                fieldsParam = `course=${urlCourse}`;
                            }
                        }

                        const fieldsRes = await api.get(`forms/fields/?${fieldsParam}&field_group=INITIAL`);
                        const fieldData = Array.isArray(fieldsRes.data) ? fieldsRes.data : (fieldsRes.data?.results || []);
                        setDynamicFields(fieldData.sort((a, b) => a.order - b.order));
                    }
                }
            } catch (err) {
                console.error("Error fetching programs", err);
            }
        };
        fetchProgramsAndInit();
    }, []);

    const fetchStudents = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                is_active: (!isTrashView).toString(),
                page: studentPage.toString(),
                search: searchTerm
            });
            
            if (selectedProgram) params.append('program', selectedProgram);
            if (selectedSubProgram) params.append('sub_program', selectedSubProgram);
            if (selectedCourse) params.append('course', selectedCourse);

            const res = await api.get(`students/?${params.toString()}`);
            const data = res.data;
            if (data.results) {
                setStudentList(data.results);
                setStudentPagination({
                    count: data.count,
                    next: data.next,
                    previous: data.previous
                });
            } else {
                setStudentList(Array.isArray(data) ? data : []);
                setStudentPagination({ count: data.length, next: null, previous: null });
            }
        } catch (err) {
            console.error("Failed to fetch students", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const token = localStorage.getItem('token');
        setIsAuthenticated(!!token);
    }, []);

    useEffect(() => {
        if (isAuthenticated) {
            const timer = setTimeout(() => {
                fetchStudents();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [activeTab, isAuthenticated, isTrashView, studentPage, searchTerm, selectedProgram, selectedSubProgram, selectedCourse]);

    // Reset pagination on mode change
    useEffect(() => {
        setStudentPage(1);
    }, [isTrashView, searchTerm]);


    // Handle Program Change UI
    const handleProgramChange = (e) => {
        const progId = e.target.value;
        setSelectedProgram(progId);
        setSelectedSubProgram('');
        setSelectedCourse('');
        setSubPrograms([]);
        setCourses([]);
        setDynamicFields([]);
        setDynamicValues({});

        // Update URL to be helpful
        setSearchParams({ program: progId });

        loadProgramDetails(progId);
    };

    // Handle Copy Link
    const handleCopyLink = async () => {
        const prog = programs.find(p => p.id === parseInt(selectedProgram));
        const progSlug = prog?.slug || selectedProgram;
        let url = `${window.location.origin}/apply/${progSlug}`;

        const params = new URLSearchParams();
        if (selectedSubProgram) params.append('sp', selectedSubProgram);
        if (selectedCourse) params.append('c', selectedCourse);
        
        const qStr = params.toString();
        if (qStr) url += `?${qStr}`;

        const success = await copyToClipboard(url);
        if (success) {
            setToast({ type: 'success', message: 'Professional Share Link Copied!' });
            setTimeout(() => setToast(null), 3000);
        }
    };

    // Handle SubProgram Change
    const handleSubProgramChange = async (e) => {
        const subId = e.target.value;
        setSelectedSubProgram(subId);
        setSelectedCourse('');
        setCourses([]);
        setDynamicFields([]);

        // Update URL
        const newParams = new URLSearchParams(searchParams);
        newParams.set('sp', subId);
        newParams.delete('c');
        setSearchParams(newParams);

        if (subId) {
            try {
                const res = await api.get(`courses/?sub_program=${subId}`);
                setCourses(res.data);
                fetchDynamicFields('sub_program', subId);
            } catch (err) {
                console.error(err);
            }
        } else {
            // Revert to program fields
            fetchDynamicFields('program', selectedProgram);
        }
    };

    const handleCourseChange = async (e) => {
        const courseId = e.target.value;
        setSelectedCourse(courseId);
        setDynamicFields([]);

        // Update URL
        const newParams = new URLSearchParams(searchParams);
        if (courseId) {
            newParams.set('c', courseId);
        } else {
            newParams.delete('c');
        }
        setSearchParams(newParams);

        if (courseId) {
            fetchDynamicFields('course', courseId);
        } else if (selectedSubProgram) {
            fetchDynamicFields('sub_program', selectedSubProgram);
        } else {
            fetchDynamicFields('program', selectedProgram);
        }
    };

    const fetchDynamicFields = async (param, id) => {
        try {
            const res = await api.get(`forms/fields/?${param}=${id}&field_group=INITIAL`);
            const data = Array.isArray(res.data) ? res.data : (res.data?.results || []);
            const sorted = data.sort((a, b) => a.order - b.order);
            setDynamicFields(sorted);
        } catch (err) {
            console.error(err);
        }
    };

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleDynamicChange = (e, fieldId) => {
        setDynamicValues({ ...dynamicValues, [fieldId]: e.target.value });
    };

    const handleDynamicFileChange = (e, fieldId) => {
        setFiles(prev => ({ ...prev, [fieldId]: e.target.files[0] }));
    };

    const handleTxnChange = (e) => {
        setTransactionData({ ...transactionData, [e.target.name]: e.target.value });
    };

    const handleBulkFileChange = (e) => {
        setBulkFile(e.target.files[0]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        const data = new FormData();
        data.append('program_type', selectedProgram);
        if (selectedSubProgram) data.append('sub_program', selectedSubProgram);
        if (selectedCourse) data.append('course', selectedCourse);

        // Map recognized dynamic fields to the core Student requirements
        const coreFieldsMap = {
            'first name': 'first_name',
            'full name': 'first_name',
            'name': 'first_name',
            'last name': 'last_name',
            'mobile': 'mobile',
            'mob': 'mobile',
            'phone': 'mobile',
            'contact': 'mobile',
            'whatsapp': 'mobile',
            'email': 'email',
            'dob': 'dob',
            'date of birth': 'dob',
            'gender': 'gender',
            'marital status': 'marital_status'
        };

        let foundFirstName = '';
        let foundMobile = '';

        dynamicFields.forEach(field => {
            const val = dynamicValues[field.id];
            if (val) {
                const label = field.label.toLowerCase().trim();
                const coreKey = coreFieldsMap[label] || Object.keys(coreFieldsMap).find(k => label.includes(k));

                if (coreKey && coreFieldsMap[coreKey]) {
                    data.append(coreFieldsMap[coreKey], val);
                    if (coreFieldsMap[coreKey] === 'first_name') foundFirstName = val;
                    if (coreFieldsMap[coreKey] === 'mobile') foundMobile = val;
                } else if (coreFieldsMap[label]) {
                    data.append(coreFieldsMap[label], val);
                    if (coreFieldsMap[label] === 'first_name') foundFirstName = val;
                    if (coreFieldsMap[label] === 'mobile') foundMobile = val;
                }
            }
        });

        if (!foundFirstName) data.append('first_name', 'Student');
        if (!foundMobile) data.append('mobile', '0000000000');

        data.append('dynamic_values', JSON.stringify(dynamicValues));

        // Handle dynamic files
        Object.keys(files).forEach(fieldId => {
            // Check if the fieldId corresponds to a dynamic field that is a file type
            const field = dynamicFields.find(f => f.id === parseInt(fieldId) && f.field_type === 'file');
            if (field) {
                data.append(`dynamic_file_${fieldId}`, files[fieldId]);
            }
        });

        const txnId = dynamicValues[dynamicFields.find(f => f.label === 'Transaction ID')?.id];
        const txnAmt = dynamicValues[dynamicFields.find(f => f.label === 'Amount')?.id];

        if (txnId || txnAmt) {
            data.append('transaction_details', JSON.stringify({
                transaction_id: txnId || '',
                amount: txnAmt || ''
            }));
        }

        try {
            await api.post('students/', data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setMessage({ type: 'success', text: 'Application submitted successfully! Welcome to the family.' });
            
            // Re-fetch list and clear form
            fetchStudents();
            setFormData({
                first_name: '', last_name: '', father_husband_name: '', mother_name: '',
                email: '', mobile: '', dob: '', gender: '', marital_status: '',
                perm_address: '', perm_city: '', perm_district: '', perm_state: '', perm_pincode: '',
                corr_address: '', corr_city: '', corr_district: '', corr_state: '', corr_pincode: '',
            });
            setDynamicValues({});
            setFiles({});
            setTransactionData({ amount: '', transaction_id: '', transaction_link: '' });
        } catch (err) {
            console.error("Submission Error:", err);
            let errorMsg = 'Failed to submit application. Please check your inputs.';
            if (err.response?.data) {
                const data = err.response.data;
                if (typeof data === 'string') {
                    errorMsg = data;
                } else if (data.detail) {
                    errorMsg = data.detail;
                } else if (typeof data === 'object') {
                    // Extract first validation error: { "mobile": ["error message"] }
                    const firstError = Object.values(data).flat()[0];
                    if (firstError) errorMsg = firstError;
                }
            }
            setMessage({ type: 'error', text: errorMsg });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Move this application to trash?")) return;
        try {
            await api.delete(`students/${id}/`);
            setStudentList(prev => prev.filter(s => s.id !== id));
            setMessage({ type: 'success', text: 'Moved to trash' });
        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: 'Delete failed' });
        }
    };

    const handleRestore = async (id) => {
        try {
            await api.post(`students/${id}/restore/`);
            setStudentList(prev => prev.filter(s => s.id !== id));
            setMessage({ type: 'success', text: 'Application restored' });
        } catch (err) {
            console.error(err);
        }
    };

    const handlePermanentDelete = async (id) => {
        if (!window.confirm("Permanently delete this student? This cannot be undone.")) return;
        try {
            await api.post(`students/${id}/permanent_delete/`);
            setStudentList(prev => prev.filter(s => s.id !== id));
            setMessage({ type: 'success', text: 'Permanently deleted' });
        } catch (err) {
            console.error(err);
        }
    };

    const handleEditClick = async (student) => {
        setEditingStudent(student);

        // Map dynamic values list to a simple id-value object
        const dynVals = {};
        student.dynamic_values_list?.forEach(v => {
            if (v.field) dynVals[v.field] = v.value;
        });

        // Initialize form data with existing program/course IDs
        setEditFormData({
            first_name: student.first_name,
            last_name: student.last_name,
            mobile: student.mobile,
            email: student.email,
            program_type: student.program_type,
            sub_program: student.sub_program,
            course: student.course,
            dynamic_values: dynVals
        });

        // Pre-fetch cascaded options for the current student
        try {
            if (student.program_type) {
                const subRes = await api.get(`sub-programs/?program=${student.program_type}`);
                setEditSubPrograms(subRes.data);
            }
            if (student.sub_program) {
                const courseRes = await api.get(`courses/?sub_program=${student.sub_program}`);
                setEditCourses(courseRes.data);
            }
        } catch (err) {
            console.error("Failed to pre-fetch edit options", err);
        }
    };

    const handleEditProgramChange = async (e) => {
        const progId = e.target.value;
        setEditFormData(prev => ({ ...prev, program_type: progId, sub_program: '', course: '' }));
        setEditSubPrograms([]);
        setEditCourses([]);

        if (progId) {
            try {
                const res = await api.get(`sub-programs/?program=${progId}`);
                setEditSubPrograms(res.data);
            } catch (err) { console.error(err); }
        }
    };

    const handleEditSubProgramChange = async (e) => {
        const subId = e.target.value;
        setEditFormData(prev => ({ ...prev, sub_program: subId, course: '' }));
        setEditCourses([]);

        if (subId) {
            try {
                const res = await api.get(`courses/?sub_program=${subId}`);
                setEditCourses(res.data);
            } catch (err) { console.error(err); }
        }
    };

    const handleEditDynamicChange = (fieldId, value) => {
        setEditFormData(prev => ({
            ...prev,
            dynamic_values: {
                ...prev.dynamic_values,
                [fieldId]: value
            }
        }));
    };

    const handleUpdateStudent = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            // Send dynamic_values as JSON string if needed, or directly as object
            const payload = {
                ...editFormData,
                dynamic_values: JSON.stringify(editFormData.dynamic_values)
            };
            await api.patch(`students/${editingStudent.id}/`, payload);

            // Re-fetch list to get updated dynamic values
            const res = await api.get(`students/?is_active=${!isTrashView}`);
            setStudentList(res.data.results || res.data);

            setEditingStudent(null);
            setMessage({ type: 'success', text: 'Application updated' });
        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: 'Update failed' });
        } finally {
            setLoading(false);
        }
    };

    const handleBulkUpload = async (e) => {
        e.preventDefault();
        if (!bulkFile) return;

        const formData = new FormData();
        formData.append('file', bulkFile);
        setLoading(true);
        setBulkResponse(null);

        try {
            const res = await api.post('bulk/upload-students/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setBulkResponse(res.data);
            setMessage({ type: 'success', text: `Processed with ${res.data.success_count} successes.` });
        } catch (err) {
            console.error(err);
            const errorMsg = err.response?.data?.error || "Bulk upload failed";
            setMessage({ type: 'error', text: errorMsg });
        } finally {
            setLoading(false);
        }
    };

    // Simplified conditional rendering - basically if subprograms exist, show them.
    const hasSubPrograms = subPrograms.length > 0;
    const hasCourses = courses.length > 0;

    // Filtered Students
    const filteredStudents = studentList;

    // UI Components
    const InputField = ({ label, name, type = "text", required = false, value, onChange, className }) => (
        <div className={`flex flex-col ${className}`}>
            <label className="text-sm font-semibold text-slate-700 mb-2">{label} {required && <span className="text-red-500">*</span>}</label>
            <input
                type={type}
                name={name}
                value={value}
                onChange={onChange}
                required={required}
                className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all placeholder:text-slate-400 text-slate-700 shadow-sm"
            />
        </div>
    );

    const SelectField = ({ label, value, onChange, options, required = false, defaultText = "-- Select --" }) => (
        <div className="flex flex-col">
            <label className="text-sm font-semibold text-slate-700 mb-2">{label} {required && <span className="text-red-500">*</span>}</label>
            <div className="relative">
                <select
                    value={value}
                    onChange={onChange}
                    required={required}
                    className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all text-slate-700 shadow-sm appearance-none"
                >
                    <option value="">{defaultText}</option>
                    {options.map(opt => (
                        <option key={opt.id || opt} value={opt.id || opt}>{opt.name || opt}</option>
                    ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-500">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen w-full bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
            <div className="max-w-5xl mx-auto w-full">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-12"
                >
                    <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600 mb-4">
                        Student Enrollment
                    </h1>
                    <p className="text-lg text-slate-500 max-w-2xl mx-auto">
                        Join our community of learners and achievers. Please fill out the form below to begin your journey.
                    </p>
                </motion.div>

                {isAuthenticated && !isPublicView && (
                    <div className="flex mb-8 overflow-x-auto custom-scrollbar pb-2 max-w-full justify-start md:justify-center">
                        <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-200 flex flex-nowrap whitespace-nowrap min-w-min mx-auto">
                            <button
                                onClick={() => setActiveTab('single')}
                                className={`px-4 sm:px-6 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'single' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Single Application
                            </button>
                            <button
                                onClick={() => setActiveTab('bulk')}
                                className={`px-4 sm:px-6 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'bulk' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Bulk Upload
                            </button>
                            <button
                                onClick={() => setActiveTab('list')}
                                className={`px-4 sm:px-6 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'list' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                View Applications
                            </button>
                        </div>
                    </div>
                )}

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

                    {message && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className={`mb-8 p-4 rounded-xl border ${message.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'} flex items-center justify-center`}
                        >
                            {message.text}
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
                    {activeTab === 'list' && isAuthenticated ? (
                        <div className="p-8">
                            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                                <h3 className="text-2xl font-bold text-slate-900">
                                    {isTrashView ? 'Trash Section' : 'Submitted Applications'}
                                </h3>
                                <div className="flex flex-wrap items-center gap-3">
                                    {/* Program Logic Filters */}
                                    <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner">
                                        <select 
                                            value={selectedProgram}
                                            onChange={handleProgramChange}
                                            className="bg-transparent text-xs font-bold text-slate-700 px-3 py-1 outline-none min-w-[120px] cursor-pointer"
                                        >
                                            <option value="">All Brands/Programs</option>
                                            {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                        
                                        {selectedProgram && (
                                            <div className="flex items-center gap-2 border-l border-slate-300 pl-2">
                                                <select 
                                                    value={selectedSubProgram}
                                                    onChange={handleSubProgramChange}
                                                    className="bg-transparent text-xs font-bold text-indigo-600 px-3 py-1 outline-none min-w-[120px] cursor-pointer"
                                                >
                                                    <option value="">All Categories</option>
                                                    {subPrograms.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                                                </select>
                                                
                                                {selectedSubProgram && (
                                                    <select 
                                                        value={selectedCourse}
                                                        onChange={handleCourseChange}
                                                        className="bg-transparent text-xs font-bold text-emerald-600 px-3 py-1 outline-none min-w-[120px] border-l border-slate-300 pl-2 cursor-pointer"
                                                    >
                                                        <option value="">All Courses</option>
                                                        {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                    </select>
                                                )}
                                            </div>
                                        )}
                                        
                                        {(selectedProgram || selectedSubProgram || selectedCourse) && (
                                            <button 
                                                onClick={() => {
                                                    setSelectedProgram('');
                                                    setSelectedSubProgram('');
                                                    setSelectedCourse('');
                                                    setSubPrograms([]);
                                                    setCourses([]);
                                                }}
                                                className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                                                title="Clear Filters"
                                            >
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => setIsTrashView(!isTrashView)}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${isTrashView ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                    >
                                        <Trash2 size={16} />
                                        {isTrashView ? 'View Active' : 'View Trash'}
                                    </button>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                        <input
                                            type="text"
                                            placeholder="Search students..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:border-indigo-500 outline-none text-sm w-48 md:w-64"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider bg-slate-50/50">
                                            <th className="p-4 font-bold">Student</th>
                                            <th className="p-4 font-bold">Contact</th>
                                            <th className="p-4 font-bold">Program</th>
                                            <th className="p-4 font-bold">Application Info</th>
                                            <th className="p-4 font-bold">Amount</th>
                                            <th className="p-4 font-bold">Transaction ID</th>
                                            <th className="p-4 font-bold">Status</th>
                                            <th className="p-4 font-bold text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-sm">
                                        {loading ? (
                                            <tr><td colSpan="5" className="p-8 text-center text-slate-400">Loading records...</td></tr>
                                        ) : filteredStudents.length > 0 ? (
                                            filteredStudents.map((student) => (
                                                <tr key={student.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
                                                                {(student.first_name?.[0] || '')}{(student.last_name?.[0] || '')}
                                                            </div>
                                                            <div>
                                                                <div 
                                                                    className="font-bold text-slate-900 hover:text-indigo-600 cursor-pointer transition-colors"
                                                                    onClick={() => setSelectedStudentProfile(student)}
                                                                >
                                                                    {student.first_name} {student.last_name}
                                                                </div>
                                                                <div className="text-xs text-slate-400">ID: {student.crm_student_id || student.id}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="text-slate-600">{student.mobile}</div>
                                                        <div className="text-xs text-slate-400">{student.email}</div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="font-medium text-slate-800">{student.program_name}</div>
                                                        <div className="text-xs text-slate-500">{student.sub_program_name || student.course_name || '-'}</div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="max-w-[200px] space-y-1">
                                                            {student.dynamic_values_list?.slice(0, 3).map(val => (
                                                                <div key={val.id} className="text-[10px] leading-tight flex gap-1 truncate">
                                                                    <span className="font-bold text-slate-400 shrink-0">{val.field_label}:</span>
                                                                    <span className="text-slate-600 truncate">{val.value}</span>
                                                                </div>
                                                            ))}
                                                            {student.dynamic_values_list?.length > 3 && (
                                                                <div className="text-[10px] text-indigo-500 font-bold italic">
                                                                    +{student.dynamic_values_list.length - 3} more details...
                                                                </div>
                                                            )}
                                                            {!student.dynamic_values_list?.length && (
                                                                <span className="text-[10px] text-slate-300 italic">No custom data</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="font-bold text-slate-900">₹{student.total_paid || 0}</div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="font-medium text-slate-800">{student.transactions_list?.[0]?.transaction_id || '-'}</div>
                                                        {student.transactions_list?.length > 1 && (
                                                            <div className="text-[10px] text-indigo-500 font-bold mt-1">+{student.transactions_list.length - 1} more</div>
                                                        )}
                                                    </td>
                                                    <td className="p-4">
                                                        {student.transactions_list?.length > 0 || student.is_paid ? (
                                                            <span className="inline-flex items-center px-2 py-1 rounded bg-green-50 text-green-700 text-xs font-medium">
                                                                Paid
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs font-medium">
                                                                Pending
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                onClick={() => setSelectedStudentProfile(student)}
                                                                className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-all"
                                                                title="View Profile"
                                                            >
                                                                <FileText size={16} />
                                                            </button>

                                                            {!isTrashView ? (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleEditClick(student)}
                                                                        className="p-2 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-all"
                                                                        title="Edit"
                                                                    >
                                                                        <Edit2 size={16} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDelete(student.id)}
                                                                        className="p-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-all"
                                                                        title="Move to Trash"
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleRestore(student.id)}
                                                                        className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-all"
                                                                        title="Restore"
                                                                    >
                                                                        <RotateCcw size={16} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handlePermanentDelete(student.id)}
                                                                        className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all"
                                                                        title="Delete Permanently"
                                                                    >
                                                                        <Trash size={16} />
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr><td colSpan="6" className="p-8 text-center text-slate-400">No applications found.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination Controls */}
                            <div className="mt-8 flex items-center justify-between bg-white p-4 border-t border-slate-100">
                                <span className="text-sm text-slate-500 font-medium">
                                    Showing <span className="text-slate-900 font-bold">{filteredStudents.length}</span> of <span className="text-slate-900 font-bold">{studentPagination.count}</span> applications
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setStudentPage(p => Math.max(1, p - 1))}
                                        disabled={!studentPagination.previous || loading}
                                        className="px-4 py-2 rounded-xl bg-slate-100 border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-50 transition-all font-sans"
                                    >
                                        Previous
                                    </button>
                                    <button
                                        onClick={() => setStudentPage(p => p + 1)}
                                        disabled={!studentPagination.next || loading}
                                        className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 shadow-md shadow-indigo-100 disabled:opacity-50 transition-all font-sans"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : activeTab === 'bulk' && isAuthenticated ? (
                        <div className="p-8 md:p-12">
                            <div className="max-w-xl mx-auto text-center">
                                <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <svg className="w-10 h-10 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                </div>
                                <h3 className="text-2xl font-bold text-slate-900 mb-2">Upload Student Data</h3>
                                <p className="text-slate-500 mb-8">Upload your CSV or Excel file to process multiple student records at once.</p>

                                <form onSubmit={handleBulkUpload} className="space-y-6">
                                    <div className="relative border-2 border-dashed border-slate-300 rounded-2xl p-8 hover:border-indigo-500 transition-colors bg-slate-50/50">
                                        <input
                                            type="file"
                                            onChange={handleBulkFileChange}
                                            accept=".csv, .xlsx, .xls"
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            required
                                        />
                                        <div className="text-center">
                                            <p className="text-sm font-medium text-slate-900">
                                                {bulkFile ? bulkFile.name : "Click to upload or drag and drop"}
                                            </p>
                                            <p className="text-xs text-slate-500 mt-1">XLSX, CSV up to 10MB</p>
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={loading || !bulkFile}
                                        className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:shadow-indigo-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
                                    >
                                        {loading ? 'Processing...' : 'Start Upload'}
                                    </button>
                                </form>

                                {bulkResponse && (
                                    <div className="mt-8 text-left bg-slate-50 rounded-xl p-6 border border-slate-200">
                                        <h4 className="font-semibold text-slate-900 mb-2">Results</h4>
                                        <p className="text-sm text-green-600">✓ {bulkResponse.success_count} records processed successfully</p>
                                        {bulkResponse.errors?.length > 0 && (
                                            <div className="mt-4">
                                                <p className="text-sm text-red-600 font-medium mb-2">Errors ({bulkResponse.errors.length})</p>
                                                <ul className="list-disc list-inside text-xs text-red-500 space-y-1 max-h-40 overflow-y-auto">
                                                    {bulkResponse.errors.map((err, i) => <li key={i}>{err}</li>)}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="p-8 md:p-12">
                            {/* Step 1: Program Selection */}
                            <div className="mb-10">
                                <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
                                    <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-3 text-sm">1</span>
                                    Program Selection
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                                    {(!isPublicView || !selectedProgram) ? (
                                        <SelectField
                                            label="Select Program"
                                            value={selectedProgram}
                                            onChange={handleProgramChange}
                                            options={programs}
                                            required
                                        />
                                    ) : (
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-slate-700 mb-2">Selected Program</label>
                                            <div className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-bold">
                                                {programs.find(p => p.id === parseInt(selectedProgram))?.name}
                                            </div>
                                        </div>
                                    )}

                                    {/* Copy Link Feature */}
                                    {isAuthenticated && !isPublicView && selectedProgram && (
                                        <div className="pb-1">
                                            <button
                                                type="button"
                                                onClick={handleCopyLink}
                                                className="group relative flex items-center gap-3 px-6 py-4 rounded-2xl bg-white border-2 border-slate-100 hover:border-indigo-500 text-slate-600 hover:text-indigo-600 font-black text-sm transition-all w-full md:w-auto overflow-hidden shadow-sm hover:shadow-indigo-100"
                                            >
                                                <div className="relative z-10 flex items-center gap-3">
                                                    <Copy size={18} className="transition-transform group-hover:scale-110" />
                                                    <span>Get Enrollment Link</span>
                                                </div>
                                                <div className="absolute inset-0 bg-indigo-50 translate-y-[101%] group-hover:translate-y-0 transition-transform duration-300" />
                                            </button>
                                        </div>
                                    )}

                                    {hasSubPrograms && (
                                        <SelectField
                                            label="Select Category / Sub-Program"
                                            value={selectedSubProgram}
                                            onChange={handleSubProgramChange}
                                            options={subPrograms}
                                            required
                                        />
                                    )}

                                    {hasCourses && (
                                        <SelectField
                                            label="Select Course/Subject"
                                            value={selectedCourse}
                                            onChange={handleCourseChange}
                                            options={courses}
                                            required
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Student Form (Fully Dynamic) */}
                            {selectedProgram && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="space-y-10"
                                >
                                    <hr className="border-slate-100" />

                                    {/* Application Form (Fully Dynamic) */}
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
                                            <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-3 text-sm">2</span>
                                            Application Details
                                        </h3>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {dynamicFields.map(field => (
                                                <div key={field.id} className={field.field_type === 'file' ? 'md:col-span-2' : ''}>
                                                    <label className="text-sm font-semibold text-slate-700 mb-2 block">
                                                        {field.label} {field.is_required && <span className="text-red-500">*</span>}
                                                    </label>
                                                    {field.field_type === 'dropdown' ? (
                                                        <div className="relative">
                                                            <select
                                                                className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all text-slate-700 shadow-sm appearance-none"
                                                                onChange={(e) => handleDynamicChange(e, field.id)}
                                                                required={field.is_required}
                                                            >
                                                                <option value="">Select {field.label}</option>
                                                                {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                            </select>
                                                            <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-500">
                                                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                                                            </div>
                                                        </div>
                                                    ) : field.field_type === 'file' ? (
                                                        <div className="p-4 border-2 border-dashed border-slate-200 rounded-xl hover:border-indigo-400 transition-colors bg-slate-50">
                                                            <input
                                                                type="file"
                                                                onChange={(e) => handleDynamicFileChange(e, field.id)}
                                                                required={field.is_required}
                                                                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <input
                                                            type={field.field_type}
                                                            placeholder={`Enter ${field.label}`}
                                                            className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all placeholder:text-slate-400 text-slate-700 shadow-sm"
                                                            onChange={(e) => handleDynamicChange(e, field.id)}
                                                            required={field.is_required}
                                                        />
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>


                                    <div className="pt-6">
                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 hover:shadow-indigo-300 transition-all disabled:opacity-50 transform hover:-translate-y-0.5"
                                        >
                                            {loading ? <span className="flex items-center justify-center"><svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Submission in progress...</span> : "Submit Application"}
                                        </button>
                                        <p className="text-center text-xs text-slate-400 mt-4">By submitting this form, you agree to our terms and conditions.</p>
                                    </div>
                                </motion.div>
                            )}
                        </form>
                    )}
                </div>
            </div>
            {/* Student Profile Modal */}
            {selectedStudentProfile && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-3xl p-8 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
                    >
                        <div className="flex justify-between items-start mb-8">
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-indigo-100">
                                    {(selectedStudentProfile.first_name?.[0] || '')}{(selectedStudentProfile.last_name?.[0] || '')}
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-900">{selectedStudentProfile.first_name} {selectedStudentProfile.last_name}</h2>
                                    <p className="text-slate-500 font-medium">{selectedStudentProfile.crm_student_id}</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        handleEditClick(selectedStudentProfile);
                                        setSelectedStudentProfile(null);
                                    }}
                                    className="p-2 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-100 transition-all"
                                    title="Edit Profile"
                                >
                                    <Edit2 size={24} />
                                </button>
                                <button
                                    onClick={() => setSelectedStudentProfile(null)}
                                    className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
                                >
                                    <X size={24} />
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Program Info */}
                            <div className="md:col-span-2 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Enrollment Details</h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                                    <div>
                                        <p className="text-xs text-slate-500 mb-1">Program</p>
                                        <p className="font-bold text-slate-800">{selectedStudentProfile.program_name}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 mb-1">Sub-Program</p>
                                        <p className="font-bold text-slate-800">{selectedStudentProfile.sub_program_name || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 mb-1">Course</p>
                                        <p className="font-bold text-slate-800">{selectedStudentProfile.course_name || '-'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Base Contact Info */}
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Contact Info</h3>
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-xs text-slate-500 mb-1">Mobile</p>
                                        <p className="font-medium text-slate-800">{selectedStudentProfile.mobile || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 mb-1">Email</p>
                                        <p className="font-medium text-slate-800">{selectedStudentProfile.email || '-'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Dynamic Fields Groups */}
                            <div className="md:col-span-2 space-y-8">
                                {['INITIAL', 'ACADEMIC'].map(group => {
                                    const groupFields = selectedStudentProfile.dynamic_values_list?.filter(val => val.field_group === group);
                                    if (!groupFields || groupFields.length === 0) return null;

                                    return (
                                        <div key={group}>
                                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                                                {group === 'INITIAL' ? 'Initial Application (Sales)' : 'Academic/Post-Admission Details'}
                                            </h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white border border-slate-100 p-6 rounded-2xl shadow-sm">
                                                {groupFields.map((val) => (
                                                    <div key={val.id}>
                                                        <p className="text-xs text-slate-500 mb-1">{val.field_label}</p>
                                                        <p className="font-medium text-slate-800">{val.value || '-'}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                                {!selectedStudentProfile.dynamic_values_list?.length && (
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Form Details</h3>
                                        <div className="bg-white border border-slate-100 p-6 rounded-2xl">
                                            <p className="text-slate-400 text-sm italic">No custom fields filled.</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Documents */}
                            <div className="md:col-span-2">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Uploaded Documents</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {selectedStudentProfile.documents_list?.length > 0 ? (
                                        selectedStudentProfile.documents_list.map((doc) => (
                                            <a
                                                key={doc.id}
                                                href={`${api.defaults.baseURL.replace('/api/', '')}${doc.file}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-100 rounded-xl hover:border-indigo-300 hover:bg-indigo-50 transition-all group"
                                            >
                                                <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center text-slate-400 group-hover:text-indigo-600 shadow-sm">
                                                    <FileText size={20} />
                                                </div>
                                                <div className="flex-1 overflow-hidden">
                                                    <p className="text-sm font-bold text-slate-800 truncate">{doc.document_type}</p>
                                                    <p className="text-xs text-slate-400">Click to view</p>
                                                </div>
                                            </a>
                                        ))
                                    ) : (
                                        <p className="text-slate-400 text-sm italic">No documents uploaded.</p>
                                    )}
                                </div>
                            </div>

                            {/* Transactions */}
                            <div className="md:col-span-2">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Payment Information</h3>
                                {selectedStudentProfile.transactions_list?.length > 0 ? (
                                    <div className="bg-green-50/50 border border-green-100 p-6 rounded-2xl">
                                        {selectedStudentProfile.transactions_list.map((txn) => (
                                            <div key={txn.id} className="grid grid-cols-2 md:grid-cols-3 gap-6">
                                                <div>
                                                    <p className="text-xs text-green-600/70 mb-1">Transaction ID</p>
                                                    <p className="font-bold text-green-800">{txn.transaction_id || '-'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-green-600/70 mb-1">Amount</p>
                                                    <p className="font-bold text-green-800">₹{txn.amount || '-'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-green-600/70 mb-1">Date</p>
                                                    <p className="font-bold text-green-800">{new Date(txn.date).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl text-center">
                                        <p className="text-amber-700 text-sm font-medium">No payment record found.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-10 pt-8 border-t border-slate-100">
                            <button
                                onClick={() => setSelectedStudentProfile(null)}
                                className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                            >
                                Close Profile
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Edit Student Modal */}
            {editingStudent && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-3xl p-8 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
                    >
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3">
                                <Edit2 className="text-indigo-600" size={24} />
                                Edit Application
                            </h2>
                            <button onClick={() => setEditingStudent(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleUpdateStudent} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="md:col-span-2 bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Program Selection</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
                                        <div>
                                            <label className="text-xs font-semibold text-slate-700 mb-1 block">Program <span className="text-red-500">*</span></label>
                                            <select
                                                className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm outline-none focus:border-indigo-500 shadow-sm"
                                                value={editFormData.program_type || ''}
                                                onChange={handleEditProgramChange}
                                                required
                                            >
                                                <option value="">Select Program</option>
                                                {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold text-slate-700 mb-1 block">Sub-Program</label>
                                            <select
                                                className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm outline-none focus:border-indigo-500 shadow-sm"
                                                value={editFormData.sub_program || ''}
                                                onChange={handleEditSubProgramChange}
                                            >
                                                <option value="">Select Sub-Program</option>
                                                {editSubPrograms.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold text-slate-700 mb-1 block">Course</label>
                                            <select
                                                className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm outline-none focus:border-indigo-500 shadow-sm"
                                                value={editFormData.course || ''}
                                                onChange={(e) => setEditFormData(prev => ({ ...prev, course: e.target.value }))}
                                            >
                                                <option value="">Select Course</option>
                                                {editCourses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="md:col-span-2 border-b border-slate-100 pb-2">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Core Information</h4>
                                </div>

                                <InputField
                                    label="First Name"
                                    name="first_name"
                                    value={editFormData.first_name || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, first_name: e.target.value })}
                                    required
                                />
                                <InputField
                                    label="Last Name"
                                    name="last_name"
                                    value={editFormData.last_name || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, last_name: e.target.value })}
                                />
                                <InputField
                                    label="Mobile Number"
                                    name="mobile"
                                    value={editFormData.mobile || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, mobile: e.target.value })}
                                    required
                                />
                                <InputField
                                    label="Email Address"
                                    name="email"
                                    value={editFormData.email || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                                />

                                {['INITIAL', 'ACADEMIC'].map(group => {
                                    const groupFields = dynamicFields.filter(f => f.field_group === group && !['First Name', 'Mobile Number', 'Contact Number', 'Mobile'].includes(f.label));
                                    if (groupFields.length === 0) return null;

                                    return (
                                        <React.Fragment key={group}>
                                            <div className="md:col-span-2 border-b border-slate-100 pt-4 pb-2">
                                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                                                    {group === 'INITIAL' ? 'Initial Application Details' : 'Academic Coordinator Data Entry'}
                                                </h4>
                                            </div>
                                            {groupFields.map(field => (
                                                <div key={field.id} className={field.field_type === 'file' ? 'md:col-span-2' : ''}>
                                                    <label className="text-xs font-semibold text-slate-700 mb-1.5 block">{field.label}</label>
                                                    {field.field_type === 'dropdown' ? (
                                                        <select
                                                            className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm outline-none focus:border-indigo-500 shadow-sm"
                                                            value={editFormData.dynamic_values?.[field.id] || ''}
                                                            onChange={(e) => handleEditDynamicChange(field.id, e.target.value)}
                                                        >
                                                            <option value="">Select {field.label}</option>
                                                            {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                        </select>
                                                    ) : field.field_type !== 'file' ? (
                                                        <input
                                                            type={field.field_type}
                                                            className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm outline-none focus:border-indigo-500 shadow-sm"
                                                            value={editFormData.dynamic_values?.[field.id] || ''}
                                                            onChange={(e) => handleEditDynamicChange(field.id, e.target.value)}
                                                        />
                                                    ) : (
                                                        <div className="p-3 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center">
                                                            <p className="text-xs text-slate-400 italic font-medium">File uploads (like {field.label}) can only be added via the application form.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </React.Fragment>
                                    );
                                })}
                            </div>

                            <div className="pt-6 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setEditingStudent(null)}
                                    className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 hover:shadow-indigo-200 transition-all disabled:opacity-50"
                                >
                                    {loading ? 'Saving...' : 'Update Details'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </div>
    );
};

export default SalesModule;
