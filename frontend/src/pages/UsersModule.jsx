import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import {
    Plus, Trash2, Edit2, X, Search, UserCircle, UserPlus, Users, ChevronDown, Shield, GraduationCap, Briefcase
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const UsersModule = () => {
    const [loading, setLoading] = useState(false);
    const [users, setUsers] = useState([]);
    const [userModalOpen, setUserModalOpen] = useState(false);
    const [newUser, setNewUser] = useState({
        username: '', email: '', password: '', role: 'SALES', first_name: '', last_name: '', phone_number: ''
    });
    const [editUser, setEditUser] = useState(null);
    const [userModalMode, setUserModalMode] = useState('create'); // 'create' or 'edit'
    const [activeTab, setActiveTab] = useState('ADMIN'); // STAFF/ADMIN, SALES, MENTOR, STUDENT
    const [userPage, setUserPage] = useState(1);
    const [userPagination, setUserPagination] = useState({ count: 0, next: null, previous: null });
    const [searchQuery, setSearchQuery] = useState('');

    const tabs = [
        { label: 'Administrators', role: 'ADMIN', icon: Shield, color: 'text-rose-600', bg: 'bg-rose-50' },
        { label: 'Sales Management', role: 'SALES', icon: Briefcase, color: 'text-indigo-600', bg: 'bg-indigo-50' },
        { label: 'Mentors & Faculty', role: 'MENTOR', icon: GraduationCap, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { label: 'Student Accounts', role: 'STUDENT', icon: UserCircle, color: 'text-blue-600', bg: 'bg-blue-50' },
    ];

    useEffect(() => {
        fetchUsers();
    }, [userPage, activeTab]);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await api.get(`auth/management/users/?page=${userPage}&role=${activeTab}&search=${searchQuery}`);
            const data = res.data;
            if (data.results) {
                setUsers(data.results);
                setUserPagination({
                    count: data.count,
                    next: data.next,
                    previous: data.previous
                });
            } else {
                setUsers(Array.isArray(data) ? data : []);
                setUserPagination({ count: data.length, next: null, previous: null });
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveUser = async (e) => {
        e.preventDefault();
        try {
            if (userModalMode === 'create') {
                await api.post('auth/management/users/', newUser);
            } else {
                // Ensure password isn't sent if empty
                const payload = { ...editUser };
                if (!payload.password) delete payload.password;

                await api.patch(`auth/management/users/${editUser.id}/`, payload);
            }
            setUserModalOpen(false);
            fetchUsers();
            setNewUser({ username: '', email: '', password: '', role: 'SALES', first_name: '', last_name: '', phone_number: '' });
            setEditUser(null);
        } catch (err) {
            console.error(err);
            alert("Failed to save user");
        }
    };

    const openCreateUser = () => {
        setUserModalMode('create');
        setNewUser({ username: '', email: '', password: '', role: activeTab === 'ADMIN' ? 'ADMIN' : activeTab, first_name: '', last_name: '', phone_number: '' });
        setUserModalOpen(true);
    };

    const openEditUser = (user) => {
        setUserModalMode('edit');
        setEditUser({ ...user });
        setUserModalOpen(true);
    };

    const handleDeleteUser = async (id, roleName) => {
        if (!window.confirm(`Are you sure you want to remove this ${roleName}? This will revoke all their system access.`)) return;
        try {
            await api.delete(`auth/management/users/${id}/`);
            fetchUsers();
        } catch (err) {
            console.error(err);
        }
    };

    const currentTab = tabs.find(t => t.role === activeTab);

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fadeIn">
            {/* Context Header */}
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                    <h1 className="text-5xl font-black text-slate-900 tracking-tight">
                        {currentTab?.label || 'Identity'} <span className="text-indigo-600">Hub</span>
                    </h1>
                    <p className="text-slate-500 font-medium mt-3 text-lg">Manage access, security profiles and activity for all {activeTab.toLowerCase()}s</p>
                </div>
                <button
                    onClick={openCreateUser}
                    className={`flex items-center gap-3 px-8 py-4 ${currentTab?.bg || 'bg-indigo-600'} ${currentTab?.color || 'text-white'} font-black rounded-2xl shadow-xl transition-all hover:-translate-y-1 active:scale-95 text-sm uppercase tracking-widest border border-transparent hover:border-white/20`}
                >
                    <UserPlus size={20} />
                    Add {activeTab.replace('_', ' ')}
                </button>
            </header>

            {/* Enhanced Tabs System */}
            <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-[32px] border border-slate-100 shadow-sm overflow-x-auto custom-scrollbar no-scrollbar">
                {tabs.map((tab) => (
                    <button
                        key={tab.role}
                        onClick={() => { setActiveTab(tab.role); setUserPage(1); }}
                        className={`flex items-center gap-3 px-6 py-4 rounded-2xl font-black text-sm transition-all whitespace-nowrap ${activeTab === tab.role
                            ? `${tab.bg} ${tab.color} shadow-lg shadow-slate-100 scale-105`
                            : 'bg-white text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                            }`}
                    >
                        <tab.icon size={20} />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Stats for Active Section */}
                <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm relative overflow-hidden group">
                    <div className={`absolute top-0 right-0 w-24 h-24 ${tabs.find(t => t.role === activeTab)?.bg} rounded-bl-[60px] opacity-20 -z-10 group-hover:w-full group-hover:h-full group-hover:rounded-none transition-all duration-500`} />
                    <div className={`w-12 h-12 bg-white rounded-2xl shadow-sm border border-slate-50 flex items-center justify-center ${tabs.find(t => t.role === activeTab)?.color} mb-4`}>
                        {activeTab === 'ADMIN' ? <Shield size={24} /> : activeTab === 'MENTOR' ? <GraduationCap size={24} /> : <Users size={24} />}
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active {activeTab.replace('_', ' ')}s</p>
                    <h3 className="text-3xl font-black text-slate-900">{userPagination.count}</h3>
                </div>

                {/* Internal Search */}
                <div className="md:col-span-3 bg-white p-4 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4 px-8">
                    <Search className="text-slate-400" size={24} />
                    <input
                        type="text"
                        placeholder={`Search ${activeTab.toLowerCase()} names, emails, or usernames...`}
                        className="bg-transparent border-none outline-none w-full font-bold text-lg text-slate-700 placeholder-slate-300"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && fetchUsers()}
                    />
                    <button
                        onClick={fetchUsers}
                        className="px-6 py-3 bg-slate-900 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest hover:bg-black transition-all"
                    >
                        Search
                    </button>
                </div>
            </div>

            {/* User List Panel */}
            <div className="bg-white rounded-[48px] border border-slate-100 shadow-2xl shadow-slate-200/50 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                <th className="p-8 text-[10px] font-black uppercase text-slate-400 tracking-widest">Identity & Profile</th>
                                <th className="p-8 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Security Role</th>
                                <th className="p-8 text-[10px] font-black uppercase text-slate-400 tracking-widest">Status</th>
                                <th className="p-8 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Control</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {users.map(user => (
                                <tr key={user.id} className="group hover:bg-slate-50/30 transition-colors">
                                    <td className="p-8">
                                        <div className="flex items-center gap-5">
                                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-500 font-black text-xl group-hover:scale-105 transition-all shadow-sm">
                                                {user.first_name ? user.first_name[0] : user.username[0].toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-black text-slate-900 text-lg leading-tight">{user.first_name || user.username} {user.last_name || ''}</p>
                                                <p className="text-sm font-medium text-slate-400 tracking-tight mt-1">{user.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-8 text-center">
                                        <span className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm inline-block ${user.role === 'SUPER_ADMIN' ? 'bg-indigo-600 text-white' :
                                            user.role === 'ADMIN' ? 'bg-rose-50 border border-rose-100 text-rose-600' :
                                                user.role === 'MENTOR' ? 'bg-emerald-50 border border-emerald-100 text-emerald-600' :
                                                    'bg-blue-50 border border-blue-100 text-blue-600'
                                            }`}>
                                            {user.role.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="p-8">
                                        <div className="flex items-center gap-3">
                                            <div className="relative">
                                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                                <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping opacity-40" />
                                            </div>
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Operational</span>
                                        </div>
                                    </td>
                                    <td className="p-8 text-right space-x-3">
                                        <button
                                            onClick={() => openEditUser(user)}
                                            className="inline-flex items-center justify-center w-12 h-12 bg-white border border-slate-100 text-slate-400 rounded-2xl hover:text-indigo-600 hover:border-indigo-100 transition-all shadow-sm hover:shadow-md"
                                        >
                                            <Edit2 size={18} />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteUser(user.id, user.role)}
                                            className="inline-flex items-center justify-center w-12 h-12 bg-white border border-slate-100 text-slate-400 rounded-2xl hover:text-rose-600 hover:border-rose-100 transition-all shadow-sm hover:shadow-md"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Footer / Pagination Toolbar */}
                    <div className="p-8 bg-slate-50/40 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-indigo-500" />
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                Page {userPage} &bull; Rendering {users.length} of {userPagination.count} Records
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setUserPage(p => Math.max(1, p - 1))}
                                disabled={!userPagination.previous || loading}
                                className="px-8 py-3 bg-white border border-slate-200 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-600 disabled:opacity-50 transition-all hover:bg-slate-50 shadow-sm"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setUserPage(p => p + 1)}
                                disabled={!userPagination.next || loading}
                                className="px-8 py-3 bg-indigo-600 border border-indigo-600 rounded-2xl font-black text-[10px] uppercase tracking-widest text-white disabled:opacity-50 transition-all hover:bg-indigo-700 shadow-xl shadow-indigo-100"
                            >
                                Next Page
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Interactive User Modal */}
            <AnimatePresence>
                {userModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 30 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 30 }}
                            className="bg-white rounded-[48px] shadow-2xl w-full max-w-2xl overflow-hidden border border-white"
                        >
                            <div className="relative">
                                {/* Decorative elements */}
                                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/50 rounded-bl-[100px] -z-10" />

                                <div className="p-12">
                                    <div className="flex justify-between items-center mb-10">
                                        <div>
                                            <h2 className="text-4xl font-black text-slate-900 tracking-tight">
                                                {userModalMode === 'create' ? 'Provision Staff' : 'Modify Account'}
                                            </h2>
                                            <p className="text-slate-400 font-medium text-base mt-2">Configure system access and security credentials</p>
                                        </div>
                                        <button onClick={() => setUserModalOpen(false)} className="p-4 bg-slate-50 rounded-2xl text-slate-400 hover:text-slate-900 transition-colors shadow-sm">
                                            <X size={24} />
                                        </button>
                                    </div>

                                    <form onSubmit={handleSaveUser} className="space-y-8">
                                        <div className="grid grid-cols-2 gap-8">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Username / UID</label>
                                                <input
                                                    className="w-full px-6 py-5 bg-slate-50 border border-transparent rounded-2xl focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none font-bold transition-all text-lg"
                                                    value={userModalMode === 'create' ? newUser.username : editUser?.username}
                                                    onChange={e => userModalMode === 'create' ? setNewUser({ ...newUser, username: e.target.value }) : setEditUser({ ...editUser, username: e.target.value })}
                                                    disabled={userModalMode === 'edit'}
                                                    placeholder="john_doe"
                                                    required
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Official Email</label>
                                                <input
                                                    className="w-full px-6 py-5 bg-slate-50 border border-transparent rounded-2xl focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none font-bold transition-all text-lg"
                                                    type="email"
                                                    placeholder="john@natyaarts.com"
                                                    value={userModalMode === 'create' ? newUser.email : editUser?.email}
                                                    onChange={e => userModalMode === 'create' ? setNewUser({ ...newUser, email: e.target.value }) : setEditUser({ ...editUser, email: e.target.value })}
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-8">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">First Name</label>
                                                <input
                                                    className="w-full px-6 py-5 bg-slate-50 border border-transparent rounded-2xl focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none font-bold transition-all text-lg"
                                                    value={userModalMode === 'create' ? newUser.first_name : editUser?.first_name || ''}
                                                    onChange={e => userModalMode === 'create' ? setNewUser({ ...newUser, first_name: e.target.value }) : setEditUser({ ...editUser, first_name: e.target.value })}
                                                    required
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Last Name</label>
                                                <input
                                                    className="w-full px-6 py-5 bg-slate-50 border border-transparent rounded-2xl focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none font-bold transition-all text-lg"
                                                    value={userModalMode === 'create' ? newUser.last_name || '' : editUser?.last_name || ''}
                                                    onChange={e => userModalMode === 'create' ? setNewUser({ ...newUser, last_name: e.target.value }) : setEditUser({ ...editUser, last_name: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        {userModalMode === 'create' && (
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Access Password</label>
                                                <input
                                                    className="w-full px-6 py-5 bg-slate-50 border border-transparent rounded-2xl focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none font-bold transition-all text-lg"
                                                    type="password"
                                                    value={newUser.password}
                                                    onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                                    required
                                                />
                                            </div>
                                        )}

                                        <div className="grid grid-cols-2 gap-8">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">System Profile</label>
                                                <div className="relative">
                                                    <select
                                                        className="w-full px-6 py-5 bg-slate-50 border border-transparent rounded-2xl focus:bg-white focus:border-indigo-500 outline-none font-black transition-all appearance-none text-lg"
                                                        value={userModalMode === 'create' ? newUser.role : editUser?.role}
                                                        onChange={e => userModalMode === 'create' ? setNewUser({ ...newUser, role: e.target.value }) : setEditUser({ ...editUser, role: e.target.value })}
                                                    >
                                                        {activeTab === 'ADMIN' ? (
                                                            <>
                                                                <option value="ADMIN">Lead Administrator</option>
                                                                <option value="SUPER_ADMIN">System Owner / Super Admin</option>
                                                                <option value="ACADEMIC">Academic Manager</option>
                                                            </>
                                                        ) : activeTab === 'SALES' ? (
                                                            <option value="SALES">Sales Associate</option>
                                                        ) : activeTab === 'MENTOR' ? (
                                                            <option value="MENTOR">Faculty / Mentor</option>
                                                        ) : (
                                                            <option value="STUDENT">Student Scholar</option>
                                                        )}
                                                    </select>
                                                    <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Contact Phone</label>
                                                <input
                                                    className="w-full px-6 py-5 bg-slate-50 border border-transparent rounded-2xl focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none font-bold transition-all text-lg"
                                                    value={userModalMode === 'create' ? newUser.phone_number : editUser?.phone_number || ''}
                                                    placeholder="+91"
                                                    onChange={e => userModalMode === 'create' ? setNewUser({ ...newUser, phone_number: e.target.value }) : setEditUser({ ...editUser, phone_number: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        <button className="w-full py-6 bg-indigo-600 text-white rounded-[28px] font-black text-xl transition-all hover:bg-indigo-700 shadow-[0_25px_50px_-12px_rgba(79,70,229,0.4)] transform hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3">
                                            {userModalMode === 'create' ? <><UserPlus size={24} /> Confirm Account Provision</> : 'Apply Account Modifications'}
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default UsersModule;
