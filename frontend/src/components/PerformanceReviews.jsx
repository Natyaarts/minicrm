import React, { useState, useEffect } from 'react';
import { Star, TrendingUp, Search, Plus, X, BarChart2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api/axios';

const PerformanceReviews = ({ authUser, employees }) => {
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [newReview, setNewReview] = useState({ employee: '', review_period: 'Q1 2026', rating: 3, feedback: '' });

    useEffect(() => {
        fetchReviews();
    }, []);

    const fetchReviews = async () => {
        setLoading(true);
        try {
            const res = await api.get('hrms/reviews/');
            setReviews(res.data.results || res.data || []);
        } catch (error) {
            console.error("Failed to fetch reviews", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveReview = async (e) => {
        e.preventDefault();
        try {
            const empProfile = employees.find(emp => emp.user_id === authUser.id || emp.display_username === authUser.username);
            const payload = {
                ...newReview,
                reviewer: empProfile ? empProfile.id : employees[0].id // Fallback
            };

            await api.post('hrms/reviews/', payload);
            setShowModal(false);
            setNewReview({ employee: '', review_period: 'Q1 2026', rating: 3, feedback: '' });
            fetchReviews();
        } catch (error) {
            console.error("Failed to save review", error);
            alert("Failed to submit review");
        }
    };

    const renderStars = (rating) => {
        return (
            <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(star => (
                    <Star key={star} size={14} className={star <= rating ? "fill-amber-400 text-amber-400" : "text-slate-200"} />
                ))}
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex justify-between items-center bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                    <h2 className="text-lg font-bold text-slate-800">Performance & Appraisals</h2>
                    <p className="text-xs text-slate-500 mt-1">Track employee KPIs and quarterly performance ratings.</p>
                </div>
                {(authUser.role === 'SUPER_ADMIN' || authUser.role === 'ADMIN' || authUser.role === 'MANAGER') && (
                    <button onClick={() => setShowModal(true)} className="bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-sm hover:bg-amber-600 transition-all flex items-center gap-2">
                        <Plus size={16} /> New Review
                    </button>
                )}
            </div>

            {loading ? (
                <div className="flex justify-center p-10"><div className="w-8 h-8 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin"></div></div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {reviews.length === 0 ? (
                        <div className="col-span-full text-center p-10 text-slate-400 font-medium bg-white rounded-2xl border border-dashed border-slate-300">
                            No performance reviews found.
                        </div>
                    ) : (
                        reviews.map(review => (
                            <div key={review.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 group hover:shadow-md transition-all">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center font-bold">
                                            {review.employee_name ? review.employee_name.charAt(0) : '?'}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-800">{review.employee_name}</h3>
                                            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">{review.review_period}</p>
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                        <BarChart2 size={16} className="text-slate-400" />
                                    </div>
                                </div>
                                
                                <div className="mb-4">
                                    {renderStars(review.rating)}
                                </div>
                                
                                <p className="text-sm text-slate-600 italic line-clamp-3 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                                    "{review.feedback}"
                                </p>
                                
                                <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500 flex justify-between">
                                    <span>Reviewed by: <strong>{review.reviewer_name}</strong></span>
                                    <span>{new Date(review.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Add Review Modal */}
            <AnimatePresence>
                {showModal && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden flex flex-col">
                            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <h3 className="text-xl font-black text-slate-900">Write Performance Review</h3>
                                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-rose-500 transition-colors"><X size={20} /></button>
                            </div>
                            <div className="p-8">
                                <form onSubmit={handleSaveReview} className="space-y-5">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Employee</label>
                                        <select required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-amber-400 focus:bg-white text-sm font-medium" value={newReview.employee} onChange={e => setNewReview({...newReview, employee: e.target.value})}>
                                            <option value="">Select Employee...</option>
                                            {employees.map(emp => (
                                                <option key={emp.id} value={emp.id}>{emp.full_name || emp.display_username} - {emp.employee_id}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Review Period</label>
                                            <input required type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-amber-400 focus:bg-white text-sm font-medium" value={newReview.review_period} onChange={e => setNewReview({...newReview, review_period: e.target.value})} placeholder="e.g. Q2 2026" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Rating (1-5)</label>
                                            <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-amber-400 focus:bg-white text-sm font-medium" value={newReview.rating} onChange={e => setNewReview({...newReview, rating: parseInt(e.target.value)})}>
                                                <option value="1">1 - Needs Improvement</option>
                                                <option value="2">2 - Below Expectations</option>
                                                <option value="3">3 - Meets Expectations</option>
                                                <option value="4">4 - Exceeds Expectations</option>
                                                <option value="5">5 - Outstanding</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Constructive Feedback</label>
                                        <textarea required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-amber-400 focus:bg-white text-sm font-medium resize-none h-32" value={newReview.feedback} onChange={e => setNewReview({...newReview, feedback: e.target.value})} placeholder="Provide detailed feedback on their performance..." />
                                    </div>
                                    <div className="pt-4 border-t border-slate-100 flex justify-end">
                                        <button type="submit" className="bg-amber-500 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-sm shadow-amber-200 hover:bg-amber-600 transition-all flex items-center gap-2">
                                            Save Review
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PerformanceReviews;
