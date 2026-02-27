
import React, { useState, useEffect } from 'react';
import api from '../api/axios';

const AcademicModule = () => {
    const [batches, setBatches] = useState([]);
    const [mentors, setMentors] = useState([]);
    const [students, setStudents] = useState([]);
    const [stats, setStats] = useState({ totalStudents: 0, totalBatches: 0, totalMentors: 0 });

    const [activeTab, setActiveTab] = useState('overview');
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Fee Data Modal State
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [feeData, setFeeData] = useState(null);
    const [feeLoading, setFeeLoading] = useState(false);

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const [batchRes, mentorRes, studentRes] = await Promise.all([
                api.get('batches/'),
                api.get('auth/mentors/'),
                api.get('students/')
            ]);

            const bData = batchRes.data.results || batchRes.data;
            const mData = mentorRes.data.results || mentorRes.data;
            const sData = studentRes.data.results || studentRes.data;

            setBatches(bData);
            setMentors(mData);
            setStudents(sData);

            setStats({
                totalBatches: batchRes.data.count || bData.length,
                totalMentors: mentorRes.data.count || mData.length,
                totalStudents: studentRes.data.count || sData.length
            });

        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const filteredStudents = students.filter(s =>
        (s.first_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (s.last_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (s.crm_student_id?.toLowerCase().includes(searchTerm.toLowerCase()))
    );

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

    const renderOverview = () => (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fadeIn">
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
                <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Mentors</div>
                <div className="text-4xl font-extrabold text-green-600">{stats.totalMentors}</div>
            </div>

            {/* Recent Batches Preview */}
            <div className="md:col-span-3 mt-6">
                <h3 className="text-xl font-bold text-slate-800 mb-6 px-1">Batch Overview</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {batches.slice(0, 6).map(batch => (
                        <div key={batch.id} className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group">
                            <h4 className="font-bold text-slate-900 text-lg mb-1 group-hover:text-indigo-600 transition-colors">{batch.name}</h4>
                            <p className="text-sm text-slate-500 font-medium mb-4">{batch.course_name}</p>
                            <div className="flex justify-between items-center text-xs text-slate-500 border-t border-slate-100 pt-3">
                                <span className="bg-slate-100 px-2 py-1 rounded text-slate-600 font-medium">Students: {batch.student_count}</span>
                                <span className="font-medium text-slate-700">Mentor: {batch.primary_mentor_details?.username}</span>
                            </div>
                        </div>
                    ))}
                </div>
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
                            <th className="p-4 font-bold text-slate-500 uppercase text-xs">Students</th>
                            <th className="p-4 font-bold text-slate-500 uppercase text-xs">Start Date</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {batches.map(batch => (
                            <tr key={batch.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4 font-bold text-slate-900">{batch.name}</td>
                                <td className="p-4 text-slate-600 font-medium">{batch.course_name}</td>
                                <td className="p-4 text-slate-600">{batch.primary_mentor_details?.username}</td>
                                <td className="p-4 text-slate-600">{batch.student_count}</td>
                                <td className="p-4 text-slate-600 font-mono text-xs">{batch.start_date}</td>
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
                            <th className="p-4 font-bold text-slate-500 uppercase text-xs">Batch</th>
                            <th className="p-4 font-bold text-slate-500 uppercase text-xs">Mobile</th>
                            <th className="p-4 font-bold text-slate-500 uppercase text-xs text-right">Fee Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredStudents.length > 0 ? (
                            filteredStudents.map(student => (
                                <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-4 font-mono text-xs font-bold text-indigo-600 bg-indigo-50/50 w-24 text-center rounded-r-lg my-1">{student.crm_student_id}</td>
                                    <td className="p-4 font-bold text-slate-800">{student.first_name} {student.last_name}</td>
                                    <td className="p-4 text-slate-600">{student.program_name}</td>
                                    <td className="p-4 text-slate-600">{student.batch_name || <span className="text-slate-400 italic font-medium">Unassigned</span>}</td>
                                    <td className="p-4 text-slate-600 font-mono text-xs">{student.mobile}</td>
                                    <td className="p-4 text-right">
                                        <button
                                            onClick={() => handleViewFees(student)}
                                            className="px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-xs font-bold transition-colors"
                                        >
                                            View Fees
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
        </div>
    );

    return (
        <div className="space-y-8 text-slate-900 w-full">
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
                        {activeTab === 'students' && renderStudents()}
                    </div>
                )
            }

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
        </div >
    );
}

export default AcademicModule;
