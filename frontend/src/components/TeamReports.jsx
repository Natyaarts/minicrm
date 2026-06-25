import React, { useState, useEffect } from 'react';
import { Users, PhoneCall, TrendingUp, AlertCircle, ChevronRight, User } from 'lucide-react';
import api from '../api/axios';

const TeamReports = ({ onBdeClick }) => {
    const [teamData, setTeamData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTeamData = async () => {
            try {
                // Fetch high-level leaderboard stats for the grid
                const res = await api.get('/crm/dashboard-stats/');
                if (res.data && res.data.leaderboard) {
                    setTeamData(res.data.leaderboard);
                }
            } catch (error) {
                console.error("Failed to fetch team data", error);
            } finally {
                setLoading(false);
            }
        };
        fetchTeamData();
    }, []);

    if (loading) {
        return (
            <div className="p-8 flex justify-center items-center h-[500px]">
                <div className="flex flex-col items-center">
                    <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    <p className="mt-4 text-sm font-medium text-slate-500">Loading team reports...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Users className="text-indigo-600" />
                    Sales Team Reports
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                    Select a team member to view their detailed performance report, call recordings, and pending tasks.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {teamData.map((member) => {
                    const completionRate = member.assigned > 0 
                        ? Math.round((member.contacted / member.assigned) * 100) 
                        : 0;
                        
                    return (
                        <div 
                            key={member.id}
                            onClick={() => onBdeClick(member.id)}
                            className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer group"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center font-bold text-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                        {(member.name || 'U').charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 text-lg">{member.name || 'Unknown'}</h3>
                                        <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Sales Rep</p>
                                    </div>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                    <ChevronRight size={18} />
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 mb-5">
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                                        <Users size={14} />
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Assigned Leads</span>
                                    </div>
                                    <p className="text-xl font-black text-slate-700">{member.assigned}</p>
                                </div>
                                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                                    <div className="flex items-center gap-1.5 text-emerald-600 mb-1">
                                        <PhoneCall size={14} />
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Contacted</span>
                                    </div>
                                    <p className="text-xl font-black text-emerald-700">{member.contacted}</p>
                                </div>
                            </div>

                            <div className="mb-2 flex justify-between items-center text-xs">
                                <span className="font-medium text-slate-600">Lead Contact Rate</span>
                                <span className="font-bold text-indigo-600">{completionRate}%</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2">
                                <div 
                                    className="bg-indigo-500 h-2 rounded-full" 
                                    style={{ width: `${completionRate}%` }}
                                ></div>
                            </div>
                            
                            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center text-xs font-medium text-indigo-600 group-hover:text-indigo-700">
                                View full report & call recordings &rarr;
                            </div>
                        </div>
                    );
                })}
                
                {teamData.length === 0 && (
                    <div className="col-span-full bg-slate-50 border border-slate-200 border-dashed rounded-2xl p-12 text-center">
                        <User className="mx-auto h-12 w-12 text-slate-400 mb-3" />
                        <h3 className="text-lg font-medium text-slate-900">No Sales Team Data</h3>
                        <p className="mt-1 text-sm text-slate-500">Assign leads to your sales representatives to see their performance here.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TeamReports;
