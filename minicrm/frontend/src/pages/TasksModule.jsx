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
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 mt-8">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight">Task <span className="text-indigo-600">Board.</span></h1>
                    <p className="text-slate-500 font-bold mt-1">Track performance and manage daily objectives.</p>
                </div>
                {(authUser?.role === 'SUPER_ADMIN' || authUser?.role === 'ADMIN') && (
                    <button 
                        onClick={() => setShowModal(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-indigo-600 transition-all shadow-xl hover:-translate-y-1"
                    >
                        <Plus size={18} /> New Task
                    </button>
                )}
            </div>

            <div className="flex flex-col lg:flex-row gap-6 overflow-x-auto pb-8 snap-x">
                {columns.map(col => {
                    const colTasks = tasks.filter(t => t.status === col.id && t.title.toLowerCase().includes(searchTerm.toLowerCase()));
                    
                    return (
                        <div key={col.id} className="min-w-[320px] flex-1 snap-start">
                            <div className={`bg-${col.color}-50 border border-${col.color}-100 rounded-t-3xl p-4 flex justify-between items-center`}>
                                <h3 className={`font-black text-${col.color}-900 flex items-center gap-2`}>
                                    <col.icon size={18} className={`text-${col.color}-500`} />
                                    {col.label}
                                </h3>
                                <span className={`bg-${col.color}-200 text-${col.color}-800 px-3 py-1 rounded-xl text-xs font-black`}>
                                    {colTasks.length}
                                </span>
                            </div>
                            
                            <div className="bg-slate-100/50 p-4 min-h-[500px] border-x border-b border-slate-100 rounded-b-3xl space-y-4">
                                {colTasks.map(task => (
                                    <motion.div 
                                        key={task.id}
                                        layout
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all group"
                                    >
                                        <div className="flex justify-between items-start mb-3">
                                            <span className={`text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-xl border ${getPriorityColor(task.priority)}`}>
                                                {task.priority}
                                            </span>
                                            {(authUser?.role === 'SUPER_ADMIN' || authUser?.role === 'ADMIN') && (
                                                <button onClick={() => deleteTask(task.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                        
                                        <h4 className="font-bold text-slate-900 mb-2 leading-snug">{task.title}</h4>
                                        {task.description && <p className="text-xs text-slate-500 mb-4 line-clamp-2">{task.description}</p>}
                                        
                                        {/* Comments Section */}
                                        <div className="mb-4 space-y-2">
                                            {task.comments?.length > 0 && (
                                                <div className="bg-slate-50 rounded-xl p-3 space-y-2 max-h-32 overflow-y-auto">
                                                    {task.comments.map(c => (
                                                        <div key={c.id} className="text-[10px]">
                                                            <span className="font-black text-slate-900">{c.author_name}: </span>
                                                            <span className="text-slate-600">{c.content}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="flex gap-2">
                                                <input 
                                                    type="text" 
                                                    placeholder="Add a message..."
                                                    className="flex-1 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 text-[10px] font-bold outline-none focus:border-indigo-300"
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

                                        <div className="flex items-center gap-4 text-xs font-bold text-slate-400 mb-4">
                                            {task.due_date && (
                                                <div className="flex items-center gap-1.5"><Calendar size={14}/> {task.due_date}</div>
                                            )}
                                            <div className="flex items-center gap-1.5"><User size={14}/> {task.assignee_name}</div>
                                        </div>

                                        {/* Status Movers */}
                                        <div className="flex gap-2 pt-3 border-t border-slate-100">
                                            {columns.map(targetCol => (
                                                targetCol.id !== task.status && (
                                                    <button 
                                                        key={targetCol.id}
                                                        onClick={() => updateTaskStatus(task, targetCol.id)}
                                                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-black text-slate-500 bg-slate-50 hover:bg-${targetCol.color}-500 hover:text-white transition-colors uppercase`}
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
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl">
                        <h2 className="text-2xl font-black text-slate-900 mb-6">Assign New Task</h2>
                        <form onSubmit={handleCreateTask} className="space-y-4">
                            <div>
                                <label className="block text-xs font-black text-slate-400 uppercase mb-2">Title</label>
                                <input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl text-sm font-bold focus:border-indigo-500 outline-none" placeholder="Task title..." />
                            </div>
                            
                            {(authUser?.role === 'SUPER_ADMIN' || authUser?.role === 'ADMIN') && (
                                <div>
                                    <label className="block text-xs font-black text-slate-400 uppercase mb-2">Assign To</label>
                                    <select required value={formData.assignee} onChange={e => setFormData({...formData, assignee: e.target.value})} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl text-sm font-bold focus:border-indigo-500 outline-none">
                                        <option value="">Select Employee</option>
                                        {employees.map(e => <option key={e.id} value={e.id}>{e.full_name || e.display_username}</option>)}
                                    </select>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-black text-slate-400 uppercase mb-2">Priority</label>
                                    <select value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value})} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl text-sm font-bold focus:border-indigo-500 outline-none">
                                        <option value="LOW">Low</option>
                                        <option value="MEDIUM">Medium</option>
                                        <option value="HIGH">High</option>
                                        <option value="URGENT">Urgent</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-400 uppercase mb-2">Due Date</label>
                                    <input type="date" value={formData.due_date} onChange={e => setFormData({...formData, due_date: e.target.value})} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl text-sm font-bold focus:border-indigo-500 outline-none" />
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-black text-slate-400 uppercase mb-2">Description</label>
                                <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl text-sm font-bold focus:border-indigo-500 outline-none min-h-[100px]" placeholder="Details..." />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-4 text-slate-500 font-bold hover:bg-slate-50 rounded-2xl">Cancel</button>
                                <button type="submit" disabled={loading} className="flex-1 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:-translate-y-1 transition-all shadow-indigo-200">
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
