import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { 
    Clock, AlertCircle, CheckCircle2, User, 
    Plus, Search, Trash2, Calendar, Check
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

const TasksModule = () => {
    const { user: authUser } = useAuth();
    const [tasks, setTasks] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        assignee: '',
        priority: 'MEDIUM',
        due_date: ''
    });

    const fetchTasks = async () => {
        setLoading(true);
        try {
            const res = await api.get('hrms/tasks/');
            setTasks(res.data.results || res.data || []);
            
            if (authUser?.role === 'SUPER_ADMIN' || authUser?.role === 'ADMIN') {
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
        fetchTasks();
    }, []);

    const handleCreateTask = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = { ...formData };
            if (!payload.assignee && authUser?.id) {
                // If not assigned specifically, assign to self
                const myProfile = employees.find(e => e.display_username === authUser.username);
                if (myProfile) payload.assignee = myProfile.id;
            }
            await api.post('hrms/tasks/', payload);
            setShowModal(false);
            setFormData({ title: '', description: '', assignee: '', priority: 'MEDIUM', due_date: '' });
            fetchTasks();
        } catch (err) {
            alert("Failed to create task");
            setLoading(false);
        }
    };

    const updateTaskStatus = async (task, newStatus) => {
        try {
            await api.patch(`hrms/tasks/${task.id}/`, { status: newStatus });
            fetchTasks();
        } catch (err) {
            alert("Failed to update status");
        }
    };

    const deleteTask = async (id) => {
        if (!window.confirm("Are you sure you want to delete this task?")) return;
        try {
            await api.delete(`hrms/tasks/${id}/`);
            fetchTasks();
        } catch (err) {
            alert("Failed to delete task");
        }
    };

    const columns = [
        { id: 'TODO', label: 'To Do', icon: Clock, color: 'slate' },
        { id: 'IN_PROGRESS', label: 'In Progress', icon: AlertCircle, color: 'amber' },
        { id: 'REVIEW', label: 'In Review', icon: Search, color: 'indigo' },
        { id: 'DONE', label: 'Done', icon: CheckCircle2, color: 'emerald' },
    ];

    const getPriorityColor = (priority) => {
        if (priority === 'URGENT') return 'bg-rose-100 text-rose-700 border-rose-200';
        if (priority === 'HIGH') return 'bg-orange-100 text-orange-700 border-orange-200';
        if (priority === 'MEDIUM') return 'bg-blue-100 text-blue-700 border-blue-200';
        return 'bg-slate-100 text-slate-700 border-slate-200';
    };

    return (
        <div className="min-h-screen bg-[#FDFCFB] pb-20 px-4 md:px-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Task Board</h1>
                    <p className="text-slate-500 text-sm mt-1">Track performance and manage daily objectives.</p>
                </div>
                {(authUser?.role === 'SUPER_ADMIN' || authUser?.role === 'ADMIN') && (
                    <button 
                        onClick={() => setShowModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg font-semibold text-sm hover:bg-slate-900 transition-all shadow-sm"
                    >
                        <Plus size={16} /> New Task
                    </button>
                )}
            </div>

            <div className="flex flex-col lg:flex-row gap-6 overflow-x-auto pb-8 snap-x">
                {columns.map(col => {
                    const colTasks = tasks.filter(t => t.status === col.id && t.title.toLowerCase().includes(searchTerm.toLowerCase()));
                    
                    return (
                        <div key={col.id} className="min-w-[320px] flex-1 snap-start">
                            <div className={`bg-${col.color}-50 border border-${col.color}-200 rounded-t-lg p-3 flex justify-between items-center`}>
                                <h3 className={`font-semibold text-sm text-${col.color}-800 flex items-center gap-2`}>
                                    <col.icon size={16} className={`text-${col.color}-600`} />
                                    {col.label}
                                </h3>
                                <span className={`bg-${col.color}-100 text-${col.color}-700 px-2.5 py-0.5 rounded-md text-xs font-semibold`}>
                                    {colTasks.length}
                                </span>
                            </div>
                            
                            <div className="bg-slate-50/50 p-3 min-h-[500px] border-x border-b border-slate-200 rounded-b-lg space-y-3">
                                {colTasks.map(task => (
                                    <motion.div 
                                        key={task.id}
                                        layout
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm hover:shadow transition-all group"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <span className={`text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded border ${getPriorityColor(task.priority)}`}>
                                                {task.priority}
                                            </span>
                                            {(authUser?.role === 'SUPER_ADMIN' || authUser?.role === 'ADMIN') && (
                                                <button onClick={() => deleteTask(task.id)} className="text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity p-1">
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                        
                                        <h4 className="font-semibold text-sm text-slate-800 mb-1.5 leading-snug">{task.title}</h4>
                                        {task.description && <p className="text-xs text-slate-500 mb-3 line-clamp-2">{task.description}</p>}
                                        
                                        {/* Comments Section */}
                                        <div className="mb-3 space-y-2">
                                            {task.comments?.length > 0 && (
                                                <div className="bg-slate-50 rounded-md p-2 space-y-1.5 max-h-32 overflow-y-auto border border-slate-100">
                                                    {task.comments.map(c => (
                                                        <div key={c.id} className="text-[10px]">
                                                            <span className="font-semibold text-slate-700">{c.author_name}: </span>
                                                            <span className="text-slate-600">{c.content}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="flex gap-2">
                                                <input 
                                                    type="text" 
                                                    placeholder="Add a message..."
                                                    className="flex-1 bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-xs font-medium outline-none focus:border-indigo-400"
                                                    onKeyDown={async (e) => {
                                                        if (e.key === 'Enter' && e.target.value.trim()) {
                                                            const content = e.target.value;
                                                            e.target.value = '';
                                                            try {
                                                                await api.post('hrms/task-comments/', { task: task.id, content });
                                                                fetchTasks();
                                                            } catch (err) {
                                                                alert("Failed to post message");
                                                            }
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 text-xs font-medium text-slate-500 mb-3">
                                            {task.due_date && (
                                                <div className="flex items-center gap-1.5"><Calendar size={14}/> {task.due_date}</div>
                                            )}
                                            <div className="flex items-center gap-1.5"><User size={14}/> {task.assignee_name}</div>
                                        </div>

                                        {/* Status Movers */}
                                        <div className="flex gap-1.5 pt-2.5 border-t border-slate-100">
                                            {columns.map(targetCol => (
                                                targetCol.id !== task.status && (
                                                    <button 
                                                        key={targetCol.id}
                                                        onClick={() => updateTaskStatus(task, targetCol.id)}
                                                        className={`flex-1 py-1 rounded text-[10px] font-semibold text-slate-500 bg-slate-50 hover:bg-${targetCol.color}-500 hover:text-white transition-colors uppercase border border-slate-100 hover:border-${targetCol.color}-500`}
                                                    >
                                                        {targetCol.id === 'DONE' ? <Check size={14} className="mx-auto" /> : targetCol.label}
                                                    </button>
                                                )
                                            ))}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl border border-slate-200">
                        <h2 className="text-xl font-bold text-slate-800 mb-4">Assign New Task</h2>
                        <form onSubmit={handleCreateTask} className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Title</label>
                                <input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm font-medium focus:border-indigo-400 outline-none" placeholder="Task title..." />
                            </div>
                            
                            {(authUser?.role === 'SUPER_ADMIN' || authUser?.role === 'ADMIN') && (
                                <div>
                                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Assign To</label>
                                    <select required value={formData.assignee} onChange={e => setFormData({...formData, assignee: e.target.value})} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm font-medium focus:border-indigo-400 outline-none">
                                        <option value="">Select Employee</option>
                                        {employees.map(e => <option key={e.id} value={e.id}>{e.full_name || e.display_username}</option>)}
                                    </select>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Priority</label>
                                    <select value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value})} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm font-medium focus:border-indigo-400 outline-none">
                                        <option value="LOW">Low</option>
                                        <option value="MEDIUM">Medium</option>
                                        <option value="HIGH">High</option>
                                        <option value="URGENT">Urgent</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Due Date</label>
                                    <input type="date" value={formData.due_date} onChange={e => setFormData({...formData, due_date: e.target.value})} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm font-medium focus:border-indigo-400 outline-none" />
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Description</label>
                                <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm font-medium focus:border-indigo-400 outline-none min-h-[100px]" placeholder="Details..." />
                            </div>

                            <div className="flex gap-2 pt-4">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2 border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 rounded-lg text-sm transition-all">Cancel</button>
                                <button type="submit" disabled={loading} className="flex-1 py-2 bg-slate-800 text-white font-semibold rounded-lg shadow-sm hover:bg-slate-900 transition-all text-sm disabled:opacity-50">
                                    {loading ? 'Saving...' : 'Create Task'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </div>
    );
};

export default TasksModule;
