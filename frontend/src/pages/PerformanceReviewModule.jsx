import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { Star, Plus, Calendar, User, Search, Award, MessageSquare, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

const PerformanceReviewModule = () => {
    const { user: authUser } = useAuth();
    const [reviews, setReviews] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        employee: '',
        review_period: 'Q1 2026',
        rating: 5,
        feedback: ''
    });

    const isAdmin = authUser?.role === 'SUPER_ADMIN' || authUser?.role === 'ADMIN';

    const fetchReviews = async () => {
        setLoading(true);
        try {
            const res = await api.get('hrms/reviews/');
            setReviews(res.data.results || res.data || []);
            
            if (isAdmin) {
                const empRes = await api.get('hrms/employees/');
                setEmployees(empRes.data.results || empRes.data || []);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReviews();
    }, []);

    const handleCreateReview = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = {
                ...formData,
                reviewer: authUser.hrms_profile_id // Wait, do we have hrms_profile_id in authUser? Let's just assign employee and let backend figure it out, or assign the reviewer if required.
            };
            
            // Wait, we need to pass reviewer. But backend model might not auto-assign reviewer.
            // Let's see models.py: reviewer is a ForeignKey to EmployeeProfile.
            // Let's pass the currently logged-in user's profile ID as reviewer. We'll have to find it.
            const myProfile = employees.find(e => e.display_username === authUser.username);
            if (myProfile) {
                payload.reviewer = myProfile.id;
            }

            await api.post('hrms/reviews/', payload);
            setShowModal(false);
            setFormData({ employee: '', review_period: 'Q1 2026', rating: 5, feedback: '' });
            fetchReviews();
        } catch (err) {
            alert(err.response?.data?.error || "Failed to create review.");
        } finally {
            setLoading(false);
        }
    };

    const renderStars = (rating) => {
        return (
            <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                    <Star 
                        key={star} 
                        size={16} 
                        className={star <= rating ? "fill-amber-400 text-amber-400" : "fill-slate-100 text-slate-200"} 
                    />
                ))}
            </div>
        );
    };

    const filteredReviews = reviews.filter(r => 
        r.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.review_period.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-[#FDFCFB] pb-20 px-4 md:px-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Performance Reviews</h1>
                    <p className="text-slate-500 text-sm mt-1">Track employee evaluations and feedback.</p>
                </div>
                {isAdmin && (
                    <button 
                        onClick={() => setShowModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg font-semibold text-sm hover:bg-slate-900 transition-all shadow-sm"
                    >
                        <Plus size={16} /> New Review
                    </button>
                )}
            </div>

            {/* Search Bar */}
            <div className="mb-6 relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Search by name or period..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all shadow-sm"
                />
            </div>

            {/* Reviews Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredReviews.map(review => (
                    <motion.div 
                        key={review.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all relative overflow-hidden group"
                    >
                        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-bl-full -mr-4 -mt-4 opacity-50 group-hover:scale-110 transition-transform duration-500" />
                        
                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm shadow-inner">
                                        {review.employee_name?.[0]}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 text-sm">{review.employee_name}</h3>
                                        <div className="flex items-center gap-1 mt-0.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                            <Calendar size={10} />
                                            {review.review_period}
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-amber-50 px-2 py-1 rounded-lg border border-amber-100 flex items-center gap-1">
                                    <span className="font-bold text-amber-700 text-xs">{review.rating}.0</span>
                                </div>
                            </div>

                            <div className="mb-4">
                                {renderStars(review.rating)}
                            </div>

                            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
                                    <MessageSquare size={14} className="text-slate-400" /> Manager Feedback
                                </h4>
                                <p className="text-sm text-slate-700 leading-relaxed line-clamp-3 italic">"{review.feedback}"</p>
                            </div>
                            
                            <div className="mt-4 flex items-center justify-between text-[10px] font-medium text-slate-400">
                                <span>Reviewed by: {review.reviewer_name || 'System'}</span>
                                <span>{new Date(review.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </motion.div>
                ))}
                
                {!loading && filteredReviews.length === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-500">
                        <Award size={48} className="mx-auto text-slate-300 mb-3" />
                        <p className="font-medium">No performance reviews found.</p>
                    </div>
                )}
            </div>

            {/* Modal */}
            <AnimatePresence>
                {showModal && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }} 
                            animate={{ scale: 1, opacity: 1 }} 
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-200 relative"
                        >
                            <button 
                                onClick={() => setShowModal(false)}
                                className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                <X size={18} />
                            </button>
                            
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                                    <Award size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-800 leading-tight">New Evaluation</h2>
                                    <p className="text-xs font-semibold text-slate-500">Submit a performance review</p>
                                </div>
                            </div>

                            <form onSubmit={handleCreateReview} className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Employee</label>
                                    <select required value={formData.employee} onChange={e => setFormData({...formData, employee: e.target.value})} className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-sm font-medium focus:border-indigo-400 focus:bg-white outline-none transition-all">
                                        <option value="">Select Employee</option>
                                        {employees.map(e => <option key={e.id} value={e.id}>{e.full_name || e.display_username}</option>)}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Review Cycle</label>
                                        <select required value={formData.review_period} onChange={e => setFormData({...formData, review_period: e.target.value})} className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-sm font-medium focus:border-indigo-400 focus:bg-white outline-none transition-all">
                                            <option value="Q1 2026">Q1 2026</option>
                                            <option value="Q2 2026">Q2 2026</option>
                                            <option value="Q3 2026">Q3 2026</option>
                                            <option value="Q4 2026">Q4 2026</option>
                                            <option value="Annual 2025">Annual 2025</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Rating (1-5)</label>
                                        <select required value={formData.rating} onChange={e => setFormData({...formData, rating: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-sm font-medium focus:border-indigo-400 focus:bg-white outline-none transition-all">
                                            <option value="5">5 - Excellent</option>
                                            <option value="4">4 - Good</option>
                                            <option value="3">3 - Average</option>
                                            <option value="2">2 - Needs Work</option>
                                            <option value="1">1 - Poor</option>
                                        </select>
                                    </div>
                                </div>
                                
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Feedback</label>
                                    <textarea required value={formData.feedback} onChange={e => setFormData({...formData, feedback: e.target.value})} className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-sm font-medium focus:border-indigo-400 focus:bg-white outline-none transition-all min-h-[100px]" placeholder="Detailed feedback and growth areas..." />
                                </div>

                                <div className="pt-2">
                                    <button type="submit" disabled={loading} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md shadow-indigo-200 hover:shadow-lg transition-all text-sm disabled:opacity-50">
                                        {loading ? 'Submitting...' : 'Submit Review'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PerformanceReviewModule;
