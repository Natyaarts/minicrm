
import React, { useState, useEffect } from 'react';
import api from '../api/axios';

const AdminModule = () => {
    const [activeTab, setActiveTab] = useState('users');
    const [loading, setLoading] = useState(false);

    // Users State
    const [users, setUsers] = useState([]);
    const [userModalOpen, setUserModalOpen] = useState(false);
    const [newUser, setNewUser] = useState({
        username: '', email: '', password: '', role: 'SALES', first_name: '', last_name: '', phone_number: ''
    });
    const [editUser, setEditUser] = useState(null);
    const [userModalMode, setUserModalMode] = useState('create'); // 'create' or 'edit'

    // Fields State
    const [programs, setPrograms] = useState([]);
    const [subPrograms, setSubPrograms] = useState([]);
    const [selectedProgram, setSelectedProgram] = useState('');
    const [selectedSubProgram, setSelectedSubProgram] = useState('');
    const [courses, setCourses] = useState([]);
    const [selectedCourse, setSelectedCourse] = useState('');
    const [fields, setFields] = useState([]);
    const [fieldModalOpen, setFieldModalOpen] = useState(false);
    const [subProgramModalOpen, setSubProgramModalOpen] = useState(false);
    const [courseModalOpen, setCourseModalOpen] = useState(false);
    const [newField, setNewField] = useState({
        label: '', field_type: 'text', options: '', order: 0, is_required: true
    });
    const [newSubProgram, setNewSubProgram] = useState('');
    const [newCourse, setNewCourse] = useState({ name: '', fee_amount: 0 });

    // Permissions State
    const [selectedRoleForPerms, setSelectedRoleForPerms] = useState('SALES');
    const [rolePermissions, setRolePermissions] = useState([]);
    const modules = [
        { id: 'SALES', name: 'Sales Module' },
        { id: 'MENTOR', name: 'Mentor Module' },
        { id: 'STUDENT', name: 'Student Portal' },
        { id: 'ACADEMIC', name: 'Academic Module' },
        { id: 'ADMIN', name: 'Admin Module' },
    ];

    useEffect(() => {
        if (activeTab === 'users') fetchUsers();
        if (activeTab === 'fields') fetchPrograms();
        if (activeTab === 'permissions') fetchRolePermissions();
    }, [activeTab, selectedRoleForPerms]);

    useEffect(() => {
        if (activeTab === 'fields' && selectedProgram) {
            fetchFields();
            // Always attempt to fetch sub-programs for any selected program
            fetchSubPrograms(selectedProgram);
        }
    }, [selectedProgram, selectedSubProgram, selectedCourse]);

    useEffect(() => {
        if (selectedSubProgram) {
            fetchCourses(selectedSubProgram);
        } else {
            setCourses([]);
            setSelectedCourse('');
        }
    }, [selectedSubProgram]);

    // --- User Logic ---
    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await api.get('auth/management/users/');
            const data = res.data?.results || res.data || [];
            setUsers(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        try {
            if (userModalMode === 'create') {
                await api.post('auth/management/users/', newUser);
            } else {
                await api.patch(`auth/management/users/${editUser.id}/`, editUser);
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
        setNewUser({ username: '', email: '', password: '', role: 'SALES', first_name: '', last_name: '', phone_number: '' });
        setUserModalOpen(true);
    };

    const openEditUser = (user) => {
        setUserModalMode('edit');
        setEditUser({ ...user });
        setUserModalOpen(true);
    };

    const handleDeleteUser = async (id) => {
        if (!window.confirm("Are you sure?")) return;
        try {
            await api.delete(`auth/management/users/${id}/`);
            fetchUsers();
        } catch (err) {
            console.error(err);
        }
    };

    // --- Field Logic ---
    const fetchPrograms = async () => {
        try {
            const res = await api.get('programs/');
            setPrograms(Array.isArray(res.data) ? res.data : (res.data?.results || []));
        } catch (err) {
            console.error(err);
        }
    };

    const fetchSubPrograms = async (progId) => {
        try {
            const res = await api.get(`sub-programs/?program=${progId}`);
            setSubPrograms(Array.isArray(res.data) ? res.data : (res.data?.results || []));
        } catch (err) {
            console.error(err);
        }
    };

    const handleCreateSubProgram = async (e) => {
        e.preventDefault();
        try {
            await api.post('sub-programs/', {
                program: selectedProgram,
                name: newSubProgram
            });
            setSubProgramModalOpen(false);
            fetchSubPrograms(selectedProgram);
            setNewSubProgram('');
        } catch (err) {
            console.error(err);
            alert("Failed to create sub-program");
        }
    };

    const fetchCourses = async (subProgId) => {
        try {
            const res = await api.get(`courses/?sub_program=${subProgId}`);
            setCourses(Array.isArray(res.data) ? res.data : (res.data?.results || []));
        } catch (err) {
            console.error(err);
        }
    };

    const fetchFields = async () => {
        const params = new URLSearchParams();
        if (selectedProgram) params.append('program', selectedProgram);
        if (selectedSubProgram) params.append('sub_program', selectedSubProgram);
        if (selectedCourse) params.append('course', selectedCourse);

        try {
            const res = await api.get(`forms/fields/?${params.toString()}`);
            const data = Array.isArray(res.data) ? res.data : (res.data?.results || []);
            setFields(data.sort((a, b) => a.order - b.order));
        } catch (err) {
            console.error(err);
        }
    };

    const handleCreateField = async (e) => {
        e.preventDefault();
        const payload = { ...newField };
        if (selectedProgram) payload.program = selectedProgram;
        if (selectedSubProgram) payload.sub_program = selectedSubProgram;
        if (selectedCourse) payload.course = selectedCourse;

        if (payload.field_type === 'dropdown' && typeof payload.options === 'string') {
            payload.options = payload.options.split(',').map(s => s.trim());
        } else if (payload.field_type !== 'dropdown') {
            payload.options = null;
        }

        try {
            await api.post('forms/fields/', payload);
            setFieldModalOpen(false);
            fetchFields();
            setNewField({ label: '', field_type: 'text', options: '', order: 0, is_required: true });
        } catch (err) {
            console.error(err);
            alert("Failed to create field");
        }
    };

    const handleCreateCourse = async (e) => {
        e.preventDefault();
        try {
            await api.post('courses/', {
                name: newCourse.name,
                fee_amount: newCourse.fee_amount,
                sub_program: selectedSubProgram
            });
            setCourseModalOpen(false);
            fetchCourses(selectedSubProgram);
            setNewCourse({ name: '', fee_amount: 0 });
        } catch (err) {
            console.error(err);
            alert("Failed to create course");
        }
    };

    const handleDeleteField = async (id) => {
        if (!window.confirm("Delete this field?")) return;
        try {
            await api.delete(`forms/fields/${id}/`);
            fetchFields();
        } catch (err) {
            console.error(err);
        }
    };

    // --- Permission Logic ---
    const fetchRolePermissions = async () => {
        try {
            const res = await api.get(`auth/management/permissions/?role=${selectedRoleForPerms}`);
            setRolePermissions(Array.isArray(res.data) ? res.data : (res.data?.results || []));
        } catch (err) {
            console.error(err);
        }
    };

    const handleTogglePermission = async (moduleCode, key, currentVal) => {
        let permObj = rolePermissions.find(p => p.module === moduleCode);

        try {
            if (!permObj) {
                const res = await api.post('auth/management/permissions/', {
                    role: selectedRoleForPerms,
                    module: moduleCode,
                    [key]: !currentVal
                });
                setRolePermissions([...rolePermissions, res.data]);
            } else {
                const res = await api.patch(`auth/management/permissions/${permObj.id}/`, {
                    [key]: !currentVal
                });
                setRolePermissions(rolePermissions.map(p => p.id === permObj.id ? res.data : p));
            }
        } catch (err) {
            console.error(err);
        }
    };

    // Sync State
    const [syncStatus, setSyncStatus] = useState(null);
    const [isSyncing, setIsSyncing] = useState(false);

    const handleSyncWise = async () => {
        setIsSyncing(true);
        setSyncStatus("Scanning Wise Students... This may take a while.");
        try {
            const res = await api.post('integrations/sync-students/');
            const stats = res.data.stats;
            setSyncStatus(`Sync Complete! Scanned: ${stats.scanned}, Created: ${stats.created}, Linked: ${stats.linked}, Updated: ${stats.updated}, Errors: ${stats.errors}`);
        } catch (err) {
            console.error(err);
            setSyncStatus("Sync Failed: " + (err.response?.data?.error || err.message));
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="space-y-8 text-slate-900">
            <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-pink-600 to-orange-500">
                Admin Control Panel
            </h1>

            {/* Tabs */}
            <div className="flex gap-4 md:gap-6 border-b border-slate-200 overflow-x-auto custom-scrollbar whitespace-nowrap pb-2">
                <button
                    onClick={() => setActiveTab('users')}
                    className={`pb-4 px-2 font-bold text-sm transition-all border-b-2 ${activeTab === 'users' ? 'border-pink-500 text-pink-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                >
                    User Management
                </button>
                <button
                    onClick={() => setActiveTab('fields')}
                    className={`pb-4 px-2 font-bold text-sm transition-all border-b-2 ${activeTab === 'fields' ? 'border-pink-500 text-pink-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                >
                    Dynamic Form Builder
                </button>
                <button
                    onClick={() => setActiveTab('permissions')}
                    className={`pb-4 px-2 font-bold text-sm transition-all border-b-2 ${activeTab === 'permissions' ? 'border-pink-500 text-pink-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                >
                    Role Permissions
                </button>
                <button
                    onClick={() => setActiveTab('integrations')}
                    className={`pb-4 px-2 font-bold text-sm transition-all border-b-2 ${activeTab === 'integrations' ? 'border-pink-500 text-pink-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                >
                    Integrations
                </button>
            </div>

            {/* User Tab Content */}
            {activeTab === 'users' && (
                <div className="space-y-6 animate-fadeIn">
                    <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <h2 className="text-xl font-bold text-slate-800">System Users</h2>
                        <button
                            onClick={openCreateUser}
                            className="px-5 py-2.5 bg-pink-600 hover:bg-pink-700 rounded-xl text-white font-bold shadow-md transition-all hover:shadow-lg transform hover:-translate-y-0.5"
                        >
                            + Add User
                        </button>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="p-4 font-bold text-slate-500 uppercase text-xs">Username</th>
                                    <th className="p-4 font-bold text-slate-500 uppercase text-xs">Role</th>
                                    <th className="p-4 font-bold text-slate-500 uppercase text-xs">Email</th>
                                    <th className="p-4 font-bold text-slate-500 uppercase text-xs text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {users?.map(user => (
                                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-4 font-bold text-slate-900">{user.username}</td>
                                        <td className="p-4">
                                            <span className={`px-2.5 py-1 rounded-lg text-xs font-extrabold tracking-wide 
                                                ${user.role === 'ADMIN' ? 'bg-red-100 text-red-600' :
                                                    user.role === 'MENTOR' ? 'bg-green-100 text-green-600' :
                                                        'bg-blue-100 text-blue-600'}`}>
                                                {user.role}
                                            </span>
                                        </td>
                                        <td className="p-4 text-slate-600 font-medium">{user.email}</td>
                                        <td className="p-4 text-right space-x-3">
                                            <button
                                                onClick={() => openEditUser(user)}
                                                className="text-indigo-600 hover:text-indigo-800 font-medium"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDeleteUser(user.id)}
                                                className="text-red-500 hover:text-red-700 font-medium"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Fields Tab Content */}
            {activeTab === 'fields' && (
                <div className="space-y-6 animate-fadeIn">
                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                        <h2 className="text-xl font-bold text-slate-800 mb-6">Form Configuration</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Select Program</label>
                                <select
                                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:ring-2 focus:ring-pink-100 focus:border-pink-500 outline-none transition-all font-medium"
                                    value={selectedProgram}
                                    onChange={e => setSelectedProgram(e.target.value)}
                                >
                                    <option value="">-- Select Program --</option>
                                    {programs?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Select Sub-Program</label>
                                <div className="flex gap-2">
                                    <select
                                        className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:ring-2 focus:ring-pink-100 focus:border-pink-500 outline-none transition-all font-medium"
                                        value={selectedSubProgram}
                                        onChange={e => {
                                            setSelectedSubProgram(e.target.value);
                                            setSelectedCourse('');
                                        }}
                                    >
                                        <option value="">-- Select Sub-Program --</option>
                                        {subPrograms?.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                                    </select>
                                    <button
                                        onClick={() => setSubProgramModalOpen(true)}
                                        className="px-4 bg-pink-100 text-pink-700 rounded-xl font-bold hover:bg-pink-200 transition"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>

                            {selectedSubProgram && (
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Select Course</label>
                                    <div className="flex gap-2">
                                        <select
                                            className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:ring-2 focus:ring-pink-100 focus:border-pink-500 outline-none transition-all font-medium"
                                            value={selectedCourse}
                                            onChange={e => setSelectedCourse(e.target.value)}
                                        >
                                            <option value="">-- Select Course --</option>
                                            {courses?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                        <button
                                            onClick={() => setCourseModalOpen(true)}
                                            className="px-4 bg-green-100 text-green-700 rounded-xl font-bold hover:bg-green-200 transition"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {courseModalOpen && (
                        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                            <div className="bg-white rounded-2xl p-8 w-full max-w-md border border-slate-200 shadow-2xl transform transition-all scale-100">
                                <h2 className="text-2xl font-bold mb-6 text-slate-900">Add New Course</h2>
                                <form onSubmit={handleCreateCourse} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Course Name</label>
                                        <input
                                            className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium"
                                            value={newCourse.name}
                                            onChange={e => setNewCourse({ ...newCourse, name: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Fee Amount</label>
                                        <input
                                            className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium"
                                            type="number"
                                            value={newCourse.fee_amount}
                                            onChange={e => setNewCourse({ ...newCourse, fee_amount: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="flex gap-4 pt-4">
                                        <button type="button" onClick={() => setCourseModalOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition">Cancel</button>
                                        <button type="submit" className="flex-1 py-3 bg-indigo-600 rounded-xl hover:bg-indigo-700 text-white font-bold transition shadow-md">Create Course</button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    {(selectedProgram || selectedSubProgram) && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center px-1">
                                <h3 className="text-lg font-bold text-slate-800">Defined Fields</h3>
                                <button
                                    onClick={() => setFieldModalOpen(true)}
                                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-white text-sm font-bold shadow-md transition-all"
                                >
                                    + Add New Field
                                </button>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                {fields?.map(field => (
                                    <div key={field.id} className="flex justify-between items-center p-5 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
                                        <div>
                                            <span className="font-bold text-slate-900 text-lg">{field.label}</span>
                                            <span className="ml-3 text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded uppercase tracking-wide">{field.field_type}</span>
                                            {field.is_required && <span className="ml-2 text-xs font-bold text-red-500">* Required</span>}
                                            <div className="text-sm text-slate-400 mt-1 font-medium">Order: {field.order}</div>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteField(field.id)}
                                            className="text-red-500 hover:text-red-700 text-sm font-bold bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Permissions Tab Content */}
            {activeTab === 'permissions' && (
                <div className="space-y-6 animate-fadeIn">
                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                        <label className="block text-sm mb-4 text-slate-500 font-bold uppercase tracking-wider">Configure Permissions for Role:</label>
                        <div className="flex gap-3 flex-wrap">
                            {['ADMIN', 'SALES', 'MENTOR', 'ACADEMIC', 'STUDENT'].map(role => (
                                <button
                                    key={role}
                                    onClick={() => setSelectedRoleForPerms(role)}
                                    className={`px-5 py-2 rounded-full text-xs font-bold transition-all shadow-sm ${selectedRoleForPerms === role ? 'bg-orange-500 text-white shadow-orange-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}
                                >
                                    {role}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-widest font-bold border-b border-slate-200">
                                <tr>
                                    <th className="p-5">Module / Section</th>
                                    <th className="p-5 text-center">View</th>
                                    <th className="p-5 text-center">Add</th>
                                    <th className="p-5 text-center">Edit</th>
                                    <th className="p-5 text-center">Delete</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {modules?.map(mod => {
                                    const p = Array.isArray(rolePermissions) ? rolePermissions.find(x => x.module === mod.id) || {} : {};
                                    return (
                                        <tr key={mod.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-5">
                                                <div className="font-bold text-slate-800 text-lg">{mod.name}</div>
                                                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mt-1">{mod.id}</div>
                                            </td>
                                            {['can_view', 'can_add', 'can_edit', 'can_delete'].map(key => (
                                                <td key={key} className="p-5 text-center">
                                                    <button
                                                        onClick={() => handleTogglePermission(mod.id, key, p[key] || false)}
                                                        className={`w-14 h-8 rounded-full transition-all relative shadow-inner ${p[key] ? 'bg-green-500' : 'bg-slate-200'}`}
                                                    >
                                                        <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all transform ${p[key] ? 'translate-x-7' : 'translate-x-1'}`}></div>
                                                    </button>
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Integrations Tab */}
            {activeTab === 'integrations' && (
                <div className="space-y-6 animate-fadeIn">
                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                        <h2 className="text-xl font-bold text-slate-800 mb-6">Wise LMS Integration</h2>

                        <div className="space-y-4">
                            <p className="text-slate-600">
                                Sync all students from the configured Wise LMS account. This process will:
                            </p>
                            <ul className="list-disc pl-5 text-sm text-slate-500 space-y-2">
                                <li>Scan all students in Wise (this may take time depending on the count).</li>
                                <li>Match students by their <b>mobile number</b> (last 10 digits).</li>
                                <li><b>Link</b> existing CRM students to their Wise profiles if not already linked.</li>
                                <li><b>Create</b> new student profiles in CRM for any Wise student not found here (marked as 'Wise Import' program).</li>
                            </ul>

                            <div className="pt-6">
                                <button
                                    onClick={handleSyncWise}
                                    disabled={isSyncing}
                                    className={`px-8 py-4 rounded-xl font-bold text-white shadow-lg transition-all 
                                        ${isSyncing ? 'bg-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-200 transform hover:-translate-y-1'}`}
                                >
                                    {isSyncing ? 'Syncing in Progress...' : 'Start Full Sync'}
                                </button>
                            </div>

                            {syncStatus && (
                                <div className={`mt-6 p-4 rounded-xl border font-bold text-sm
                                    ${syncStatus.includes('Failed') ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-700 border-green-100'}
                                `}>
                                    {syncStatus}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Create User Modal */}
            {userModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-white rounded-2xl p-8 w-full max-w-md border border-slate-200 shadow-2xl transform transition-all scale-100">
                        <h2 className="text-2xl font-bold mb-6 text-slate-900">
                            {userModalMode === 'create' ? 'Add System User' : 'Edit System User'}
                        </h2>
                        <form onSubmit={handleCreateUser} className="space-y-4">
                            <input
                                className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-pink-100 focus:border-pink-500 outline-none transition-all font-medium"
                                placeholder="Username"
                                value={userModalMode === 'create' ? newUser.username : editUser.username}
                                onChange={e => userModalMode === 'create' ? setNewUser({ ...newUser, username: e.target.value }) : setEditUser({ ...editUser, username: e.target.value })}
                                required
                            />
                            <input
                                className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-pink-100 focus:border-pink-500 outline-none transition-all font-medium"
                                placeholder="Email"
                                type="email"
                                value={userModalMode === 'create' ? newUser.email : editUser.email}
                                onChange={e => userModalMode === 'create' ? setNewUser({ ...newUser, email: e.target.value }) : setEditUser({ ...editUser, email: e.target.value })}
                                required
                            />
                            {userModalMode === 'create' && (
                                <input
                                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-pink-100 focus:border-pink-500 outline-none transition-all font-medium"
                                    placeholder="Password"
                                    type="password"
                                    value={newUser.password}
                                    onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                    required
                                />
                            )}
                            <select
                                className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-pink-100 focus:border-pink-500 outline-none transition-all font-medium"
                                value={userModalMode === 'create' ? newUser.role : editUser.role}
                                onChange={e => userModalMode === 'create' ? setNewUser({ ...newUser, role: e.target.value }) : setEditUser({ ...editUser, role: e.target.value })}
                            >
                                <option value="SALES">Sales User</option>
                                <option value="MENTOR">Mentor</option>
                                <option value="ACADEMIC">Academic User</option>
                                <option value="STUDENT">Student</option>
                                <option value="ADMIN">Admin</option>
                            </select>
                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={() => setUserModalOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition">Cancel</button>
                                <button type="submit" className="flex-1 py-3 bg-pink-600 rounded-xl hover:bg-pink-700 text-white font-bold transition shadow-md">
                                    {userModalMode === 'create' ? 'Create User' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {
                fieldModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                        <div className="bg-white rounded-2xl p-8 w-full max-w-md border border-slate-200 shadow-2xl transform transition-all scale-100">
                            <h2 className="text-2xl font-bold mb-6 text-slate-900">Add Custom Field</h2>
                            <form onSubmit={handleCreateField} className="space-y-5">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Field Label</label>
                                    <input className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium" value={newField.label} onChange={e => setNewField({ ...newField, label: e.target.value })} required />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Type</label>
                                    <select className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium" value={newField.field_type} onChange={e => setNewField({ ...newField, field_type: e.target.value })}>
                                        <option value="text">Text</option>
                                        <option value="number">Number</option>
                                        <option value="date">Date</option>
                                        <option value="dropdown">Dropdown</option>
                                        <option value="file">File Upload</option>
                                    </select>
                                </div>
                                {newField.field_type === 'dropdown' && (
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Options (comma separated)</label>
                                        <input className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium" placeholder="Option 1, Option 2" value={newField.options} onChange={e => setNewField({ ...newField, options: e.target.value })} />
                                    </div>
                                )}
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Order</label>
                                        <input type="number" className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium" value={newField.order} onChange={e => setNewField({ ...newField, order: parseInt(e.target.value) })} />
                                    </div>
                                    <div className="flex items-center pt-6">
                                        <input type="checkbox" className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300 mr-3" checked={newField.is_required} onChange={e => setNewField({ ...newField, is_required: e.target.checked })} />
                                        <label className="text-sm font-bold text-slate-700">Is Required</label>
                                    </div>
                                </div>
                                <div className="flex gap-4 pt-4">
                                    <button type="button" onClick={() => setFieldModalOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition">Cancel</button>
                                    <button type="submit" className="flex-1 py-3 bg-indigo-600 rounded-xl hover:bg-indigo-700 text-white font-bold transition shadow-md">Add Field</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
            {
                subProgramModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                        <div className="bg-white rounded-2xl p-8 w-full max-w-md border border-slate-200 shadow-2xl transform transition-all scale-100">
                            <h2 className="text-2xl font-bold mb-6 text-slate-900">Add New Sub-Program</h2>
                            <form onSubmit={handleCreateSubProgram} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Sub-Program Name</label>
                                    <input
                                        className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium"
                                        value={newSubProgram}
                                        onChange={e => setNewSubProgram(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="flex gap-4 pt-4">
                                    <button type="button" onClick={() => setSubProgramModalOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition">Cancel</button>
                                    <button type="submit" className="flex-1 py-3 bg-indigo-600 rounded-xl hover:bg-indigo-700 text-white font-bold transition shadow-md">Create Sub-Program</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default AdminModule;
