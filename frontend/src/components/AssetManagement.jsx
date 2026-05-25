import React, { useState, useEffect } from 'react';
import { Laptop, Key, Monitor, Archive, Edit2, Trash2, Plus, X, Search, CheckCircle2, Clock, User, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api/axios';

const AssetManagement = ({ employees }) => {
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [newAsset, setNewAsset] = useState({ name: '', asset_id: '', category: 'Laptop', status: 'AVAILABLE', assigned_to: '' });
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('All');
    const [filterStatus, setFilterStatus] = useState('All');

    useEffect(() => {
        fetchAssets();
    }, []);

    const fetchAssets = async () => {
        setLoading(true);
        try {
            const res = await api.get('hrms/assets/');
            setAssets(res.data.results || res.data || []);
        } catch (error) {
            console.error("Failed to fetch assets", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveAsset = async (e) => {
        e.preventDefault();
        try {
            const payload = { ...newAsset };
            if (!payload.assigned_to) payload.assigned_to = null;
            if (payload.assigned_to) payload.assigned_date = new Date().toISOString().split('T')[0];

            await api.post('hrms/assets/', payload);
            setShowModal(false);
            setNewAsset({ name: '', asset_id: '', category: 'Laptop', status: 'AVAILABLE', assigned_to: '' });
            fetchAssets();
        } catch (error) {
            console.error("Failed to save asset", error);
            alert("Failed to save asset");
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to delete this asset?")) return;
        try {
            await api.delete(`hrms/assets/${id}/`);
            fetchAssets();
        } catch (error) {
            alert("Failed to delete asset");
        }
    };

    const getStatusBadge = (status) => {
        switch(status) {
            case 'AVAILABLE': return <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 w-fit"><CheckCircle2 size={12}/> Available</span>;
            case 'ASSIGNED': return <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 w-fit"><User size={12}/> Assigned</span>;
            case 'MAINTENANCE': return <span className="px-2.5 py-1 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 w-fit"><Clock size={12}/> Maintenance</span>;
            default: return <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-widest w-fit">Retired</span>;
        }
    };

    const getIcon = (category) => {
        if (category === 'Laptop') return <Laptop size={20} />;
        if (category === 'Monitor') return <Monitor size={20} />;
        if (category === 'Key') return <Key size={20} />;
        return <Archive size={20} />;
    };

    const filteredAssets = assets.filter(asset => {
        const matchesSearch = asset.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              asset.asset_id.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = filterCategory === 'All' || asset.category === filterCategory;
        const matchesStatus = filterStatus === 'All' || asset.status === filterStatus;
        return matchesSearch && matchesCategory && matchesStatus;
    });

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex justify-between items-center bg-white/70 backdrop-blur-xl p-6 rounded-[2rem] border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <div>
                    <h2 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 tracking-tight">Asset Management</h2>
                    <p className="text-xs text-slate-500 mt-1 font-medium">Track company laptops, equipment, and keys.</p>
                </div>
                <button onClick={() => setShowModal(true)} className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-105 transition-all duration-300 flex items-center gap-2">
                    <Plus size={18} /> Assign Asset
                </button>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center bg-white/70 backdrop-blur-xl p-4 rounded-2xl border border-white/50 shadow-sm gap-4">
                <div className="relative w-full sm:w-96">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="Search assets by name or ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-slate-50/50 border border-slate-200/80 rounded-xl outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 transition-all text-sm font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-medium"
                    />
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative group">
                        <select 
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                            className="pl-10 pr-8 py-3 bg-white border border-slate-200/80 rounded-xl outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 transition-all text-sm font-semibold text-slate-700 appearance-none cursor-pointer shadow-sm w-full sm:w-auto"
                        >
                            <option value="All">All Categories</option>
                            <option value="Laptop">Laptops</option>
                            <option value="Monitor">Monitors</option>
                            <option value="Key">Keys</option>
                            <option value="Other">Others</option>
                        </select>
                        <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" size={16} />
                    </div>
                    
                    <div className="relative group">
                        <select 
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="pl-4 pr-8 py-3 bg-white border border-slate-200/80 rounded-xl outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 transition-all text-sm font-semibold text-slate-700 appearance-none cursor-pointer shadow-sm w-full sm:w-auto"
                        >
                            <option value="All">All Statuses</option>
                            <option value="AVAILABLE">Available</option>
                            <option value="ASSIGNED">Assigned</option>
                            <option value="MAINTENANCE">Maintenance</option>
                        </select>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center p-10"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div></div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredAssets.map(asset => (
                        <div key={asset.id} className="bg-white/80 backdrop-blur-xl rounded-[2rem] border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 flex flex-col justify-between group hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
                            
                            <div>
                                <div className="flex justify-between items-start mb-5">
                                    <div className="w-14 h-14 bg-gradient-to-br from-indigo-50 to-purple-50 text-indigo-600 rounded-2xl flex items-center justify-center border border-indigo-100/50 shadow-sm group-hover:scale-110 transition-transform duration-300">
                                        {getIcon(asset.category)}
                                    </div>
                                    <button onClick={() => handleDelete(asset.id)} className="w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 hover:border-rose-100 transition-all opacity-0 group-hover:opacity-100 shadow-sm transform hover:scale-110">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                                <h3 className="text-xl font-black text-slate-800 tracking-tight">{asset.name}</h3>
                                <p className="text-xs text-slate-500 font-medium font-mono mt-1 mb-5 flex items-center gap-1">
                                    <span className="text-slate-400">ID:</span> {asset.asset_id}
                                </p>
                                {getStatusBadge(asset.status)}
                            </div>
                            
                            <div className="mt-6 pt-5 border-t border-slate-100/80">
                                {asset.assigned_to ? (
                                    <div className="flex justify-between items-center bg-slate-50/80 rounded-xl p-3 border border-slate-100">
                                        <span className="text-xs font-semibold text-slate-500">Assigned to</span>
                                        <span className="text-sm font-bold text-slate-800">{asset.assigned_to_name}</span>
                                    </div>
                                ) : (
                                    <div className="flex justify-between items-center bg-slate-50/50 rounded-xl p-3 border border-slate-100 border-dashed">
                                        <span className="text-xs font-semibold text-slate-400">Status</span>
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Unassigned</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add Asset Modal */}
            <AnimatePresence>
                {showModal && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 sm:p-6">
                        <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white/95 backdrop-blur-2xl w-full max-w-lg rounded-[2.5rem] shadow-[0_20px_60px_rgb(0,0,0,0.15)] border border-white/60 overflow-hidden flex flex-col relative">
                            {/* Decorative background element */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -z-10 pointer-events-none translate-x-1/3 -translate-y-1/3"></div>
                            
                            <div className="px-8 py-6 border-b border-slate-100/80 flex justify-between items-center bg-white/50 backdrop-blur-sm">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-md">
                                        <Plus size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-slate-900 tracking-tight">Add Asset</h3>
                                        <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mt-0.5">Inventory Management</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowModal(false)} className="w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 hover:border-rose-100 transition-all shadow-sm transform hover:scale-110">
                                    <X size={18} strokeWidth={2.5} />
                                </button>
                            </div>
                            <div className="p-8 bg-white/40">
                                <form onSubmit={handleSaveAsset} className="space-y-6">
                                    <div className="grid grid-cols-2 gap-5">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Asset Name</label>
                                            <input required type="text" className="w-full px-4 py-3.5 bg-slate-50/50 border border-slate-200/80 rounded-2xl outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 text-sm font-semibold text-slate-800 transition-all duration-300 placeholder:text-slate-400 placeholder:font-medium" value={newAsset.name} onChange={e => setNewAsset({...newAsset, name: e.target.value})} placeholder="MacBook Pro M2" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Asset ID</label>
                                            <input required type="text" className="w-full px-4 py-3.5 bg-slate-50/50 border border-slate-200/80 rounded-2xl outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 text-sm font-mono font-bold text-indigo-600 transition-all duration-300 placeholder:text-slate-400 placeholder:font-medium" value={newAsset.asset_id} onChange={e => setNewAsset({...newAsset, asset_id: e.target.value})} placeholder="LPT-001" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-5">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Category</label>
                                            <select className="w-full px-4 py-3.5 bg-slate-50/50 border border-slate-200/80 rounded-2xl outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 text-sm font-semibold text-slate-800 transition-all duration-300 appearance-none cursor-pointer" value={newAsset.category} onChange={e => setNewAsset({...newAsset, category: e.target.value})}>
                                                <option>Laptop</option>
                                                <option>Monitor</option>
                                                <option>Key</option>
                                                <option>Other</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Status</label>
                                            <select className="w-full px-4 py-3.5 bg-slate-50/50 border border-slate-200/80 rounded-2xl outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 text-sm font-semibold text-slate-800 transition-all duration-300 appearance-none cursor-pointer" value={newAsset.status} onChange={e => setNewAsset({...newAsset, status: e.target.value})}>
                                                <option value="AVAILABLE">Available</option>
                                                <option value="ASSIGNED">Assigned</option>
                                                <option value="MAINTENANCE">Maintenance</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-200/80">
                                        <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Assign To <span className="text-slate-400 font-medium normal-case tracking-normal">(Optional)</span></label>
                                        <select className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 text-sm font-semibold text-slate-800 transition-all duration-300 appearance-none cursor-pointer shadow-sm" value={newAsset.assigned_to} onChange={e => {
                                            setNewAsset({...newAsset, assigned_to: e.target.value, status: e.target.value ? 'ASSIGNED' : 'AVAILABLE'});
                                        }}>
                                            <option value="">-- Unassigned --</option>
                                            {employees.map(emp => (
                                                <option key={emp.id} value={emp.id}>{emp.full_name || emp.display_username} - {emp.employee_id}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="pt-4 flex gap-3">
                                        <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-white text-slate-700 border border-slate-200 px-6 py-4 rounded-2xl text-sm font-bold hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm">Cancel</button>
                                        <button type="submit" className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4 rounded-2xl text-sm font-bold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all duration-300">Save Asset</button>
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

export default AssetManagement;
