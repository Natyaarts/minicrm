import React, { useState, useEffect } from 'react';
import { Laptop, Key, Monitor, Archive, Trash2, Plus, X, Search, CheckCircle2, Clock, User, Filter, Package, Tag, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api/axios';

const CATEGORIES = ['Laptop', 'Monitor', 'Key', 'Other'];
const STATUSES   = ['AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED'];

const categoryConfig = {
  Laptop:  { icon: Laptop,  gradient: 'from-blue-500 to-indigo-600',   bg: 'bg-blue-50',   text: 'text-blue-600',   border: 'border-blue-100' },
  Monitor: { icon: Monitor, gradient: 'from-violet-500 to-purple-600', bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-100' },
  Key:     { icon: Key,     gradient: 'from-amber-500 to-orange-500',  bg: 'bg-amber-50',  text: 'text-amber-600',  border: 'border-amber-100' },
  Other:   { icon: Archive, gradient: 'from-slate-400 to-slate-600',   bg: 'bg-slate-50',  text: 'text-slate-600',  border: 'border-slate-200' },
};

const statusConfig = {
  AVAILABLE:   { label: 'Available',   color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  ASSIGNED:    { label: 'Assigned',    color: 'bg-indigo-100 text-indigo-700 border-indigo-200',   dot: 'bg-indigo-500' },
  MAINTENANCE: { label: 'Maintenance', color: 'bg-amber-100 text-amber-700 border-amber-200',      dot: 'bg-amber-500' },
  RETIRED:     { label: 'Retired',     color: 'bg-rose-100 text-rose-700 border-rose-200',         dot: 'bg-rose-500' },
};

const StatusBadge = ({ status }) => {
  const cfg = statusConfig[status] || statusConfig.RETIRED;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

const AssetManagement = ({ employees = [] }) => {
  const [assets,         setAssets]         = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [showModal,      setShowModal]      = useState(false);
  const [deleting,       setDeleting]       = useState(null);
  const [saving,         setSaving]         = useState(false);
  const [newAsset,       setNewAsset]       = useState({ name: '', asset_id: '', category: 'Laptop', status: 'AVAILABLE', assigned_to: '' });
  const [searchTerm,     setSearchTerm]     = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterStatus,   setFilterStatus]   = useState('All');

  useEffect(() => { fetchAssets(); }, []);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const res = await api.get('hrms/assets/');
      setAssets(res.data.results || res.data || []);
    } catch { /* silent */ } finally { setLoading(false); }
  };

  const handleSaveAsset = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...newAsset };
      if (!payload.assigned_to) payload.assigned_to = null;
      if (payload.assigned_to)  payload.assigned_date = new Date().toISOString().split('T')[0];
      await api.post('hrms/assets/', payload);
      setShowModal(false);
      setNewAsset({ name: '', asset_id: '', category: 'Laptop', status: 'AVAILABLE', assigned_to: '' });
      fetchAssets();
    } catch { alert('Failed to save asset'); }
    finally  { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this asset?')) return;
    setDeleting(id);
    try { await api.delete(`hrms/assets/${id}/`); fetchAssets(); }
    catch { alert('Failed to delete asset'); }
    finally { setDeleting(null); }
  };

  const openModal = () => {
    setNewAsset({ name: '', asset_id: '', category: 'Laptop', status: 'AVAILABLE', assigned_to: '' });
    setShowModal(true);
  };

  const filteredAssets = assets.filter(a => {
    const q = searchTerm.toLowerCase();
    return (
      (a.name?.toLowerCase().includes(q) || a.asset_id?.toLowerCase().includes(q)) &&
      (filterCategory === 'All' || a.category === filterCategory) &&
      (filterStatus   === 'All' || a.status   === filterStatus)
    );
  });

  // Stats
  const stats = [
    { label: 'Total Assets',  value: assets.length,                                        icon: Package,      gradient: 'from-indigo-500 to-blue-600',   bg: 'from-indigo-50 to-blue-50' },
    { label: 'Available',     value: assets.filter(a => a.status === 'AVAILABLE').length,   icon: CheckCircle2, gradient: 'from-emerald-500 to-teal-600',   bg: 'from-emerald-50 to-teal-50' },
    { label: 'Assigned',      value: assets.filter(a => a.status === 'ASSIGNED').length,    icon: User,         gradient: 'from-purple-500 to-violet-600',  bg: 'from-purple-50 to-violet-50' },
    { label: 'Maintenance',   value: assets.filter(a => a.status === 'MAINTENANCE').length, icon: AlertTriangle,gradient: 'from-amber-500 to-orange-500',   bg: 'from-amber-50 to-orange-50' },
  ];

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 text-white">
            <Package size={22} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Asset Management</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Track laptops, equipment, keys & more</p>
          </div>
        </div>
        <button
          onClick={openModal}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-0.5 transition-all"
        >
          <Plus size={18} /> Add Asset
        </button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className={`bg-gradient-to-br ${s.bg} rounded-2xl p-4 border border-white/60 shadow-sm flex items-center gap-4`}>
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.gradient} flex items-center justify-center text-white shadow-md shrink-0`}>
                <Icon size={18} />
              </div>
              <div>
                <p className="text-2xl font-black text-slate-800">{s.value}</p>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{s.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search by name or asset ID..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 shadow-sm transition-all"
          />
        </div>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:border-indigo-400 shadow-sm cursor-pointer appearance-none"
        >
          <option value="All">All Categories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:border-indigo-400 shadow-sm cursor-pointer appearance-none"
        >
          <option value="All">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{statusConfig[s].label}</option>)}
        </select>
      </div>

      {/* ── Asset Grid ── */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-sm">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-400"><Package size={32} /></div>
          <p className="text-slate-700 font-bold text-lg">No assets found</p>
          <p className="text-slate-400 text-sm mt-1">Add your first asset using the button above</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredAssets.map(asset => {
            const cat = categoryConfig[asset.category] || categoryConfig.Other;
            const CatIcon = cat.icon;
            return (
              <motion.div
                key={asset.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col"
              >
                {/* Card header gradient stripe */}
                <div className={`h-1.5 w-full bg-gradient-to-r ${cat.gradient}`} />

                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-12 h-12 rounded-2xl ${cat.bg} ${cat.text} border ${cat.border} flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-300`}>
                      <CatIcon size={22} />
                    </div>
                    <button
                      onClick={() => handleDelete(asset.id)}
                      disabled={deleting === asset.id}
                      className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 hover:border-rose-200 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <h3 className="font-black text-slate-900 text-base leading-tight">{asset.name}</h3>
                  <p className="text-[11px] font-mono font-bold text-slate-400 mt-1 mb-3">#{asset.asset_id}</p>

                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100">
                    <StatusBadge status={asset.status} />
                    {asset.assigned_to ? (
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                        <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-black">
                          {(asset.assigned_to_name || '?')[0]?.toUpperCase()}
                        </div>
                        <span className="truncate max-w-[100px]">{asset.assigned_to_name}</span>
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Unassigned</span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── Add Asset Modal ── */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setShowModal(false)}
            />

            {/* Modal */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200"
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-indigo-600 to-purple-700 px-7 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                    <Plus size={20} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-black text-lg">Add New Asset</h3>
                    <p className="text-indigo-200 text-xs font-medium">Register to inventory</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-9 h-9 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleSaveAsset} className="p-7 space-y-5">
                {/* Asset Name + ID */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Asset Name</label>
                    <input
                      required type="text"
                      placeholder="MacBook Pro M2"
                      value={newAsset.name}
                      onChange={e => setNewAsset({ ...newAsset, name: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-400 placeholder:font-normal"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Asset ID</label>
                    <input
                      required type="text"
                      placeholder="LPT-001"
                      value={newAsset.asset_id}
                      onChange={e => setNewAsset({ ...newAsset, asset_id: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold font-mono text-indigo-600 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-400 placeholder:font-normal placeholder:font-sans"
                    />
                  </div>
                </div>

                {/* Category + Status */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Category</label>
                    <select
                      value={newAsset.category}
                      onChange={e => setNewAsset({ ...newAsset, category: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all appearance-none cursor-pointer"
                    >
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Status</label>
                    <select
                      value={newAsset.status}
                      onChange={e => setNewAsset({ ...newAsset, status: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all appearance-none cursor-pointer"
                    >
                      {STATUSES.map(s => <option key={s} value={s}>{statusConfig[s].label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Assign To */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Assign To <span className="text-slate-400 font-medium normal-case tracking-normal">(Optional)</span>
                  </label>
                  <select
                    value={newAsset.assigned_to}
                    onChange={e => setNewAsset({ ...newAsset, assigned_to: e.target.value, status: e.target.value ? 'ASSIGNED' : 'AVAILABLE' })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all appearance-none cursor-pointer"
                  >
                    <option value="">— Unassigned —</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name || emp.display_username}{emp.employee_id ? ` (${emp.employee_id})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-3 border border-slate-200 bg-white text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:translate-y-0 flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
                    ) : (
                      <><Plus size={16} /> Save Asset</>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AssetManagement;
