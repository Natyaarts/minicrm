import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api/axios';
import { Phone, Mail, FileText, Calendar, Settings, Plus, X, Trash2, UserCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const KanbanBoard = ({ program, subProgram, course, searchTerm }) => {
    const { user: authUser } = useAuth();
    const [stages, setStages] = useState([]);
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);

    // Settings Modal State
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [newStageName, setNewStageName] = useState('');
    const [newStageColor, setNewStageColor] = useState('#e2e8f0');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchStagesAndLeads();
    }, [program, subProgram, course, searchTerm]);

    const fetchStagesAndLeads = async () => {
        setLoading(true);
        try {
            const stageRes = await api.get('crm/stages/').catch(() => ({ data: [] }));
            let stageData = stageRes.data.results || stageRes.data;
            
            if (!Array.isArray(stageData) || stageData.length === 0) {
                stageData = [
                    { id: 'NEW', name: 'New Lead', color: '#e2e8f0' },
                    { id: 'FOLLOW_UP', name: 'Follow-up', color: '#fef08a' },
                    { id: 'PAYMENT_PENDING', name: 'Payment Pending', color: '#fed7aa' },
                    { id: 'ENROLLED', name: 'Enrolled', color: '#bbf7d0' },
                    { id: 'DROPPED', name: 'Dropped', color: '#fecaca' },
                ];
            } else {
                stageData = stageData.sort((a, b) => a.order - b.order);
            }
            setStages(stageData);

            const params = new URLSearchParams({ is_active: 'true' });
            if (program) params.append('program', program);
            if (subProgram) params.append('sub_program', subProgram);
            if (course) params.append('course', course);
            if (searchTerm) params.append('search', searchTerm);

            const res = await api.get(`students/?${params.toString()}`);
            const data = res.data.results || res.data || [];
            setLeads(data);
        } catch (err) {
            console.error("Failed to fetch Kanban data", err);
        } finally {
            setLoading(false);
        }
    };

    const handleDragStart = (e, leadId) => {
        e.dataTransfer.setData('leadId', leadId);
    };

    const handleDrop = async (e, stageId) => {
        e.preventDefault();
        const leadId = e.dataTransfer.getData('leadId');
        
        const originalLeads = [...leads];
        setLeads(leads.map(lead => 
            lead.id.toString() === leadId ? { ...lead, lead_status: stageId } : lead
        ));

        try {
            await api.patch(`students/${leadId}/`, { lead_status: stageId });
        } catch (error) {
            console.error("Failed to update lead status", error);
            setLeads(originalLeads);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleAddStage = async (e) => {
        e.preventDefault();
        if (!newStageName.trim()) return;
        setIsSaving(true);
        try {
            const res = await api.post('crm/stages/', {
                name: newStageName,
                color: newStageColor,
                order: stages.length
            });
            setStages([...stages, res.data]);
            setNewStageName('');
        } catch (err) {
            console.error("Failed to add stage", err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteStage = async (stageId) => {
        // Don't delete static fallback stages
        if (typeof stageId === 'string') return; 
        
        try {
            await api.delete(`crm/stages/${stageId}/`);
            setStages(stages.filter(s => s.id !== stageId));
        } catch (err) {
            console.error("Failed to delete stage", err);
        }
    };

    if (loading) {
        return <div className="flex justify-center p-12 text-slate-400">Loading pipeline...</div>;
    }

    return (
        <div className="relative">
            {/* Header Actions */}
            {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.SALES?.add) && (
                <div className="flex justify-end mb-4">
                    <button 
                        onClick={() => setIsSettingsOpen(true)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors shadow-sm"
                    >
                        <Settings size={14} />
                        Manage Stages
                    </button>
                </div>
            )}

            {/* Kanban Board */}
            <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-250px)]">
                {stages.map(stage => {
                    const stageLeads = leads.filter(lead => 
                        (lead.lead_status || 'NEW').toString() === (stage.id || stage.name).toString()
                    );

                    return (
                        <div 
                            key={stage.id} 
                            className="flex-shrink-0 w-80 bg-slate-100 rounded-xl flex flex-col border border-slate-200"
                            onDrop={(e) => handleDrop(e, stage.id || stage.name)}
                            onDragOver={handleDragOver}
                        >
                            <div className="p-3 border-b border-slate-200 flex justify-between items-center bg-slate-50/50 rounded-t-xl" style={{ borderTop: `4px solid ${stage.color || '#94a3b8'}`}}>
                                <h4 className="font-bold text-sm text-slate-800">{stage.name}</h4>
                                <span className="text-xs font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-full shadow-sm">{stageLeads.length}</span>
                            </div>
                            
                            <div className="p-3 flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                                {stageLeads.map(lead => (
                                    <motion.div
                                        layoutId={lead.id.toString()}
                                        key={lead.id}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, lead.id.toString())}
                                        className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 cursor-grab active:cursor-grabbing hover:border-indigo-300 transition-colors"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="font-semibold text-sm text-slate-900 truncate pr-2">
                                                {lead.first_name} {lead.last_name}
                                            </div>
                                            <span className="text-[10px] text-slate-400 font-medium">#{lead.crm_student_id || lead.id}</span>
                                        </div>
                                        <div className="text-xs text-slate-500 mb-2 truncate">
                                            {lead.program_name} {lead.course_name ? `- ${lead.course_name}` : ''}
                                        </div>
                                        
                                        {lead.assigned_to_name && (
                                            <div className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-semibold border border-indigo-100 mb-2">
                                                <UserCircle size={10} />
                                                {lead.assigned_to_name}
                                            </div>
                                        )}
                                        
                                        <div className="flex items-center justify-between border-t border-slate-50 pt-2 mt-2">
                                            <div className="flex gap-2">
                                                <button className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="Call">
                                                    <Phone size={12} />
                                                </button>
                                                <button className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="Email">
                                                    <Mail size={12} />
                                                </button>
                                                <button className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="Notes">
                                                    <FileText size={12} />
                                                </button>
                                            </div>
                                            <div className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
                                                <Calendar size={10} />
                                                {new Date(lead.created_at || Date.now()).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Stage Manager Modal */}
            <AnimatePresence>
                {isSettingsOpen && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
                        >
                            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                                <h3 className="text-lg font-bold text-slate-800">Pipeline Stages</h3>
                                <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-slate-600">
                                    <X size={20} />
                                </button>
                            </div>
                            
                            <div className="p-6">
                                <div className="space-y-3 mb-6 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                                    {stages.map((stage, idx) => (
                                        <div key={stage.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                                            <div className="flex items-center gap-3">
                                                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: stage.color || '#94a3b8' }}></div>
                                                <span className="font-semibold text-sm text-slate-700">{stage.name}</span>
                                            </div>
                                            {typeof stage.id === 'number' && (
                                                <button 
                                                    onClick={() => handleDeleteStage(stage.id)}
                                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    {stages.length > 0 && typeof stages[0].id === 'string' && (
                                        <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200 mt-2">
                                            You are currently viewing default fallback stages. Add a new stage below to create your custom pipeline database.
                                        </p>
                                    )}
                                </div>

                                <form onSubmit={handleAddStage} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">Add New Stage</h4>
                                    <div className="flex gap-3">
                                        <input 
                                            type="color" 
                                            value={newStageColor}
                                            onChange={(e) => setNewStageColor(e.target.value)}
                                            className="w-10 h-10 rounded cursor-pointer shrink-0 p-1 bg-white border border-slate-200"
                                            title="Choose stage color"
                                        />
                                        <div className="flex-1 flex gap-2">
                                            <input 
                                                type="text"
                                                value={newStageName}
                                                onChange={(e) => setNewStageName(e.target.value)}
                                                placeholder="Stage Name (e.g. Needs Follow-up)"
                                                className="flex-1 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                required
                                            />
                                            <button 
                                                type="submit"
                                                disabled={isSaving || !newStageName.trim()}
                                                className="bg-indigo-600 text-white p-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
                                            >
                                                <Plus size={18} />
                                            </button>
                                        </div>
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

export default KanbanBoard;
