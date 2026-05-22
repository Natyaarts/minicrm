import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import {
    Plus, Trash2, Edit2, X, Search, UserCircle, UserPlus, Users, ChevronDown, Shield, GraduationCap, Briefcase, BookOpen
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
        { label: 'Teacher Staff', role: 'TEACHER', icon: BookOpen, color: 'text-teal-600', bg: 'bg-teal-50' },
        { label: 'General Staff', role: 'EMPLOYEE', icon: Users, color: 'text-amber-600', bg: 'bg-amber-50' },
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
            let errorMessage = "Failed to save user";
            if (err.response && err.response.data) {
                const data = err.response.data;
                if (typeof data === 'object') {
                    errorMessage = Object.entries(data)
                        .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
                        .join('\n');
                } else if (typeof data === 'string') {
                    errorMessage = data;
                }
            }
            alert(errorMessage);
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
        <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fadeIn">
            {/* Context Header */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
                        {currentTab?.label || 'Identity'} Hub
                    </h1>
                    <p className="text-slate-500 mt-1 text-xs">Manage access, security profiles and activity for all {activeTab.toLowerCase()}s</p>
                </div>
                <button
                    onClick={openCreateUser}
                    className={`flex items-center gap-1.5 px-4 py-2 ${currentTab?.bg || 'bg-indigo-600'} ${currentTab?.color || 'text-white'} font-semibold rounded-lg shadow-sm transition-colors hover:opacity-90 active:scale-95 text-xs border border-slate-200/10`}
                >
                    <UserPlus size={15} />
                    Add {activeTab.replace('_', ' ')}
                </button>
            </header>

            {/* Enhanced Tabs System */}
            <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm overflow-x-auto no-scrollbar">
                {tabs.map((tab) => (
                    <button
                        key={tab.role}
                        onClick={() => { setActiveTab(tab.role); setUserPage(1); }}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-semibold text-xs transition-colors whitespace-nowrap ${activeTab === tab.role
                            ? `${tab.bg} ${tab.color} border border-slate-100 shadow-sm`
                            : 'bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                            }`}
                    >
                        <tab.icon size={15} />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Stats for Active Section */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${tabs.find(t => t.role === activeTab)?.bg || 'bg-indigo-50'} ${tabs.find(t => t.role === activeTab)?.color || 'text-indigo-600'}`}>
                        {activeTab === 'ADMIN' ? <Shield size={20} /> : activeTab === 'MENTOR' ? <GraduationCap size={20} /> : activeTab === 'TEACHER' ? <BookOpen size={20} /> : <Users size={20} />}
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active {activeTab.replace('_', ' ')}s</p>
                        <h3 className="text-xl font-bold text-slate-800">{userPagination.count}</h3>
                    </div>
                </div>

                {/* Internal Search */}
                <div className="md:col-span-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3 px-4">
                    <Search className="text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder={`Search ${activeTab.toLowerCase()} names, emails, or usernames...`}
                        className="bg-transparent border-none outline-none w-full text-sm text-slate-700 placeholder-slate-400"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && fetchUsers()}
                    />
                    <button
                        onClick={fetchUsers}
                        className="px-4 py-2 bg-slate-800 text-white font-semibold rounded-lg text-xs hover:bg-slate-900 transition-colors"
                    >
                        Search
                    </button>
                </div>
            </div>

            {/* User List Panel */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-6 py-3 text-xs font-semibold uppercase text-slate-500 tracking-wider">Identity & Profile</th>
                                <th className="px-6 py-3 text-xs font-semibold uppercase text-slate-500 tracking-wider text-center">Security Role</th>
                                <th className="px-6 py-3 text-xs font-semibold uppercase text-slate-500 tracking-wider">Status</th>
                                <th className="px-6 py-3 text-xs font-semibold uppercase text-slate-500 tracking-wider text-right">Control</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {users.map(user => (
                                <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-sm border border-slate-200 shadow-sm">
                                                {user.first_name ? user.first_name[0] : user.username[0].toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-semibold text-slate-800 text-sm leading-none">{user.first_name || user.username} {user.last_name || ''}</p>
                                                <p className="text-xs text-slate-400 mt-1.5">{user.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`px-2.5 py-1 rounded-md text-xs font-semibold tracking-wide inline-block ${user.role === 'SUPER_ADMIN' ? 'bg-indigo-600 text-white' :
                                            user.role === 'ADMIN' ? 'bg-rose-50 border border-rose-100 text-rose-600' :
                                                user.role === 'MENTOR' ? 'bg-emerald-50 border border-emerald-100 text-emerald-600' :
                                                    user.role === 'TEACHER' ? 'bg-teal-50 border border-teal-100 text-teal-600' :
                                                        user.role === 'ACADEMIC_COORDINATOR' ? 'bg-amber-50 border border-amber-100 text-amber-600' :
                                                            user.role === 'EMPLOYEE' ? 'bg-orange-50 border border-orange-100 text-orange-600' :
                                                                'bg-blue-50 border border-blue-100 text-blue-600'
                                            }`}>
                                            {user.role.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                            </div>
                                            <span className="text-xs text-slate-600 font-medium">Operational</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right space-x-2">
                                        <button
                                            onClick={() => openEditUser(user)}
                                            className="inline-flex items-center justify-center w-8 h-8 bg-white border border-slate-200 text-slate-500 rounded-lg hover:text-indigo-600 hover:border-indigo-300 transition-colors shadow-sm"
                                        >
                                            <Edit2 size={14} />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteUser(user.id, user.role)}
                                            className="inline-flex items-center justify-center w-8 h-8 bg-white border border-slate-200 text-slate-500 rounded-lg hover:text-rose-600 hover:border-rose-300 transition-colors shadow-sm"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Footer / Pagination Toolbar */}
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                            <p className="text-xs text-slate-500 font-medium">
                                Page {userPage} &bull; Showing {users.length} of {userPagination.count} records
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setUserPage(p => Math.max(1, p - 1))}
                                disabled={!userPagination.previous || loading}
                                className="px-3.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 disabled:opacity-50 transition-colors hover:bg-slate-50 shadow-sm"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setUserPage(p => p + 1)}
                                disabled={!userPagination.next || loading}
                                className="px-3.5 py-1.5 bg-indigo-600 border border-indigo-600 rounded-lg text-xs font-semibold text-white disabled:opacity-50 transition-colors hover:bg-indigo-700 shadow-sm"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* User Modal */}
            <AnimatePresence>
                {userModalOpen && (
                    <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.96, opacity: 0, y: 16 }}
                            transition={{ duration: 0.18 }}
                            className="bg-white rounded-xl shadow-lg w-full max-w-lg border border-slate-200"
                        >
                            {/* Modal Header */}
                            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
                                <div>
                                    <h2 className="text-base font-bold text-slate-800">
                                        {userModalMode === 'create' ? 'Add New User' : 'Edit User'}
                                    </h2>
                                    <p className="text-xs text-slate-400 mt-0.5">Configure system access credentials</p>
                                </div>
                                <button onClick={() => setUserModalOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Modal Body */}
                            <form onSubmit={handleSaveUser} className="px-6 py-5 space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 mb-1">Username</label>
                                        <input
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none text-sm text-slate-700 transition-all"
                                            value={userModalMode === 'create' ? newUser.username : editUser?.username}
                                            onChange={e => userModalMode === 'create' ? setNewUser({ ...newUser, username: e.target.value }) : setEditUser({ ...editUser, username: e.target.value })}
                                            disabled={userModalMode === 'edit'}
                                            placeholder="john_doe"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 mb-1">Email</label>
                                        <input
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none text-sm text-slate-700 transition-all"
                                            type="email"
                                            placeholder="john@natyaarts.com"
                                            value={userModalMode === 'create' ? newUser.email : editUser?.email}
                                            onChange={e => userModalMode === 'create' ? setNewUser({ ...newUser, email: e.target.value }) : setEditUser({ ...editUser, email: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 mb-1">First Name</label>
                                        <input
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none text-sm text-slate-700 transition-all"
                                            value={userModalMode === 'create' ? newUser.first_name : editUser?.first_name || ''}
                                            onChange={e => userModalMode === 'create' ? setNewUser({ ...newUser, first_name: e.target.value }) : setEditUser({ ...editUser, first_name: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 mb-1">Last Name</label>
                                        <input
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none text-sm text-slate-700 transition-all"
                                            value={userModalMode === 'create' ? newUser.last_name || '' : editUser?.last_name || ''}
                                            onChange={e => userModalMode === 'create' ? setNewUser({ ...newUser, last_name: e.target.value }) : setEditUser({ ...editUser, last_name: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {userModalMode === 'create' && (
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 mb-1">Password</label>
                                        <input
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none text-sm text-slate-700 transition-all"
                                            type="password"
                                            value={newUser.password}
                                            onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                            required
                                        />
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 mb-1">Role</label>
                                        <div className="relative">
                                            <select
                                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-indigo-400 outline-none text-sm text-slate-700 transition-all appearance-none"
                                                value={userModalMode === 'create' ? newUser.role : editUser?.role}
                                                onChange={e => userModalMode === 'create' ? setNewUser({ ...newUser, role: e.target.value }) : setEditUser({ ...editUser, role: e.target.value })}
                                            >
                                                {activeTab === 'ADMIN' ? (
                                                    <>
                                                        <option value="ADMIN">Administrator</option>
                                                        <option value="SUPER_ADMIN">Super Admin</option>
                                                        <option value="ACADEMIC">Academic Manager</option>
                                                        <option value="ACADEMIC_COORDINATOR">Academic Coordinator</option>
                                                        <option value="TEACHER">Teacher</option>
                                                        <option value="EMPLOYEE">General Employee</option>
                                                    </>
                                                ) : activeTab === 'SALES' ? (
                                                    <>
                                                        <option value="SALES">Sales</option>
                                                        <option value="EMPLOYEE">General Employee</option>
                                                    </>
                                                ) : activeTab === 'MENTOR' ? (
                                                    <>
                                                        <option value="MENTOR">Mentor</option>
                                                        <option value="EMPLOYEE">General Employee</option>
                                                    </>
                                                ) : activeTab === 'TEACHER' ? (
                                                    <>
                                                        <option value="TEACHER">Teacher</option>
                                                        <option value="EMPLOYEE">General Employee</option>
                                                    </>
                                                ) : (
                                                    <>
                                                        <option value="STUDENT">Student</option>
                                                        <option value="EMPLOYEE">General Employee</option>
                                                    </>
                                                )}
                                            </select>
                                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 mb-1">Phone</label>
                                        <input
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none text-sm text-slate-700 transition-all"
                                            value={userModalMode === 'create' ? newUser.phone_number : editUser?.phone_number || ''}
                                            placeholder="+91"
                                            onChange={e => userModalMode === 'create' ? setNewUser({ ...newUser, phone_number: e.target.value }) : setEditUser({ ...editUser, phone_number: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {/* Footer Buttons */}
                                <div className="flex justify-end gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setUserModalOpen(false)}
                                        className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-2"
                                    >
                                        {userModalMode === 'create' ? <><UserPlus size={15} /> Add User</> : 'Save Changes'}
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

export default UsersModule;
