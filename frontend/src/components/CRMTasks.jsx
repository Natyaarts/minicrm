import React, { useState, useEffect } from 'react';
import { Calendar, CheckCircle2, Clock, Phone, Mail } from 'lucide-react';
import api from '../api/axios';

const CRMTasks = () => {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchTasks();
    }, []);

    const fetchTasks = async () => {
        try {
            const res = await api.get('/crm/tasks/');
            setTasks(res.data);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching tasks:', error);
            setLoading(false);
        }
    };
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-800">Tasks & Follow-ups</h2>
                <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors">
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
        </div>
    );
};

export default CRMTasks;
