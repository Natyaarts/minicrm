import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { Search, User, Loader2, AlertCircle } from 'lucide-react';

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
            <div className="max-w-2xl mx-auto mt-10 p-8 bg-white rounded-3xl shadow-xl border border-rose-100 text-center">
                <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <User className="w-8 h-8 text-rose-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Student Portal Simulator</h2>
                <p className="text-slate-500 mb-8">You are logged in as an Administrator. Search for a student below to view the portal as they would see it.</p>

                <form onSubmit={handleAdminSearch} className="relative mb-8">
                    <Search className="absolute left-4 top-3.5 text-slate-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Search by Name, Mobile, or ID..."
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all outline-none font-medium"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <button
                        type="submit"
                        disabled={isSearching}
                        className="absolute right-2 top-2 bg-rose-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-rose-700 transition-colors disabled:opacity-50"
                    >
                        {isSearching ? 'Searching...' : 'Search'}
                    </button>
                </form>

                {searchResults.length > 0 && (
                    <div className="text-left bg-slate-50 rounded-xl border border-slate-100 divide-y divide-slate-100 max-h-60 overflow-y-auto">
                        {searchResults.map(student => (
                            <button
                                key={student.id}
                                onClick={() => selectStudent(student)}
                                className="w-full flex items-center justify-between p-4 hover:bg-white transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-700 font-bold text-xs">
                                        {student.first_name?.[0] || 'S'}
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-800 text-sm">{student.first_name} {student.last_name}</div>
                                        <div className="text-xs text-slate-500">{student.mobile}</div>
                                    </div>
                                </div>
                                <div className="text-xs font-mono font-bold text-slate-400 bg-white border px-2 py-1 rounded">
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
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-center bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-4">
                    {isAdmin && (
                        <button onClick={() => setProfile(null)} className="bg-slate-100 hover:bg-slate-200 p-2 rounded-lg text-xs font-bold text-slate-600 transition-colors">
                            Exit View
                        </button>
                    )}
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-900 mb-2">
                            Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-600 to-amber-500">{profile.first_name || profile.username}</span>
                        </h1>
                        <p className="text-slate-500 font-medium">Student Portal Dashboard</p>
                    </div>
                </div>
                <div className="mt-4 md:mt-0 text-right">
                    <div className="text-xs text-slate-400 uppercase tracking-wider font-bold">CRM ID</div>
                    <div className="text-xl font-mono text-slate-800 font-bold bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">{profile.crm_student_id || 'N/A'}</div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-4 border-b border-slate-200">
                {['DASHBOARD', 'EXAMS'].map(tab => (
                    <button 
                        key={tab} 
                        onClick={() => setActiveTab(tab)}
                        className={`pb-4 px-2 text-sm font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'text-rose-600 border-b-2 border-rose-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {activeTab === 'DASHBOARD' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Profile Card */}
                <div className="md:col-span-1 space-y-6">
                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        <h3 className="text-lg font-bold text-slate-800 mb-6 border-b border-slate-100 pb-4">Academic Profile</h3>
                        <div className="space-y-5 text-sm">
                            <div>
                                <label className="text-slate-400 font-semibold block text-xs uppercase mb-1">Program</label>
                                <div className="text-slate-800 font-medium text-base">{profile.program_name || 'N/A'}</div>
                            </div>
                            <div>
                                <label className="text-slate-400 font-semibold block text-xs uppercase mb-1">Assigned Courses (Wise LMS)</label>
                                {lmsData?.enrolled_courses && lmsData.enrolled_courses.length > 0 ? (
                                    <div className="space-y-2">
                                        {lmsData.enrolled_courses.map(course => (
                                            <div key={course.id} className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                                <div className="text-slate-800 font-bold text-sm">{course.name}</div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-slate-800 font-medium text-base">{profile.course_name || 'N/A'}</div>
                                )}
                            </div>
                            <div>
                                <label className="text-slate-400 font-semibold block text-xs uppercase mb-1">Batch</label>
                                <div className="text-slate-800 font-medium text-base">{profile.batch_name || 'Unassigned'}</div>
                            </div>
                            <div>
                                <label className="text-slate-400 font-semibold block text-xs uppercase mb-1">Email</label>
                                <div className="text-slate-600 break-all">{profile.email}</div>
                            </div>
                            <div>
                                <label className="text-slate-400 font-semibold block text-xs uppercase mb-1">Mobile</label>
                                <div className="text-slate-600 font-mono">{profile.mobile}</div>
                            </div>
                            <div>
                                <label className="text-slate-400 font-semibold block text-xs uppercase mb-1">Parent / Guardian</label>
                                <div className="text-slate-800 font-medium">{profile.father_husband_name || profile.mother_name || 'N/A'}</div>
                            </div>
                            <div>
                                <label className="text-slate-400 font-semibold block text-xs uppercase mb-1">Address</label>
                                <div className="text-slate-600 text-xs leading-relaxed">
                                    {profile.perm_address || 'No address on file'}
                                    {profile.perm_city && `, ${profile.perm_city}`}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Custom Form Details (Directly in Dashboard) */}
                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        <h3 className="text-lg font-bold text-slate-800 mb-6 border-b border-slate-100 pb-4">Application Details</h3>
                        <div className="space-y-6">
                            {['INITIAL', 'ACADEMIC'].map(group => {
                                const groupFields = profile.dynamic_values_list?.filter(val => val.field_group === group);
                                if (!groupFields || groupFields.length === 0) return null;

                                return (
                                    <div key={group}>
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">
                                            {group === 'INITIAL' ? 'Initial Application' : 'Academic Records'}
                                        </h4>
                                        <div className="grid grid-cols-1 gap-4">
                                            {groupFields.map((val) => (
                                                <div key={val.id} className="flex justify-between items-start border-b border-slate-50 pb-2 last:border-0">
                                                    <span className="text-xs font-semibold text-slate-500">{val.field_label}</span>
                                                    <span className="text-xs font-bold text-slate-800 text-right max-w-[60%] truncate">{val.value || '-'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                            {!profile.dynamic_values_list?.length && (
                                <p className="text-slate-400 text-sm italic">No custom fields filled.</p>
                            )}
                        </div>
                    </div>

                    {/* LMS Stats - Attendance & Progress */}
                    {lmsData && (
                        <div className="space-y-6">
                            {lmsData.attendance !== undefined && (
                                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                                    <h3 className="text-lg font-bold text-slate-800 mb-6">Attendance</h3>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="text-5xl font-extrabold text-rose-600">{lmsData.attendance}%</div>
                                    </div>
                                    <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden shadow-inner">
                                        <div
                                            className="bg-rose-500 h-full rounded-full transition-all duration-1000"
                                            style={{ width: `${lmsData.attendance}%` }}
                                        ></div>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-4 font-medium italic">* Based on live sessions joined</p>
                                </div>
                            )}

                            {lmsData.course_progress !== undefined && (
                                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                                    <h3 className="text-lg font-bold text-slate-800 mb-6">Course Progress</h3>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="text-5xl font-extrabold text-amber-500">{lmsData.course_progress}%</div>
                                    </div>
                                    <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden shadow-inner">
                                        <div
                                            className="bg-amber-500 h-full rounded-full transition-all duration-1000"
                                            style={{ width: `${lmsData.course_progress}%` }}
                                        ></div>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-4 font-medium italic">* Overall completion of modules & assessments</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Main Content Area */}
                <div className="md:col-span-2 space-y-6">

                    {/* Fee Status Card */}
                    {lmsData && lmsData.fee_details && (
                        <div className="bg-gradient-to-br from-rose-600 to-rose-700 p-8 rounded-3xl shadow-xl relative overflow-hidden group text-white">
                            {/* ... Using Rose/Amber Theme ... */}
                            <h3 className="text-2xl font-bold text-white/90 mb-8 flex items-center gap-3">
                                Fee Status <span className="text-xs bg-white/20 px-2 py-1 rounded text-white/80 font-normal">LMS Sync</span>
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 relative z-10">
                                <div>
                                    <div className="text-rose-200 text-sm font-medium mb-1 uppercase tracking-wide">Total Fees</div>
                                    <div className="text-3xl font-bold text-white">₹{lmsData.fee_details.total_fee.toLocaleString()}</div>
                                </div>
                                <div>
                                    <div className="text-rose-200 text-sm font-medium mb-1 uppercase tracking-wide">Paid Amount</div>
                                    <div className="text-3xl font-bold text-amber-300">₹{lmsData.fee_details.paid_fee.toLocaleString()}</div>
                                </div>
                                <div>
                                    <div className="text-rose-200 text-sm font-medium mb-1 uppercase tracking-wide">Due Amount</div>
                                    <div className="text-3xl font-bold text-white">₹{lmsData.fee_details.due_fee.toLocaleString()}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {lmsData?.recent_activities && (
                        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm h-full">
                            <h3 className="text-xl font-bold text-slate-800 mb-6">Recent Activity</h3>
                            <ul className="space-y-6">
                                {lmsData.recent_activities.map((act, idx) => (
                                    <li key={idx} className="flex gap-4">
                                        <div className="w-3 h-3 mt-1.5 rounded-full bg-amber-500 flex-shrink-0 ring-4 ring-amber-50"></div>
                                        <div>
                                            <p className="text-sm font-semibold text-slate-800">{act.activity}</p>
                                            <p className="text-xs text-slate-500 mt-1">{act.date}</p>
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
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                        <h3 className="text-xl font-black text-slate-800 mb-8 border-b border-slate-100 pb-4 flex items-center gap-2">
                            <span className="w-2 h-8 bg-rose-600 rounded-full" />
                            Academic Examinations
                        </h3>

                        {!batchDetails?.exams || batchDetails.exams.length === 0 ? (
                            <div className="py-20 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                <AlertCircle className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No exams have been scheduled yet</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {batchDetails.exams.map(exam => {
                                    const myResult = exam.is_published ? exam.results?.find(r => r.student === profile.id) : null;
                                    const isPassed = myResult && myResult.marks_obtained >= exam.passing_marks;

                                    return (
                                        <div key={exam.id} className="bg-slate-50 p-6 rounded-2xl border border-slate-100 hover:border-rose-200 transition-all group">
                                            <div className="flex justify-between items-start mb-6">
                                                <div>
                                                    <span className="text-[10px] font-black bg-rose-100 text-rose-600 px-2 py-1 rounded uppercase tracking-widest mb-2 inline-block">
                                                        {exam.exam_type?.replace('_', ' ')}
                                                    </span>
                                                    <h4 className="text-lg font-black text-slate-800">{exam.title}</h4>
                                                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Date: {new Date(exam.date).toLocaleDateString()}</p>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[10px] text-slate-400 font-bold uppercase">Total Marks</div>
                                                    <div className="text-2xl font-black text-slate-800">{exam.total_marks}</div>
                                                </div>
                                            </div>

                                            {exam.is_published ? (
                                                <div className={`p-4 rounded-xl flex items-center justify-between ${isPassed ? 'bg-emerald-50 border border-emerald-100' : 'bg-rose-50 border border-rose-100'}`}>
                                                    <div>
                                                        <p className={`text-[10px] font-black uppercase tracking-widest ${isPassed ? 'text-emerald-600' : 'text-rose-600'}`}>Your score</p>
                                                        <p className={`text-2xl font-black ${isPassed ? 'text-emerald-700' : 'text-rose-700'}`}>{myResult?.marks_obtained || 0} / <span className="text-sm opacity-60">{exam.total_marks}</span></p>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest ${isPassed ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                                                            {myResult?.is_present === false ? 'Absent' : (isPassed ? 'Passed' : 'Failed')}
                                                        </div>
                                                        {myResult?.remarks && <p className="text-[10px] font-medium text-slate-500 mt-2 italic max-w-[120px] line-clamp-2">{myResult.remarks}</p>}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-4">
                                                    <div className={`p-4 rounded-xl border border-dashed flex items-center gap-3 ${new Date(exam.date) > new Date() ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-amber-50 border-amber-200 text-amber-600'}`}>
                                                        <div className={`w-2 h-2 rounded-full animate-pulse ${new Date(exam.date) > new Date() ? 'bg-indigo-500' : 'bg-amber-500'}`} />
                                                        <span className="text-xs font-black uppercase tracking-widest">
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
                                                            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-900 transition-all shadow-lg shadow-indigo-100"
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
                <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md z-[100] flex flex-col p-4 md:p-10 animate-fadeIn">
                    <div className="max-w-4xl mx-auto w-full flex flex-col h-full gap-6">
                        {/* Player Header */}
                        <div className="flex justify-between items-center text-white">
                            <div>
                                <h2 className="text-2xl font-black">{takingExam.title}</h2>
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{takingExam.exam_type} • {takingExam.questions.length} Questions</p>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] font-black uppercase text-rose-500 animate-pulse">Live Exam Session</div>
                                <div className="text-3xl font-mono font-bold">--:--</div>
                            </div>
                        </div>

                        {/* Question Area */}
                        <div className="bg-white rounded-[40px] flex-1 shadow-2xl p-8 md:p-14 overflow-y-auto relative">
                           <div className="max-w-2xl mx-auto">
                                <div className="flex items-center gap-3 mb-8">
                                    <span className="w-10 h-10 bg-indigo-600 text-white rounded-2xl flex items-center justify-center font-black">Q{currentQuestionIdx + 1}</span>
                                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{takingExam.questions[currentQuestionIdx].marks} Marks</span>
                                </div>

                                <h3 className="text-xl md:text-3xl font-bold text-slate-800 leading-tight mb-12">
                                    {takingExam.questions[currentQuestionIdx].text}
                                </h3>

                                {takingExam.questions[currentQuestionIdx].question_type === 'MCQ' ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {takingExam.questions[currentQuestionIdx].options.map(opt => (
                                            <button 
                                                key={opt.id}
                                                onClick={() => setExamAnswers({...examAnswers, [takingExam.questions[currentQuestionIdx].id]: opt.id})}
                                                className={`p-6 rounded-3xl text-left font-bold transition-all border-2 ${examAnswers[takingExam.questions[currentQuestionIdx].id] === opt.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-200' : 'bg-slate-50 border-slate-100 text-slate-600 hover:border-indigo-200'}`}
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
                                        className="w-full p-8 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none min-h-[250px] font-medium text-lg focus:border-indigo-600 transition-all"
                                    />
                                )}
                           </div>
                        </div>

                        {/* Player Footer / Navigation */}
                        <div className="flex justify-between items-center bg-white/10 p-2 rounded-full border border-white/5 backdrop-blur-sm">
                            <button 
                                disabled={currentQuestionIdx === 0}
                                onClick={() => setCurrentQuestionIdx(currentQuestionIdx - 1)}
                                className="px-8 py-4 rounded-full font-black text-xs uppercase tracking-widest text-white hover:bg-white/10 disabled:opacity-20"
                            >
                                Previous
                            </button>
                            
                            <div className="hidden md:flex gap-2">
                                {takingExam.questions.map((_, i) => (
                                    <button 
                                        key={i} 
                                        onClick={() => setCurrentQuestionIdx(i)}
                                        className={`w-10 h-10 rounded-full font-black text-xs border ${currentQuestionIdx === i ? 'bg-white text-slate-900 border-white' : 'text-white border-white/20 hover:border-white/50'} ${examAnswers[takingExam.questions[i].id] ? 'bg-emerald-500/20' : ''}`}
                                    >
                                        {i + 1}
                                    </button>
                                ))}
                            </div>

                            {currentQuestionIdx < takingExam.questions.length - 1 ? (
                                <button 
                                    onClick={() => setCurrentQuestionIdx(currentQuestionIdx + 1)}
                                    className="px-10 py-4 bg-white text-slate-900 rounded-full font-black text-xs uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all shadow-xl"
                                >
                                    Next Question
                                </button>
                            ) : (
                                <button 
                                    onClick={() => {
                                        if (window.confirm("Are you sure you want to submit your exam?")) {
                                            setToast({ type: 'success', message: 'Exam Submitted Successfully!' });
                                            setTakingExam(null);
                                            setTimeout(() => setToast(null), 3000);
                                        }
                                    }}
                                    className="px-10 py-4 bg-emerald-500 text-white rounded-full font-black text-xs uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-500/20"
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
