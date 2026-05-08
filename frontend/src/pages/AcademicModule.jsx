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
            const res = await api.get('integrations/courses/?type=LIVE');
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
            } else {
                setStudents(Array.isArray(data) ? data : []);
                setStudentPagination({ count: (Array.isArray(data) ? data.length : 0), next: null, previous: null });
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
            <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Total Students</div>
                <div className="text-4xl font-extrabold text-blue-600">{stats.totalStudents}</div>
            </div>
            <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Active Batches</div>
                <div className="text-4xl font-extrabold text-purple-600">{stats.totalBatches}</div>
            </div>
            <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Teachers</div>
                <div className="text-4xl font-extrabold text-teal-600">{stats.totalTeachers}</div>
            </div>
            <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Mentors</div>
                <div className="text-4xl font-extrabold text-green-600">{stats.totalMentors}</div>
            </div>

            {/* Recent Batches Preview */}
            <div className="md:col-span-4 mt-6">
                <h3 className="text-xl font-bold text-slate-800 mb-6 px-1">Batch Overview</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {batches.slice(0, 6).map(batch => (
                        <div 
                            key={batch.id} 
                            onClick={() => {
                                setSelectedBatchId(batch.id);
                                setActiveTab('students');
                            }}
                            className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group"
                        >
                            <h4 className="font-bold text-slate-900 text-lg mb-1 group-hover:text-indigo-600 transition-colors">{batch.name}</h4>
                            <p className="text-sm text-slate-500 font-medium mb-4">{batch.course_name}</p>
                            <div className="flex flex-col gap-2 text-xs border-t border-slate-100 pt-3">
                                <div className="flex justify-between items-center text-slate-500">
                                    <span className="bg-slate-100 px-2 py-1 rounded text-slate-600 font-medium">Students: {batch.student_count}</span>
                                    <span className="font-medium text-slate-700">Mentor: {batch.primary_mentor_details?.username}</span>
                                </div>
                                <div className="text-indigo-600 font-bold">
                                    Teacher: {batch.teacher_details?.username || 'Not Assigned'}
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
            <div className="flex justify-between items-center mb-6 px-1">
                <h3 className="text-xl font-bold text-slate-800">Faculty & Staff</h3>
                <div className="flex gap-4">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search faculty..."
                            className="pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm w-64 focus:border-teal-500 outline-none transition-all shadow-sm"
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
                                fetchTeachers(); // Refresh counts
                            } catch (err) {
                                alert("Failed to sync attendance: " + (err.response?.data?.error || err.message));
                            } finally {
                                setLoading(false);
                            }
                        }}
                        className="px-5 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-sm hover:bg-indigo-100 transition-all flex items-center gap-2 border border-indigo-100"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
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
                        className="px-5 py-2.5 bg-teal-50 text-teal-600 rounded-xl font-bold text-sm hover:bg-teal-100 transition-all flex items-center gap-2 border border-teal-100 shadow-sm"
                    >
                        <Users size={18} />
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
                                fetchBatches(); // Refresh batches too
                            } catch (err) {
                                alert("Failed to auto-link: " + (err.response?.data?.error || err.message));
                            } finally {
                                setLoading(false);
                            }
                        }}
                        className="px-5 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-sm hover:bg-indigo-100 transition-all flex items-center gap-2 border border-indigo-100 shadow-sm"
                    >
                        <Link2 size={18} />
                        Auto-Link Batches
                    </button>
                    <button
                        onClick={() => {
                            setNewTeacher({ username: '', first_name: '', last_name: '', email: '', phone_number: '', password: '', lms_teacher_id: '' });
                            setShowAddTeacher(true);
                        }}
                        className="px-6 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-bold hover:bg-teal-700 shadow-lg shadow-teal-100 transition-all flex items-center gap-2"
                    >
                        <Plus size={20} />
                        Add Teacher
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {teachers.map(teacher => (
                    <div key={teacher.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm group hover:border-teal-300 transition-all">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center text-teal-600 font-bold text-xl">
                                {teacher.first_name?.[0] || teacher.username[0].toUpperCase()}
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-900">{teacher.first_name} {teacher.last_name}</h4>
                                <p className="text-xs text-slate-500 font-mono">@{teacher.username}</p>
                            </div>
                        </div>
                        <div className="space-y-2 text-sm text-slate-600">
                            <div className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                                {teacher.email}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold text-slate-500 uppercase">{teacher.role}</span>
                                {teacher.lms_teacher_id && (
                                    <span className="px-2 py-0.5 bg-indigo-100 rounded text-[10px] font-bold text-indigo-600 uppercase flex items-center gap-1">
                                        <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                                        Linked
                                    </span>
                                )}
                            </div>
                            {teacher.lms_teacher_id && (
                                <div className="text-[10px] font-bold text-slate-400 pl-6">
                                    ID: {teacher.lms_teacher_id}
                                </div>
                            )}
                        </div>

                        {/* Assigned Batches List */}
                        <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-start">
                            <div className="flex-1">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Assigned Batches</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {teacher.teacher_batches_details?.length > 0 ? (
                                        teacher.teacher_batches_details.map(b => (
                                            <span key={b.id} className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-[10px] font-bold border border-indigo-100">
                                                {b.name}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-[10px] text-slate-400 italic">No batches assigned</span>
                                    )}
                                </div>
                            </div>
                            <div className="text-right pl-4">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Attendance</p>
                                <div className="text-xl font-black text-emerald-600 leading-none">
                                    {teacher.total_classes_conducted || 0}
                                </div>
                                <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">Classes Taken</p>
                            </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2 justify-end">
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
                                className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase hover:bg-slate-200 transition-colors"
                            >
                                Edit Profile
                            </button>
                            <button
                                onClick={() => setResettingTeacher(teacher)}
                                className="px-3 py-1 bg-teal-50 text-teal-600 rounded-lg text-[10px] font-black uppercase hover:bg-teal-100 transition-colors"
                            >
                                Reset Password
                            </button>
                            <button
                                onClick={() => setAssigningTeacher(teacher)}
                                className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase hover:bg-indigo-100 transition-colors"
                            >
                                Assign Batches
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            {/* Teacher Pagination */}
            <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 mt-6 shadow-sm">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                    Showing {teachers.length} of {teacherPagination.count} Faculty
                </span>
                <div className="flex gap-2">
                    <button
                        onClick={() => setTeacherPage(p => Math.max(1, p - 1))}
                        disabled={!teacherPagination.previous}
                        className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold disabled:opacity-50"
                    >
                        Prev
                    </button>
                    <button
                        onClick={() => setTeacherPage(p => p + 1)}
                        disabled={!teacherPagination.next}
                        className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-bold disabled:opacity-50"
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
                <h3 className="text-xl font-bold text-slate-800">All Batches</h3>
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Search batches..."
                        className="pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm w-64 focus:border-indigo-500 outline-none transition-all shadow-sm"
                        value={batchSearch}
                        onChange={e => setBatchSearch(e.target.value)}
                    />
                </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="p-4 font-bold text-slate-500 uppercase text-xs">Batch Name</th>
                            <th className="p-4 font-bold text-slate-500 uppercase text-xs">Course</th>
                            <th className="p-4 font-bold text-slate-500 uppercase text-xs">Primary Mentor</th>
                            <th className="p-4 font-bold text-slate-500 uppercase text-xs">Assigned Teacher</th>
                            <th className="p-4 font-bold text-slate-500 uppercase text-xs">Students</th>
                            <th className="p-4 font-bold text-slate-500 uppercase text-xs">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {batches.map(batch => (
                            <tr key={batch.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4 font-bold text-slate-900">{batch.name}</td>
                                <td className="p-4 text-slate-600 font-medium">{batch.course_name}</td>
                                <td className="p-4 text-slate-600 font-medium">{batch.primary_mentor_details?.username}</td>
                                <td className="p-4 text-slate-900">
                                    {batch.teacher_details ? (
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-indigo-600">{batch.teacher_details.username}</span>
                                        </div>
                                    ) : <span className="text-slate-400 italic font-medium">Not Assigned</span>}
                                </td>
                                <td className="p-4 text-slate-600">{batch.student_count}</td>
                                <td className="p-4">
                                    <button
                                        onClick={() => setEditingBatch(batch)}
                                        className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors"
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
            <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                    Showing {batches.length} of {batchPagination.count} Batches
                </span>
                <div className="flex gap-2">
                    <button
                        onClick={() => setBatchPage(p => Math.max(1, p - 1))}
                        disabled={!batchPagination.previous}
                        className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold disabled:opacity-50"
                    >
                        Prev
                    </button>
                    <button
                        onClick={() => setBatchPage(p => p + 1)}
                        disabled={!batchPagination.next}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-50"
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
                <h3 className="text-xl font-bold text-slate-800 shrink-0">Student Directory</h3>
                <div className="flex flex-wrap gap-3 w-full justify-end">
                    <select
                        className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:border-indigo-500 outline-none transition-all shadow-sm font-bold min-w-[200px]"
                        value={selectedBatchId}
                        onChange={e => setSelectedBatchId(e.target.value)}
                    >
                        <option value="">All Batches</option>
                        {batches.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search students..."
                            className="pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm w-72 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all shadow-sm"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        <svg className="w-4 h-4 text-slate-400 absolute right-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="p-4 font-bold text-slate-500 uppercase text-xs">CRM ID</th>
                            <th className="p-4 font-bold text-slate-500 uppercase text-xs">Name</th>
                            <th className="p-4 font-bold text-slate-500 uppercase text-xs">Program</th>
                            <th className="p-4 font-bold text-slate-500 uppercase text-xs">Quick Info</th>
                            <th className="p-4 font-bold text-slate-500 uppercase text-xs">Batch</th>
                            <th className="p-4 font-bold text-slate-500 uppercase text-xs">Transaction ID</th>
                            <th className="p-4 font-bold text-slate-500 uppercase text-xs">Mobile</th>
                            <th className="p-4 font-bold text-slate-500 uppercase text-xs text-right">Fee Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {displayStudents.length > 0 ? (
                            displayStudents.map(student => (
                                <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-4 font-mono text-xs font-bold text-indigo-600 bg-indigo-50/50 w-24 text-center rounded-r-lg my-1">{student.crm_student_id}</td>
                                    <td className="p-4">
                                        <div 
                                            className="font-bold text-slate-800 hover:text-indigo-600 cursor-pointer transition-colors"
                                            onClick={() => setSelectedStudentProfile(student)}
                                        >
                                            {student.first_name} {student.last_name}
                                        </div>
                                    </td>
                                    <td className="p-4 text-slate-600 text-xs">{student.program_name}</td>
                                    <td className="p-4">
                                        <div className="max-w-[150px] space-y-1">
                                            {student.dynamic_values_list?.filter(v => v.value && v.value.trim() !== '').slice(0, 2).map(val => (
                                                <div key={val.id} className="text-[10px] leading-tight flex gap-1 truncate text-slate-500">
                                                    <span className="font-bold opacity-70 shrink-0">{val.field_label}:</span>
                                                    <span className="truncate">{val.value}</span>
                                                </div>
                                            ))}
                                            {student.dynamic_values_list?.filter(v => v.value && v.value.trim() !== '').length > 2 && (
                                                <div className="text-[9px] text-teal-600 font-bold italic">+{student.dynamic_values_list.filter(v => v.value && v.value.trim() !== '').length - 2} more details...</div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4 text-slate-600 text-xs font-medium">{student.batch_name || <span className="text-slate-400 italic">Unassigned</span>}</td>
                                    <td className="p-4">
                                        <div className="font-mono text-[10px] font-bold text-slate-600">
                                            {student.transactions_list?.[0]?.transaction_id || <span className="text-slate-300">-</span>}
                                        </div>
                                    </td>
                                    <td className="p-4 text-slate-600 font-mono text-xs">{student.mobile}</td>
                                    <td className="p-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => handleCompleteProfile(student)}
                                                className="px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-colors"
                                            >
                                                Details
                                            </button>
                                            <button
                                                onClick={() => handleViewFees(student)}
                                                className="px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-xs font-bold transition-colors"
                                            >
                                                Fees
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan="7" className="p-10 text-center text-slate-500 font-medium">No students found matching your search.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination UI */}
            <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm mt-4">
                <span className="text-sm text-slate-500">
                    Showing <span className="font-bold text-slate-900">{displayStudents.length}</span> of <span className="font-bold text-slate-900">{studentPagination.count}</span> students
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
                        className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm"
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    ); };

    return (
        <div className="space-y-8 text-slate-900 w-full pb-20">
            <div className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-teal-500 to-blue-600">
                    Academic Oversight
                </h1>

                {/* Tabs */}
                <div className="flex overflow-x-auto whitespace-nowrap bg-slate-100 p-1.5 rounded-xl mt-4 md:mt-0 max-w-full">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'overview' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                    >
                        Overview
                    </button>
                    <button
                        onClick={() => setActiveTab('batches')}
                        className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'batches' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                    >
                        Batches ({batchPagination.count})
                    </button>
                    <button
                        onClick={() => setActiveTab('teachers')}
                        className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'teachers' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                    >
                        Teachers ({teacherPagination.count})
                    </button>
                    <button
                        onClick={() => setActiveTab('students')}
                        className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'students' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                    >
                        Students ({studentPagination.count})
                    </button>
                    <button
                        onClick={() => { setActiveTab('wise'); fetchWiseCourses(); }}
                        className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'wise' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
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
                                    <h3 className="text-xl font-bold text-slate-800">Wise LMS Classes</h3>
                                    <button onClick={fetchWiseCourses} className="text-indigo-600 text-sm font-bold">Refresh List</button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {wiseCourses.map(course => (
                                        <div key={course._id} className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm group hover:border-indigo-300 transition-all">
                                            <h4 className="font-bold text-slate-900 mb-1 group-hover:text-indigo-600">{course.name || course.subject}</h4>
                                            <p className="text-xs text-slate-500 font-medium mb-4">{course.subject}</p>
                                            <div className="flex justify-between items-center pt-4 border-t border-slate-50">
                                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{course.studentCount || 0} Students</span>
                                                <button 
                                                    onClick={() => syncWiseBatch(course._id)}
                                                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all"
                                                >
                                                    Sync to CRM
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {wiseCourses.length === 0 && <p className="col-span-full text-center py-10 text-slate-400">No Wise classes found.</p>}
                                </div>
                            </div>
                        )}
                    </div>
                )
            }

            {/* Modals Container */}

            {showAddTeacher && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl relative">
                        <h2 className="text-2xl font-bold mb-6 text-slate-900">{newTeacher.id ? 'Edit Teacher Profile' : 'Add New Teacher'}</h2>
                        <form onSubmit={handleAddTeacher} className="space-y-4">
                            <input
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-teal-500 transition-all font-medium"
                                placeholder="Username"
                                value={newTeacher.username}
                                onChange={e => setNewTeacher({ ...newTeacher, username: e.target.value })}
                                required
                                disabled={!!newTeacher.id} // Username shouldn't change
                            />
                            <div className="grid grid-cols-2 gap-4">
                                <input
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-teal-500 transition-all font-medium"
                                    placeholder="First Name"
                                    value={newTeacher.first_name}
                                    onChange={e => setNewTeacher({ ...newTeacher, first_name: e.target.value })}
                                    required
                                />
                                <input
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-teal-500 transition-all font-medium"
                                    placeholder="Last Name"
                                    value={newTeacher.last_name}
                                    onChange={e => setNewTeacher({ ...newTeacher, last_name: e.target.value })}
                                />
                            </div>
                            <input
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-teal-500 transition-all font-medium"
                                placeholder="Email"
                                type="email"
                                value={newTeacher.email}
                                onChange={e => setNewTeacher({ ...newTeacher, email: e.target.value })}
                                required
                            />
                            <div className="flex gap-4">
                                <input
                                    className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-teal-500 transition-all font-medium"
                                    placeholder="Phone Number"
                                    value={newTeacher.phone_number}
                                    onChange={e => setNewTeacher({ ...newTeacher, phone_number: e.target.value })}
                                />
                                <input
                                    className="flex-1 p-3 bg-slate-50 border border-indigo-200 rounded-xl outline-none focus:border-indigo-500 transition-all font-medium text-indigo-700"
                                    placeholder="Wise Teacher ID"
                                    value={newTeacher.lms_teacher_id || ''}
                                    onChange={e => setNewTeacher({ ...newTeacher, lms_teacher_id: e.target.value })}
                                />
                            </div>
                            
                            <div className="relative">
                                <input
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-teal-500 transition-all font-bold text-teal-700"
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
                                    className="absolute right-2 top-2 px-2 py-1 bg-teal-100 text-teal-600 rounded text-[10px] font-black uppercase hover:bg-teal-200 transition-colors"
                                >
                                    Generate
                                </button>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={() => setShowAddTeacher(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors">Cancel</button>
                                <button type="submit" className="flex-1 py-3 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-colors">{newTeacher.id ? 'Save Changes' : 'Create Account'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Reset Password Modal */}
            {resettingTeacher && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl relative">
                        <h2 className="text-2xl font-bold mb-2 text-slate-900">Reset Password</h2>
                        <p className="text-sm text-slate-500 mb-6 font-medium">Set a new password for <span className="text-teal-600 font-bold">{resettingTeacher.first_name || resettingTeacher.username}</span></p>
                        
                        <form onSubmit={handleResetPassword} className="space-y-4">
                            <div className="relative">
                                <input
                                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-teal-500 transition-all font-bold text-teal-700"
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
                                    className="absolute right-3 top-3.5 px-2 py-1 bg-teal-100 text-teal-600 rounded text-[10px] font-black uppercase hover:bg-teal-200 transition-colors"
                                >
                                    Generate
                                </button>
                            </div>
                            
                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={() => setResettingTeacher(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors">Cancel</button>
                                <button type="submit" className="flex-1 py-3 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-colors">Update Password</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Assign Batches to Teacher Modal */}
            {assigningTeacher && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-white rounded-3xl p-8 w-full max-w-2xl shadow-2xl relative max-h-[90vh] flex flex-col">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold mb-1 text-slate-900">Assign Batches</h2>
                            <p className="text-sm text-slate-500 font-medium">Assigning batches to <span className="text-teal-600 font-bold">{assigningTeacher.first_name || assigningTeacher.username}</span></p>
                        </div>

                        <div className="relative mb-4">
                            <input
                                type="text"
                                placeholder="Search batches to assign..."
                                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-indigo-500 transition-all font-bold"
                                value={assignBatchSearch}
                                onChange={e => setAssignBatchSearch(e.target.value)}
                            />
                            <svg className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
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
                                            className={`p-4 rounded-2xl border transition-all cursor-pointer flex justify-between items-center group
                                                ${isAssignedToThis ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 bg-slate-50 hover:border-indigo-300'}
                                            `}
                                        >
                                            <div>
                                                <div className="font-bold text-slate-900">{batch.name}</div>
                                                <div className="text-xs text-slate-500">{batch.course_name}</div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {batch.teacher && !isAssignedToThis && (
                                                    <span className="text-[9px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-black uppercase">
                                                        With {batch.teacher_details?.username}
                                                    </span>
                                                )}
                                                <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all
                                                    ${isAssignedToThis ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 bg-white group-hover:border-indigo-300'}
                                                `}>
                                                    {isAssignedToThis && <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path></svg>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            }
                        </div>

                        <div className="mt-6 flex gap-4">
                            <button onClick={() => { setAssigningTeacher(null); setAssignBatchSearch(''); }} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors">Done</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Assign Teacher Modal */}
            {editingBatch && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl relative">
                        <h2 className="text-2xl font-bold mb-2 text-slate-900">Assign Teacher</h2>
                        <p className="text-sm text-slate-500 mb-6 font-medium">Assign a teacher to <span className="text-indigo-600 font-bold">{editingBatch.name}</span></p>

                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                            {teachers.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => handleAssignTeacher(editingBatch.id, t.id)}
                                    className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between group transition-all ${editingBatch.teacher === t.id ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 hover:border-slate-300 bg-slate-50'}`}
                                >
                                    <div>
                                        <div className="font-bold text-slate-900">{t.first_name || t.username} {t.last_name}</div>
                                        <div className="text-xs text-slate-500 font-mono">@{t.username}</div>
                                    </div>
                                    {editingBatch.teacher === t.id && <div className="text-indigo-600"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path></svg></div>}
                                </button>
                            ))}
                            {teachers.length === 0 && <p className="text-center py-4 text-slate-500 italic">No teachers found. Add some teachers first.</p>}
                        </div>

                        <button onClick={() => setEditingBatch(null)} className="w-full mt-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors">Close</button>
                    </div>
                </div>
            )}

            {/* Profile Completion Modal */}
            {completingProfile && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
                        <button
                            onClick={() => setCompletingProfile(null)}
                            className="absolute top-6 right-6 text-slate-400 hover:text-slate-700 transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>

                        <h2 className="text-2xl font-bold mb-1 text-slate-900 text-transparent bg-clip-text bg-gradient-to-r from-teal-500 to-blue-600">Additional Details</h2>
                        <p className="text-slate-500 text-sm mb-6">Completing profile for <span className="text-indigo-600 font-bold">{completingProfile.first_name} {completingProfile.last_name}</span></p>

                        <form onSubmit={handleSaveCompletion} className="space-y-6">
                            {academicFields.length === 0 ? (
                                <div className="py-10 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-100">
                                    <p className="text-slate-400 text-sm italic">No additional coordinator fields defined for this program.</p>
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
                                                <div className="p-4 border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50 text-center">
                                                    <p className="text-xs text-slate-400">File uploads are managed in Document view</p>
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

            {/* Fee Status Modal */}
            {
                selectedStudent && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                        <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl relative">
                            <button
                                onClick={() => setSelectedStudent(null)}
                                className="absolute top-6 right-6 text-slate-400 hover:text-slate-700 transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>

                            <h2 className="text-2xl font-bold mb-1 text-slate-900">Fee Status</h2>
                            <p className="text-slate-500 text-sm mb-6">{selectedStudent.first_name} {selectedStudent.last_name} ({selectedStudent.crm_student_id})</p>

                            {feeLoading ? (
                                <div className="py-10 text-center space-y-3">
                                    <div className="w-8 h-8 border-4 border-rose-200 border-t-rose-600 rounded-full animate-spin mx-auto"></div>
                                    <p className="text-slate-500 font-medium text-sm">Fetching LMS Data...</p>
                                </div>
                            ) : feeData ? (
                                <div className="space-y-4">
                                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex justify-between items-center">
                                        <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Total Fee</span>
                                        <span className="font-extrabold text-slate-900 text-lg">₹{feeData.fee_details?.total_fee?.toLocaleString() || 0}</span>
                                    </div>
                                    <div className="p-4 rounded-xl bg-green-50 border border-green-100 flex justify-between items-center">
                                        <span className="text-sm font-semibold text-green-700 uppercase tracking-wider">Paid Amount</span>
                                        <span className="font-extrabold text-green-700 text-lg">₹{feeData.fee_details?.paid_fee?.toLocaleString() || 0}</span>
                                    </div>
                                    <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 flex justify-between items-center">
                                        <span className="text-sm font-semibold text-rose-700 uppercase tracking-wider">Due Amount</span>
                                        <span className="font-extrabold text-rose-700 text-lg">₹{feeData.fee_details?.due_fee?.toLocaleString() || 0}</span>
                                    </div>
                                    {feeData.error_message && (
                                        <div className="mt-4 p-3 rounded-lg bg-orange-50 text-orange-700 text-xs font-semibold">
                                            {feeData.error_message}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="py-10 text-center text-slate-500 text-sm">Failed to load data.</div>
                            )}

                            <button
                                onClick={() => setSelectedStudent(null)}
                                className="w-full mt-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors"
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
                    <div className="my-8 bg-slate-50 rounded-[2.5rem] p-8 md:p-12 w-full max-w-5xl shadow-2xl relative border border-white">
                        <button
                            onClick={() => setSelectedStudentProfile(null)}
                            className="absolute top-8 right-8 p-3 bg-white text-slate-400 hover:text-slate-900 rounded-2xl shadow-sm hover:shadow-md transition-all z-10"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                            {/* Profile Header Card */}
                            <div className="md:col-span-1 space-y-6">
                                <div className="bg-white p-8 rounded-3xl border border-white shadow-sm">
                                    <div className="w-24 h-24 bg-gradient-to-tr from-indigo-500 to-indigo-600 rounded-3xl flex items-center justify-center text-white text-4xl font-extrabold shadow-lg shadow-indigo-100 mb-6">
                                        {selectedStudentProfile.first_name?.[0]}{selectedStudentProfile.last_name?.[0]}
                                    </div>
                                    <h2 className="text-2xl font-black text-slate-900">{selectedStudentProfile.first_name} {selectedStudentProfile.last_name}</h2>
                                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1 mb-6">Student ID: {selectedStudentProfile.crm_student_id}</p>
                                    
                                    <div className="space-y-4 pt-6 border-t border-slate-50">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg></div>
                                            <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Mobile</p><p className="text-sm font-bold text-slate-700">{selectedStudentProfile.mobile}</p></div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg></div>
                                            <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Email</p><p className="text-sm font-bold text-slate-700 break-all">{selectedStudentProfile.email}</p></div>
                                        </div>
                                    </div>

                                    <div className="mt-8 space-y-3">
                                        <button 
                                            onClick={() => {
                                                setSelectedStudentProfile(null);
                                                handleCompleteProfile(selectedStudentProfile);
                                            }}
                                            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                                            Edit Academic Data
                                        </button>
                                        <button 
                                            onClick={() => {
                                                setSelectedStudentProfile(null);
                                                handleViewFees(selectedStudentProfile);
                                            }}
                                            className="w-full py-3 bg-rose-50 text-rose-600 rounded-2xl font-bold hover:bg-rose-100 transition-all text-xs"
                                        >
                                            View Fees & Financials
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Data Groups Content */}
                            <div className="md:col-span-2 space-y-8">
                                {['INITIAL', 'ACADEMIC'].map(group => {
                                    const groupFields = selectedStudentProfile.dynamic_values_list?.filter(val => val.field_group === group);
                                    if (!groupFields || groupFields.length === 0) return null;

                                    return (
                                        <div key={group}>
                                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">
                                                {group === 'INITIAL' ? 'Initial Application Details' : 'Academic & Post-Admission Records'}
                                            </h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-8 rounded-[2rem] border border-white shadow-sm">
                                                {groupFields.map((val) => (
                                                    <div key={val.id}>
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{val.field_label}</p>
                                                        <p className="font-bold text-slate-800">{val.value || '-'}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                                {!selectedStudentProfile.dynamic_values_list?.length && (
                                    <div className="bg-white p-10 rounded-[2rem] text-center">
                                        <p className="text-slate-400 font-medium font-italic">No custom data recorded yet.</p>
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
