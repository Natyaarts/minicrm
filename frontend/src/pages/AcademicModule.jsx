
import React, { useState, useEffect } from 'react';
import api from '../api/axios';

const AcademicModule = () => {
    const [batches, setBatches] = useState([]);
    const [mentors, setMentors] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [students, setStudents] = useState([]);
    const [stats, setStats] = useState({ totalStudents: 0, totalBatches: 0, totalMentors: 0, totalTeachers: 0 });

    const [activeTab, setActiveTab] = useState('overview');
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
    const [newTeacher, setNewTeacher] = useState({ username: '', first_name: '', last_name: '', email: '', phone_number: '' });
    
    // Profile Completion State
    const [completingProfile, setCompletingProfile] = useState(null);
    const [academicFields, setAcademicFields] = useState([]);
    const [academicValues, setAcademicValues] = useState({});
    const [savingCompletion, setSavingCompletion] = useState(false);

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchTeachers = async () => {
        try {
            const res = await api.get('auth/management/teachers/');
            setTeachers(res.data.results || res.data);
            setStats(prev => ({ ...prev, totalTeachers: (res.data.results || res.data).length }));
        } catch (err) {
            console.error("Failed to fetch teachers", err);
        }
    };

    useEffect(() => {
        fetchStudents();
    }, [studentPage]);

    useEffect(() => {
        // Reset to page 1 when searching
        if (searchTerm) {
            setStudentPage(1);
        }
    }, [searchTerm]);

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const [batchRes, mentorRes, teacherRes] = await Promise.all([
                api.get('batches/'),
                api.get('auth/mentors/'),
                api.get('auth/management/teachers/')
            ]);

            const bData = batchRes.data.results || batchRes.data;
            const mData = mentorRes.data.results || mentorRes.data;
            const tData = teacherRes.data.results || teacherRes.data;

            setBatches(bData);
            setMentors(mData);
            setTeachers(tData);

            // Fetch students separately or update stats from studentRes later
            await fetchStudents();

            setStats(prev => ({
                ...prev,
                totalBatches: batchRes.data.count || bData.length,
                totalMentors: mentorRes.data.count || mData.length,
                totalTeachers: teacherRes.data.count || tData.length
            }));

        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchStudents = async () => {
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
                setStats(prev => ({ ...prev, totalStudents: data.count }));
            } else {
                setStudents(Array.isArray(data) ? data : []);
                setStudentPagination({ count: data.length, next: null, previous: null });
                setStats(prev => ({ ...prev, totalStudents: data.length }));
            }
        } catch (err) {
            console.error("Failed to fetch students", err);
        }
    };

    // Filtered students is now just 'students' because the API handles search
    const displayStudents = students;

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchStudents();
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

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
            await api.post('auth/management/teachers/', newTeacher);
            setShowAddTeacher(false);
            setNewTeacher({ username: '', first_name: '', last_name: '', email: '', phone_number: '' });
            fetchTeachers();
        } catch (err) {
            console.error("Failed to add teacher", err);
            alert("Failed to add teacher. Check if username/email already exists.");
        }
    };

    const handleAssignTeacher = async (batchId, teacherId) => {
        try {
            await api.patch(`batches/${batchId}/`, { teacher: teacherId });
            setEditingBatch(null);
            const res = await api.get('batches/');
            setBatches(res.data.results || res.data);
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
                        <div key={batch.id} className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group">
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
            <div className="flex justify-between items-center px-1">
                <h3 className="text-xl font-bold text-slate-800">Teacher Directory</h3>
                <button
                    onClick={() => setShowAddTeacher(true)}
                    className="px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-bold hover:bg-teal-700 shadow-lg shadow-teal-200 transition-all flex items-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                    Add Teacher
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                                {teacher.phone_number || 'N/A'}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderBatches = () => (
        <div className="space-y-6 animate-fadeIn">
            <h3 className="text-xl font-bold text-slate-800 px-1">All Batches</h3>
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
        </div>
    );

    const renderStudents = () => (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex justify-between items-center px-1">
                <h3 className="text-xl font-bold text-slate-800">Student Directory</h3>
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
    );

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
                        Batches ({batches.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('teachers')}
                        className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'teachers' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                    >
                        Teachers ({teachers.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('students')}
                        className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'students' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                    >
                        Students ({students.length})
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
                    </div>
                )
            }

            {/* Modals Container */}

            {/* Add Teacher Modal */}
            {showAddTeacher && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl relative">
                        <h2 className="text-2xl font-bold mb-6 text-slate-900">Add New Teacher</h2>
                        <form onSubmit={handleAddTeacher} className="space-y-4">
                            <input
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-teal-500 transition-all font-medium"
                                placeholder="Username"
                                value={newTeacher.username}
                                onChange={e => setNewTeacher({ ...newTeacher, username: e.target.value })}
                                required
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
                            <input
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-teal-500 transition-all font-medium"
                                placeholder="Phone Number"
                                value={newTeacher.phone_number}
                                onChange={e => setNewTeacher({ ...newTeacher, phone_number: e.target.value })}
                            />
                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={() => setShowAddTeacher(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors">Cancel</button>
                                <button type="submit" className="flex-1 py-3 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-colors">Create Account</button>
                            </div>
                        </form>
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
