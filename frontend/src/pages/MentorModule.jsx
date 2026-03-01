
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { motion } from 'framer-motion';
import { FileText, User, Calendar, BookOpen, Search, X, Key, Edit, Users } from 'lucide-react';

const MentorModule = () => {
    // Data State
    const [batches, setBatches] = useState([]);
    const [batchPagination, setBatchPagination] = useState({ count: 0, next: null, previous: null });
    const [batchPage, setBatchPage] = useState(1);
    const [programs, setPrograms] = useState([]);
    const [subPrograms, setSubPrograms] = useState([]);
    const [courses, setCourses] = useState([]);
    const [mentors, setMentors] = useState([]);
    const { user: authUser } = useAuth();

    // UI State
    const [selectedBatch, setSelectedBatch] = useState(null);
    const [studentsInBatch, setStudentsInBatch] = useState([]);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [unassignedStudents, setUnassignedStudents] = useState([]);
    const [selectedStudentProfile, setSelectedStudentProfile] = useState(null);
    const [studentLmsData, setStudentLmsData] = useState(null);
    const [isCredentialsModalOpen, setIsCredentialsModalOpen] = useState(false);
    const [credentialStudent, setCredentialStudent] = useState(null);
    const [credentialForm, setCredentialForm] = useState({ username: '', password: '' });
    const [allStudents, setAllStudents] = useState([]);
    const [viewTab, setViewTab] = useState('batches');
    const [studentSearchQuery, setStudentSearchQuery] = useState('');
    const [studentPage, setStudentPage] = useState(1);
    const [studentPagination, setStudentPagination] = useState({ count: 0, next: null, previous: null });

    // Wise ID Linking State
    const [isWiseLinkModalOpen, setIsWiseLinkModalOpen] = useState(false);
    const [wiseLinkStudent, setWiseLinkStudent] = useState(null);
    const [wiseIdInput, setWiseIdInput] = useState('');
    const [unassignedPage, setUnassignedPage] = useState(1);
    const [unassignedPagination, setUnassignedPagination] = useState({ count: 0, next: null, previous: null });

    // Selection state for Create Modal
    const [selectedProgramId, setSelectedProgramId] = useState('');
    const [selectedSubProgramId, setSelectedSubProgramId] = useState('');

    // Form Data for New Batch
    const [newBatch, setNewBatch] = useState({
        name: '',
        course: '',
        start_date: '',
        end_date: '',
        secondary_mentors: []
    });
    const [isEditMode, setIsEditMode] = useState(false);

    useEffect(() => {
        if (selectedStudentProfile) {
            fetchStudentLmsData(selectedStudentProfile.id);
        } else {
            setStudentLmsData(null);
        }
    }, [selectedStudentProfile]);

    const fetchStudentLmsData = async (studentId) => {
        try {
            const res = await api.get(`integrations/details/?student_id=${studentId}`);
            setStudentLmsData(res.data);
        } catch (err) {
            console.error("Failed to fetch student LMS data", err);
        }
    };

    useEffect(() => {
        // Redundant fetchUser removed, using authUser from context
        fetchBatches();
        fetchMeta();
    }, [batchPage]); // Re-fetch batches when page changes

    useEffect(() => {
        if (viewTab === 'all-students') {
            fetchStudentsWithPagination();
        }
    }, [viewTab, studentPage]);

    // Handle search with debounce
    useEffect(() => {
        if (viewTab === 'all-students') {
            const timer = setTimeout(() => {
                setStudentPage(1); // Reset to page 1 on search
                fetchStudentsWithPagination();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [studentSearchQuery]);

    const fetchStudentsWithPagination = async () => {
        try {
            setLoading(true);
            const res = await api.get(`students/?page=${studentPage}&search=${studentSearchQuery}`);
            const data = res.data;
            if (data.results) {
                setAllStudents(data.results);
                setStudentPagination({
                    count: data.count,
                    next: data.next,
                    previous: data.previous
                });
            } else {
                setAllStudents(Array.isArray(data) ? data : []);
                setStudentPagination({ count: Array.isArray(data) ? data.length : 0, next: null, previous: null });
            }
        } catch (err) {
            console.error("Failed to fetch all students", err);
        } finally {
            setLoading(false);
        }
    };

    // fetchUser removed as we use useAuth()


    const fetchBatches = async () => {
        try {
            const res = await api.get(`batches/?page=${batchPage}`);
            if (res.data.results) {
                setBatches(res.data.results);
                setBatchPagination({
                    count: res.data.count,
                    next: res.data.next,
                    previous: res.data.previous
                });
            } else {
                setBatches(Array.isArray(res.data) ? res.data : []);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const fetchMeta = async () => {
        try {
            const [progRes, mentorRes] = await Promise.all([
                api.get('programs/'),
                api.get('auth/mentors/')
            ]);
            setPrograms(progRes.data);
            setMentors(mentorRes.data);
        } catch (err) {
            console.error(err);
        }
    };

    // Cascading effects for creation
    useEffect(() => {
        if (selectedProgramId) {
            fetchSubPrograms(selectedProgramId);
            setSelectedSubProgramId('');
            setNewBatch(prev => ({ ...prev, course: '' }));
        } else {
            setSubPrograms([]);
            setCourses([]);
        }
    }, [selectedProgramId]);

    useEffect(() => {
        if (selectedSubProgramId) {
            fetchCourses(selectedSubProgramId);
            setNewBatch(prev => ({ ...prev, course: '' }));
        } else {
            setCourses([]);
        }
    }, [selectedSubProgramId]);

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

    const handleBatchClick = async (batch) => {
        setSelectedBatch(batch);
        setLoading(true);
        try {
            const res = await api.get(`students/?batch=${batch.id}`);
            setStudentsInBatch(res.data?.results || res.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };


    const handleEditBatch = () => {
        setNewBatch({
            name: selectedBatch.name,
            course: selectedBatch.course,
            start_date: selectedBatch.start_date,
            end_date: selectedBatch.end_date,
            secondary_mentors: selectedBatch.secondary_mentors || []
        });
        setIsEditMode(true);
        setIsCreateModalOpen(true);
    };

    const handleSaveBatch = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...newBatch,
                primary_mentor: isEditMode ? selectedBatch.primary_mentor : authUser.id
            };

            if (isEditMode) {
                await api.patch(`batches/${selectedBatch.id}/`, payload);
                alert("Batch updated successfully");
            } else {
                await api.post('batches/', payload);
                alert("Batch created successfully");
            }

            setIsCreateModalOpen(false);
            setIsEditMode(false);
            fetchBatches();

            // Refresh selected batch if we are editing it
            if (isEditMode && selectedBatch) {
                // We need to fetch the updated batch details or just update local state partially
                // Ideally fetch the specific batch again
                const res = await api.get(`batches/${selectedBatch.id}/`);
                setSelectedBatch(res.data);
            }

            setNewBatch({ name: '', course: '', start_date: '', end_date: '', secondary_mentors: [] });
            setSelectedProgramId('');
            setSelectedSubProgramId('');
        } catch (err) {
            console.error("Failed to save batch", err);
            alert("Failed to save batch");
        }
    };

    const fetchUnassignedStudents = async () => {
        try {
            setLoading(true);
            const res = await api.get(`students/?unassigned=true&page=${unassignedPage}`);
            const data = res.data;
            if (data.results) {
                setUnassignedStudents(data.results);
                setUnassignedPagination({
                    count: data.count,
                    next: data.next,
                    previous: data.previous
                });
            } else {
                setUnassignedStudents(Array.isArray(data) ? data : []);
                setUnassignedPagination({ count: data.length, next: null, previous: null });
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isAddStudentModalOpen) {
            fetchUnassignedStudents();
        }
    }, [unassignedPage, isAddStudentModalOpen]);

    const openAddStudentModal = () => {
        setIsAddStudentModalOpen(true);
        fetchUnassignedStudents();
    };

    const addStudentToBatch = async (studentId) => {
        if (!selectedBatch) return;
        try {
            await api.post(`batches/${selectedBatch.id}/add_student/`, { student_id: studentId });
            // Refresh list
            const res = await api.get(`students/?batch=${selectedBatch.id}`);
            setStudentsInBatch(res.data?.results || res.data || []);
            setIsAddStudentModalOpen(false);
        } catch (err) {
            console.error(err);
            alert("Failed to add student");
        }
    };

    const removeStudentFromBatch = async (studentId) => {
        if (!selectedBatch || !window.confirm("Remove student from batch?")) return;
        try {
            await api.post(`batches/${selectedBatch.id}/remove_student/`, { student_id: studentId });
            // Refresh list
            const res = await api.get(`students/?batch=${selectedBatch.id}`);
            setStudentsInBatch(res.data?.results || res.data || []);
        } catch (err) {
            console.error(err);
            alert("Failed to remove student");
        }
    };

    const handleSetCredentials = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.post(`students/${credentialStudent.id}/set_credentials/`, credentialForm);
            alert("Credentials updated successfully");
            setIsCredentialsModalOpen(false);
            setCredentialForm({ username: '', password: '' });
        } catch (err) {
            console.error(err);
            alert(err.response?.data?.error || "Failed to update credentials");
        } finally {
            setLoading(false);
        }
    };

    // Open Wise Link Modal - Auto Link with Manual Fallback
    const handleWiseLinkClick = async (student) => {
        if (!student.mobile) {
            alert("Student has no mobile number for lookup.");
            setWiseLinkStudent(student);
            setWiseIdInput('');
            setIsWiseLinkModalOpen(true);
            return;
        }

        const confirmLink = window.confirm(`Attempt to auto-link ${student.first_name} with Wise LMS using phone number ${student.mobile}? \n\nClick Cancel to enter Wise ID manually.`);

        if (!confirmLink) {
            // Manual Link Trigger
            setWiseLinkStudent(student);
            setWiseIdInput(student.lms_student_id || '');
            setIsWiseLinkModalOpen(true);
            return;
        }

        setLoading(true);
        try {
            // Using the new auto-link endpoint
            const res = await api.post('/integrations/link-student/', {
                student_id: student.id
            });

            if (res.data.success) {
                alert(res.data.message);
                // Refresh list
                if (viewTab === 'batches' && selectedBatch) {
                    handleBatchClick(selectedBatch);
                } else {
                    fetchStudentsWithPagination();
                }
            }
        } catch (error) {
            console.error("Wise Link Error:", error);
            const errorMsg = error.response?.data?.error || "Failed to link student.";

            // Ask for manual fallback on failure
            if (window.confirm(`${errorMsg}\n\nWould you like to link manually by entering the Wise ID?`)) {
                setWiseLinkStudent(student);
                setWiseIdInput('');
                setIsWiseLinkModalOpen(true);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSaveWiseId = async (e) => {
        e.preventDefault();
        if (!wiseLinkStudent || !wiseIdInput) return;
        setLoading(true);
        try {
            await api.patch(`students/${wiseLinkStudent.id}/`, { lms_student_id: wiseIdInput });
            alert('Wise ID linked successfully!');
            setIsWiseLinkModalOpen(false);
            setWiseIdInput('');
            if (viewTab === 'batches' && selectedBatch) {
                handleBatchClick(selectedBatch);
            } else {
                fetchStudentsWithPagination();
            }
        } catch (err) {
            console.error('Failed to link Wise ID', err);
            alert(err.response?.data?.error || 'Failed to link Wise ID');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full bg-slate-50 font-sans text-slate-900 pb-10">
            {/* Top Minimal Navigation */}
            <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                <div>
                    <h1 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
                        Mentor Dashboard
                    </h1>
                    <p className="text-slate-500 font-medium text-sm mt-1">Manage your batches and track student progress.</p>
                </div>

                <div className="flex flex-col md:flex-row bg-slate-100 p-1.5 rounded-2xl w-full md:w-auto gap-2 md:gap-0">
                    <button
                        onClick={() => { setViewTab('batches'); setSelectedBatch(null); }}
                        className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${viewTab === 'batches' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Batches
                    </button>
                    <button
                        onClick={() => { setViewTab('all-students'); setSelectedBatch(null); }}
                        className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${viewTab === 'all-students' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Full Student List
                    </button>
                </div>

                {!selectedBatch && viewTab === 'batches' && (
                    <button
                        onClick={() => {
                            setNewBatch({ name: '', course: '', start_date: '', end_date: '', secondary_mentors: [] });
                            setIsEditMode(false);
                            setIsCreateModalOpen(true);
                        }}
                        className="w-full md:w-auto px-6 py-3 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all font-bold"
                    >
                        + Create Batch
                    </button>
                )}
                {selectedBatch && (
                    <button
                        onClick={() => setSelectedBatch(null)}
                        className="text-slate-500 hover:text-indigo-600 font-bold flex items-center gap-2 transition-colors px-4 py-2 bg-slate-50 rounded-xl"
                    >
                        <span className="text-lg">←</span> Back
                    </button>
                )}
            </div>

            {/* Content Logic */}
            {viewTab === 'all-students' && !selectedBatch ? (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">All Students</h2>
                                <p className="text-sm text-slate-500">Showing {allStudents.length} students across all programs</p>
                            </div>
                            <div className="relative w-full md:w-80">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="text"
                                    placeholder="Search by name, ID or mobile..."
                                    className="w-full pl-11 pr-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all text-sm"
                                    value={studentSearchQuery}
                                    onChange={(e) => setStudentSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full border-separate border-spacing-y-3">
                                <thead>
                                    <tr className="text-left">
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Student</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Program</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Batch</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allStudents.map((student) => (
                                        <tr key={student.id} className="group hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-5 bg-white border-y border-l border-slate-100 rounded-l-2xl first:border-l">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-sm">
                                                        {student.first_name?.[0]}{student.last_name?.[0] || ''}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-slate-800">{student.first_name} {student.last_name}</div>
                                                        <div className="text-xs text-slate-400">{student.crm_student_id}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 bg-white border-y border-slate-100 text-center">
                                                <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase">
                                                    {student.program_name}
                                                </span>
                                            </td>
                                            <td className="px-6 py-5 bg-white border-y border-slate-100 text-center text-sm font-medium text-slate-600">
                                                {student.batch_name || <span className="text-slate-300 italic">Unassigned</span>}
                                            </td>
                                            <td className="px-6 py-5 bg-white border-y border-r border-slate-100 rounded-r-2xl text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => handleWiseLinkClick(student)}
                                                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${student.lms_student_id ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-600'}`}
                                                    >
                                                        {student.lms_student_id ? 'Linked' : 'Link Wise'}
                                                    </button>
                                                    <button
                                                        onClick={() => setSelectedStudentProfile(student)}
                                                        className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 transition-all shadow-sm"
                                                    >
                                                        View Profile
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {allStudents.length === 0 && (
                                        <tr>
                                            <td colSpan="4" className="text-center py-10 text-slate-400">
                                                No students found matching your search.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Controls */}
                        <div className="mt-8 flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-200">
                            <span className="text-sm text-slate-500 font-medium">
                                Showing <span className="text-slate-900 font-bold">{allStudents.length}</span> of <span className="text-slate-900 font-bold">{studentPagination.count}</span> students
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setStudentPage(p => Math.max(1, p - 1))}
                                    disabled={!studentPagination.previous || loading}
                                    className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all"
                                >
                                    Previous
                                </button>
                                <button
                                    onClick={() => setStudentPage(p => p + 1)}
                                    disabled={!studentPagination.next || loading}
                                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 shadow-md shadow-indigo-100 disabled:opacity-50 transition-all"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            ) : null}

            {viewTab === 'batches' && (
                !selectedBatch ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {batches.map(batch => (
                            <motion.div
                                whileHover={{ y: -4 }}
                                key={batch.id}
                                onClick={() => handleBatchClick(batch)}
                                className="p-8 bg-white rounded-2xl border border-slate-200 cursor-pointer shadow-sm hover:shadow-xl transition-all group"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="text-xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{batch.name}</h3>
                                    <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider">
                                        Active
                                    </div>
                                </div>

                                <div className="text-slate-500 text-sm space-y-3">
                                    <div className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 bg-slate-300 rounded-full"></span>
                                        <span>Course: <span className="font-medium text-slate-700">{batch.course_name || 'N/A'}</span></span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 bg-slate-300 rounded-full"></span>
                                        <span>Students: <span className="font-medium text-slate-700">{batch.student_count || 0}</span></span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 bg-slate-300 rounded-full"></span>
                                        <span>Primary: <span className="font-medium text-slate-700">{batch.primary_mentor_details?.username || 'None'}</span></span>
                                    </div>
                                </div>
                            </motion.div>
                        ))}

                        {/* Batch Pagination */}
                        <div className="col-span-full mt-4 flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                            <span className="text-sm text-slate-500 font-medium">
                                Showing <span className="text-slate-900 font-bold">{batches.length}</span> of <span className="text-slate-900 font-bold">{batchPagination.count}</span> batches
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setBatchPage(p => Math.max(1, p - 1))}
                                    disabled={!batchPagination.previous}
                                    className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition-all"
                                >
                                    Previous
                                </button>
                                <button
                                    onClick={() => setBatchPage(p => p + 1)}
                                    disabled={!batchPagination.next}
                                    className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 transition-all"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                        {batches.length === 0 && (
                            <div className="col-span-full text-center text-slate-400 py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                                <p className="text-lg">No batches found. Create one to get started.</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6 animate-fadeIn">
                        {/* Batch Details Header */}
                        <div className="p-8 bg-white rounded-2xl border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h2 className="text-3xl font-bold text-slate-900 mb-2">{selectedBatch.name}</h2>
                                    <p className="text-slate-500 text-lg">{selectedBatch.course_name}</p>
                                </div>
                                <button
                                    onClick={openAddStudentModal}
                                    className="px-5 py-2.5 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2"
                                >
                                    <span className="text-lg">+</span> Add Student
                                </button>
                                <button
                                    onClick={handleEditBatch}
                                    className="px-5 py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2"
                                >
                                    <Edit size={16} /> Edit Batch
                                </button>
                            </div>
                            <div className="flex gap-8 pt-6 border-t border-slate-100">
                                <div>
                                    <span className="block text-slate-400 text-xs uppercase tracking-wider font-semibold mb-1">Start Date</span>
                                    <span className="text-slate-900 font-medium">{selectedBatch.start_date}</span>
                                </div>
                                <div>
                                    <span className="block text-slate-400 text-xs uppercase tracking-wider font-semibold mb-1">Total Students</span>
                                    <span className="text-slate-900 font-medium">{studentsInBatch.length}</span>
                                </div>
                            </div>
                        </div>

                        {/* Student List Table */}
                        <div className="bg-white rounded-2xl overflow-x-auto border border-slate-200 shadow-sm">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="p-5 font-semibold text-slate-500 text-sm">Student Name</th>
                                        <th className="p-5 font-semibold text-slate-500 text-sm">Email</th>
                                        <th className="p-5 font-semibold text-slate-500 text-sm">Mobile</th>
                                        <th className="p-5 font-semibold text-slate-500 text-sm text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {studentsInBatch.map((student, idx) => (
                                        <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="p-5">
                                                <div className="font-medium text-slate-900">{student.first_name} {student.last_name}</div>
                                            </td>
                                            <td className="p-5 text-slate-500">{student.email}</td>
                                            <td className="p-5 text-slate-500">{student.mobile}</td>
                                            <td className="p-5 text-right flex items-center justify-end gap-3">
                                                <button
                                                    onClick={() => handleWiseLinkClick(student)}
                                                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${student.lms_student_id ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-600'}`}
                                                >
                                                    {student.lms_student_id ? 'Linked' : 'Link Wise'}
                                                </button>
                                                <button
                                                    onClick={() => setSelectedStudentProfile(student)}
                                                    className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all flex items-center gap-2"
                                                >
                                                    <FileText size={14} />
                                                    Profile
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setCredentialStudent(student);
                                                        setCredentialForm({ username: student.username || '', password: '' });
                                                        setIsCredentialsModalOpen(true);
                                                    }}
                                                    className="px-4 py-2 bg-amber-50 text-amber-600 rounded-xl text-xs font-bold hover:bg-amber-100 transition-all flex items-center gap-2"
                                                >
                                                    <Key size={14} />
                                                    Set Login
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); removeStudentFromBatch(student.id); }}
                                                    className="text-red-500 hover:text-red-700 text-sm font-medium px-4 py-2 rounded-xl hover:bg-red-50 transition-colors"
                                                >
                                                    Remove
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {studentsInBatch.length === 0 && (
                                        <tr>
                                            <td colSpan="4" className="p-12 text-center text-slate-400">
                                                No students assigned to this batch yet.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            )}

            {/* Create Batch Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl"
                    >
                        <h2 className="text-2xl font-bold mb-6 text-slate-900">{isEditMode ? 'Edit Batch' : 'Create New Batch'}</h2>
                        <form onSubmit={handleSaveBatch} className="space-y-5">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Batch Name</label>
                                <input
                                    className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                    value={newBatch.name}
                                    onChange={e => setNewBatch({ ...newBatch, name: e.target.value })}
                                    required
                                    placeholder="e.g., Summer 2026 Batch A"
                                />
                            </div>
                            {isEditMode ? (
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Program & Course</label>
                                    <div className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 font-medium">
                                        {selectedBatch?.course_name || 'Loading...'}
                                    </div>
                                    <p className="text-xs text-slate-400 mt-1">Course details cannot be changed for an active batch.</p>
                                </div>
                            ) : (
                                <>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Program</label>
                                        <select
                                            className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                            value={selectedProgramId}
                                            onChange={e => setSelectedProgramId(e.target.value)}
                                            required={!isEditMode}
                                            disabled={isEditMode}
                                        >
                                            <option value="">Select Program</option>
                                            {programs.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                        {isEditMode && <p className="text-xs text-slate-400 mt-1">Course selection cannot be changed while editing.</p>}
                                    </div>

                                    {(selectedProgramId || isEditMode) && (
                                        <div className="animate-fadeIn">
                                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Sub-Program / Category</label>
                                            <select
                                                className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                                value={selectedSubProgramId}
                                                onChange={e => setSelectedSubProgramId(e.target.value)}
                                                required={!isEditMode}
                                                disabled={isEditMode}
                                            >
                                                <option value="">Select Category</option>
                                                {subPrograms.map(sp => (
                                                    <option key={sp.id} value={sp.id}>{sp.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Course</label>
                                        <select
                                            className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                            value={newBatch.course}
                                            onChange={e => setNewBatch({ ...newBatch, course: e.target.value })}
                                            required
                                            disabled={(!selectedSubProgramId && subPrograms.length > 0) || isEditMode}
                                        >
                                            <option value="">Select Course</option>
                                            {courses.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Start Date</label>
                                    <input
                                        type="date"
                                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                        value={newBatch.start_date}
                                        onChange={e => setNewBatch({ ...newBatch, start_date: e.target.value })}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">End Date</label>
                                    <input
                                        type="date"
                                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                        value={newBatch.end_date}
                                        onChange={e => setNewBatch({ ...newBatch, end_date: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Secondary Mentors (Optional)</label>
                                <div className="p-3 border border-slate-200 rounded-xl bg-slate-50 max-h-40 overflow-y-auto custom-scrollbar">
                                    <div className="space-y-2">
                                        {mentors
                                            .filter(m => m.id !== authUser?.id) // Exclude self
                                            .map(mentor => (
                                                <label key={mentor.id} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-slate-100 cursor-pointer hover:border-indigo-200 transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        value={mentor.id}
                                                        checked={newBatch.secondary_mentors.includes(mentor.id)}
                                                        onChange={(e) => {
                                                            const id = parseInt(e.target.value);
                                                            setNewBatch(prev => {
                                                                const current = prev.secondary_mentors;
                                                                return {
                                                                    ...prev,
                                                                    secondary_mentors: e.target.checked
                                                                        ? [...current, id]
                                                                        : current.filter(existingId => existingId !== id)
                                                                };
                                                            });
                                                        }}
                                                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
                                                    />
                                                    <div>
                                                        <div className="text-sm font-medium text-slate-700">{mentor.first_name} {mentor.last_name}</div>
                                                        <div className="text-xs text-slate-400">@{mentor.username}</div>
                                                    </div>
                                                </label>
                                            ))}
                                        {mentors.filter(m => m.id !== authUser?.id).length === 0 && (
                                            <p className="text-sm text-slate-400 text-center py-2">No other mentors available</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={() => { setIsCreateModalOpen(false); setIsEditMode(false); }} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition-colors">Cancel</button>
                                <button type="submit" className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all">
                                    {isEditMode ? 'Update Batch' : 'Create Batch'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}

            {/* Add Student Modal */}
            {isAddStudentModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl h-[80vh] flex flex-col"
                    >
                        <h2 className="text-xl font-bold mb-4 text-slate-900">Add Student to Batch</h2>
                        <div className="overflow-y-auto flex-1 space-y-2 pr-2 custom-scrollbar">
                            {unassignedStudents.length === 0 ? (
                                <p className="text-slate-500 text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">No unassigned students found.</p>
                            ) : (
                                unassignedStudents.map(student => (
                                    <div key={student.id} className="flex justify-between items-center p-4 bg-white border border-slate-100 rounded-xl hover:border-indigo-300 hover:shadow-md transition-all">
                                        <div>
                                            <p className="font-bold text-slate-800">{student.first_name} {student.last_name}</p>
                                            <p className="text-sm text-slate-500">{student.email}</p>
                                        </div>
                                        <button
                                            onClick={() => addStudentToBatch(student.id)}
                                            className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 text-sm font-semibold transition-colors"
                                        >
                                            Add
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Pagination for Modal */}
                        {unassignedPagination.count > 0 && (
                            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100 mt-4">
                                <span className="text-xs text-slate-500 font-medium">
                                    Total: <b>{unassignedPagination.count}</b> (Page {unassignedPage})
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setUnassignedPage(p => Math.max(1, p - 1))}
                                        disabled={!unassignedPagination.previous || loading}
                                        className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold disabled:opacity-50"
                                    >
                                        Prev
                                    </button>
                                    <button
                                        onClick={() => setUnassignedPage(p => p + 1)}
                                        disabled={!unassignedPagination.next || loading}
                                        className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold disabled:opacity-50"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="pt-6 mt-2 border-t border-slate-100">
                            <button onClick={() => setIsAddStudentModalOpen(false)} className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-colors">Close</button>
                        </div>
                    </motion.div>
                </div>
            )}
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
                            <button
                                onClick={() => setSelectedStudentProfile(null)}
                                className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Enrollment Details */}
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
                                        <p className="text-xs text-slate-500 mb-1">Course (CRM)</p>
                                        <p className="font-bold text-slate-800">{selectedStudentProfile.course_name || '-'}</p>
                                    </div>
                                    {studentLmsData?.enrolled_courses?.length > 0 && (
                                        <div className="col-span-2 md:col-span-1">
                                            <p className="text-xs text-slate-500 mb-1">Wise LMS Courses</p>
                                            <div className="flex flex-wrap gap-2 mt-1">
                                                {studentLmsData.enrolled_courses.map(course => (
                                                    <span key={course.id} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold">
                                                        {course.name}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* LMS / Finance info */}
                            <div className="md:col-span-2 bg-gradient-to-br from-slate-900 to-indigo-950 p-7 rounded-3xl text-white shadow-xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                                    <Key size={120} />
                                </div>
                                <div className="relative z-10">
                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-300">Wise LMS Integration</h3>
                                        <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-white/60">Live Feed</span>
                                    </div>

                                    {studentLmsData ? (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                            <div className="space-y-4">
                                                <div>
                                                    <p className="text-xs text-indigo-300/60 font-bold uppercase mb-1">Total Fee</p>
                                                    <p className="text-2xl font-black">₹{studentLmsData.fee_details?.total_fee?.toLocaleString()}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-indigo-300/60 font-bold uppercase mb-1">Due Amount</p>
                                                    <p className={`text-xl font-bold ${studentLmsData.fee_details?.due_fee > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                        ₹{studentLmsData.fee_details?.due_fee?.toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <div>
                                                    <p className="text-xs text-indigo-300/60 font-bold uppercase mb-1">Attendance</p>
                                                    <div className="flex items-end gap-2">
                                                        <p className="text-3xl font-black text-white">{studentLmsData.attendance}%</p>
                                                        <p className="text-[10px] text-white/40 mb-1 mb-1">Monthly</p>
                                                    </div>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-indigo-300/60 font-bold uppercase mb-1">Next Due Date</p>
                                                    <p className="text-sm font-bold text-white/80">{studentLmsData.fee_details?.next_due_date || 'N/A'}</p>
                                                </div>
                                            </div>

                                            <div>
                                                <p className="text-xs text-indigo-300/60 font-bold uppercase mb-3">Course Progress</p>
                                                <div className="text-4xl font-black text-indigo-400 mb-2">{studentLmsData.course_progress}%</div>
                                                <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                                                    <div
                                                        className="bg-indigo-400 h-full rounded-full transition-all duration-1000"
                                                        style={{ width: `${studentLmsData.course_progress}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="py-6 text-center text-white/40 text-sm italic font-medium">
                                            {selectedStudentProfile.lms_student_id ? "Connecting to Wise LMS..." : "No Wise ID linked to this student."}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Contact Info */}
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

                            {/* Dynamic Fields */}
                            <div className="md:col-span-2">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Application Form Details</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white border border-slate-100 p-6 rounded-2xl">
                                    {selectedStudentProfile.dynamic_values_list?.length > 0 ? (
                                        selectedStudentProfile.dynamic_values_list.map((val) => (
                                            <div key={val.id}>
                                                <p className="text-xs text-slate-500 mb-1">{val.field_label}</p>
                                                <p className="font-medium text-slate-800">{val.value || '-'}</p>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-slate-400 text-sm italic col-span-2">No custom fields filled.</p>
                                    )}
                                </div>
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
            {/* Credentials Modal */}
            {isCredentialsModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl"
                    >
                        <h2 className="text-xl font-bold mb-2 text-slate-900 flex items-center gap-2">
                            <Key className="text-amber-500" size={24} />
                            Set Student Login
                        </h2>
                        <p className="text-sm text-slate-500 mb-6">Set username and password for <b>{credentialStudent?.first_name} {credentialStudent?.last_name}</b></p>

                        <form onSubmit={handleSetCredentials} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Username</label>
                                <input
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-indigo-500 outline-none transition-all text-sm"
                                    value={credentialForm.username}
                                    onChange={e => setCredentialForm({ ...credentialForm, username: e.target.value })}
                                    required
                                    placeholder="Username"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Password</label>
                                <input
                                    type="password"
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-indigo-500 outline-none transition-all text-sm"
                                    value={credentialForm.password}
                                    onChange={e => setCredentialForm({ ...credentialForm, password: e.target.value })}
                                    required
                                    placeholder="Enter new password"
                                />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsCredentialsModalOpen(false)}
                                    className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold shadow-lg shadow-amber-100 hover:shadow-amber-200 transition-all disabled:opacity-50"
                                >
                                    {loading ? "Updating..." : "Save Credentials"}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}

            {/* Wise ID Linking Modal */}
            {isWiseLinkModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[80]">
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl"
                    >
                        <h2 className="text-xl font-bold mb-2 text-slate-900 flex items-center gap-2">
                            🔗 Link Wise LMS ID
                        </h2>
                        <p className="text-sm text-slate-500 mb-6">
                            Manually enter the Wise User UUID for <b>{wiseLinkStudent?.first_name}</b>.
                            <br />
                            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded mt-1 inline-block">
                                ⚠️ Only use this if Auto-Link fails.
                            </span>
                        </p>

                        <form onSubmit={handleSaveWiseId} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Wise User ID (UUID)</label>
                                <input
                                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-indigo-500 outline-none transition-all font-mono text-sm"
                                    value={wiseIdInput}
                                    onChange={e => setWiseIdInput(e.target.value)}
                                    placeholder="e.g. 66a1b2c3d4e5f6..."
                                    required
                                />
                                <p className="text-xs text-slate-400 mt-2">
                                    Find this in Wise Dashboard &gt; Users &gt; Select User &gt; URL or ID field.
                                </p>
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsWiseLinkModalOpen(false)}
                                    className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-indigo-600 transition-all shadow-lg disabled:opacity-50"
                                >
                                    {loading ? "Linking..." : "Link ID"}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
            {/* Wise ID Linking Modal */}
            {/* Wise Link Modal Removed - Using Auto-Link Alert/Confirm flow for now */}
        </div>
    );
}

export default MentorModule;
