import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Search, FileText, X } from 'lucide-react';
import { copyToClipboard } from '../utils/clipboard';

const AcademicCoordinatorModule = () => {
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
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

    const fetchStudents = async () => {
        setLoading(true);
        try {
            const res = await api.get(`students/?page=${studentPage}&search=${searchTerm}`);
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
    }, [studentPage, searchTerm]);

    useEffect(() => {
        if (searchTerm) setStudentPage(1);
    }, [searchTerm]);

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

    const handleSaveCompletion = async (e) => {
        e.preventDefault();
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
                    className="mb-8 flex flex-col md:flex-row justify-between items-center"
                >
                    <div>
                        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600 mb-2">
                            Academic Coordinator
                        </h1>
                        <p className="text-sm text-slate-500 max-w-2xl">
                            Review applications from Sales and enter Post-Admission Academic details.
                        </p>
                    </div>
                    <div className="relative mt-4 md:mt-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search students..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:border-teal-500 outline-none text-sm w-64"
                        />
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

                <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100 p-6 md:p-8 animate-fadeIn">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="p-4 font-bold text-slate-500 uppercase text-xs">CRM ID</th>
                                    <th className="p-4 font-bold text-slate-500 uppercase text-xs">Name</th>
                                    <th className="p-4 font-bold text-slate-500 uppercase text-xs">Program</th>
                                    <th className="p-4 font-bold text-slate-500 uppercase text-xs">Initial Details</th>
                                    <th className="p-4 font-bold text-slate-500 uppercase text-xs">Academic Details</th>
                                    <th className="p-4 font-bold text-slate-500 uppercase text-xs">Mobile</th>
                                    <th className="p-4 font-bold text-slate-500 uppercase text-xs text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {loading ? (
                                    <tr><td colSpan="6" className="p-10 text-center text-slate-500 font-medium animate-pulse">Loading students...</td></tr>
                                ) : students.length > 0 ? (
                                    students.map(student => (
                                        <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-4 font-mono text-xs font-bold text-teal-600">{student.crm_student_id}</td>
                                            <td className="p-4 font-bold text-slate-800 cursor-pointer hover:text-teal-600 transition-colors" onClick={() => setViewingProfile(student)}>
                                                {student.first_name} {student.last_name}
                                            </td>
                                            <td className="p-4 text-slate-600 text-xs">{student.program_name}</td>
                                            <td className="p-4">
                                                <div className="max-w-[150px] space-y-1">
                                                    {student.dynamic_values_list?.filter(v => v.field_group === 'INITIAL' && v.value && v.value.trim() !== '').slice(0, 2).map(val => (
                                                        <div key={val.id} className="text-[10px] leading-tight flex gap-1 truncate text-slate-500">
                                                            <span className="font-bold opacity-70 shrink-0">{val.field_label}:</span>
                                                            <span className="truncate">{val.value}</span>
                                                        </div>
                                                    ))}
                                                    {student.dynamic_values_list?.filter(v => v.field_group === 'INITIAL' && v.value && v.value.trim() !== '').length === 0 && (
                                                        <span className="text-[10px] text-slate-300 italic">No Initial Data</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="max-w-[150px] space-y-1 border-l-2 border-teal-100 pl-2">
                                                    {student.dynamic_values_list?.filter(v => v.field_group === 'ACADEMIC' && v.value && v.value.trim() !== '').map(val => (
                                                        <div key={val.id} className="text-[10px] leading-tight flex gap-1 truncate text-teal-700">
                                                            <span className="font-bold shrink-0">{val.field_label}:</span>
                                                            <span className="truncate">{val.value}</span>
                                                        </div>
                                                    ))}
                                                    {student.dynamic_values_list?.filter(v => v.field_group === 'ACADEMIC' && v.value && v.value.trim() !== '').length === 0 && (
                                                        <span className="text-[10px] text-slate-300 italic">Pending...</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4 text-slate-600 font-mono text-xs">{student.mobile}</td>
                                            <td className="p-4 text-right flex gap-2 justify-end">
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
                                                    className="px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-white border border-indigo-100 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                                >
                                                    Copy Link
                                                </button>
                                                <button
                                                    onClick={() => handleCompleteProfile(student)}
                                                    className="px-4 py-2 bg-teal-50 text-teal-600 hover:bg-teal-100 rounded-xl text-xs font-bold transition-colors"
                                                >
                                                    Enter Data
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan="6" className="p-10 text-center text-slate-500 font-medium">No students found matching your search.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between bg-white pt-6 mt-4 border-t border-slate-100">
                        <span className="text-sm text-slate-500">
                            Showing <span className="font-bold text-slate-900">{students.length}</span> of <span className="font-bold text-slate-900">{studentPagination.count}</span> students
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setStudentPage(p => Math.max(1, p - 1))}
                                disabled={!studentPagination.previous || loading}
                                className="px-4 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition-all"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setStudentPage(p => p + 1)}
                                disabled={!studentPagination.next || loading}
                                className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 disabled:opacity-50 transition-all shadow-sm"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>

                {/* Profile Completion Modal */}
                {completingProfile && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                        <div className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
                            <button
                                onClick={() => setCompletingProfile(null)}
                                className="absolute top-6 right-6 text-slate-400 hover:text-slate-700 transition-colors"
                            >
                                <X size={24} />
                            </button>

                            <h2 className="text-2xl font-bold mb-1 text-slate-900 text-transparent bg-clip-text bg-gradient-to-r from-teal-500 to-blue-600">Academic Details</h2>
                            <p className="text-slate-500 text-sm mb-6">Entering details for <span className="text-teal-600 font-bold">{completingProfile.first_name} {completingProfile.last_name}</span></p>

                            <form onSubmit={handleSaveCompletion} className="space-y-6">
                                {academicFields.length === 0 ? (
                                    <div className="py-10 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-100">
                                        <p className="text-slate-400 text-sm italic">No additional academic fields defined for this program.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {academicFields.map(field => (
                                            <div key={field.id} className="space-y-2">
                                                <label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">
                                                    {field.label} {field.is_required && <span className="text-red-500">*</span>}
                                                </label>
                                                {field.field_type === 'dropdown' ? (
                                                    <select
                                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-teal-500 transition-all font-bold"
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
                                                    <div className="p-4 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 hover:bg-white transition-all cursor-pointer group">
                                                        <input 
                                                            type="file" 
                                                            className="hidden" 
                                                            id={`file-${field.id}`}
                                                            onChange={e => {
                                                                const file = e.target.files[0];
                                                                if (file && file.size > 10 * 1024 * 1024) {
                                                                    alert(`File "${file.name}" is too large. Please upload a file smaller than 10MB.`);
                                                                    e.target.value = ''; // Reset input
                                                                    return;
                                                                }
                                                                setAcademicFiles({ ...academicFiles, [field.id]: file });
                                                            }}
                                                            required={field.is_required && !academicValues[field.id]}
                                                        />
                                                        <label htmlFor={`file-${field.id}`} className="flex flex-col items-center justify-center cursor-pointer">
                                                            <div className="w-10 h-10 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                                                <FileText size={20} />
                                                            </div>
                                                            <p className="text-xs font-bold text-slate-600">
                                                                {academicFiles[field.id] ? academicFiles[field.id].name : `Upload ${field.label}`}
                                                            </p>
                                                            {field.is_required && <p className="text-[10px] text-rose-500 mt-1">Required</p>}
                                                        </label>
                                                    </div>
                                                ) : (
                                                    <input
                                                        type={field.field_type}
                                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-teal-500 transition-all font-bold"
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

                                <div className="flex gap-4 pt-4">
                                    <button type="button" onClick={() => setCompletingProfile(null)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-colors">Cancel</button>
                                    <button
                                        type="submit"
                                        disabled={savingCompletion || academicFields.length === 0}
                                        className="flex-1 py-4 bg-gradient-to-r from-teal-500 to-blue-600 text-white rounded-2xl font-bold hover:shadow-lg transition-all disabled:opacity-50"
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
                        <div className="bg-white rounded-3xl p-8 w-full max-w-2xl shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
                            <button
                                onClick={() => setViewingProfile(null)}
                                className="absolute top-6 right-6 p-2 bg-slate-100 hover:bg-rose-100 hover:text-rose-600 rounded-full transition-colors text-slate-400"
                            >
                                <X size={20} />
                            </button>

                            <div className="flex items-start gap-4 mb-8">
                                <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-teal-500 to-blue-500 p-0.5 shadow-lg shadow-teal-500/20">
                                    <div className="w-full h-full bg-white rounded-full flex items-center justify-center font-black text-2xl text-teal-600">
                                        {viewingProfile.first_name[0]}{viewingProfile.last_name?.[0]}
                                    </div>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-slate-900">{viewingProfile.first_name} {viewingProfile.last_name}</h2>
                                    <p className="text-sm font-bold text-slate-500 font-mono mt-1">{viewingProfile.crm_student_id}</p>
                                    <p className="text-xs font-bold text-teal-600 mt-0.5">{viewingProfile.program_name}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Academic Data */}
                                <div className="bg-teal-50/50 rounded-2xl p-6 border border-teal-100">
                                    <h3 className="text-sm font-black text-teal-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <FileText size={16} /> Academic Data
                                    </h3>
                                    <div className="space-y-4">
                                        {viewingProfile.dynamic_values_list?.filter(v => v.field_group === 'ACADEMIC' && v.value && v.value.trim() !== '').length > 0 ? (
                                            viewingProfile.dynamic_values_list.filter(v => v.field_group === 'ACADEMIC' && v.value && v.value.trim() !== '').map(val => (
                                                <div key={val.id} className="border-b border-teal-100/50 pb-3 last:border-0 last:pb-0">
                                                    <p className="text-[10px] font-bold text-teal-600/70 uppercase tracking-widest mb-1">{val.field_label}</p>
                                                    <p className="text-sm font-medium text-slate-800 break-words">{val.value}</p>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-sm text-slate-400 italic">No Academic Data found.</p>
                                        )}
                                    </div>
                                </div>

                                {/* Initial Data */}
                                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
                                    <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <FileText size={16} /> Initial Sales Data
                                    </h3>
                                    <div className="space-y-4">
                                        <div className="border-b border-slate-200/50 pb-3">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Mobile</p>
                                            <p className="text-sm font-medium text-slate-800 break-words">{viewingProfile.mobile || '-'}</p>
                                        </div>
                                        <div className="border-b border-slate-200/50 pb-3">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Email</p>
                                            <p className="text-sm font-medium text-slate-800 break-words">{viewingProfile.email || '-'}</p>
                                        </div>
                                        {viewingProfile.dynamic_values_list?.filter(v => v.field_group === 'INITIAL' && v.value && v.value.trim() !== '').map(val => (
                                            <div key={val.id} className="border-b border-slate-200/50 pb-3 last:border-0 last:pb-0">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{val.field_label}</p>
                                                <p className="text-sm font-medium text-slate-800 break-words">{val.value}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {/* Documents Section */}
                                <div className="md:col-span-2">
                                    <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <FileText size={16} /> Uploaded Documents
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {viewingProfile.documents_list?.length > 0 ? (
                                            viewingProfile.documents_list.map((doc) => (
                                                <a
                                                    key={doc.id}
                                                    href={doc.file.startsWith('http') ? doc.file : `${api.defaults.baseURL.split('/api')[0]}${doc.file}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl hover:border-teal-300 hover:bg-teal-50 transition-all group"
                                                >
                                                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-400 group-hover:text-teal-600 shadow-sm transition-colors">
                                                        <FileText size={20} />
                                                    </div>
                                                    <div className="flex-1 overflow-hidden">
                                                        <p className="text-sm font-bold text-slate-800 truncate">{doc.document_type}</p>
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Click to view</p>
                                                    </div>
                                                </a>
                                            ))
                                        ) : (
                                            <div className="md:col-span-2 py-6 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-100">
                                                <p className="text-sm text-slate-400 italic">No documents uploaded yet.</p>
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
