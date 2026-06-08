import React, { useState, useEffect } from 'react';
import { Calendar, CheckCircle2, Clock, Phone, Mail } from 'lucide-react';
import api from '../api/axios';

const CRMTasks = () => {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState([]);
    const [students, setStudents] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newTask, setNewTask] = useState({ title: '', due_date: '', task_type: 'CALL', status: 'PENDING', assigned_to: '', student: '' });

    useEffect(() => {
        fetchTasks();
        fetchUsersAndStudents();
    }, []);

    const fetchTasks = async () => {
        try {
            const res = await api.get('/crm/tasks/');
            setTasks(res.data.results || res.data);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching tasks:', error);
            setLoading(false);
        }
    };

    const fetchUsersAndStudents = async () => {
        try {
            const [usersRes, studentsRes] = await Promise.all([
                api.get('/crm/sales-users/'),
                api.get('/students/')
            ]);
            setUsers(usersRes.data.results || usersRes.data || []);
            setStudents(studentsRes.data.results || studentsRes.data || []);
        } catch (err) {
            console.error("Error fetching options:", err);
        }
    };

    const handleCreateTask = async (e) => {
        e.preventDefault();
        try {
            await api.post('/crm/tasks/', {
                ...newTask,
                assigned_to: newTask.assigned_to || null,
                student: newTask.student || null
            });
            setIsModalOpen(false);
            setNewTask({ title: '', due_date: '', task_type: 'CALL', status: 'PENDING', assigned_to: '', student: '' });
            fetchTasks();
        } catch (error) {
            console.error('Error creating task:', error);
            alert("Failed to create task");
        }
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-800">Tasks & Follow-ups</h2>
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors"
                >
                    + New Task
                </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="border-b border-slate-100 bg-slate-50 p-4">
                    <h3 className="text-sm font-semibold text-slate-700">Upcoming Tasks</h3>
                </div>
                <div className="divide-y divide-slate-100">
                    {loading ? (
                        <div className="p-4 text-center text-sm text-slate-500">Loading tasks...</div>
                    ) : tasks.length === 0 ? (
                        <div className="p-4 text-center text-sm text-slate-500">No tasks found.</div>
                    ) : (
                        tasks.map(task => (
                            <div key={task.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                <div className="flex items-start gap-4">
                                    <button className="mt-0.5 text-slate-300 hover:text-emerald-500 transition-colors">
                                        <CheckCircle2 size={20} />
                                    </button>
                                    <div>
                                        <h4 className="font-semibold text-slate-800 text-sm">{task.title}</h4>
                                        <div className="flex items-center gap-3 mt-1">
                                            {task.due_date && (
                                                <span className="flex items-center gap-1 text-[10px] font-medium text-slate-500">
                                                    <Calendar size={12} /> {new Date(task.due_date).toLocaleString()}
                                                </span>
                                            )}
                                            {task.student_name && (
                                                <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                                                    Lead: {task.student_name}
                                                </span>
                                            )}
                                            {task.assigned_to_name && (
                                                <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                                                    Assigned to: {task.assigned_to_name}
                                                </span>
                                            )}
                                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${task.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                                {task.status}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {task.task_type === 'CALL' && <button className="p-2 text-slate-400 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 rounded-lg transition-colors"><Phone size={14} /></button>}
                                    {task.task_type === 'EMAIL' && <button className="p-2 text-slate-400 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 rounded-lg transition-colors"><Mail size={14} /></button>}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800">Create New Task</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">&times;</button>
                        </div>
                        <form onSubmit={handleCreateTask} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Task Title</label>
                                <input 
                                    type="text" 
                                    required
                                    className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    value={newTask.title}
                                    onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                                    placeholder="e.g. Call lead about pricing"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Assign To</label>
                                    <select 
                                        className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                        value={newTask.assigned_to}
                                        onChange={(e) => setNewTask({...newTask, assigned_to: e.target.value})}
                                    >
                                        <option value="">Unassigned</option>
                                        {users.map(u => (
                                            <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Lead / Student</label>
                                    <select 
                                        className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                        value={newTask.student}
                                        onChange={(e) => setNewTask({...newTask, student: e.target.value})}
                                    >
                                        <option value="">None</option>
                                        {students.map(s => (
                                            <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Task Type</label>
                                    <select 
                                        className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                        value={newTask.task_type}
                                        onChange={(e) => setNewTask({...newTask, task_type: e.target.value})}
                                    >
                                        <option value="CALL">Phone Call</option>
                                        <option value="EMAIL">Email</option>
                                        <option value="MEETING">Meeting</option>
                                        <option value="OTHER">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Due Date</label>
                                    <input 
                                        type="datetime-local" 
                                        className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        value={newTask.due_date}
                                        onChange={(e) => setNewTask({...newTask, due_date: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="pt-4 flex justify-end gap-2">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                                <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors">Save Task</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CRMTasks;
