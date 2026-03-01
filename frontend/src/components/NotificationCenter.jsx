import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { Bell, X, Check, CheckCheck, Info, AlertTriangle, AlertCircle, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const NotificationCenter = () => {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000); // Polling every 30s
        return () => clearInterval(interval);
    }, []);

    const fetchNotifications = async () => {
        try {
            const res = await api.get('notifications/');
            setNotifications(res.data.results || res.data);
            const countRes = await api.get('notifications/unread_count/');
            setUnreadCount(countRes.data.count);
        } catch (err) {
            console.error("Failed to fetch notifications");
        }
    };

    const markAsRead = async (id) => {
        try {
            await api.post(`notifications/${id}/mark_read/`);
            setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (err) {
            console.error("Failed to mark read");
        }
    };

    const markAllRead = async () => {
        try {
            await api.post('notifications/mark_all_read/');
            setNotifications(notifications.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
        } catch (err) {
            console.error("Failed to mark all read");
        }
    };

    const getTypeStyles = (type) => {
        switch (type) {
            case 'SUCCESS': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
            case 'WARNING': return 'bg-amber-50 text-amber-600 border-amber-100';
            case 'ERROR': return 'bg-rose-50 text-rose-600 border-rose-100';
            case 'APPLICATION': return 'bg-indigo-50 text-indigo-600 border-indigo-100';
            default: return 'bg-slate-50 text-slate-600 border-slate-100';
        }
    };

    const getIcon = (type) => {
        switch (type) {
            case 'SUCCESS': return <Check size={14} />;
            case 'WARNING': return <AlertTriangle size={14} />;
            case 'ERROR': return <AlertCircle size={14} />;
            case 'APPLICATION': return <Sparkles size={14} />;
            default: return <Info size={14} />;
        }
    };

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
            >
                <Bell size={22} />
                {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-5 h-5 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute right-0 mt-3 w-80 max-h-[480px] bg-white rounded-3xl shadow-2xl border border-slate-100 z-50 overflow-hidden flex flex-col"
                        >
                            <div className="p-5 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                                <h3 className="font-black text-slate-800 tracking-tight">System Alerts</h3>
                                {unreadCount > 0 && (
                                    <button
                                        onClick={markAllRead}
                                        className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700 bg-white px-3 py-1.5 rounded-lg border border-indigo-100 shadow-sm transition"
                                    >
                                        Mark All Read
                                    </button>
                                )}
                            </div>

                            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                                {notifications.length === 0 ? (
                                    <div className="py-12 text-center">
                                        <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                            <Bell className="text-slate-200" />
                                        </div>
                                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Quiet for now</p>
                                    </div>
                                ) : (
                                    notifications.map(n => (
                                        <div
                                            key={n.id}
                                            onClick={() => !n.is_read && markAsRead(n.id)}
                                            className={`p-4 rounded-2xl border transition-all cursor-pointer ${n.is_read
                                                    ? 'bg-white border-slate-50 opacity-60'
                                                    : 'bg-white border-indigo-50 shadow-sm hover:translate-x-1 ring-1 ring-indigo-500/5'
                                                }`}
                                        >
                                            <div className="flex gap-3">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border mt-0.5 ${getTypeStyles(n.notification_type)}`}>
                                                    {getIcon(n.notification_type)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start mb-0.5">
                                                        <p className={`text-sm font-black truncate ${n.is_read ? 'text-slate-500' : 'text-slate-800'}`}>
                                                            {n.title}
                                                        </p>
                                                        {!n.is_read && <div className="w-2 h-2 bg-indigo-500 rounded-full mt-1.5 shrink-0" />}
                                                    </div>
                                                    <p className="text-xs text-slate-500 leading-relaxed font-medium line-clamp-2">
                                                        {n.message}
                                                    </p>
                                                    <p className="text-[9px] font-bold text-slate-300 mt-2 uppercase tracking-tighter">
                                                        {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="p-3 bg-slate-50 border-t border-slate-100">
                                <button className="w-full py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition">
                                    View Older Notifications
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

export default NotificationCenter;
