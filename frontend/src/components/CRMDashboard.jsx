import React, { useState, useEffect } from 'react';
import { Users, TrendingUp, DollarSign, Activity } from 'lucide-react';
import api from '../api/client';

const CRMDashboard = () => {
    const [stats, setStats] = useState({
        new_leads: 0,
        conversion_rate: 0,
        follow_ups: 0,
        revenue: 0
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await api.get('/crm/dashboard-stats/');
                setStats(response.data);
            } catch (error) {
                console.error("Failed to fetch dashboard stats", error);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    if (loading) {
        return <div className="p-6 text-slate-500">Loading dashboard data...</div>;
    }

    return (
        <div className="p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-6">Sales Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center">
                        <Users size={24} />
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">New Leads</p>
                        <h3 className="text-2xl font-bold text-slate-900">{stats.new_leads}</h3>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center">
                        <TrendingUp size={24} />
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Conversion</p>
                        <h3 className="text-2xl font-bold text-slate-900">{stats.conversion_rate}%</h3>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center">
                        <Activity size={24} />
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Follow-ups</p>
                        <h3 className="text-2xl font-bold text-slate-900">{stats.follow_ups}</h3>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center">
                        <DollarSign size={24} />
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Revenue</p>
                        <h3 className="text-2xl font-bold text-slate-900">₹{stats.revenue}</h3>
                    </div>
                </div>
            </div>
            
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm min-h-[300px] flex items-center justify-center">
                <p className="text-slate-400 font-medium">Chart Visualization Placeholder</p>
            </div>
        </div>
    );
};

export default CRMDashboard;
