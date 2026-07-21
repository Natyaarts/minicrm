import React, { useState, useEffect } from 'react';
import { X, PhoneCall, Mail, MessageSquare, FileText, User, Headphones } from 'lucide-react';
import api from '../api/axios';

const BDEReport = ({ bdeId, onClose }) => {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    useEffect(() => {
        if (!bdeId) return;
        const fetchReport = async () => {
            try {
                setLoading(true);
                let url = `/crm/bde-report/${bdeId}/`;
                const params = new URLSearchParams();
                if (startDate) params.append('start_date', startDate);
                if (endDate) params.append('end_date', endDate);
                
                if (params.toString()) {
                    url += `?${params.toString()}`;
                }
                
                const res = await api.get(url);
                setReport(res.data);
            } catch (err) {
                console.error("Failed to fetch BDE report:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchReport();
    }, [bdeId, startDate, endDate]);

    const clearFilters = () => {
        setStartDate('');
        setEndDate('');
    };

    if (!bdeId) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <div className="bg-slate-50 w-full max-w-4xl rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="flex justify-between items-center p-4 md:p-6 bg-white rounded-t-2xl border-b border-slate-200">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-black text-xl">
                            {report?.bde?.name?.charAt(0) || <User />}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">{report?.bde?.name || 'Loading...'}</h2>
                            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">Sales Representative Report</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <div className="hidden sm:flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200 shadow-sm">
                            <div className="flex flex-col">
                                <label className="text-[10px] uppercase font-bold text-slate-500 mb-0.5 px-1">Start Date</label>
                                <input 
                                    type="date" 
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="text-xs border-none outline-none bg-white rounded px-2 py-1"
                                />
                            </div>
                            <span className="text-slate-300">-</span>
                            <div className="flex flex-col">
                                <label className="text-[10px] uppercase font-bold text-slate-500 mb-0.5 px-1">End Date</label>
                                <input 
                                    type="date" 
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="text-xs border-none outline-none bg-white rounded px-2 py-1"
                                />
                            </div>
                            {(startDate || endDate) && (
                                <button 
                                    onClick={clearFilters}
                                    className="ml-1 text-[10px] text-rose-500 hover:bg-rose-50 px-2 py-1.5 rounded transition-colors font-bold uppercase"
                                >
                                    Clear
                                </button>
                            )}
                        </div>

                        <button 
                            onClick={onClose}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12">
                        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                        <p className="text-sm font-medium text-slate-500">Compiling BDE Report...</p>
                    </div>
                ) : !report ? (
                    <div className="flex flex-col justify-center items-center p-12 flex-1">
                        <p className="text-sm font-medium text-rose-500">Failed to load report data.</p>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                        
                        {/* Metrics */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Assigned Leads</p>
                                <h3 className="text-2xl font-black text-indigo-600">{report.metrics.total_assigned}</h3>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Interactions Logged</p>
                                <h3 className="text-2xl font-black text-emerald-600">{report.metrics.total_interactions}</h3>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Pending Follow-up Tasks</p>
                                <h3 className="text-2xl font-black text-rose-600">{report.metrics.pending_tasks}</h3>
                            </div>
                        </div>

                        {/* Split View: Leads & Timeline */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            
                            {/* Assigned Leads Column */}
                            <div className="lg:col-span-1 bg-white border border-slate-200 rounded-xl flex flex-col">
                                <div className="p-4 border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
                                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Assigned Leads ({report.leads.length})</h3>
                                </div>
                                <div className="p-4 flex-1 overflow-y-auto max-h-[400px] space-y-3">
                                    {report.leads.map(lead => (
                                        <div key={lead.id} className="p-3 border border-slate-100 rounded-lg hover:border-indigo-200 transition-colors">
                                            <p className="text-sm font-bold text-slate-800">{lead.name}</p>
                                            <div className="flex justify-between items-center mt-1">
                                                <p className="text-[10px] font-medium text-slate-500">{lead.crm_id}</p>
                                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{lead.status}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {report.leads.length === 0 && (
                                        <p className="text-xs text-slate-400 italic text-center py-4">No leads assigned.</p>
                                    )}
                                </div>
                            </div>

                            {/* Interaction Timeline Column */}
                            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl flex flex-col">
                                <div className="p-4 border-b border-slate-100 bg-slate-50/50 rounded-t-xl flex justify-between items-center">
                                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Master Activity Timeline</h3>
                                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-bold flex items-center gap-1">
                                        <Headphones size={12} /> Contains Call Recordings
                                    </span>
                                </div>
                                <div className="p-4 md:p-6 flex-1 overflow-y-auto max-h-[400px] space-y-6">
                                    {report.timeline.map((item, index) => (
                                        <div key={item.id} className="relative pl-6">
                                            {/* Timeline Line */}
                                            {index !== report.timeline.length - 1 && (
                                                <div className="absolute left-2 top-6 bottom-[-24px] w-0.5 bg-slate-100"></div>
                                            )}
                                            {/* Timeline Dot */}
                                            <div className={`absolute left-0.5 top-1.5 w-3 h-3 rounded-full border-2 border-white
                                                ${item.type === 'CALL' ? 'bg-blue-500' : 
                                                  item.type === 'WHATSAPP' ? 'bg-green-500' : 
                                                  item.type === 'EMAIL' ? 'bg-slate-700' : 'bg-amber-500'}`}
                                            ></div>
                                            
                                            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl shadow-sm">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-800">
                                                            {item.type === 'CALL' ? 'Phone Call with' : 
                                                             item.type === 'WHATSAPP' ? 'WhatsApp with' : 
                                                             item.type === 'EMAIL' ? 'Email to' : 'Note on'} <span className="text-indigo-600">{item.student_name}</span>
                                                        </p>
                                                        {(item.student_crm_id || item.student_phone) && (
                                                            <div className="flex flex-wrap items-center gap-2 mt-1 mb-1.5 text-[11px] text-slate-500 font-medium">
                                                                {item.student_crm_id && (
                                                                    <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px]">
                                                                        ID: {item.student_crm_id}
                                                                    </span>
                                                                )}
                                                                {item.student_phone && (
                                                                    <span className="flex items-center gap-0.5 bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-[10px]">
                                                                        <PhoneCall size={10} /> {item.student_phone}
                                                                    </span>
                                                                )}
                                                                {item.student_email && (
                                                                    <span className="text-slate-400 max-w-[150px] truncate">
                                                                        {item.student_email}
                                                                    </span>
                                                                )}
                                                                {item.student_status && (
                                                                    <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">
                                                                        {item.student_status}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                        <p className="text-[10px] text-slate-500 mt-0.5">
                                                            {new Date(item.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                                        </p>
                                                    </div>
                                                    <div className="text-slate-400">
                                                        {item.type === 'CALL' ? <PhoneCall size={16} /> : 
                                                         item.type === 'WHATSAPP' ? <MessageSquare size={16} /> : 
                                                         item.type === 'EMAIL' ? <Mail size={16} /> : <FileText size={16} />}
                                                    </div>
                                                </div>
                                                <p className="text-sm text-slate-600 mb-3">{item.notes}</p>
                                                
                                                {/* Audio Player if recording exists */}
                                                {item.audio_url && (
                                                    <div className="mt-3 bg-white border border-indigo-100 p-3 rounded-lg">
                                                        <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                                            <Headphones size={12} /> Call Recording
                                                        </p>
                                                        <audio controls className="w-full h-8" src={item.audio_url}>
                                                            Your browser does not support the audio element.
                                                        </audio>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {report.timeline.length === 0 && (
                                        <p className="text-xs text-slate-400 italic text-center py-8">No interactions logged yet.</p>
                                    )}
                                </div>
                            </div>
                        </div>

                    </div>
                )}
            </div>
        </div>
    );
};

export default BDEReport;
