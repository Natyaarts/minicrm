import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, User, Phone, Mail, Clock, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api/axios';

const StatLeadsModal = ({ config, onClose, onViewLead, salesSectionFilter }) => {
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ count: 0, next: null, previous: null });

    const fetchLeads = async (currentPage) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                is_active: 'true',
                page: currentPage.toString()
            });

            if (salesSectionFilter && salesSectionFilter !== 'ALL') {
                params.append('sales_section', salesSectionFilter);
            }

            if (config.type === 'stage') {
                params.append('lead_status', config.value);
            } else if (config.type === 'assignee') {
                params.append('assigned_to', config.value);
            } else if (config.type === 'contacted') {
                params.append('contacted', config.value);
            } else if (config.type === 'status') {
                params.append('lead_status__in', 'ENROLLED,CONVERTED,4');
            } else if (config.type === 'all') {
                params.append('hide_converted', 'true');
            }

            const res = await api.get(`students/?${params.toString()}`);
            setLeads(res.data.results || []);
            setPagination({
                count: res.data.count,
                next: res.data.next,
                previous: res.data.previous
            });
        } catch (error) {
            console.error("Failed to fetch stat leads", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (config) {
            setPage(1);
            fetchLeads(1);
        }
    }, [config]);

    const handleNext = () => {
        if (pagination.next) {
            setPage(p => p + 1);
            fetchLeads(page + 1);
        }
    };

    const handlePrev = () => {
        if (pagination.previous) {
            setPage(p => p - 1);
            fetchLeads(page - 1);
        }
    };

    const getStatusStyle = (status) => {
        if (!status) return "bg-slate-100 text-slate-700";
        const s = status.toUpperCase();
        if (s.includes('NEW')) return "bg-emerald-100 text-emerald-700";
        if (s.includes('FOLLOW')) return "bg-blue-100 text-blue-700";
        if (s.includes('CONVERT') || s.includes('ENROLL')) return "bg-indigo-100 text-indigo-700";
        if (s.includes('DROP')) return "bg-rose-100 text-rose-700";
        return "bg-slate-100 text-slate-700";
    };

    if (!config) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
                >
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                                <User size={20} />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-slate-800">{config.title || 'Leads List'}</h2>
                                <p className="text-xs font-medium text-slate-500">Showing {pagination.count} leads</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-500 transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-auto bg-slate-50/50 p-6">
                        {loading && leads.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40">
                                <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                                <p className="text-sm font-medium text-slate-500 mt-4">Loading leads...</p>
                            </div>
                        ) : leads.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 text-center">
                                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                                    <User size={24} />
                                </div>
                                <p className="text-base font-bold text-slate-700">No leads found</p>
                                <p className="text-sm text-slate-500">There are no leads matching this category.</p>
                            </div>
                        ) : (
                            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200">
                                            <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Lead</th>
                                            <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Contact</th>
                                            <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                            <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Assigned To</th>
                                            <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {leads.map(lead => (
                                            <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <p className="text-sm font-bold text-slate-800">{lead.first_name} {lead.last_name}</p>
                                                    <p className="text-xs font-medium text-slate-500 flex items-center gap-1 mt-0.5">
                                                        <Clock size={12} />
                                                        {new Date(lead.created_at).toLocaleDateString()}
                                                    </p>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {lead.mobile && (
                                                        <p className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                                                            <Phone size={12} className="text-slate-400" />
                                                            {lead.mobile}
                                                        </p>
                                                    )}
                                                    {lead.email && (
                                                        <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mt-1">
                                                            <Mail size={12} className="text-slate-400" />
                                                            <span className="truncate max-w-[120px]">{lead.email}</span>
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold tracking-wide uppercase ${getStatusStyle(lead.lead_status_display)}`}>
                                                        {lead.lead_status_display || 'New Lead'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {lead.assigned_to_name ? (
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">
                                                                {lead.assigned_to_name.charAt(0)}
                                                            </div>
                                                            <span className="text-xs font-semibold text-slate-700">{lead.assigned_to_name}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs font-medium text-rose-500 bg-rose-50 px-2 py-1 rounded-md">Unassigned</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        onClick={() => {
                                                            onClose();
                                                            onViewLead(lead.id);
                                                        }}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-lg text-xs font-bold transition-colors"
                                                    >
                                                        <Eye size={14} />
                                                        View
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Footer / Pagination */}
                    <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-500">
                            Showing page {page} {pagination.count > 0 ? `of ${Math.ceil(pagination.count / 10)}` : ''}
                        </p>
                        <div className="flex gap-2">
                            <button 
                                onClick={handlePrev}
                                disabled={!pagination.previous}
                                className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 text-slate-600 rounded-lg disabled:opacity-50 hover:bg-slate-50 transition-colors flex items-center gap-1"
                            >
                                <ChevronLeft size={14} /> Prev
                            </button>
                            <button 
                                onClick={handleNext}
                                disabled={!pagination.next}
                                className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 text-slate-600 rounded-lg disabled:opacity-50 hover:bg-slate-50 transition-colors flex items-center gap-1"
                            >
                                Next <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default StatLeadsModal;
