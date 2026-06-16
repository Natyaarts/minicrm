import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { Search, User, Loader2, AlertCircle, Check } from 'lucide-react';

const StudentPortal = () => {
    const { user } = useAuth();
    const [profile, setProfile] = useState(null);
    const [lmsData, setLmsData] = useState(null);
    const [batchDetails, setBatchDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('DASHBOARD');
    const [takingExam, setTakingExam] = useState(null); // Exam object
    const [examAnswers, setExamAnswers] = useState({}); // q_id -> ans
    const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
    const [toast, setToast] = useState(null);

    // Admin Mode Search
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    const isAdmin = user?.role === 'SUPER_ADMIN' || user?.is_superuser;

    useEffect(() => {
        if (!isAdmin) {
            fetchMyData();
        } else {
            setLoading(false); // Admin starts ready to search
        }
    }, [isAdmin]);

    const fetchMyData = async () => {
        try {
            setLoading(true);
            const userRes = await api.get('auth/me/');
            setProfile(userRes.data); // Initial fallback

            // Fetch student record linked to this user
            const studentRes = await api.get('students/');
            const students = Array.isArray(studentRes.data) ? studentRes.data : (studentRes.data.results || []);

            if (students.length > 0) {
                const myProfile = students[0];
                setProfile(myProfile);
                fetchLmsData(myProfile.id);
            }
        } catch (err) {
            console.error("Error fetching student data", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchLmsData = async (studentId) => {
        try {
            const res = await api.get(`integrations/details/?student_id=${studentId}`);
            setLmsData(res.data);
        } catch (err) { console.error("LMS Data fetch error", err); }
    };

    const fetchBatchDetails = async (batchId) => {
        try {
            const res = await api.get(`batches/${batchId}/`);
            setBatchDetails(res.data);
        } catch (err) { console.error("Batch details error", err); }
    };

    useEffect(() => {
        if (profile?.batch_id) {
            fetchBatchDetails(profile.batch_id);
        }
    }, [profile?.batch_id]);

    const submitFinalExam = async (examId) => {
        if (!profile?.id) {
            alert("Student profile not found.");
            return;
        }
        try {
            setLoading(true);
            const payload = {
                exam: examId,
                student: profile.id,
                is_submitted: true,
                answers_json: examAnswers
            };
            const res = await api.post('student-submissions/', payload);
            const score = res.data?.score ?? 0;
            setToast({ type: 'success', message: `Exam Submitted! Score: ${score}` });
            setTakingExam(null);
            setExamAnswers({});
            // Refresh student profile/data
            fetchMyData();
        } catch (err) {
            console.error("Exam submission failed", err);
            alert("Failed to submit exam. Please check your connection.");
        } finally {
            setLoading(false);
            setTimeout(() => setToast(null), 3000);
        }
    };

    const handleAdminSearch = async (e) => {
        e.preventDefault();
        if (!searchTerm.trim()) return;

        setIsSearching(true);
        try {
            const res = await api.get(`students/?search=${searchTerm}`);
            const results = Array.isArray(res.data) ? res.data : (res.data.results || []);
            setSearchResults(results);
        } catch (err) {
            alert("Search failed");
        } finally {
            setIsSearching(false);
        }
    };

    const selectStudent = (student) => {
        setProfile(student);
        setSearchResults([]);
        setSearchTerm('');
        fetchLmsData(student.id);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="w-8 h-8 text-rose-600 animate-spin" />
            </div>
        );
    }

    // --- ADMIN SEARCH VIEW ---
    if (isAdmin && !profile) {
        return (
            <div className="max-w-xl mx-auto mt-10 p-6 bg-white rounded-2xl border border-slate-200 shadow-sm text-center animate-fadeIn">
                <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <User className="w-6 h-6 text-rose-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">Student Portal Simulator</h2>
                <p className="text-sm text-slate-500 mb-6">You are logged in as an Administrator. Search for a student below to view the portal as they would see it.</p>

                <form onSubmit={handleAdminSearch} className="relative flex items-center gap-2 mb-6">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search by Name, Mobile, or ID..."
                            className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 transition-all outline-none font-medium text-slate-800"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isSearching}
                        className="bg-rose-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-rose-700 transition-colors disabled:opacity-50 shadow-sm"
                    >
                        {isSearching ? 'Searching...' : 'Search'}
                    </button>
                </form>

                {searchResults.length > 0 && (
                    <div className="text-left bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-60 overflow-y-auto shadow-sm">
                        {searchResults.map(student => (
                            <button
                                key={student.id}
                                onClick={() => selectStudent(student)}
                                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-700 font-bold text-xs">
                                        {student.first_name?.[0] || 'S'}
                                    </div>
                                    <div>
                                        <div className="font-semibold text-slate-800 text-sm">{student.first_name} {student.last_name}</div>
                                        <div className="text-xs text-slate-500 font-medium">{student.mobile}</div>
                                    </div>
                                </div>
                                <div className="text-xs font-mono font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg">
                                    {student.crm_student_id}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
                <AlertCircle className="w-12 h-12 text-rose-300 mb-4" />
                <h3 className="text-xl font-bold text-slate-800">Student Profile Not Found</h3>
                <p className="text-slate-500 mt-2 max-w-md">Your user account is not linked to any active student profile. Please contact the administrator.</p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn text-slate-900 pb-10">
            {toast && (
                <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[150] px-4 py-2.5 rounded-xl bg-slate-950 text-white shadow-lg flex items-center gap-2 font-semibold text-xs whitespace-nowrap border border-slate-800 animate-slideDown">
                    <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                        <Check size={12} className="stroke-[3]" />
                    </div>
                    {toast.message}
                </div>
            )}

            {/* Header Section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white px-6 py-5 rounded-2xl shadow-sm border border-slate-200 gap-4">
                <div className="flex items-center gap-4">
                    {isAdmin && (
                        <button onClick={() => setProfile(null)} className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5">
                            Exit View
                        </button>
                    )}
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 mb-0.5">
                            Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-600 to-amber-500">{profile.first_name || profile.username}</span>
                        </h1>
                        <p className="text-xs text-slate-500 font-medium">Student Portal Dashboard</p>
                    </div>
                </div>
                <div className="flex flex-col sm:items-end">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1">CRM Student ID</span>
                    <span className="text-sm font-mono text-slate-600 font-bold bg-slate-50 px-3 py-1 rounded-xl border border-slate-200">
                        {profile.crm_student_id || 'N/A'}
                    </span>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex justify-start">
                <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-200 flex flex-nowrap whitespace-nowrap">
                    {['DASHBOARD', 'EXAMS'].map(tab => (
                        <button 
                            key={tab} 
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === tab ? 'bg-rose-50 text-rose-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            {tab === 'DASHBOARD' ? 'Dashboard' : 'Academic Exams'}
                        </button>
                    ))}
                </div>
            </div>

            {activeTab === 'DASHBOARD' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Profile Card */}
                    <div className="md:col-span-1 space-y-6">
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                            <h3 className="text-base font-bold text-slate-800 mb-4 border-b border-slate-100 pb-3">Academic Profile</h3>
                            <div className="space-y-4 text-sm">
                                <div>
                                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Program</label>
                                    <div className="text-slate-700 text-sm font-semibold">{profile.program_name || 'N/A'}</div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Assigned Courses (Wise LMS)</label>
                                    {lmsData?.enrolled_courses && lmsData.enrolled_courses.length > 0 ? (
                                        <div className="space-y-1.5">
                                            {lmsData.enrolled_courses.map(course => (
                                                <div key={course.id} className="flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                                                    <div className="text-slate-700 font-semibold text-sm">{course.name}</div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-slate-700 text-sm font-semibold">{profile.course_name || 'N/A'}</div>
                                    )}
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Batch</label>
                                    <div className="text-slate-700 text-sm font-semibold">{profile.batch_name || 'Unassigned'}</div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Email</label>
                                    <div className="text-slate-600 text-sm font-medium break-all">{profile.email}</div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Mobile</label>
                                    <div className="text-slate-600 text-sm font-medium font-mono">{profile.mobile}</div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Parent / Guardian</label>
                                    <div className="text-slate-700 text-sm font-semibold">{profile.father_husband_name || profile.mother_name || 'N/A'}</div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Address</label>
                                    <div className="text-slate-600 text-xs font-medium leading-relaxed">
                                        {profile.perm_address || 'No address on file'}
                                        {profile.perm_city && `, ${profile.perm_city}`}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Custom Form Details (Directly in Dashboard) */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                            <h3 className="text-base font-bold text-slate-800 mb-4 border-b border-slate-100 pb-3">Application Details</h3>
                            <div className="space-y-4">
                                {['INITIAL', 'ACADEMIC'].map(group => {
                                    const groupFields = profile.dynamic_values_list?.filter(val => val.field_group === group);
                                    if (!groupFields || groupFields.length === 0) return null;

                                    return (
                                        <div key={group}>
                                            <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                                                {group === 'INITIAL' ? 'Initial Application' : 'Academic Records'}
                                            </h4>
                                            <div className="grid grid-cols-1 gap-2">
                                                {groupFields.map((val) => (
                                                    <div key={val.id} className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0 text-xs">
                                                        <span className="font-semibold text-slate-500">{val.field_label}</span>
                                                        <span className="font-bold text-slate-800 text-right max-w-[60%] truncate">{val.value || '-'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                                {!profile.dynamic_values_list?.length && (
                                    <p className="text-slate-400 text-xs italic">No custom fields filled.</p>
                                )}
                            </div>
                        </div>

                        {/* LMS Stats - Attendance & Progress */}
                        {lmsData && (
                            <div className="space-y-6">
                                {lmsData.attendance !== undefined && (
                                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                                        <h3 className="text-base font-bold text-slate-800 mb-4">Attendance</h3>
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="text-4xl font-extrabold text-rose-600">{lmsData.attendance}%</div>
                                        </div>
                                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden shadow-inner">
                                            <div
                                                className="bg-rose-500 h-full rounded-full transition-all duration-1000"
                                                style={{ width: `${lmsData.attendance}%` }}
                                            ></div>
                                        </div>
                                        <p className="text-[10px] text-slate-400 mt-3 font-medium italic">* Based on live sessions joined</p>
                                    </div>
                                )}

                                {lmsData.course_progress !== undefined && (
                                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                                        <h3 className="text-base font-bold text-slate-800 mb-4">Course Progress</h3>
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="text-4xl font-extrabold text-amber-500">{lmsData.course_progress}%</div>
                                        </div>
                                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden shadow-inner">
                                            <div
                                                className="bg-amber-500 h-full rounded-full transition-all duration-1000"
                                                style={{ width: `${lmsData.course_progress}%` }}
                                            ></div>
                                        </div>
                                        <p className="text-[10px] text-slate-400 mt-3 font-medium italic">* Overall completion of modules & assessments</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Main Content Area */}
                    <div className="md:col-span-2 space-y-6">

                        {/* Fee Status Card */}
                        {lmsData && lmsData.fee_details && (
                            <div className="bg-gradient-to-br from-rose-500 to-rose-600 p-6 rounded-2xl shadow-sm relative overflow-hidden group text-white">
                                <h3 className="text-base font-bold text-white/95 mb-6 flex items-center gap-2">
                                    Fee Status <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded text-white font-medium">LMS Sync</span>
                                </h3>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 relative z-10">
                                    <div>
                                        <div className="text-rose-100 text-[10px] font-bold uppercase tracking-wider mb-1">Total Fees</div>
                                        <div className="text-2xl font-bold text-white">₹{lmsData.fee_details.total_fee.toLocaleString()}</div>
                                    </div>
                                    <div>
                                        <div className="text-rose-100 text-[10px] font-bold uppercase tracking-wider mb-1">Paid Amount</div>
                                        <div className="text-2xl font-bold text-amber-200">₹{lmsData.fee_details.paid_fee.toLocaleString()}</div>
                                    </div>
                                    <div>
                                        <div className="text-rose-100 text-[10px] font-bold uppercase tracking-wider mb-1">Due Amount</div>
                                        <div className="text-2xl font-bold text-white">₹{lmsData.fee_details.due_fee.toLocaleString()}</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {lmsData?.recent_activities && (
                            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-full">
                                <h3 className="text-base font-bold text-slate-800 mb-4">Recent Activity</h3>
                                <ul className="space-y-4">
                                    {lmsData.recent_activities.map((act, idx) => (
                                        <li key={idx} className="flex gap-4">
                                            <div className="w-2 h-2 mt-1.5 rounded-full bg-amber-500 flex-shrink-0 ring-4 ring-amber-50"></div>
                                            <div>
                                                <p className="text-xs font-semibold text-slate-800">{act.activity}</p>
                                                <p className="text-[10px] text-slate-400 font-medium mt-0.5">{act.date}</p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-8 animate-fadeIn">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 className="text-base font-bold text-slate-800 mb-6 border-b border-slate-100 pb-3 flex items-center gap-2">
                            <span className="w-1 h-5 bg-rose-600 rounded-full" />
                            Academic Examinations
                        </h3>

                        {!batchDetails?.exams || batchDetails.exams.length === 0 ? (
                            <div className="py-12 text-center bg-slate-50/50 rounded-xl border border-slate-200/60 max-w-md mx-auto my-4 p-6">
                                <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                                <p className="text-slate-600 font-semibold text-sm">No scheduled exams</p>
                                <p className="text-slate-400 text-xs mt-1">There are no academic examinations currently scheduled for your batch.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {batchDetails.exams.map(exam => {
                                    const myResult = exam.is_published ? exam.results?.find(r => r.student === profile.id) : null;
                                    const isPassed = myResult && myResult.marks_obtained >= exam.passing_marks;

                                    return (
                                        <div key={exam.id} className="bg-white p-5 rounded-xl border border-slate-200 hover:border-rose-200 hover:shadow-sm transition-all group">
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <span className="text-[9px] font-bold bg-rose-50 text-rose-700 px-2 py-0.5 rounded uppercase tracking-wider mb-2 inline-block">
                                                        {exam.exam_type?.replace('_', ' ')}
                                                    </span>
                                                    <h4 className="text-base font-bold text-slate-800">{exam.title}</h4>
                                                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-1">Date: {new Date(exam.date).toLocaleDateString()}</p>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Total Marks</div>
                                                    <div className="text-xl font-bold text-slate-800">{exam.total_marks}</div>
                                                </div>
                                            </div>

                                            {exam.is_published ? (
                                                <div className={`p-3 rounded-lg flex items-center justify-between mt-4 ${isPassed ? 'bg-emerald-50/50 border border-emerald-100' : 'bg-rose-50/50 border border-rose-100'}`}>
                                                    <div>
                                                        <p className={`text-[9px] font-bold uppercase tracking-wider ${isPassed ? 'text-emerald-600' : 'text-rose-600'}`}>Your score</p>
                                                        <p className={`text-xl font-bold ${isPassed ? 'text-emerald-700' : 'text-rose-700'}`}>{myResult?.marks_obtained || 0} <span className="text-xs text-slate-400 font-normal">/ {exam.total_marks}</span></p>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${isPassed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                                            {myResult?.is_present === false ? 'Absent' : (isPassed ? 'Passed' : 'Failed')}
                                                        </div>
                                                        {myResult?.remarks && <p className="text-[10px] font-medium text-slate-500 mt-2 italic max-w-[120px] line-clamp-2">{myResult.remarks}</p>}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-3 mt-4">
                                                    <div className={`p-3 rounded-lg border border-slate-200/80 flex items-center gap-2 bg-slate-50 text-slate-500`}>
                                                        <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${new Date(exam.date) > new Date() ? 'bg-indigo-500' : 'bg-rose-500'}`} />
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                                            {new Date(exam.date) > new Date() ? 'Upcoming Assessment' : 'Awaiting Result Publication'}
                                                        </span>
                                                    </div>

                                                    {exam.questions?.length > 0 && new Date(exam.date).toDateString() === new Date().toDateString() && (
                                                        <button 
                                                            onClick={() => {
                                                                setTakingExam(exam);
                                                                setExamAnswers({});
                                                                setCurrentQuestionIdx(0);
                                                            }}
                                                            className="w-full py-2.5 bg-rose-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-rose-700 transition-colors shadow-sm mt-3"
                                                        >
                                                            Attend Exam Now
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {takingExam && (
                <div className="fixed inset-0 bg-slate-900/98 backdrop-blur-md z-[100] flex flex-col p-4 md:p-8 animate-fadeIn">
                    <div className="max-w-4xl mx-auto w-full flex flex-col h-full gap-4">
                        {/* Player Header */}
                        <div className="flex justify-between items-center text-white">
                            <div>
                                <h2 className="text-xl font-bold text-white">{takingExam.title}</h2>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">{takingExam.exam_type} • {takingExam.questions.length} Questions</p>
                            </div>
                            <div className="text-right">
                                <div className="text-[9px] font-bold uppercase tracking-wider text-rose-500 animate-pulse">Live Exam Session</div>
                                <div className="text-2xl font-mono font-bold text-white">--:--</div>
                            </div>
                        </div>

                        {/* Question Area */}
                        <div className="bg-white rounded-2xl flex-1 shadow-xl p-6 md:p-10 overflow-y-auto relative border border-slate-100">
                           <div className="max-w-2xl mx-auto">
                                <div className="flex items-center gap-3 mb-6">
                                    <span className="w-9 h-9 bg-rose-600 text-white rounded-lg flex items-center justify-center font-bold text-sm">Q{currentQuestionIdx + 1}</span>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{takingExam.questions[currentQuestionIdx].marks} Marks</span>
                                </div>

                                <h3 className="text-lg md:text-2xl font-bold text-slate-800 leading-snug mb-8">
                                    {takingExam.questions[currentQuestionIdx].text}
                                </h3>

                                {takingExam.questions[currentQuestionIdx].question_type === 'MCQ' ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {takingExam.questions[currentQuestionIdx].options.map(opt => (
                                            <button 
                                                key={opt.id}
                                                onClick={() => setExamAnswers({...examAnswers, [takingExam.questions[currentQuestionIdx].id]: opt.id})}
                                                className={`p-4 rounded-xl text-left font-semibold text-sm transition-all border border-slate-200 ${examAnswers[takingExam.questions[currentQuestionIdx].id] === opt.id ? 'bg-rose-50 border-rose-500 text-rose-950 shadow-sm font-bold' : 'bg-slate-50 hover:bg-slate-100 border-slate-100 text-slate-600'}`}
                                            >
                                                {opt.option_text}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <textarea 
                                        value={examAnswers[takingExam.questions[currentQuestionIdx].id] || ''}
                                        onChange={e => setExamAnswers({...examAnswers, [takingExam.questions[currentQuestionIdx].id]: e.target.value})}
                                        placeholder="Type your answer here..."
                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none min-h-[200px] font-medium text-sm focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 transition-all text-slate-800"
                                    />
                                )}
                           </div>
                        </div>

                        {/* Player Footer / Navigation */}
                        <div className="flex justify-between items-center bg-slate-800/80 p-2 rounded-xl border border-slate-700 backdrop-blur-sm gap-2">
                            <button 
                                disabled={currentQuestionIdx === 0}
                                onClick={() => setCurrentQuestionIdx(currentQuestionIdx - 1)}
                                className="px-5 py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-300 hover:text-white hover:bg-slate-700/50 disabled:opacity-20 transition-all"
                            >
                                Previous
                            </button>
                            
                            <div className="hidden md:flex gap-1.5">
                                {takingExam.questions.map((_, i) => (
                                    <button 
                                        key={i} 
                                        onClick={() => setCurrentQuestionIdx(i)}
                                        className={`w-8 h-8 rounded-lg font-semibold text-xs border ${currentQuestionIdx === i ? 'bg-white text-slate-900 border-white' : 'text-slate-300 border-slate-700 hover:border-slate-500'} ${examAnswers[takingExam.questions[i].id] ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : ''} transition-all`}
                                    >
                                        {i + 1}
                                    </button>
                                ))}
                            </div>

                            {currentQuestionIdx < takingExam.questions.length - 1 ? (
                                <button 
                                    onClick={() => setCurrentQuestionIdx(currentQuestionIdx + 1)}
                                    className="px-6 py-2.5 bg-white text-slate-900 rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                                >
                                    Next Question
                                </button>
                            ) : (
                                <button 
                                    onClick={() => {
                                        if (window.confirm("Are you sure you want to submit your exam?")) {
                                            submitFinalExam(takingExam.id);
                                        }
                                    }}
                                    className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-emerald-700 transition-all shadow-sm"
                                >
                                    Submit Final Test
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default StudentPortal;
