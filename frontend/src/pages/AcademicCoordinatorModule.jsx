import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Search, FileText, X, Download } from 'lucide-react';
import { copyToClipboard } from '../utils/clipboard';
import { compressImage } from '../utils/fileCompressor';

const AcademicCoordinatorModule = () => {
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [academicStatus, setAcademicStatus] = useState('');
    const [programFilter, setProgramFilter] = useState('');
    const [programs, setPrograms] = useState([]);
    const [studentPage, setStudentPage] = useState(1);
    const [studentPagination, setStudentPagination] = useState({ count: 0, next: null, previous: null });
    const [toast, setToast] = useState(null);

    // Profile Viewing State
    const [viewingProfile, setViewingProfile] = useState(null);

    // Profile Completion State
    const [completingProfile, setCompletingProfile] = useState(null);
    const [academicFields, setAcademicFields] = useState([]);
    const [academicValues, setAcademicValues] = useState({});
    const [savingCompletion, setSavingCompletion] = useState(false);
    const [academicFiles, setAcademicFiles] = useState({});

    useEffect(() => {
        const fetchPrograms = async () => {
            try {
                const res = await api.get('programs/');
                setPrograms(res.data);
            } catch (err) {
                console.error("Failed to fetch programs", err);
            }
        };
        fetchPrograms();
    }, []);

    const fetchStudents = async () => {
        setLoading(true);
        try {
            let url = `students/?page=${studentPage}&search=${searchTerm}`;
            if (academicStatus) url += `&academic_status=${academicStatus}`;
            if (programFilter) url += `&program=${programFilter}`;
            
            const res = await api.get(url);
            const data = res.data;
            if (data.results) {
                setStudents(data.results);
                setStudentPagination({
                    count: data.count,
                    next: data.next,
                    previous: data.previous
                });
            } else {
                setStudents(Array.isArray(data) ? data : []);
                setStudentPagination({ count: data.length, next: null, previous: null });
            }
        } catch (err) {
            console.error("Failed to fetch students", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchStudents();
        }, 500);
        return () => clearTimeout(timer);
    }, [studentPage, searchTerm, academicStatus, programFilter]);

    useEffect(() => {
        if (searchTerm || academicStatus !== undefined || programFilter !== undefined) setStudentPage(1);
    }, [searchTerm, academicStatus, programFilter]);

    const handleCompleteProfile = async (student) => {
        setCompletingProfile(student);
        setAcademicFields([]);
        setAcademicValues({});
        setAcademicFiles({});
        
        // Map existing values
        const currentVals = {};
        student.dynamic_values_list?.forEach(v => {
            currentVals[v.field] = v.value;
        });
        setAcademicValues(currentVals);

        try {
            let params = `program=${student.program_type}`;
            if (student.sub_program) params = `sub_program=${student.sub_program}`;
            if (student.course) params = `course=${student.course}`;
            
            const res = await api.get(`forms/fields/?${params}&field_group=ACADEMIC`);
            const fields = Array.isArray(res.data) ? res.data : (res.data?.results || []);
            setAcademicFields(fields.sort((a,b) => a.order - b.order));
        } catch (err) {
            console.error("Failed to fetch academic fields", err);
        }
    };

    const handleExport = () => {
        if (students.length === 0) {
            setToast({ type: 'error', message: 'No data to export!' });
            setTimeout(() => setToast(null), 3000);
            return;
        }

        // Collect all dynamic field headers across all students in current view
        const initialHeaders = new Set();
        const academicHeaders = new Set();
        
        students.forEach(s => {
            s.dynamic_values_list?.forEach(v => {
                if (v.field_group === 'INITIAL') initialHeaders.add(v.field_label);
                if (v.field_group === 'ACADEMIC') academicHeaders.add(v.field_label);
            });
        });

        const sortedInitialFields = Array.from(initialHeaders).sort();
        const sortedAcademicFields = Array.from(academicHeaders).sort();

        const headers = [
            'CRM ID', 'First Name', 'Last Name', 'Mobile', 'Email', 'Program', 
            ...sortedInitialFields,
            ...sortedAcademicFields
        ];

        const rows = students.map(s => {
            const rowData = {
                'CRM ID': s.crm_student_id,
                'First Name': s.first_name,
                'Last Name': s.last_name,
                'Mobile': s.mobile,
                'Email': s.email,
                'Program': s.program_name
            };

            // Map dynamic fields from the student's value list
            s.dynamic_values_list?.forEach(v => {
                rowData[v.field_label] = v.value;
            });

            // Return comma-separated row with escaped values
            return headers.map(h => {
                const val = (rowData[h] || '').toString();
                // Escape quotes and wrap in quotes to handle commas
                return `"${val.replace(/"/g, '""')}"`;
            }).join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `student_academic_export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setToast({ type: 'success', message: 'Exporting Current Page...' });
        setTimeout(() => setToast(null), 3000);
    };

    const handleSaveCompletion = async (e) => {
        e.preventDefault();
        
        // Dynamic Validation
        for (const field of academicFields) {
            const value = academicValues[field.id];
            
            // 1. Required Check
            if (field.is_required && !value && field.field_type !== 'file') {
                alert(`${field.label} is required.`);
                return;
            }
            if (field.is_required && field.field_type === 'file' && !academicFiles[field.id] && !value) {
                alert(`${field.label} file is required.`);
                return;
            }

            // 2. Custom Regex Validation
            if (value && field.validation_rules) {
                try {
                    const rules = typeof field.validation_rules === 'string' 
                        ? JSON.parse(field.validation_rules) 
                        : field.validation_rules;
                    
                    if (rules.pattern) {
                        const regex = new RegExp(rules.pattern);
                        if (!regex.test(value)) {
                            alert(rules.message || `Invalid ${field.label}`);
                            return;
                        }
                    }
                } catch (e) {
                    console.error("Rules parsing failed", e);
                }
            }
        }

        setSavingCompletion(true);

        const formData = new FormData();
        formData.append('dynamic_values', JSON.stringify(academicValues));
        
        // Append academic files
        Object.keys(academicFiles).forEach(fieldId => {
            formData.append(`dynamic_file_${fieldId}`, academicFiles[fieldId]);
        });

        try {
            await api.patch(`students/${completingProfile.id}/`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setCompletingProfile(null);
            fetchStudents(); // Refresh to show updated data
            setToast({ type: 'success', message: 'Academic Details Saved Successfully!' });
            setTimeout(() => setToast(null), 3000);
        } catch (err) {
            console.error("Save failed", err);
            alert("Failed to save details.");
        } finally {
            setSavingCompletion(false);
        }
    };

    return (
        <div className="min-h-screen w-full bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
            <div className="max-w-6xl mx-auto w-full">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-5 rounded-2xl border border-slate-200 shadow-sm gap-4 mb-6"
                >
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 mb-0.5">
                            <span className="text-emerald-600">Academic</span>{" "}
                            <span className="text-teal-600">Coordinator</span>
                        </h1>
                        <p className="text-xs text-slate-500 font-medium">
                            Review applications from Sales and enter Post-Admission Academic details.
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2.5 w-full sm:w-auto">
                        <select
                            value={programFilter}
                            onChange={(e) => setProgramFilter(e.target.value)}
                            className="px-3 py-1.5 rounded-md border border-slate-200 text-xs text-slate-600 outline-none focus:border-emerald-500 bg-white shadow-sm"
                        >
                            <option value="">All Programs</option>
                            {programs.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                        <select
                            value={academicStatus}
                            onChange={(e) => setAcademicStatus(e.target.value)}
                            className="px-3 py-1.5 rounded-md border border-slate-200 text-xs text-slate-600 outline-none focus:border-emerald-500 bg-white shadow-sm"
                        >
                            <option value="">All Applications</option>
                            <option value="AVAILABLE">Data Available</option>
                            <option value="WANTED">Data Pending (Wanted)</option>
                        </select>
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Search students..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 pr-4 py-1.5 rounded-md border border-slate-200 focus:border-slate-350 outline-none text-xs w-full bg-slate-50/50"
                            />
                        </div>
                        <button
                            onClick={handleExport}
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-650 hover:bg-slate-50 rounded-md text-xs font-medium transition-colors shadow-sm"
                            title="Export Current Page to CSV"
                        >
                            <Download size={14} /> Export
                        </button>
                    </div>
                </motion.div>

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

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 animate-fadeIn">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50/75 border-b border-slate-200">
                                <tr>
                                    <th className="p-3.5 font-semibold text-slate-500 uppercase text-[10px] tracking-wider">CRM ID</th>
                                    <th className="p-3.5 font-semibold text-slate-500 uppercase text-[10px] tracking-wider">Name</th>
                                    <th className="p-3.5 font-semibold text-slate-500 uppercase text-[10px] tracking-wider">Program</th>
                                    <th className="p-3.5 font-semibold text-slate-500 uppercase text-[10px] tracking-wider">Initial Details</th>
                                    <th className="p-3.5 font-semibold text-slate-500 uppercase text-[10px] tracking-wider">Academic Details</th>
                                    <th className="p-3.5 font-semibold text-slate-500 uppercase text-[10px] tracking-wider">Mobile</th>
                                    <th className="p-3.5 font-semibold text-slate-500 uppercase text-[10px] tracking-wider text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {loading ? (
                                    <tr><td colSpan="7" className="p-10 text-center text-slate-400 font-medium animate-pulse">Loading students...</td></tr>
                                ) : students.length > 0 ? (
                                    students.map(student => (
                                        <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="p-3.5 font-mono text-xs font-semibold text-teal-600 bg-teal-50/20 w-24 text-center rounded-lg">{student.crm_student_id}</td>
                                            <td className="p-3.5 font-semibold text-slate-800 cursor-pointer hover:text-teal-600 transition-colors text-sm" onClick={() => setViewingProfile(student)}>
                                                {student.first_name} {student.last_name}
                                            </td>
                                            <td className="p-3.5 text-slate-500 text-xs font-normal">{student.program_name}</td>
                                            <td className="p-3.5">
                                                <div className="max-w-[150px] space-y-1">
                                                    {student.dynamic_values_list?.filter(v => v.field_group === 'INITIAL' && v.value && v.value.trim() !== '').slice(0, 2).map(val => (
                                                        <div key={val.id} className="text-[10px] leading-tight flex gap-1 truncate text-slate-450">
                                                            <span className="font-semibold opacity-70 shrink-0">{val.field_label}:</span>
                                                            <span className="truncate text-slate-600">{val.value}</span>
                                                        </div>
                                                    ))}
                                                    {student.dynamic_values_list?.filter(v => v.field_group === 'INITIAL' && v.value && v.value.trim() !== '').length === 0 && (
                                                        <span className="text-[10px] text-slate-400 italic">No Initial Data</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-3.5">
                                                <div className="max-w-[150px] space-y-1 border-l border-slate-200 pl-2">
                                                    {student.dynamic_values_list?.filter(v => v.field_group === 'ACADEMIC' && v.value && v.value.trim() !== '').map(val => (
                                                        <div key={val.id} className="text-[10px] leading-tight flex gap-1 truncate text-teal-700">
                                                            <span className="font-semibold shrink-0">{val.field_label}:</span>
                                                            <span className="truncate">{val.value}</span>
                                                        </div>
                                                    ))}
                                                    {student.dynamic_values_list?.filter(v => v.field_group === 'ACADEMIC' && v.value && v.value.trim() !== '').length === 0 && (
                                                        <span className="text-[10px] text-slate-405 italic">Pending...</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-3.5 text-slate-500 font-mono text-xs font-normal">{student.mobile}</td>
                                            <td className="p-3.5 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => {
                                                            const progId = student.program_type_id || (student.program_name ? student.program_name : '');
                                                            const slug = student.program_slug || progId;
                                                            
                                                            let link = `${window.location.origin}/apply/${slug}?group=ACADEMIC&sid=${student.id}`;
                                                            if (student.sub_program_id) link += `&sp=${student.sub_program_id}`;
                                                            if (student.course_id) link += `&c=${student.course_id}`;
                                                            
                                                            copyToClipboard(link);
                                                            setToast({ message: `Direct Link Copied for ${student.first_name}!` });
                                                            setTimeout(() => setToast(null), 3000);
                                                        }}
                                                        className="px-2.5 py-1 bg-white border border-slate-200 text-slate-650 hover:bg-slate-50 rounded-md text-xs font-semibold transition-colors shadow-sm"
                                                    >
                                                        Copy Link
                                                    </button>
                                                    <button
                                                        onClick={() => handleCompleteProfile(student)}
                                                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold transition-colors shadow-sm"
                                                    >
                                                        Enter Data
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan="7" className="p-10 text-center text-slate-400 font-medium">No students found matching your search.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between bg-white pt-6 mt-4 border-t border-slate-200">
                        <span className="text-xs text-slate-500 font-medium">
                            Showing <span className="font-semibold text-slate-700">{students.length}</span> of <span className="font-semibold text-slate-700">{studentPagination.count}</span> students
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setStudentPage(p => Math.max(1, p - 1))}
                                disabled={!studentPagination.previous || loading}
                                className="px-3 py-1.5 rounded-md bg-white border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setStudentPage(p => p + 1)}
                                disabled={!studentPagination.next || loading}
                                className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-sm"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>

                {/* Profile Completion Modal */}
                {completingProfile && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                        <div className="bg-white rounded-2xl p-6 shadow-xl border border-slate-100 relative max-h-[95vh] overflow-y-auto w-full max-w-lg">
                            <button
                                onClick={() => setCompletingProfile(null)}
                                className="absolute top-5 right-5 text-slate-450 hover:text-slate-650 transition-colors"
                            >
                                <X size={20} />
                            </button>

                            <h2 className="text-xl font-bold text-slate-900 mb-1">Academic Details</h2>
                            <p className="text-xs text-slate-500 font-medium mb-6">Entering details for <span className="text-emerald-600 font-semibold">{completingProfile.first_name} {completingProfile.last_name}</span></p>

                            <form onSubmit={handleSaveCompletion} className="space-y-4">
                                {academicFields.length === 0 ? (
                                    <div className="py-10 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                        <p className="text-slate-400 text-xs italic">No additional academic fields defined for this program.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {academicFields.map(field => (
                                            <div key={field.id} className="space-y-1.5">
                                                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-0.5">
                                                    {field.label} {field.is_required && <span className="text-red-500">*</span>}
                                                </label>
                                                {field.field_type === 'dropdown' ? (
                                                    <select
                                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:border-emerald-500 outline-none transition-all font-medium text-slate-700"
                                                        value={academicValues[field.id] || ''}
                                                        onChange={e => setAcademicValues({ ...academicValues, [field.id]: e.target.value })}
                                                        required={field.is_required}
                                                    >
                                                        <option value="">Select Option</option>
                                                        {(Array.isArray(field.options) ? field.options : field.options?.split(',') || []).map(opt => (
                                                            <option key={opt} value={opt}>{opt}</option>
                                                        ))}
                                                    </select>
                                                ) : field.field_type === 'file' ? (
                                                    <div className="p-4 border border-dashed border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-100/50 transition-all cursor-pointer group">
                                                        <input 
                                                            type="file" 
                                                            className="hidden" 
                                                            id={`file-${field.id}`}
                                                            onChange={async (e) => {
                                                                const file = e.target.files[0];
                                                                if (!file) return;

                                                                let processedFile = file;
                                                                if (file.type.startsWith('image/')) {
                                                                    processedFile = await compressImage(file, { maxWidth: 1024, maxHeight: 1024, quality: 0.7 });
                                                                }

                                                                if (processedFile.size > 10 * 1024 * 1024) {
                                                                    alert(`File "${processedFile.name}" is too large even after compression. Max limit is 10MB.`);
                                                                    e.target.value = ''; // Reset input
                                                                    return;
                                                                }
                                                                setAcademicFiles({ ...academicFiles, [field.id]: processedFile });
                                                            }}
                                                            required={field.is_required && !academicValues[field.id]}
                                                        />
                                                        <label htmlFor={`file-${field.id}`} className="flex flex-col items-center justify-center cursor-pointer">
                                                            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                                                                <FileText size={16} />
                                                            </div>
                                                            <p className="text-xs font-semibold text-slate-655">
                                                                {academicFiles[field.id] ? academicFiles[field.id].name : `Upload ${field.label}`}
                                                            </p>
                                                            {field.is_required && <p className="text-[9px] font-medium text-rose-500 mt-1">Required</p>}
                                                        </label>
                                                    </div>
                                                ) : (
                                                    <input
                                                        type={field.field_type}
                                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:border-emerald-500 outline-none transition-all font-medium text-slate-700"
                                                        placeholder={`Enter ${field.label}`}
                                                        value={academicValues[field.id] || ''}
                                                        onChange={e => setAcademicValues({ ...academicValues, [field.id]: e.target.value })}
                                                        required={field.is_required}
                                                    />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="flex gap-3 pt-4">
                                    <button type="button" onClick={() => setCompletingProfile(null)} className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-lg text-sm font-semibold transition-colors">Cancel</button>
                                    <button
                                        type="submit"
                                        disabled={savingCompletion || academicFields.length === 0}
                                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
                                    >
                                        {savingCompletion ? 'Saving...' : 'Save Details'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
                {/* Profile View Modal */}
                {viewingProfile && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                        <div className="bg-white rounded-2xl p-6 md:p-8 w-full max-w-2xl shadow-xl border border-slate-100 relative max-h-[95vh] overflow-y-auto">
                            <button
                                onClick={() => setViewingProfile(null)}
                                className="absolute top-5 right-5 p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-655 transition-all"
                            >
                                <X size={18} />
                            </button>

                            <div className="flex items-start gap-4 mb-6">
                                <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-bold text-xl border border-emerald-100">
                                    {viewingProfile.first_name[0]}{viewingProfile.last_name?.[0]}
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900">{viewingProfile.first_name} {viewingProfile.last_name}</h2>
                                    <p className="text-xs font-mono text-slate-400 font-semibold mt-0.5">{viewingProfile.crm_student_id}</p>
                                    <p className="text-xs font-semibold text-emerald-600 mt-0.5">{viewingProfile.program_name}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Academic Data */}
                                <div className="bg-slate-50/50 rounded-xl p-5 border border-slate-200/60">
                                    <h3 className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                                        <FileText size={14} /> Academic Data
                                    </h3>
                                    <div className="space-y-4">
                                        {viewingProfile.dynamic_values_list?.filter(v => v.field_group === 'ACADEMIC' && v.value && v.value.trim() !== '').length > 0 ? (
                                            viewingProfile.dynamic_values_list.filter(v => v.field_group === 'ACADEMIC' && v.value && v.value.trim() !== '').map(val => (
                                                <div key={val.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                                                    <p className="text-[9px] font-semibold text-slate-450 uppercase tracking-wider mb-0.5">{val.field_label}</p>
                                                    <p className="text-xs font-medium text-slate-700 break-words">{val.value}</p>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-xs text-slate-400 italic">No Academic Data found.</p>
                                        )}
                                    </div>
                                </div>

                                {/* Initial Data */}
                                <div className="bg-slate-50/50 rounded-xl p-5 border border-slate-200/60">
                                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                                        <FileText size={14} /> Initial Sales Data
                                    </h3>
                                    <div className="space-y-4">
                                        <div className="border-b border-slate-100 pb-3">
                                            <p className="text-[9px] font-semibold text-slate-455 uppercase tracking-wider mb-0.5">Mobile</p>
                                            <p className="text-xs font-medium text-slate-700 break-words">{viewingProfile.mobile || '-'}</p>
                                        </div>
                                        <div className="border-b border-slate-100 pb-3">
                                            <p className="text-[9px] font-semibold text-slate-455 uppercase tracking-wider mb-0.5">Email</p>
                                            <p className="text-xs font-medium text-slate-700 break-words">{viewingProfile.email || '-'}</p>
                                        </div>
                                        {viewingProfile.dynamic_values_list?.filter(v => v.field_group === 'INITIAL' && v.value && v.value.trim() !== '').map(val => (
                                            <div key={val.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                                                <p className="text-[9px] font-semibold text-slate-455 uppercase tracking-wider mb-0.5">{val.field_label}</p>
                                                <p className="text-xs font-medium text-slate-700 break-words">{val.value}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {/* Documents Section */}
                                <div className="md:col-span-2">
                                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                        <FileText size={14} /> Uploaded Documents
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {viewingProfile.documents_list?.length > 0 ? (
                                            viewingProfile.documents_list.map((doc) => (
                                                <a
                                                    key={doc.id}
                                                    href={doc.file.startsWith('http') ? doc.file : `${api.defaults.baseURL.split('/api')[0]}${doc.file}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="flex items-center gap-3 p-3 bg-white border border-slate-200 hover:border-emerald-350 hover:bg-emerald-50/30 rounded-xl transition-all group shadow-sm"
                                                >
                                                    <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-150 flex items-center justify-center text-slate-400 group-hover:text-emerald-600 transition-colors shadow-sm">
                                                        <FileText size={18} />
                                                    </div>
                                                    <div className="flex-1 overflow-hidden">
                                                        <p className="text-xs font-semibold text-slate-700 truncate">{doc.document_type}</p>
                                                        <p className="text-[9px] font-medium text-slate-400 uppercase tracking-wider">Click to view</p>
                                                    </div>
                                                </a>
                                            ))
                                        ) : (
                                            <div className="md:col-span-2 py-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                                <p className="text-xs text-slate-400 italic">No documents uploaded yet.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AcademicCoordinatorModule;
