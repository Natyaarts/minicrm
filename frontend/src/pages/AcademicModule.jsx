import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { RefreshCw, Plus, Search, Calendar, Users, GraduationCap, ChevronRight, UserCheck, Link2 } from 'lucide-react';

const AcademicModule = () => {
    const [batches, setBatches] = useState([]);
    const [batchPagination, setBatchPagination] = useState({ count: 0, next: null, previous: null });
    const [batchPage, setBatchPage] = useState(1);
    const [batchSearch, setBatchSearch] = useState('');

    const [mentors, setMentors] = useState([]);
    const [mentorPagination, setMentorPagination] = useState({ count: 0, next: null, previous: null });
    const [mentorPage, setMentorPage] = useState(1);

    const [teachers, setTeachers] = useState([]);
    const [teacherPagination, setTeacherPagination] = useState({ count: 0, next: null, previous: null });
    const [teacherPage, setTeacherPage] = useState(1);
    const [teacherSearch, setTeacherSearch] = useState('');

    const [students, setStudents] = useState([]);
    const [stats, setStats] = useState({ totalStudents: 0, totalBatches: 0, totalMentors: 0, totalTeachers: 0 });

    const [activeTab, setActiveTab] = useState('overview');
    const [wiseCourses, setWiseCourses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [studentPage, setStudentPage] = useState(1);
    const [studentPagination, setStudentPagination] = useState({ count: 0, next: null, previous: null });

    // Modals state
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [selectedStudentProfile, setSelectedStudentProfile] = useState(null);
    const [feeData, setFeeData] = useState(null);
    const [feeLoading, setFeeLoading] = useState(false);

    const [showAddTeacher, setShowAddTeacher] = useState(false);
    const [editingBatch, setEditingBatch] = useState(null);
    const [newTeacher, setNewTeacher] = useState({ username: '', first_name: '', last_name: '', email: '', phone_number: '', password: '' });
    
    const [selectedBatchId, setSelectedBatchId] = useState('');
    const [completingProfile, setCompletingProfile] = useState(null);
    const [academicFields, setAcademicFields] = useState([]);
    const [academicValues, setAcademicValues] = useState({});
    const [savingCompletion, setSavingCompletion] = useState(false);
    
    const [resettingTeacher, setResettingTeacher] = useState(null);
    const [newPassword, setNewPassword] = useState('');
    
    const [assigningTeacher, setAssigningTeacher] = useState(null);
    const [assignBatchSearch, setAssignBatchSearch] = useState('');

    useEffect(() => {
        fetchInitialData();
    }, [batchPage, batchSearch, mentorPage, teacherPage, teacherSearch]);

    const fetchTeachers = async () => {
        try {
            const res = await api.get(`auth/management/teachers/?page=${teacherPage}&search=${teacherSearch}`);
            setTeachers(res.data.results || res.data);
            setTeacherPagination({
                count: res.data.count || (res.data.results || res.data).length,
                next: res.data.next,
                previous: res.data.previous
            });
            setStats(prev => ({ ...prev, totalTeachers: res.data.count || (res.data.results || res.data).length }));
        } catch (err) {
            console.error("Failed to fetch teachers", err);
        }
    };

    useEffect(() => {
        fetchStudents();
    }, [studentPage, searchTerm, selectedBatchId]);

    const fetchWiseCourses = async () => {
        try {
            setLoading(true);
            const res = await api.get('integrations/courses/?type=ALL');
            setWiseCourses(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const syncWiseBatch = async (courseId) => {
        if (!window.confirm("This will create a new Batch in CRM and import all students from Wise LMS. Proceed?")) return;
        try {
            setLoading(true);
            const res = await api.post('integrations/sync-batch/', { class_id: courseId });
            alert(res.data.message);
            setActiveTab('batches');
            fetchInitialData();
        } catch (err) {
            console.error(err);
            alert("Sync failed: " + (err.response?.data?.error || "Unknown error"));
        } finally {
            setLoading(false);
        }
    };

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            // Fetch batches with pagination and search
            try {
                const batchRes = await api.get(`batches/?page=${batchPage}&search=${batchSearch}`);
                const bData = batchRes.data.results || batchRes.data;
                setBatches(bData);
                setBatchPagination({
                    count: batchRes.data.count || bData.length,
                    next: batchRes.data.next,
                    previous: batchRes.data.previous
                });
                setStats(prev => ({ ...prev, totalBatches: batchRes.data.count || bData.length }));
            } catch (err) { console.error("Batch fetch failed", err); }

            // Fetch mentors
            try {
                const mentorRes = await api.get(`auth/mentors/?page=${mentorPage}`);
                const mData = mentorRes.data.results || mentorRes.data;
                setMentors(mData);
                setMentorPagination({
                    count: mentorRes.data.count || mData.length,
                    next: mentorRes.data.next,
                    previous: mentorRes.data.previous
                });
                setStats(prev => ({ ...prev, totalMentors: mentorRes.data.count || mData.length }));
            } catch (err) { console.error("Mentor fetch failed", err); }

            // Fetch teachers
            await fetchTeachers();

        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchStudents = async () => {
        try {
            setLoading(true);
            let url = `students/?page=${studentPage}&search=${searchTerm}`;
            if (selectedBatchId) {
                url += `&batch=${selectedBatchId}`;
            }
            const res = await api.get(url);
            const data = res.data;
            if (data.results) {
                setStudents(data.results);
                setStudentPagination({
                    count: data.count,
                    next: data.next,
                    previous: data.previous
                });
                if (!selectedBatchId && !searchTerm) {
                    setStats(prev => ({ ...prev, totalStudents: data.count }));
                }
            } else {
                setStudents(Array.isArray(data) ? data : []);
                const count = Array.isArray(data) ? data.length : 0;
                setStudentPagination({ count, next: null, previous: null });
                if (!selectedBatchId && !searchTerm) {
                    setStats(prev => ({ ...prev, totalStudents: count }));
                }
            }
        } catch (err) {
            console.error("Failed to fetch students", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Reset to page 1 when filter changes
        setStudentPage(1);
    }, [selectedBatchId, searchTerm]);

    const handleViewFees = async (student) => {
        setSelectedStudent(student);
        setFeeLoading(true);
        setFeeData(null);
        try {
            const res = await api.get(`integrations/details/?student_id=${student.id}`);
            setFeeData(res.data);
        } catch (err) {
            console.error("Failed to fetch fee data", err);
        } finally {
            setFeeLoading(false);
        }
    };
    
    const handleCompleteProfile = async (student) => {
        setCompletingProfile(student);
        setAcademicFields([]);
        setAcademicValues({});
        
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
        try {
            await api.patch(`students/${completingProfile.id}/`, {
                dynamic_values: JSON.stringify(academicValues)
            });
            setCompletingProfile(null);
            fetchStudents(); // Refresh to show updated data
        } catch (err) {
            console.error("Save failed", err);
            alert("Failed to save details.");
        } finally {
            setSavingCompletion(false);
        }
    };

    const handleAddTeacher = async (e) => {
        e.preventDefault();
        try {
            if (newTeacher.id) {
                // Remove password from update if empty
                const updateData = { ...newTeacher };
                if (!updateData.password) delete updateData.password;
                
                await api.patch(`auth/management/teachers/${newTeacher.id}/`, updateData);
                alert("Teacher updated successfully!");
            } else {
                await api.post('auth/management/teachers/', newTeacher);
                alert("Teacher added successfully!");
            }
            setShowAddTeacher(false);
            setNewTeacher({ username: '', first_name: '', last_name: '', email: '', phone_number: '', password: '', lms_teacher_id: '' });
            fetchTeachers();
        } catch (err) {
            console.error("Teacher action failed", err);
            alert("Action failed: " + (err.response?.data?.error || "Check if username/email already exists."));
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        try {
            await api.patch(`auth/management/teachers/${resettingTeacher.id}/`, { password: newPassword });
            setResettingTeacher(null);
            setNewPassword('');
            alert("Password updated successfully!");
        } catch (err) {
            console.error("Failed to reset password", err);
            alert("Failed to update password.");
        }
    };

    const handleAssignTeacher = async (batchId, teacherId) => {
        try {
            await api.patch(`batches/${batchId}/`, { teacher: teacherId });
            setEditingBatch(null);
            const res = await api.get('batches/');
            setBatches(res.data.results || res.data);
            fetchTeachers(); // Refresh teacher list to show new batch assignments
        } catch (err) {
            console.error("Failed to assign teacher", err);
        }
    };

    const renderOverview = () => (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-fadeIn">
            {/* Stats Cards */}
            <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-1.5">Total Students</div>
                <div className="text-3xl font-bold text-blue-600">{stats.totalStudents}</div>
            </div>
            <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-1.5">Active Batches</div>
                <div className="text-3xl font-bold text-purple-600">{stats.totalBatches}</div>
            </div>
            <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-1.5">Teachers</div>
                <div className="text-3xl font-bold text-teal-600">{stats.totalTeachers}</div>
            </div>
            <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-1.5">Mentors</div>
                <div className="text-3xl font-bold text-green-600">{stats.totalMentors}</div>
            </div>

            {/* Recent Batches Preview */}
            <div className="md:col-span-4 mt-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 px-1">Batch Overview</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {batches.slice(0, 6).map(batch => (
                        <div 
                            key={batch.id} 
                            onClick={() => {
                                setSelectedBatchId(batch.id);
                                setActiveTab('students');
                            }}
                            className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group"
                        >
                            <h4 className="font-semibold text-slate-900 text-base mb-0.5 group-hover:text-indigo-600 transition-colors">{batch.name}</h4>
                            <p className="text-xs text-slate-400 font-normal mb-3">{batch.course_name}</p>
                            <div className="flex flex-col gap-2.5 text-[11px] border-t border-slate-100 pt-3">
                                <div className="flex justify-between items-center text-slate-500">
                                    <span className="bg-slate-50 px-2 py-0.5 rounded text-slate-600 font-medium border border-slate-100">Students: {batch.student_count}</span>
                                    <span className="text-[10px] text-slate-400">Mentor: <span className="font-medium text-slate-600">
                                        {batch.primary_mentor_details ? (batch.primary_mentor_details.first_name || batch.primary_mentor_details.last_name ? `${batch.primary_mentor_details.first_name || ''} ${batch.primary_mentor_details.last_name || ''}`.trim() : batch.primary_mentor_details.username) : '-'}
                                    </span></span>
                                </div>
                                <div className="text-slate-500 flex items-center gap-1.5">
                                    <span>Teacher:</span>
                                    {batch.teacher_details?.username ? (
                                        <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100/50 text-indigo-600 rounded font-semibold text-[10px]">
                                            {batch.teacher_details.first_name || batch.teacher_details.last_name 
                                                ? `${batch.teacher_details.first_name || ''} ${batch.teacher_details.last_name || ''}`.trim() 
                                                : batch.teacher_details.username}
                                        </span>
                                    ) : (
                                        <span className="text-slate-400 italic font-normal">Not Assigned</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    const renderTeachers = () => (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 px-1">
                <h3 className="text-lg font-semibold text-slate-900">Faculty & Staff</h3>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-slate-400 w-3.5 h-3.5" />
                        <input
                            type="text"
                            placeholder="Search faculty..."
                            className="pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs w-48 focus:border-teal-500 outline-none transition-all shadow-sm font-medium"
                            value={teacherSearch}
                            onChange={e => setTeacherSearch(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={async () => {
                            setLoading(true);
                            try {
                                const res = await api.post('integrations/sync-attendance/');
                                alert(res.data.message || "Attendance synced successfully!");
                                fetchTeachers();
                            } catch (err) {
                                alert("Failed to sync attendance: " + (err.response?.data?.error || err.message));
                            } finally {
                                setLoading(false);
                            }
                        }}
                        className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100/85 text-indigo-600 rounded-lg font-semibold text-xs border border-indigo-100 transition-all flex items-center gap-1.5 shadow-sm"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        Sync Zoom Attendance
                    </button>
                    <button
                        onClick={async () => {
                            if (!window.confirm("This will import all teachers from Wise LMS and create accounts for them. Proceed?")) return;
                            setLoading(true);
                            try {
                                const res = await api.post('integrations/sync-teachers/');
                                alert(res.data.message || "Teachers imported successfully!");
                                fetchTeachers();
                            } catch (err) {
                                alert("Failed to import teachers: " + (err.response?.data?.error || err.message));
                            } finally {
                                setLoading(false);
                            }
                        }}
                        className="px-3.5 py-2 bg-teal-50 hover:bg-teal-100/85 text-teal-600 rounded-lg font-semibold text-xs border border-teal-100 transition-all flex items-center gap-1.5 shadow-sm"
                    >
                        <Users size={14} />
                        Import from Wise
                    </button>
                    <button
                        onClick={async () => {
                            if (!window.confirm("This will match CRM batches to Wise classes by name and assign teachers. Proceed?")) return;
                            setLoading(true);
                            try {
                                const res = await api.post('integrations/auto-link/');
                                alert(res.data.message || "Batches linked and teachers assigned!");
                                fetchTeachers();
                                fetchInitialData();
                            } catch (err) {
                                alert("Failed to auto-link: " + (err.response?.data?.error || err.message));
                            } finally {
                                setLoading(false);
                            }
                        }}
                        className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100/85 text-indigo-600 rounded-lg font-semibold text-xs border border-indigo-100 transition-all flex items-center gap-1.5 shadow-sm"
                    >
                        <Link2 size={14} />
                        Auto-Link Batches
                    </button>
                    <button
                        onClick={() => {
                            setNewTeacher({ username: '', first_name: '', last_name: '', email: '', phone_number: '', password: '', lms_teacher_id: '' });
                            setShowAddTeacher(true);
                        }}
                        className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold text-xs transition-all flex items-center gap-1.5 shadow-sm"
                    >
                        <Plus size={16} />
                        Add Teacher
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {teachers.map(teacher => (
                    <div key={teacher.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm group hover:border-teal-400 hover:shadow-md transition-all">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center text-teal-600 font-semibold text-lg border border-teal-100/30">
                                {teacher.first_name?.[0] || teacher.username[0].toUpperCase()}
                            </div>
                            <div>
                                <h4 className="font-semibold text-sm text-slate-900">{teacher.first_name} {teacher.last_name}</h4>
                                <p className="text-xs text-slate-400 font-mono">@{teacher.username}</p>
                            </div>
                        </div>
                        <div className="space-y-1.5 text-xs text-slate-500">
                            <div className="flex items-center gap-2">
                                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                                <span className="truncate">{teacher.email}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 bg-slate-50 border border-slate-200 rounded text-[9px] font-medium text-slate-500 uppercase">{teacher.role}</span>
                                {teacher.lms_teacher_id && (
                                    <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100/50 rounded text-[9px] font-medium text-indigo-600 uppercase flex items-center gap-1">
                                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                                        Linked
                                    </span>
                                )}
                            </div>
                            {teacher.lms_teacher_id && (
                                <div className="text-[10px] font-medium text-slate-400 pl-6">
                                    ID: {teacher.lms_teacher_id}
                                </div>
                            )}
                        </div>

                        {/* Assigned Batches List */}
                        <div className="mt-4 pt-3.5 border-t border-slate-100 flex justify-between items-start">
                            <div className="flex-1">
                                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Assigned Batches</p>
                                <div className="flex flex-wrap gap-1">
                                    {teacher.teacher_batches_details?.length > 0 ? (
                                        teacher.teacher_batches_details.map(b => (
                                            <span key={b.id} className="px-2 py-0.5 bg-indigo-50/50 text-indigo-600 rounded text-[9px] font-medium border border-indigo-100/50">
                                                {b.name}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-[10px] text-slate-400 italic">No batches</span>
                                    )}
                                </div>
                            </div>
                            <div className="text-right pl-4">
                                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Attendance</p>
                                <div className="text-lg font-bold text-emerald-600 leading-none">
                                    {teacher.total_classes_conducted || 0}
                                </div>
                                <p className="text-[8px] font-medium text-slate-400 uppercase mt-1">Classes Taken</p>
                            </div>
                        </div>

                        <div className="mt-4 pt-3.5 border-t border-slate-50 flex flex-wrap gap-1.5 justify-end">
                            <button
                                onClick={() => {
                                    setNewTeacher({
                                        id: teacher.id,
                                        username: teacher.username,
                                        first_name: teacher.first_name,
                                        last_name: teacher.last_name,
                                        email: teacher.email,
                                        phone_number: teacher.phone_number,
                                        lms_teacher_id: teacher.lms_teacher_id || '',
                                        password: ''
                                    });
                                    setShowAddTeacher(true);
                                }}
                                className="px-2 py-1 bg-white border border-slate-200 text-slate-600 rounded-md text-[9px] font-medium uppercase hover:bg-slate-50 transition-colors"
                            >
                                Edit Profile
                            </button>
                            <button
                                onClick={() => setResettingTeacher(teacher)}
                                className="px-2 py-1 bg-teal-50 border border-teal-150 text-teal-600 rounded-md text-[9px] font-medium uppercase hover:bg-teal-100 transition-colors"
                            >
                                Reset Pass
                            </button>
                            <button
                                onClick={() => setAssigningTeacher(teacher)}
                                className="px-2 py-1 bg-indigo-50 border border-indigo-150 text-indigo-600 rounded-md text-[9px] font-medium uppercase hover:bg-indigo-100 transition-colors"
                            >
                                Assign
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            {/* Teacher Pagination */}
            <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 mt-6 shadow-sm">
                <span className="text-xs text-slate-500 font-medium">
                    Showing {teachers.length} of {teacherPagination.count} Faculty
                </span>
                <div className="flex gap-2">
                    <button
                        onClick={() => setTeacherPage(p => Math.max(1, p - 1))}
                        disabled={!teacherPagination.previous}
                        className="px-3 py-1.5 rounded-md bg-white border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all"
                    >
                        Prev
                    </button>
                    <button
                        onClick={() => setTeacherPage(p => p + 1)}
                        disabled={!teacherPagination.next}
                        className="px-3 py-1.5 rounded-md bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 disabled:opacity-50 transition-all"
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );

    const renderBatches = () => (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex justify-between items-center px-1">
                <h3 className="text-lg font-semibold text-slate-900">All Batches</h3>
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-slate-400 w-3.5 h-3.5" />
                    <input
                        type="text"
                        placeholder="Search batches..."
                        className="pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs w-48 focus:border-indigo-500 outline-none transition-all shadow-sm font-medium"
                        value={batchSearch}
                        onChange={e => setBatchSearch(e.target.value)}
                    />
                </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="p-3.5 font-semibold text-slate-400 uppercase text-[10px] tracking-wider">Batch Name</th>
                            <th className="p-3.5 font-semibold text-slate-400 uppercase text-[10px] tracking-wider">Course</th>
                            <th className="p-3.5 font-semibold text-slate-400 uppercase text-[10px] tracking-wider">Primary Mentor</th>
                            <th className="p-3.5 font-semibold text-slate-400 uppercase text-[10px] tracking-wider">Assigned Teacher</th>
                            <th className="p-3.5 font-semibold text-slate-400 uppercase text-[10px] tracking-wider">Students</th>
                            <th className="p-3.5 font-semibold text-slate-400 uppercase text-[10px] tracking-wider">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                        {batches.map(batch => (
                            <tr key={batch.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="p-3.5 font-semibold text-slate-900 text-sm">{batch.name}</td>
                                <td className="p-3.5 text-slate-500 text-xs font-normal">{batch.course_name}</td>
                                <td className="p-3.5 text-slate-500 text-xs font-normal">
                                    {batch.primary_mentor_details 
                                        ? (batch.primary_mentor_details.first_name || batch.primary_mentor_details.last_name 
                                            ? `${batch.primary_mentor_details.first_name || ''} ${batch.primary_mentor_details.last_name || ''}`.trim() 
                                            : batch.primary_mentor_details.username) 
                                        : '-'}
                                </td>
                                <td className="p-3.5 text-xs text-slate-500">
                                    {batch.teacher_details ? (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-semibold bg-indigo-50 text-indigo-600">
                                            {batch.teacher_details.first_name || batch.teacher_details.last_name 
                                                ? `${batch.teacher_details.first_name || ''} ${batch.teacher_details.last_name || ''}`.trim() 
                                                : batch.teacher_details.username}
                                        </span>
                                    ) : <span className="text-slate-400 italic">Not Assigned</span>}
                                </td>
                                <td className="p-3.5 text-slate-500 text-xs font-normal">{batch.student_count}</td>
                                <td className="p-3.5">
                                    <button
                                        onClick={() => setEditingBatch(batch)}
                                        className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-100 text-indigo-600 rounded-md text-xs font-semibold transition-colors"
                                    >
                                        Assign Teacher
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Batch Pagination */}
            <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 font-medium">
                    Showing {batches.length} of {batchPagination.count} Batches
                </span>
                <div className="flex gap-2">
                    <button
                        onClick={() => setBatchPage(p => Math.max(1, p - 1))}
                        disabled={!batchPagination.previous}
                        className="px-3 py-1.5 rounded-md bg-white border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all"
                    >
                        Prev
                    </button>
                    <button
                        onClick={() => setBatchPage(p => p + 1)}
                        disabled={!batchPagination.next}
                        className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition-all"
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );

    const renderStudents = () => {
        const displayStudents = students;
        return (
            <div className="space-y-6 animate-fadeIn">
            <div className="flex flex-col md:flex-row gap-4 items-center px-1">
                <h3 className="text-lg font-semibold text-slate-900 shrink-0">Student Directory</h3>
                <div className="flex flex-wrap gap-3 w-full justify-end">
                    <select
                        className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:border-indigo-500 outline-none transition-all shadow-sm font-semibold text-slate-700 min-w-[180px]"
                        value={selectedBatchId}
                        onChange={e => setSelectedBatchId(e.target.value)}
                    >
                        <option value="">All Batches</option>
                        {batches.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-slate-400 w-3.5 h-3.5" />
                        <input
                            type="text"
                            placeholder="Search students..."
                            className="pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs w-64 focus:border-indigo-500 outline-none transition-all shadow-sm font-medium"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="p-3.5 font-semibold text-slate-400 uppercase text-[10px] tracking-wider">CRM ID</th>
                            <th className="p-3.5 font-semibold text-slate-400 uppercase text-[10px] tracking-wider">Name</th>
                            <th className="p-3.5 font-semibold text-slate-400 uppercase text-[10px] tracking-wider">Program</th>
                            <th className="p-3.5 font-semibold text-slate-400 uppercase text-[10px] tracking-wider">Quick Info</th>
                            <th className="p-3.5 font-semibold text-slate-400 uppercase text-[10px] tracking-wider">Batch</th>
                            <th className="p-3.5 font-semibold text-slate-400 uppercase text-[10px] tracking-wider">Transaction ID</th>
                            <th className="p-3.5 font-semibold text-slate-400 uppercase text-[10px] tracking-wider">Mobile</th>
                            <th className="p-3.5 font-semibold text-slate-400 uppercase text-[10px] tracking-wider text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                        {displayStudents.length > 0 ? (
                            displayStudents.map(student => (
                                <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="p-3.5 font-mono text-xs font-semibold text-indigo-600 bg-indigo-50/20 w-24 text-center rounded-lg">{student.crm_student_id}</td>
                                    <td className="p-3.5">
                                        <div 
                                            className="font-semibold text-slate-800 hover:text-indigo-600 cursor-pointer transition-colors text-sm"
                                            onClick={() => setSelectedStudentProfile(student)}
                                        >
                                            {student.first_name} {student.last_name}
                                        </div>
                                    </td>
                                    <td className="p-3.5 text-slate-500 text-xs font-normal">{student.program_name}</td>
                                    <td className="p-3.5">
                                        <div className="max-w-[160px] space-y-1">
                                            {student.dynamic_values_list?.filter(v => v.value && v.value.trim() !== '').slice(0, 2).map(val => (
                                                <div key={val.id} className="text-[10px] leading-tight flex gap-1 truncate text-slate-400">
                                                    <span className="font-semibold opacity-70 shrink-0">{val.field_label}:</span>
                                                    <span className="truncate text-slate-600">{val.value}</span>
                                                </div>
                                            ))}
                                            {student.dynamic_values_list?.filter(v => v.value && v.value.trim() !== '').length > 2 && (
                                                <div className="text-[9px] text-teal-600 font-semibold italic">+{student.dynamic_values_list.filter(v => v.value && v.value.trim() !== '').length - 2} more details...</div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-3.5">
                                        <div className="text-slate-700 text-xs font-medium">{student.batch_name || <span className="text-slate-400 italic font-normal">Unassigned</span>}</div>
                                        <div className="text-[10px] text-slate-400 mt-0.5">{student.sub_program_name || student.course_name || student.lms_course_names || ''}</div>
                                    </td>
                                    <td className="p-3.5">
                                        <div className="font-mono text-[10px] font-medium text-slate-500">
                                            {student.transactions_list?.[0]?.transaction_id || <span className="text-slate-300">-</span>}
                                        </div>
                                    </td>
                                    <td className="p-3.5 text-slate-500 font-mono text-xs font-normal">{student.mobile}</td>
                                    <td className="p-3.5 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => handleCompleteProfile(student)}
                                                className="px-2.5 py-1 bg-indigo-50 border border-indigo-150 text-indigo-600 hover:bg-indigo-100 rounded-md text-xs font-semibold transition-colors"
                                            >
                                                Details
                                            </button>
                                            <button
                                                onClick={() => handleViewFees(student)}
                                                className="px-2.5 py-1 bg-rose-50 border border-rose-150 text-rose-600 hover:bg-rose-100 rounded-md text-xs font-semibold transition-colors"
                                            >
                                                Fees
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan="8" className="p-10 text-center text-slate-400 font-medium">No students found matching your search.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination UI */}
            <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm mt-4">
                <span className="text-xs text-slate-500 font-medium">
                    Showing <span className="font-semibold text-slate-700">{displayStudents.length}</span> of <span className="font-semibold text-slate-700">{studentPagination.count}</span> students
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
                        className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm"
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    ); };

    return (
        <div className="space-y-8 text-slate-900 w-full pb-20">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-5 rounded-2xl border border-slate-200 shadow-sm gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-0.5">
                        <span className="text-teal-600">Academic</span>{" "}
                        <span className="text-blue-600">Oversight</span>
                    </h1>
                    <p className="text-xs text-slate-500 font-medium">Manage batches, faculty, and student profiles</p>
                </div>

                {/* Tabs */}
                <div className="flex overflow-x-auto whitespace-nowrap bg-slate-50 border border-slate-200/80 p-1 rounded-xl max-w-full">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === 'overview' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/40' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Overview
                    </button>
                    <button
                        onClick={() => setActiveTab('batches')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === 'batches' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/40' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Batches ({batchPagination.count})
                    </button>
                    <button
                        onClick={() => setActiveTab('teachers')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === 'teachers' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/40' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Teachers ({teacherPagination.count})
                    </button>
                    <button
                        onClick={() => setActiveTab('students')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === 'students' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/40' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Students ({studentPagination.count})
                    </button>
                    <button
                        onClick={() => { setActiveTab('wise'); fetchWiseCourses(); }}
                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === 'wise' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/40' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Wise LMS
                    </button>
                </div>
            </div>

            {
                loading ? (
                    <div className="text-center p-10 text-slate-500 font-medium animate-pulse" > Loading Academic Data...</div>
                ) : (
                    <div className="min-h-[500px]">
                        {activeTab === 'overview' && renderOverview()}
                        {activeTab === 'batches' && renderBatches()}
                        {activeTab === 'teachers' && renderTeachers()}
                        {activeTab === 'students' && renderStudents()}
                        {activeTab === 'wise' && (
                            <div className="space-y-6 animate-fadeIn">
                                <div className="flex justify-between items-center px-1">
                                    <h3 className="text-lg font-semibold text-slate-900">Wise LMS Classes</h3>
                                    <button onClick={fetchWiseCourses} className="text-indigo-600 text-xs font-semibold hover:text-indigo-700 transition-colors">Refresh List</button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {wiseCourses.map(course => (
                                        <div key={course._id} className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm group hover:border-indigo-300 transition-all">
                                            <h4 className="font-semibold text-slate-900 text-base mb-0.5 group-hover:text-indigo-600 transition-colors">{course.name || course.subject}</h4>
                                            <p className="text-xs text-slate-400 font-normal mb-4">{course.subject}</p>
                                            <div className="flex justify-between items-center pt-3.5 border-t border-slate-100">
                                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{course.studentCount || 0} Students</span>
                                                <button 
                                                    onClick={() => syncWiseBatch(course._id)}
                                                    className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100/85 text-indigo-600 rounded-lg font-semibold text-xs border border-indigo-100 transition-all flex items-center gap-1.5 shadow-sm"
                                                >
                                                    Sync to CRM
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {wiseCourses.length === 0 && <p className="col-span-full text-center py-10 text-slate-400 font-medium">No Wise classes found.</p>}
                                </div>
                            </div>
                        )}
                    </div>
                )
            }

            {/* Modals Container */}

            {showAddTeacher && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-100 relative">
                        <h2 className="text-xl font-bold mb-5 text-slate-900">{newTeacher.id ? 'Edit Teacher Profile' : 'Add New Teacher'}</h2>
                        <form onSubmit={handleAddTeacher} className="space-y-3.5">
                            <input
                                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:bg-white focus:border-teal-500 transition-all font-medium text-slate-800"
                                placeholder="Username"
                                value={newTeacher.username}
                                onChange={e => setNewTeacher({ ...newTeacher, username: e.target.value })}
                                required
                                disabled={!!newTeacher.id} // Username shouldn't change
                            />
                            <div className="grid grid-cols-2 gap-4">
                                <input
                                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:bg-white focus:border-teal-500 transition-all font-medium text-slate-800"
                                    placeholder="First Name"
                                    value={newTeacher.first_name}
                                    onChange={e => setNewTeacher({ ...newTeacher, first_name: e.target.value })}
                                    required
                                />
                                <input
                                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:bg-white focus:border-teal-500 transition-all font-medium text-slate-800"
                                    placeholder="Last Name"
                                    value={newTeacher.last_name}
                                    onChange={e => setNewTeacher({ ...newTeacher, last_name: e.target.value })}
                                />
                            </div>
                            <input
                                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:bg-white focus:border-teal-500 transition-all font-medium text-slate-800"
                                placeholder="Email"
                                type="email"
                                value={newTeacher.email}
                                onChange={e => setNewTeacher({ ...newTeacher, email: e.target.value })}
                                required
                            />
                            <div className="flex gap-4">
                                <input
                                    className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:bg-white focus:border-teal-500 transition-all font-medium text-slate-800"
                                    placeholder="Phone Number"
                                    value={newTeacher.phone_number}
                                    onChange={e => setNewTeacher({ ...newTeacher, phone_number: e.target.value })}
                                />
                                <input
                                    className="flex-1 px-3.5 py-2 bg-slate-50 border border-indigo-150 rounded-lg text-sm outline-none focus:bg-white focus:border-indigo-500 transition-all font-medium text-indigo-700"
                                    placeholder="Wise Teacher ID"
                                    value={newTeacher.lms_teacher_id || ''}
                                    onChange={e => setNewTeacher({ ...newTeacher, lms_teacher_id: e.target.value })}
                                />
                            </div>
                            
                            <div className="relative">
                                <input
                                    className="w-full pl-3.5 pr-20 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:bg-white focus:border-teal-500 transition-all font-semibold text-teal-700"
                                    placeholder="Set Password (default: welcome123)"
                                    value={newTeacher.password}
                                    onChange={e => setNewTeacher({ ...newTeacher, password: e.target.value })}
                                />
                                <button 
                                    type="button"
                                    onClick={() => {
                                        const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
                                        let pass = "";
                                        for (let i = 0; i < 10; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
                                        setNewTeacher({ ...newTeacher, password: pass });
                                    }}
                                    className="absolute right-2 top-1.5 px-2 py-1 bg-teal-50 border border-teal-100 text-teal-600 rounded text-[9px] font-bold uppercase hover:bg-teal-100 transition-colors"
                                >
                                    Generate
                                </button>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={() => setShowAddTeacher(false)} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200/80 text-slate-600 rounded-lg text-sm font-semibold transition-colors">Cancel</button>
                                <button type="submit" className="flex-1 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-semibold transition-colors">{newTeacher.id ? 'Save Changes' : 'Create Account'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Reset Password Modal */}
            {resettingTeacher && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-100 relative">
                        <h2 className="text-xl font-bold mb-1 text-slate-900">Reset Password</h2>
                        <p className="text-xs text-slate-500 mb-5 font-normal">Set a new password for <span className="text-teal-600 font-semibold">{resettingTeacher.first_name || resettingTeacher.username}</span></p>
                        
                        <form onSubmit={handleResetPassword} className="space-y-4">
                            <div className="relative">
                                <input
                                    className="w-full pl-3.5 pr-20 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:bg-white focus:border-teal-500 transition-all font-semibold text-teal-700"
                                    placeholder="Enter New Password"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    required
                                />
                                <button 
                                    type="button"
                                    onClick={() => {
                                        const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
                                        let pass = "";
                                        for (let i = 0; i < 10; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
                                        setNewPassword(pass);
                                    }}
                                    className="absolute right-2 top-1.5 px-2 py-1 bg-teal-50 border border-teal-100 text-teal-600 rounded text-[9px] font-bold uppercase hover:bg-teal-100 transition-colors"
                                >
                                    Generate
                                </button>
                            </div>
                            
                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={() => setResettingTeacher(null)} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200/80 text-slate-600 rounded-lg text-sm font-semibold transition-colors">Cancel</button>
                                <button type="submit" className="flex-1 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-semibold transition-colors">Update Password</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Assign Batches to Teacher Modal */}
            {assigningTeacher && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-xl border border-slate-100 relative max-h-[90vh] flex flex-col">
                        <div className="mb-5">
                            <h2 className="text-xl font-bold mb-0.5 text-slate-900">Assign Batches</h2>
                            <p className="text-xs text-slate-500 font-normal">Assigning batches to <span className="text-teal-600 font-semibold">{assigningTeacher.first_name || assigningTeacher.username}</span></p>
                        </div>

                        <div className="relative mb-4">
                            <input
                                type="text"
                                placeholder="Search batches to assign..."
                                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-indigo-500 transition-all text-xs font-semibold"
                                value={assignBatchSearch}
                                onChange={e => setAssignBatchSearch(e.target.value)}
                            />
                            <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                            {batches
                                .filter(b => b.name.toLowerCase().includes(assignBatchSearch.toLowerCase()))
                                .map(batch => {
                                    const isAssignedToThis = batch.teacher === assigningTeacher.id;
                                    return (
                                        <div 
                                            key={batch.id} 
                                            onClick={() => handleAssignTeacher(batch.id, isAssignedToThis ? null : assigningTeacher.id)}
                                            className={`p-3 rounded-xl border transition-all cursor-pointer flex justify-between items-center group
                                                ${isAssignedToThis ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-150 bg-slate-50/50 hover:border-indigo-300'}
                                            `}
                                        >
                                            <div>
                                                <div className="font-semibold text-slate-900 text-sm">{batch.name}</div>
                                                <div className="text-xs text-slate-400 font-normal">{batch.course_name}</div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {batch.teacher && !isAssignedToThis && (
                                                    <span className="text-[9px] bg-amber-50 border border-amber-100 text-amber-600 px-2 py-0.5 rounded font-bold uppercase">
                                                        With {batch.teacher_details?.username}
                                                    </span>
                                                )}
                                                <div className={`w-5 h-5 rounded-lg flex items-center justify-center border transition-all
                                                    ${isAssignedToThis ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-350 bg-white group-hover:border-indigo-300'}
                                                `}>
                                                    {isAssignedToThis && <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path></svg>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            }
                        </div>

                        <div className="mt-5 flex gap-4">
                            <button onClick={() => { setAssigningTeacher(null); setAssignBatchSearch(''); }} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200/80 text-slate-600 rounded-lg text-sm font-semibold transition-colors">Done</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Assign Teacher Modal */}
            {editingBatch && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-100 relative">
                        <h2 className="text-xl font-bold mb-1 text-slate-900">Assign Teacher</h2>
                        <p className="text-xs text-slate-500 mb-5 font-normal">Assign a teacher to <span className="text-indigo-600 font-semibold">{editingBatch.name}</span></p>

                        <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {teachers.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => handleAssignTeacher(editingBatch.id, t.id)}
                                    className={`w-full p-3 rounded-xl border text-left flex items-center justify-between group transition-all ${editingBatch.teacher === t.id ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-150 hover:border-indigo-200 bg-slate-50/50'}`}
                                >
                                    <div>
                                        <div className="font-semibold text-slate-900 text-sm">{t.first_name || t.username} {t.last_name}</div>
                                        <div className="text-xs text-slate-400 font-mono">@{t.username}</div>
                                    </div>
                                    {editingBatch.teacher === t.id && <div className="text-indigo-600"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path></svg></div>}
                                </button>
                            ))}
                            {teachers.length === 0 && <p className="text-center py-4 text-slate-400 italic text-xs font-semibold">No teachers found. Add some teachers first.</p>}
                        </div>

                        <button onClick={() => setEditingBatch(null)} className="w-full mt-5 py-2 bg-slate-100 hover:bg-slate-200/80 text-slate-600 rounded-lg text-sm font-semibold transition-colors">Close</button>
                    </div>
                </div>
            )}

            {/* Profile Completion Modal */}
            {completingProfile && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl border border-slate-100 relative max-h-[95vh] overflow-y-auto">
                        <button
                            onClick={() => setCompletingProfile(null)}
                            className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>

                        <h2 className="text-lg font-bold text-slate-900">Additional Details</h2>
                        <p className="text-slate-500 text-xs mt-0.5 mb-5">Completing profile for <span className="text-indigo-600 font-semibold">{completingProfile.first_name} {completingProfile.last_name}</span></p>

                        <form onSubmit={handleSaveCompletion} className="space-y-4">
                            {academicFields.length === 0 ? (
                                <div className="py-10 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                    <p className="text-slate-400 text-sm italic">No additional coordinator fields defined for this program.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {academicFields.map(field => (
                                        <div key={field.id} className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-500 ml-1">
                                                {field.label} {field.is_required && <span className="text-red-500">*</span>}
                                            </label>
                                            {field.field_type === 'dropdown' ? (
                                                <select
                                                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-slate-350 transition-all text-sm text-slate-800"
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
                                                <div className="p-3 border border-dashed border-slate-200 rounded-lg bg-slate-50 text-center">
                                                    <p className="text-xs text-slate-400">File uploads are managed in Document view</p>
                                                </div>
                                            ) : (
                                                <input
                                                    type={field.field_type}
                                                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-slate-350 transition-all text-sm text-slate-800"
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

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setCompletingProfile(null)} className="flex-1 py-2 bg-slate-100 text-slate-650 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">Cancel</button>
                                <button
                                    type="submit"
                                    disabled={savingCompletion || academicFields.length === 0}
                                    className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
                                >
                                    {savingCompletion ? 'Saving...' : 'Save Details'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Fee Status Modal */}
            {
                selectedStudent && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                        <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-100 relative">
                            <button
                                onClick={() => setSelectedStudent(null)}
                                className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>

                            <h2 className="text-lg font-bold text-slate-900">Fee Status</h2>
                            <p className="text-slate-500 text-xs mt-0.5 mb-5">{selectedStudent.first_name} {selectedStudent.last_name} ({selectedStudent.crm_student_id})</p>

                            {feeLoading ? (
                                <div className="py-10 text-center space-y-2">
                                    <div className="w-6 h-6 border-2 border-rose-200 border-t-rose-600 rounded-full animate-spin mx-auto"></div>
                                    <p className="text-slate-500 font-medium text-xs">Fetching LMS Data...</p>
                                </div>
                            ) : feeData ? (
                                <div className="space-y-3">
                                    <div className="p-3 rounded-lg border border-slate-200/60 bg-slate-50/50 flex justify-between items-center">
                                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Fee</span>
                                        <span className="font-bold text-slate-800 text-base">₹{feeData.fee_details?.total_fee?.toLocaleString() || 0}</span>
                                    </div>
                                    <div className="p-3 rounded-lg border border-slate-200/60 bg-slate-50/50 flex justify-between items-center text-emerald-700">
                                        <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Paid Amount</span>
                                        <span className="font-bold text-emerald-600 text-base">₹{feeData.fee_details?.paid_fee?.toLocaleString() || 0}</span>
                                    </div>
                                    <div className="p-3 rounded-lg border border-slate-200/60 bg-slate-50/50 flex justify-between items-center text-rose-700">
                                        <span className="text-xs font-semibold text-rose-600 uppercase tracking-wider">Due Amount</span>
                                        <span className="font-bold text-rose-600 text-base">₹{feeData.fee_details?.due_fee?.toLocaleString() || 0}</span>
                                    </div>
                                    {feeData.error_message && (
                                        <div className="mt-4 p-3 rounded-lg bg-orange-50 text-orange-700 text-xs font-semibold">
                                            {feeData.error_message}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="py-10 text-center text-slate-400 text-xs">Failed to load data.</div>
                            )}

                            <button
                                onClick={() => setSelectedStudent(null)}
                                className="w-full mt-5 py-2 bg-slate-100 text-slate-650 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                )
            }
            {/* Full Profile View Modal */}
            {selectedStudentProfile && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn overflow-y-auto">
                    <div className="my-8 bg-white rounded-2xl p-6 md:p-8 w-full max-w-5xl shadow-xl relative border border-slate-150">
                        <button
                            onClick={() => setSelectedStudentProfile(null)}
                            className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-700 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Profile Header Card */}
                            <div className="md:col-span-1 space-y-4">
                                <div className="bg-slate-50/50 p-5 rounded-xl border border-slate-200/60 shadow-sm">
                                    <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-bold text-2xl border border-indigo-100 mb-4">
                                        {selectedStudentProfile.first_name?.[0]}{selectedStudentProfile.last_name?.[0]}
                                    </div>
                                    <h2 className="text-xl font-bold text-slate-900">{selectedStudentProfile.first_name} {selectedStudentProfile.last_name}</h2>
                                    <p className="text-xs font-semibold text-slate-500 mt-0.5 mb-4">Student ID: {selectedStudentProfile.crm_student_id}</p>
                                    
                                    <div className="space-y-3 pt-4 border-t border-slate-200/60">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg></div>
                                            <div><p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Mobile</p><p className="text-xs font-medium text-slate-700">{selectedStudentProfile.mobile}</p></div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg></div>
                                            <div><p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Email</p><p className="text-xs font-medium text-slate-700 break-all">{selectedStudentProfile.email}</p></div>
                                        </div>
                                    </div>

                                    <div className="mt-6 space-y-2">
                                        <button 
                                            onClick={() => {
                                                setSelectedStudentProfile(null);
                                                handleCompleteProfile(selectedStudentProfile);
                                            }}
                                            className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1.5"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                                            Edit Academic Data
                                        </button>
                                        <button 
                                            onClick={() => {
                                                setSelectedStudentProfile(null);
                                                handleViewFees(selectedStudentProfile);
                                            }}
                                            className="w-full py-2 bg-rose-50 text-rose-600 rounded-lg text-xs font-medium hover:bg-rose-100 transition-colors"
                                        >
                                            View Fees & Financials
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Data Groups Content */}
                            <div className="md:col-span-2 space-y-6">
                                {['INITIAL', 'ACADEMIC'].map(group => {
                                    const groupFields = selectedStudentProfile.dynamic_values_list?.filter(val => val.field_group === group);
                                    if (!groupFields || groupFields.length === 0) return null;

                                    return (
                                        <div key={group}>
                                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
                                                {group === 'INITIAL' ? 'Initial Application Details' : 'Academic & Post-Admission Records'}
                                            </h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50/50 p-5 rounded-xl border border-slate-200/60 shadow-sm">
                                                {groupFields.map((val) => (
                                                    <div key={val.id}>
                                                        <p className="text-[10px] font-semibold text-slate-400 uppercase mb-0.5">{val.field_label}</p>
                                                        <p className="text-sm font-medium text-slate-700">{val.value || '-'}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                                {!selectedStudentProfile.dynamic_values_list?.length && (
                                    <div className="bg-slate-50/50 p-8 rounded-xl border border-slate-200/60 text-center">
                                        <p className="text-slate-400 text-sm italic">No custom data recorded yet.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
}

export default AcademicModule;
