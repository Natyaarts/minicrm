import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { 
    FolderClosed, 
    UserMinus, 
    Upload, 
    Download, 
    Trash2, 
    Plus,
    CheckCircle2,
    AlertCircle,
    ChevronRight,
    Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

const EmployeeLifecycleModule = () => {
    const { user: authUser } = useAuth();
    const [activeTab, setActiveTab] = useState('documents');
    
    // Document Vault State
    const [employees, setEmployees] = useState([]);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [documents, setDocuments] = useState([]);
    const [docUploadModal, setDocUploadModal] = useState(false);
    const [newDoc, setNewDoc] = useState({ document_type: '', file: null });

    // Offboarding State
    const [offboardings, setOffboardings] = useState([]);
    const [offboardingModal, setOffboardingModal] = useState(false);
    const [newOffboarding, setNewOffboarding] = useState({
        employee: '',
        resignation_date: '',
        last_working_day: '',
        reason: ''
    });

    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            const promises = [
                api.get('hrms/documents/'),
                api.get('hrms/offboarding/')
            ];
            
            // Only admins need the full employee list
            if (authUser?.role === 'SUPER_ADMIN' || authUser?.role === 'ADMIN') {
                promises.push(api.get('hrms/employees/'));
            }

            const results = await Promise.all(promises);
            setDocuments(results[0].data.results || results[0].data);
            setOffboardings(results[1].data.results || results[1].data);
            
            if (results[2]) {
                setEmployees(results[2].data.results || results[2].data);
            } else {
                // For regular employees, set themselves as the only employee in the list
                setEmployees([{
                    id: authUser?.hrms_profile_id || authUser?.id,
                    user_name: authUser?.username || authUser?.first_name,
                    designation_name: authUser?.role
                }]);
                // Auto-select themselves
                setSelectedEmployee({
                    id: authUser?.hrms_profile_id || authUser?.id,
                    user_name: authUser?.username || authUser?.first_name
                });
            }
        } catch (error) {
            console.error("Error fetching lifecycle data", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleUploadDoc = async (e) => {
        e.preventDefault();
        if (!newDoc.file || !newDoc.document_type || !selectedEmployee) return;

        const formData = new FormData();
        formData.append('employee', selectedEmployee.id);
        formData.append('document_type', newDoc.document_type);
        formData.append('file', newDoc.file);

        try {
            await api.post('hrms/documents/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setDocUploadModal(false);
            setNewDoc({ document_type: '', file: null });
            fetchData();
        } catch (error) {
            alert("Failed to upload document.");
        }
    };

    const handleDeleteDoc = async (id) => {
        if (!window.confirm("Delete this document?")) return;
        try {
            await api.delete(`hrms/documents/${id}/`);
            fetchData();
        } catch (error) {
            alert("Failed to delete document.");
        }
    };

    const handleInitiateOffboarding = async (e) => {
        e.preventDefault();
        try {
            await api.post('hrms/offboarding/', newOffboarding);
            setOffboardingModal(false);
            setNewOffboarding({ employee: '', resignation_date: '', last_working_day: '', reason: '' });
            fetchData();
        } catch (error) {
            alert("Failed to initiate offboarding. Does this employee already have a pending offboarding?");
        }
    };

    const handleUpdateOffboarding = async (id, updates) => {
        try {
            await api.patch(`hrms/offboarding/${id}/`, updates);
            fetchData();
        } catch (error) {
            alert("Failed to update offboarding.");
        }
    };

    const getStatusBadge = (status) => {
        switch(status) {
            case 'COMPLETED': return <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold uppercase tracking-widest">Completed</span>;
            case 'IN_PROGRESS': return <span className="px-2.5 py-1 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-bold uppercase tracking-widest">In Progress</span>;
            case 'PENDING': return <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-widest">Pending</span>;
            default: return null;
        }
    };

    const renderDocumentVault = () => {
        const isAdmin = authUser?.role === 'SUPER_ADMIN' || authUser?.role === 'ADMIN';
        return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {isAdmin && (
            <div className="md:col-span-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-[600px]">
                <div className="p-4 border-b border-slate-200 bg-slate-50">
                    <h3 className="font-bold text-slate-800 text-sm">Select Employee</h3>
                </div>
                <div className="overflow-y-auto flex-1 p-2 space-y-1">
                    {employees.map(emp => (
                        <button
                            key={emp.id}
                            onClick={() => setSelectedEmployee(emp)}
                            className={`w-full text-left p-3 rounded-lg flex items-center gap-3 transition-colors ${selectedEmployee?.id === emp.id ? 'bg-indigo-50 border border-indigo-100' : 'hover:bg-slate-50 border border-transparent'}`}
                        >
                            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0">
                                {emp.user_name?.[0]}
                            </div>
                            <div className="flex-1 truncate">
                                <p className={`text-sm font-semibold truncate ${selectedEmployee?.id === emp.id ? 'text-indigo-900' : 'text-slate-800'}`}>{emp.user_name}</p>
                                <p className="text-[10px] font-medium text-slate-500 uppercase">{emp.designation_name}</p>
                            </div>
                            <ChevronRight size={16} className={selectedEmployee?.id === emp.id ? 'text-indigo-400' : 'text-slate-300'} />
                        </button>
                    ))}
                </div>
            </div>
            )}

            <div className={`${isAdmin ? 'md:col-span-2' : 'md:col-span-3'} bg-white border border-slate-200 rounded-xl shadow-sm h-[600px] flex flex-col`}>
                {selectedEmployee ? (
                    <>
                        <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800">{selectedEmployee.user_name}'s Vault</h3>
                                <p className="text-xs text-slate-500 mt-1">Manage documents securely.</p>
                            </div>
                            <button onClick={() => setDocUploadModal(true)} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-900 transition-colors">
                                <Upload size={16} /> Upload Doc
                            </button>
                        </div>
                        <div className="p-6 flex-1 overflow-y-auto">
                            {documents.filter(d => d.employee === selectedEmployee.id).length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                    <FolderClosed size={48} className="mb-4 opacity-50" />
                                    <p className="text-sm font-medium">No documents uploaded yet.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {documents.filter(d => d.employee === selectedEmployee.id).map(doc => (
                                        <div key={doc.id} className="p-4 border border-slate-200 rounded-xl hover:shadow-md transition-shadow group flex items-start justify-between">
                                            <div className="flex items-start gap-3">
                                                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                                                    <FolderClosed size={20} />
                                                </div>
                                                <div>
                                                    <h4 className="font-semibold text-slate-800 text-sm mb-1">{doc.document_type}</h4>
                                                    <p className="text-[10px] font-medium text-slate-500">Uploaded: {new Date(doc.uploaded_at).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <a href={doc.file} target="_blank" rel="noopener noreferrer" className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md">
                                                    <Download size={16} />
                                                </a>
                                                <button onClick={() => handleDeleteDoc(doc.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                        <FolderClosed size={48} className="mb-4 opacity-50" />
                        <p className="text-sm font-medium">Select an employee to view their vault.</p>
                    </div>
                )}
            </div>
        </div>
        );
    };

    const renderOffboarding = () => (
        <div className="space-y-6">
            <div className="flex justify-end">
                <button onClick={() => setOffboardingModal(true)} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-900 transition-colors">
                    <UserMinus size={16} /> Initiate Offboarding
                </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {['PENDING', 'IN_PROGRESS', 'COMPLETED'].map(status => (
                    <div key={status} className="bg-slate-50/50 rounded-xl border border-slate-200 p-4 min-h-[500px]">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-slate-700 text-sm">{status.replace('_', ' ')}</h3>
                            <span className="bg-white px-2 py-0.5 rounded text-xs font-bold text-slate-500 shadow-sm border border-slate-200">
                                {offboardings.filter(o => o.status === status).length}
                            </span>
                        </div>
                        <div className="space-y-3">
                            {offboardings.filter(o => o.status === status).map(off => (
                                <motion.div layout key={off.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:shadow-md transition-shadow">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h4 className="font-bold text-slate-800 text-sm">{employees.find(e => e.id === off.employee)?.user_name || 'Employee'}</h4>
                                            <p className="text-[10px] font-semibold text-slate-500 uppercase">LWD: {new Date(off.last_working_day).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-600 line-clamp-2 mb-4">Reason: {off.reason}</p>
                                    
                                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                                        <button 
                                            onClick={() => handleUpdateOffboarding(off.id, { assets_returned: !off.assets_returned })}
                                            className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded transition-colors ${off.assets_returned ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                                        >
                                            <CheckCircle2 size={12} /> {off.assets_returned ? 'Assets Returned' : 'Recover Assets'}
                                        </button>
                                        
                                        {status !== 'COMPLETED' && (
                                            <select 
                                                value={off.status}
                                                onChange={(e) => handleUpdateOffboarding(off.id, { status: e.target.value })}
                                                className="text-xs font-semibold bg-transparent text-indigo-600 outline-none cursor-pointer"
                                            >
                                                <option value="PENDING">Pending</option>
                                                <option value="IN_PROGRESS">In Progress</option>
                                                <option value="COMPLETED">Completed</option>
                                            </select>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="p-8 max-w-7xl mx-auto font-sans animate-fadeIn">
            <div className="flex items-center gap-3 mb-8 mt-2">
                <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-indigo-500/20 text-white">
                    <FolderClosed size={24} />
                </div>
                <div>
                    <h2 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600">Employee Lifecycle</h2>
                    <p className="text-slate-500 text-sm font-medium">Manage documents, compliance, and offboarding.</p>
                </div>
            </div>

            <div className="flex gap-2 mb-6 bg-slate-100 p-1 rounded-lg w-fit border border-slate-200">
                {[
                    { id: 'documents', label: 'Document Vault', icon: FolderClosed },
                    { id: 'offboarding', label: 'Offboarding Portal', icon: UserMinus }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-bold transition-all ${
                            activeTab === tab.id ? 'bg-white text-indigo-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'documents' ? renderDocumentVault() : renderOffboarding()}

            {/* Modals */}
            <AnimatePresence>
                {docUploadModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setDocUploadModal(false)} />
                        <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} className="bg-white rounded-xl p-6 w-full max-w-md relative z-10 shadow-xl border border-slate-200">
                            <h3 className="text-xl font-bold text-slate-800 mb-4">Upload Document</h3>
                            <form onSubmit={handleUploadDoc} className="space-y-4">
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Document Type</label>
                                    <input required type="text" placeholder="e.g. Resume, ID Proof, Contract" value={newDoc.document_type} onChange={e => setNewDoc({...newDoc, document_type: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">File</label>
                                    <input required type="file" onChange={e => setNewDoc({...newDoc, file: e.target.files[0]})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none" />
                                </div>
                                <div className="flex gap-2 mt-6">
                                    <button type="button" onClick={() => setDocUploadModal(false)} className="w-1/2 py-2 border border-slate-200 text-slate-600 rounded-lg font-semibold hover:bg-slate-50 text-sm">Cancel</button>
                                    <button type="submit" className="w-1/2 py-2 bg-slate-800 text-white rounded-lg font-semibold hover:bg-slate-900 shadow-sm text-sm">Upload</button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
                
                {offboardingModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setOffboardingModal(false)} />
                        <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} className="bg-white rounded-xl p-6 w-full max-w-md relative z-10 shadow-xl border border-slate-200">
                            <h3 className="text-xl font-bold text-slate-800 mb-4">Initiate Offboarding</h3>
                            <form onSubmit={handleInitiateOffboarding} className="space-y-4">
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Employee</label>
                                    <select required value={newOffboarding.employee} onChange={e => setNewOffboarding({...newOffboarding, employee: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400">
                                        <option value="">Select Employee...</option>
                                        {employees.map(e => <option key={e.id} value={e.id}>{e.user_name}</option>)}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Resignation Date</label>
                                        <input required type="date" value={newOffboarding.resignation_date} onChange={e => setNewOffboarding({...newOffboarding, resignation_date: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Last Working Day</label>
                                        <input required type="date" value={newOffboarding.last_working_day} onChange={e => setNewOffboarding({...newOffboarding, last_working_day: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Reason</label>
                                    <textarea required rows={3} value={newOffboarding.reason} onChange={e => setNewOffboarding({...newOffboarding, reason: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400" />
                                </div>
                                <div className="flex gap-2 mt-6">
                                    <button type="button" onClick={() => setOffboardingModal(false)} className="w-1/2 py-2 border border-slate-200 text-slate-600 rounded-lg font-semibold hover:bg-slate-50 text-sm">Cancel</button>
                                    <button type="submit" className="w-1/2 py-2 bg-slate-800 text-white rounded-lg font-semibold hover:bg-slate-900 shadow-sm text-sm">Initiate</button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default EmployeeLifecycleModule;
