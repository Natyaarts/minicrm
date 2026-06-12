import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Megaphone, PartyPopper, Calendar, MessageSquare, Send, Heart, User, Clock, Image as ImageIcon } from 'lucide-react';
import api from '../api/axios';

const CompanyWall = ({ authUser }) => {
    const [posts, setPosts] = useState([]);
    const [celebrations, setCelebrations] = useState({ birthdays: [], anniversaries: [] });
    const [newPostContent, setNewPostContent] = useState('');
    const [postType, setPostType] = useState('GENERAL');
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ count: 0, next: null, previous: null });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async (pageNum = 1) => {
        setLoading(true);
        try {
            const [postsRes, celebRes] = await Promise.all([
                api.get(`hrms/company-posts/?page=${pageNum}`).catch(() => ({ data: [] })),
                pageNum === 1 ? api.get('hrms/employees/celebrations/').catch(() => ({ data: { birthdays: [], anniversaries: [] } })) : Promise.resolve({ data: null })
            ]);
            
            const fetchedPosts = postsRes.data.results || postsRes.data || [];
            setPosts(fetchedPosts);
            setPage(pageNum);
            setPagination({
                count: postsRes.data.count || fetchedPosts.length,
                next: postsRes.data.next,
                previous: postsRes.data.previous
            });

            if (celebRes.data) {
                setCelebrations(celebRes.data || { birthdays: [], anniversaries: [] });
            }
        } catch (error) {
            console.error("Failed to fetch wall data", error);
        } finally {
            setLoading(false);
        }
    };



    const handleCreatePost = async (e) => {
        e.preventDefault();
        if (!newPostContent.trim()) return;

        try {
            await api.post('hrms/company-posts/', {
                content: newPostContent,
                post_type: postType
            });
            setNewPostContent('');
            setPostType('GENERAL');
            fetchData();
        } catch (error) {
            console.error("Failed to create post", error);
            alert("Failed to post on the wall.");
        }
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
    };

    const formatCelebrationDate = (dateString, isAnniversary) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (isAnniversary) {
            const today = new Date();
            const years = today.getFullYear() - date.getFullYear();
            return `${years} Year Anniversary!`;
        }
        return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
            
            {/* Feed Section */}
            <div className="lg:col-span-2 space-y-6">
                
                {/* Create Post Box */}
                <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5"
                >
                    <div className="flex gap-4">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 font-bold">
                            {authUser?.username?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div className="flex-1 space-y-3">
                            <textarea 
                                value={newPostContent}
                                onChange={(e) => setNewPostContent(e.target.value)}
                                placeholder="Share something with the team..."
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50 resize-none h-20 transition-all placeholder:text-slate-400"
                            />
                            
                            <div className="flex justify-between items-center pt-2">
                                <div className="flex items-center gap-2">
                                    <select 
                                        value={postType}
                                        onChange={(e) => setPostType(e.target.value)}
                                        className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-300 cursor-pointer"
                                    >
                                        <option value="GENERAL">General</option>
                                        {(authUser?.role === 'SUPER_ADMIN' || authUser?.role === 'ADMIN') && (
                                            <option value="ANNOUNCEMENT">Announcement</option>
                                        )}
                                        <option value="CELEBRATION">Celebration</option>
                                    </select>
                                </div>
                                <button 
                                    onClick={handleCreatePost}
                                    disabled={!newPostContent.trim()}
                                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-200"
                                >
                                    <Send size={16} />
                                    Post
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Posts Feed */}
                <div className="space-y-4">
                    {loading ? (
                        <div className="flex justify-center p-10"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div></div>
                    ) : posts.length === 0 ? (
                        <div className="text-center p-10 bg-white rounded-2xl border border-slate-200 text-slate-400 text-sm">
                            No posts yet. Be the first to share something!
                        </div>
                    ) : (
                        posts.map((post, i) => (
                            <motion.div 
                                key={post.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5"
                            >
                                <div className="flex gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold ${
                                        post.post_type === 'ANNOUNCEMENT' ? 'bg-amber-100 text-amber-600' :
                                        post.post_type === 'CELEBRATION' ? 'bg-emerald-100 text-emerald-600' :
                                        'bg-slate-100 text-slate-600'
                                    }`}>
                                        {post.author_name?.[0]?.toUpperCase() || post.author_username?.[0]?.toUpperCase() || 'U'}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h4 className="text-sm font-bold text-slate-800">{post.author_name || post.author_username}</h4>
                                                <p className="text-xs text-slate-500 font-medium">{post.author_designation}</p>
                                            </div>
                                            <div className="text-xs text-slate-400 flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md font-medium">
                                                <Clock size={12} />
                                                {formatDate(post.created_at)}
                                            </div>
                                        </div>

                                        {post.post_type === 'ANNOUNCEMENT' && (
                                            <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-600 text-[10px] font-bold uppercase tracking-widest">
                                                <Megaphone size={12} />
                                                Announcement
                                            </div>
                                        )}
                                        
                                        {post.post_type === 'CELEBRATION' && (
                                            <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-widest">
                                                <PartyPopper size={12} />
                                                Celebration
                                            </div>
                                        )}

                                        <p className="mt-3 text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">
                                            {post.content}
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        ))
                    )}
                    
                    {!loading && posts.length > 0 && (
                        <div className="flex items-center justify-between mt-6 bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 shadow-sm">
                            <span className="text-sm text-slate-500 font-medium">
                                Showing <span className="font-bold text-slate-800">{posts.length}</span> of {pagination.count} posts
                            </span>
                            <div className="flex gap-2">
                                <button
                                    disabled={!pagination.previous}
                                    onClick={() => fetchData(page - 1)}
                                    className="px-4 py-2 text-sm font-semibold rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    Previous
                                </button>
                                <button
                                    disabled={!pagination.next}
                                    onClick={() => fetchData(page + 1)}
                                    className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Sidebar (Celebrations) */}
            <div className="space-y-6">
                
                {/* Birthdays Widget */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col max-h-[500px]">
                    <div className="bg-gradient-to-r from-rose-500 to-rose-600 p-4 flex items-center justify-between shrink-0">
                        <h3 className="font-bold text-white flex items-center gap-2">
                            <PartyPopper size={18} />
                            Today's Birthdays
                        </h3>
                        <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                            {celebrations.birthdays?.length || 0}
                        </span>
                    </div>
                    <div className="p-4 space-y-3 overflow-y-auto custom-scrollbar">
                        {celebrations.birthdays?.length > 0 ? (
                            celebrations.birthdays.map((emp) => (
                                <div key={emp.id} className="flex items-center gap-3 p-2 hover:bg-rose-50 rounded-xl transition-colors">
                                    <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-bold shrink-0">
                                        {emp.first_name?.[0] || 'U'}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">{emp.first_name} {emp.last_name}</p>
                                        <p className="text-xs text-slate-500">{emp.designation_name || 'Employee'}</p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-6 text-slate-400 text-sm flex flex-col items-center gap-2">
                                <Calendar size={24} className="opacity-20" />
                                No birthdays today
                            </div>
                        )}
                    </div>
                </div>

                {/* Work Anniversaries Widget */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col max-h-[500px]">
                    <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 p-4 flex items-center justify-between shrink-0">
                        <h3 className="font-bold text-white flex items-center gap-2">
                            <Megaphone size={18} />
                            Work Anniversaries
                        </h3>
                        <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                            {celebrations.anniversaries?.length || 0}
                        </span>
                    </div>
                    <div className="p-4 space-y-3 overflow-y-auto custom-scrollbar">
                        {celebrations.anniversaries?.length > 0 ? (
                            celebrations.anniversaries.map((emp) => (
                                <div key={emp.id} className="flex flex-col gap-1 p-3 bg-slate-50 rounded-xl">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
                                            {emp.first_name?.[0] || 'U'}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-slate-800">{emp.first_name} {emp.last_name}</p>
                                            <p className="text-xs font-semibold text-emerald-600">
                                                {formatCelebrationDate(emp.date_of_joining, true)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-6 text-slate-400 text-sm flex flex-col items-center gap-2">
                                <Calendar size={24} className="opacity-20" />
                                No work anniversaries today
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default CompanyWall;
