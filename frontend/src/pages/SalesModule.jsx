import React, { useState, useEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, Search, FileText, User, Trash2, Edit2, RotateCcw, Trash, X, UserCircle } from 'lucide-react';
import { copyToClipboard } from '../utils/clipboard';
import { compressImage } from '../utils/fileCompressor';
import KanbanBoard from '../components/KanbanBoard';
import CRMDashboard from '../components/CRMDashboard';
import BDEReport from '../components/BDEReport';
import CRMTasks from '../components/CRMTasks';
import CRMCampaigns from '../components/CRMCampaigns';

const SalesModule = () => {
    const { user: authUser } = useAuth();
    // URL Params
    const [searchParams, setSearchParams] = useSearchParams();
    const location = useLocation();
    const isPublicView = location.pathname === '/apply';

    // Stage Management
    const [programs, setPrograms] = useState([]);
    const [subPrograms, setSubPrograms] = useState([]);
    const [courses, setCourses] = useState([]);
    const [dynamicFields, setDynamicFields] = useState([]);
    const [campaigns, setCampaigns] = useState([]);
    const [salesUsers, setSalesUsers] = useState([]);
    const [pipelineStages, setPipelineStages] = useState([]);

    const [selectedProgram, setSelectedProgram] = useState('');
    const [selectedSubProgram, setSelectedSubProgram] = useState('');
    const [selectedCourse, setSelectedCourse] = useState('');
    const [selectedStageFilter, setSelectedStageFilter] = useState('');
    const [selectedAssigneeFilter, setSelectedAssigneeFilter] = useState('');

    // Form Data
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        father_husband_name: '',
        mother_name: '',
        email: '',
        mobile: '',
        dob: '',
        gender: '',
        marital_status: '',
        campaign_id: '',
        perm_address: '',
        perm_city: '',
        perm_district: '',
        perm_state: '',
        perm_pincode: '',
        corr_address: '',
        corr_city: '',
        corr_district: '',
        corr_state: '',
        corr_pincode: '',
    });

    const [dynamicValues, setDynamicValues] = useState({});
    const [files, setFiles] = useState({});
    const [transactionData, setTransactionData] = useState({ amount: '', transaction_id: '', transaction_link: '' });

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);

    // Auth State for Bulk Upload Visibility
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [activeTab, setActiveTab] = useState('dashboard');
    const [bulkFile, setBulkFile] = useState(null);
    const [bulkResponse, setBulkResponse] = useState(null);

    useEffect(() => {
        if (location.pathname === '/crm/dashboard') setActiveTab('dashboard');
        else if (location.pathname === '/crm/pipeline') setActiveTab('kanban');
        else if (location.pathname === '/crm/leads') setActiveTab('list');
        else if (location.pathname === '/crm/tasks') setActiveTab('tasks');
        else if (location.pathname === '/crm/campaigns') setActiveTab('campaigns');
        else if (location.pathname === '/sales') setActiveTab('dashboard');
    }, [location.pathname]);

    // Student List Data
    const [studentList, setStudentList] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [toast, setToast] = useState(null);
    const [selectedStudentProfile, setSelectedStudentProfile] = useState(null);
    const [pendingPipelineStatus, setPendingPipelineStatus] = useState('');
    const [selectedLeadIds, setSelectedLeadIds] = useState([]);
    const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
    const [bulkAssignTo, setBulkAssignTo] = useState('');
    const [wiseData, setWiseData] = useState(null);
    const [loadingWise, setLoadingWise] = useState(false);

    // Activity Timeline State
    const [interactions, setInteractions] = useState([]);
    const [interactionType, setInteractionType] = useState('NOTE');
    const [interactionNotes, setInteractionNotes] = useState('');
    const [nextFollowupDate, setNextFollowupDate] = useState('');
    const [loadingInteractions, setLoadingInteractions] = useState(false);
    
    const [selectedBdeId, setSelectedBdeId] = useState(null);

    useEffect(() => {
        if (selectedStudentProfile?.id) {
            setPendingPipelineStatus(selectedStudentProfile.lead_status || 'NEW');
            fetchLiveWiseData(selectedStudentProfile.id);
            fetchInteractions(selectedStudentProfile.id);
        } else {
            setPendingPipelineStatus('');
            setWiseData(null);
            setInteractions([]);
        }
    }, [selectedStudentProfile?.id]);

    const fetchInteractions = async (studentId) => {
        setLoadingInteractions(true);
        try {
            const res = await api.get(`/crm/interactions/?student_id=${studentId}`);
            setInteractions(res.data?.results || res.data || []);
        } catch (err) {
            console.error('Failed to fetch interactions:', err);
        } finally {
            setLoadingInteractions(false);
        }
    };

    const handleStatusChange = async (newStatus) => {
        try {
            await api.patch(`students/${selectedStudentProfile.id}/`, { lead_status: newStatus });
            setSelectedStudentProfile(prev => ({ ...prev, lead_status: newStatus }));
            setToast({ title: "Success", description: "Pipeline status updated.", type: 'success' });
            setTimeout(() => setToast(null), 3000);
            fetchStudents();
        } catch (error) {
            console.error("Failed to update status", error);
            setToast({ title: "Error", description: "Failed to update status.", type: 'error' });
            setTimeout(() => setToast(null), 3000);
        }
    };

    const handleBulkAssign = async () => {
        if (!bulkAssignTo || selectedLeadIds.length === 0) return;
        try {
            await Promise.all(selectedLeadIds.map(id => 
                api.patch(`students/${id}/`, { assigned_to: bulkAssignTo })
            ));
            setToast({ title: "Success", description: `${selectedLeadIds.length} leads assigned successfully.`, type: 'success' });
            setTimeout(() => setToast(null), 3000);
            setSelectedLeadIds([]);
            setShowBulkAssignModal(false);
            setBulkAssignTo('');
            fetchStudents();
        } catch (error) {
            console.error("Failed to bulk assign leads", error);
            setToast({ title: "Error", description: "Failed to assign leads.", type: 'error' });
            setTimeout(() => setToast(null), 3000);
        }
    };

    const toggleLeadSelection = (id) => {
        setSelectedLeadIds(prev => 
            prev.includes(id) ? prev.filter(leadId => leadId !== id) : [...prev, id]
        );
    };

    const toggleAllLeads = () => {
        if (selectedLeadIds.length === studentList.length && studentList.length > 0) {
            setSelectedLeadIds([]);
        } else {
            setSelectedLeadIds(studentList.map(s => s.id));
        }
    };

    const handleLogInteraction = async () => {
        if (!interactionNotes.trim()) return;
        try {
            const payload = {
                student: selectedStudentProfile.id,
                interaction_type: interactionType,
                notes: interactionNotes
            };
            if (nextFollowupDate) {
                payload.next_followup_date = nextFollowupDate;
            }
            const res = await api.post('/crm/interactions/', payload);
            setInteractions([res.data, ...interactions]);
            setInteractionNotes('');
            setNextFollowupDate('');
            setToast({ title: "Success", description: "Activity logged.", type: 'success' });
            setTimeout(() => setToast(null), 3000);
        } catch (err) {
            console.error('Failed to log interaction:', err);
            setToast({ title: "Error", description: "Could not log activity.", type: 'error' });
            setTimeout(() => setToast(null), 3000);
        }
    };

    const fetchLiveWiseData = async (studentId) => {
        setLoadingWise(true);
        try {
            const res = await api.get(`integrations/details/?student_id=${studentId}`);
            setWiseData(res.data);
        } catch (err) {
            console.error("Failed to fetch Wise details", err);
            setWiseData(null);
        } finally {
            setLoadingWise(false);
        }
    };
    const [isTrashView, setIsTrashView] = useState(false);
    const [editingStudent, setEditingStudent] = useState(null);
    const [editFormData, setEditFormData] = useState({});
    const [editSubPrograms, setEditSubPrograms] = useState([]);
    const [editCourses, setEditCourses] = useState([]);
    const [studentPage, setStudentPage] = useState(1);
    const [studentPagination, setStudentPagination] = useState({ count: 0, next: null, previous: null });

    // Helper: Load Program Details
    const loadProgramDetails = async (progId) => {
        // We need to find the program object to know its type (Academy vs Natya)
        // Since programs state might not be populated if this is called immediately on mount, 
        // we might need to rely on the fetched data or wait.
        // However, this is mainly called from handleProgramChange where programs exist.
        // For the useEffect case, we handle it inside the effect.

        const prog = programs.find(p => p.id === parseInt(progId));
        if (prog) {
            try {
                const res = await api.get(`sub-programs/?program=${progId}`);
                setSubPrograms(res.data);

                // Fetch fields for this program context
                fetchDynamicFields('program', progId);
            } catch (err) {
                console.error(err);
            }
        }
    };

    // Initial Fetch & URL Param handling
    useEffect(() => {
        const token = localStorage.getItem('token');
        setIsAuthenticated(!!token);

        const fetchProgramsAndInit = async () => {
            try {
                const res = await api.get('programs/');
                setPrograms(res.data);
                
                try {
                    const campRes = await api.get('crm/campaigns/');
                    setCampaigns(campRes.data.results || campRes.data || []);
                } catch(e) {}
                
                try {
                    const suRes = await api.get('crm/sales-users/');
                    setSalesUsers(suRes.data || []);
                } catch(e) {}

                try {
                    const stageRes = await api.get('crm/stages/');
                    let stageData = stageRes.data.results || stageRes.data;
                    if (!Array.isArray(stageData) || stageData.length === 0) {
                        stageData = [
                            { id: 'NEW', name: 'New Lead', color: '#e2e8f0' },
                            { id: 'FOLLOW_UP', name: 'Follow-up', color: '#fef08a' },
                            { id: 'PAYMENT_PENDING', name: 'Payment Pending', color: '#fed7aa' },
                            { id: 'ENROLLED', name: 'Enrolled', color: '#bbf7d0' },
                            { id: 'DROPPED', name: 'Dropped', color: '#fecaca' },
                        ];
                    } else {
                        stageData = stageData.sort((a, b) => a.order - b.order);
                    }
                    setPipelineStages(stageData);
                } catch (e) {}

                // Check URL Param (Support both Slug and ID for backward compatibility)
                const urlProg = searchParams.get('program') || searchParams.get('p');
                const urlSubProg = searchParams.get('sp');
                const urlCourse = searchParams.get('c');

                if (urlProg) {
                    const progExists = res.data.find(p => p.slug === urlProg || p.id === parseInt(urlProg));
                    if (progExists) {
                        setSelectedProgram(progExists.id.toString());

                        // Valid program found, load its specific sub-programs
                        const subRes = await api.get(`sub-programs/?program=${progExists.id}`);
                        setSubPrograms(subRes.data);

                        let fieldsParam = `program=${progExists.id}`;
                        
                        if (urlSubProg) {
                            setSelectedSubProgram(urlSubProg);
                            fieldsParam = `sub_program=${urlSubProg}`;
                            
                            // Fetch courses for this sub-program
                            const courseRes = await api.get(`courses/?sub_program=${urlSubProg}`);
                            setCourses(courseRes.data);

                            if (urlCourse) {
                                setSelectedCourse(urlCourse);
                                fieldsParam = `course=${urlCourse}`;
                            }
                        }

                        const fieldsRes = await api.get(`forms/fields/?${fieldsParam}&field_group=INITIAL`);
                        const fieldData = Array.isArray(fieldsRes.data) ? fieldsRes.data : (fieldsRes.data?.results || []);
                        setDynamicFields(fieldData.sort((a, b) => a.order - b.order));
                    }
                }
            } catch (err) {
                console.error("Error fetching programs", err);
            }
        };
        fetchProgramsAndInit();
    }, []);

    const fetchStudents = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                is_active: (!isTrashView).toString(),
                page: studentPage.toString(),
                search: searchTerm
            });
            
            if (selectedProgram) params.append('program', selectedProgram);
            if (selectedSubProgram) params.append('sub_program', selectedSubProgram);
            if (selectedCourse) params.append('course', selectedCourse);
            if (selectedStageFilter) params.append('lead_status', selectedStageFilter);
            if (selectedAssigneeFilter) params.append('assigned_to', selectedAssigneeFilter);

            const res = await api.get(`students/?${params.toString()}`);
            const data = res.data;
            if (data.results) {
                setStudentList(data.results);
                setStudentPagination({
                    count: data.count,
                    next: data.next,
                    previous: data.previous
                });
            } else {
                setStudentList(Array.isArray(data) ? data : []);
                setStudentPagination({ count: data.length, next: null, previous: null });
            }
        } catch (err) {
            console.error("Failed to fetch students", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const token = localStorage.getItem('token');
        setIsAuthenticated(!!token);
    }, []);

    useEffect(() => {
        if (isAuthenticated) {
            const timer = setTimeout(() => {
                fetchStudents();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [activeTab, isAuthenticated, isTrashView, studentPage, searchTerm, selectedProgram, selectedSubProgram, selectedCourse, selectedStageFilter, selectedAssigneeFilter]);

    // Reset pagination on mode change
    useEffect(() => {
        setStudentPage(1);
        setSelectedLeadIds([]);
    }, [isTrashView, searchTerm, selectedProgram, selectedSubProgram, selectedCourse, selectedStageFilter, selectedAssigneeFilter]);


    // Handle Program Change UI
    const handleProgramChange = (e) => {
        const progId = e.target.value;
        setSelectedProgram(progId);
        setSelectedSubProgram('');
        setSelectedCourse('');
        setSubPrograms([]);
        setCourses([]);
        setDynamicFields([]);
        setDynamicValues({});

        // Update URL to be helpful
        setSearchParams({ program: progId });

        loadProgramDetails(progId);
    };


    // Handle SubProgram Change
    const handleSubProgramChange = async (e) => {
        const subId = e.target.value;
        setSelectedSubProgram(subId);
        setSelectedCourse('');
        setCourses([]);
        setDynamicFields([]);

        // Update URL
        const newParams = new URLSearchParams(searchParams);
        newParams.set('sp', subId);
        newParams.delete('c');
        setSearchParams(newParams);

        if (subId) {
            try {
                const res = await api.get(`courses/?sub_program=${subId}`);
                setCourses(res.data);
                fetchDynamicFields('sub_program', subId);
            } catch (err) {
                console.error(err);
            }
        } else {
            // Revert to program fields
            fetchDynamicFields('program', selectedProgram);
        }
    };

    const handleCourseChange = async (e) => {
        const courseId = e.target.value;
        setSelectedCourse(courseId);
        setDynamicFields([]);

        // Update URL
        const newParams = new URLSearchParams(searchParams);
        if (courseId) {
            newParams.set('c', courseId);
        } else {
            newParams.delete('c');
        }
        setSearchParams(newParams);

        if (courseId) {
            fetchDynamicFields('course', courseId);
        } else if (selectedSubProgram) {
            fetchDynamicFields('sub_program', selectedSubProgram);
        } else {
            fetchDynamicFields('program', selectedProgram);
        }
    };

    const fetchDynamicFields = async (param, id) => {
        try {
            const res = await api.get(`forms/fields/?${param}=${id}&field_group=INITIAL`);
            const data = Array.isArray(res.data) ? res.data : (res.data?.results || []);
            const sorted = data.sort((a, b) => a.order - b.order);
            setDynamicFields(sorted);
        } catch (err) {
            console.error(err);
        }
    };

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleDynamicChange = (e, fieldId) => {
        setDynamicValues({ ...dynamicValues, [fieldId]: e.target.value });
    };

    const handleDynamicFileChange = async (e, fieldId) => {
        const file = e.target.files[0];
        if (!file) return;

        let processedFile = file;
        if (file.type.startsWith('image/')) {
            processedFile = await compressImage(file, { maxWidth: 1024, maxHeight: 1024, quality: 0.7 });
        }

        if (processedFile.size > 10 * 1024 * 1024) {
            alert(`File "${processedFile.name}" is too large even after compression. Max limit is 10MB.`);
            e.target.value = ''; 
            return;
        }
        setFiles(prev => ({ ...prev, [fieldId]: processedFile }));
    };

    const handleTxnChange = (e) => {
        setTransactionData({ ...transactionData, [e.target.name]: e.target.value });
    };

    const handleBulkFileChange = (e) => {
        setBulkFile(e.target.files[0]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        const data = new FormData();
        data.append('program_type', selectedProgram);
        if (selectedSubProgram) data.append('sub_program', selectedSubProgram);
        if (selectedCourse) data.append('course', selectedCourse);

        // Map recognized dynamic fields to the core Student requirements
        const coreFieldsMap = {
            'first name': 'first_name',
            'full name': 'first_name',
            'name': 'first_name',
            'last name': 'last_name',
            'mobile': 'mobile',
            'mob': 'mobile',
            'phone': 'mobile',
            'contact': 'mobile',
            'whatsapp': 'mobile',
            'email': 'email',
            'dob': 'dob',
            'date of birth': 'dob',
            'gender': 'gender',
            'marital status': 'marital_status'
        };

        let foundFirstName = '';
        let foundMobile = '';

        dynamicFields.forEach(field => {
            const val = dynamicValues[field.id];
            if (val) {
                const label = field.label.toLowerCase().trim();
                const coreKey = coreFieldsMap[label] || Object.keys(coreFieldsMap).find(k => label.includes(k));

                if (coreKey && coreFieldsMap[coreKey]) {
                    data.append(coreFieldsMap[coreKey], val);
                    if (coreFieldsMap[coreKey] === 'first_name') foundFirstName = val;
                    if (coreFieldsMap[coreKey] === 'mobile') foundMobile = val;
                } else if (coreFieldsMap[label]) {
                    data.append(coreFieldsMap[label], val);
                    if (coreFieldsMap[label] === 'first_name') foundFirstName = val;
                    if (coreFieldsMap[label] === 'mobile') foundMobile = val;
                }
            }
        });

        if (!foundFirstName) data.append('first_name', 'Student');
        if (!foundMobile) data.append('mobile', '0000000000');

        data.append('dynamic_values', JSON.stringify(dynamicValues));
        data.append('is_active', 'true');
        if (formData.campaign_id) {
            data.append('campaign', formData.campaign_id);
        }
        if (formData.assigned_to) {
            data.append('assigned_to', formData.assigned_to);
        }

        // Handle dynamic files
        Object.keys(files).forEach(fieldId => {
            // Check if the fieldId corresponds to a dynamic field that is a file type
            const field = dynamicFields.find(f => f.id === parseInt(fieldId) && f.field_type === 'file');
            if (field) {
                data.append(`dynamic_file_${fieldId}`, files[fieldId]);
            }
        });

        const txnId = dynamicValues[dynamicFields.find(f => f.label === 'Transaction ID')?.id];
        const txnAmt = dynamicValues[dynamicFields.find(f => f.label === 'Amount')?.id];

        if (txnId || txnAmt) {
            data.append('transaction_details', JSON.stringify({
                transaction_id: txnId || '',
                amount: txnAmt || ''
            }));
        }

        try {
            await api.post('students/', data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setMessage({ type: 'success', text: 'Application submitted successfully! Welcome to the family.' });
            
            // Re-fetch list and clear form
            fetchStudents();
            setFormData({
                first_name: '', last_name: '', father_husband_name: '', mother_name: '',
                email: '', mobile: '', dob: '', gender: '', marital_status: '',
                perm_address: '', perm_city: '', perm_district: '', perm_state: '', perm_pincode: '',
                corr_address: '', corr_city: '', corr_district: '', corr_state: '', corr_pincode: '',
            });
            setDynamicValues({});
            setFiles({});
            setTransactionData({ amount: '', transaction_id: '', transaction_link: '' });
            setSelectedProgram('');
            setSelectedSubProgram('');
            setSelectedCourse('');
            setSubPrograms([]);
            setCourses([]);
        } catch (err) {
            console.error("Submission Error:", err);
            let errorMsg = 'Failed to submit application. Please check your inputs.';
            if (err.response?.data) {
                const data = err.response.data;
                if (typeof data === 'string') {
                    errorMsg = data;
                } else if (data.detail) {
                    errorMsg = data.detail;
                } else if (typeof data === 'object') {
                    // Extract first validation error: { "mobile": ["error message"] }
                    const firstError = Object.values(data).flat()[0];
                    if (firstError) errorMsg = firstError;
                }
            }
            setMessage({ type: 'error', text: errorMsg });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Move this application to trash?")) return;
        try {
            await api.delete(`students/${id}/`);
            setStudentList(prev => prev.filter(s => s.id !== id));
            setMessage({ type: 'success', text: 'Moved to trash' });
        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: 'Delete failed' });
        }
    };

    const handleRestore = async (id) => {
        try {
            await api.post(`students/${id}/restore/`);
            setStudentList(prev => prev.filter(s => s.id !== id));
            setMessage({ type: 'success', text: 'Application restored' });
        } catch (err) {
            console.error(err);
        }
    };

    const handlePermanentDelete = async (id) => {
        if (!window.confirm("Permanently delete this student? This cannot be undone.")) return;
        try {
            await api.post(`students/${id}/permanent_delete/`);
            setStudentList(prev => prev.filter(s => s.id !== id));
            setMessage({ type: 'success', text: 'Permanently deleted' });
        } catch (err) {
            console.error(err);
        }
    };

    const handleEditClick = async (student) => {
        setEditingStudent(student);

        // Map dynamic values list to a simple id-value object
        const dynVals = {};
        student.dynamic_values_list?.forEach(v => {
            if (v.field) dynVals[v.field] = v.value;
        });

        // Initialize form data with existing program/course IDs
        setEditFormData({
            first_name: student.first_name,
            last_name: student.last_name,
            mobile: student.mobile,
            email: student.email,
            assigned_to: student.assigned_to,
            program_type: student.program_type,
            sub_program: student.sub_program,
            course: student.course,
            dynamic_values: dynVals
        });

        // Pre-fetch cascaded options for the current student
        try {
            if (student.program_type) {
                const subRes = await api.get(`sub-programs/?program=${student.program_type}`);
                setEditSubPrograms(subRes.data);
            }
            if (student.sub_program) {
                const courseRes = await api.get(`courses/?sub_program=${student.sub_program}`);
                setEditCourses(courseRes.data);
            }
        } catch (err) {
            console.error("Failed to pre-fetch edit options", err);
        }
    };

    const handleEditProgramChange = async (e) => {
        const progId = e.target.value;
        setEditFormData(prev => ({ ...prev, program_type: progId, sub_program: '', course: '' }));
        setEditSubPrograms([]);
        setEditCourses([]);

        if (progId) {
            try {
                const res = await api.get(`sub-programs/?program=${progId}`);
                setEditSubPrograms(res.data);
            } catch (err) { console.error(err); }
        }
    };

    const handleEditSubProgramChange = async (e) => {
        const subId = e.target.value;
        setEditFormData(prev => ({ ...prev, sub_program: subId, course: '' }));
        setEditCourses([]);

        if (subId) {
            try {
                const res = await api.get(`courses/?sub_program=${subId}`);
                setEditCourses(res.data);
            } catch (err) { console.error(err); }
        }
    };

    const handleEditDynamicChange = (fieldId, value) => {
        setEditFormData(prev => ({
            ...prev,
            dynamic_values: {
                ...prev.dynamic_values,
                [fieldId]: value
            }
        }));
    };

    const handleUpdateStudent = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            // Send dynamic_values as JSON string if needed, or directly as object
            const payload = {
                ...editFormData,
                dynamic_values: JSON.stringify(editFormData.dynamic_values)
            };
            await api.patch(`students/${editingStudent.id}/`, payload);

            // Re-fetch list to get updated dynamic values
            const res = await api.get(`students/?is_active=${!isTrashView}`);
            setStudentList(res.data.results || res.data);

            setEditingStudent(null);
            setMessage({ type: 'success', text: 'Application updated' });
        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: 'Update failed' });
        } finally {
            setLoading(false);
        }
    };

    const handleBulkUpload = async (e) => {
        e.preventDefault();
        if (!bulkFile) return;

        const bulkData = new FormData();
        bulkData.append('file', bulkFile);
        if (formData.campaign_id) {
            bulkData.append('campaign_id', formData.campaign_id);
        }
        setLoading(true);
        setBulkResponse(null);

        try {
            const res = await api.post('bulk/upload-students/', bulkData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setBulkResponse(res.data);
            setMessage({ type: 'success', text: `Processed with ${res.data.success_count} successes.` });
        } catch (err) {
            console.error(err);
            const errorMsg = err.response?.data?.error || "Bulk upload failed";
            setMessage({ type: 'error', text: errorMsg });
        } finally {
            setLoading(false);
        }
    };

    // Simplified conditional rendering - basically if subprograms exist, show them.
    const hasSubPrograms = subPrograms.length > 0;
    const hasCourses = courses.length > 0;

    // Filtered Students
    const filteredStudents = studentList;

    // UI Components
    const InputField = ({ label, name, type = "text", required = false, value, onChange, className }) => (
        <div className={`flex flex-col ${className}`}>
            <label className="text-xs font-semibold text-slate-600 mb-1.5">{label} {required && <span className="text-red-500">*</span>}</label>
            <input
                type={type}
                name={name}
                value={value}
                onChange={onChange}
                required={required}
                className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 focus:border-indigo-500 outline-none text-xs text-slate-700 shadow-sm placeholder:text-slate-400"
            />
        </div>
    );

    const SelectField = ({ label, value, onChange, options, required = false, defaultText = "-- Select --" }) => (
        <div className="flex flex-col">
            <label className="text-xs font-semibold text-slate-600 mb-1.5">{label} {required && <span className="text-red-500">*</span>}</label>
            <div className="relative">
                <select
                    value={value}
                    onChange={onChange}
                    required={required}
                    className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 focus:border-indigo-500 outline-none text-xs text-slate-700 shadow-sm appearance-none"
                >
                    <option value="">{defaultText}</option>
                    {options.map(opt => (
                        <option key={opt.id || opt} value={opt.id || opt}>{opt.name || opt}</option>
                     ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen w-full bg-slate-50 py-6 px-4 sm:px-6 lg:px-8 font-sans">
            <div className="max-w-6xl mx-auto w-full">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-8"
                >
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-800 tracking-tight mb-2">
                        {activeTab === 'single' || activeTab === 'bulk' ? 'Student Enrollment' :
                         activeTab === 'kanban' || activeTab === 'list' ? 'Sales Pipeline & Leads' :
                         activeTab === 'dashboard' ? 'Sales Dashboard' :
                         activeTab === 'tasks' ? 'Tasks & Follow-ups' :
                         activeTab === 'campaigns' ? 'Marketing Campaigns' : 'Sales Management'}
                    </h1>
                    <p className="text-xs text-slate-500 max-w-xl mx-auto">
                        {activeTab === 'single' || activeTab === 'bulk' ? 'Join our community of learners and achievers. Please fill out the form below to begin your journey.' :
                         activeTab === 'campaigns' ? 'Manage your marketing sources, track budgets, and analyze lead generation.' :
                         'Manage and track your leads, interactions, and sales processes effectively.'}
                    </p>
                </motion.div>

                {/* Bulk Assign Modal */}
                <AnimatePresence>
                    {showBulkAssignModal && (
                        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
                            >
                                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                    <h3 className="font-bold text-slate-800">Bulk Assign Leads</h3>
                                    <button onClick={() => setShowBulkAssignModal(false)} className="text-slate-400 hover:text-slate-600">
                                        <X size={20} />
                                    </button>
                                </div>
                                <div className="p-6">
                                    <p className="text-xs text-slate-500 mb-4">You are assigning {selectedLeadIds.length} lead(s) to a sales representative.</p>
                                    <div className="mb-6">
                                        <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Select Assignee</label>
                                        <select
                                            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 focus:border-indigo-500 outline-none text-sm text-slate-700 shadow-sm appearance-none"
                                            value={bulkAssignTo}
                                            onChange={(e) => setBulkAssignTo(e.target.value)}
                                        >
                                            <option value="">Select a sales rep...</option>
                                            {salesUsers.map(u => (
                                                <option key={u.id} value={u.id}>{u.name || `${u.first_name} ${u.last_name}`}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex justify-end gap-3">
                                        <button 
                                            onClick={() => setShowBulkAssignModal(false)}
                                            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button 
                                            onClick={handleBulkAssign}
                                            disabled={!bulkAssignTo}
                                            className={`px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors ${bulkAssignTo ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-indigo-300 cursor-not-allowed'}`}
                                        >
                                            Assign Leads
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {toast && (
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-lg bg-slate-900 text-white shadow-md flex items-center gap-2 font-semibold text-xs whitespace-nowrap border border-slate-800 backdrop-blur-md"
                        >
                            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                                <Check size={12} />
                            </div>
                            {toast.message}
                        </motion.div>
                    )}

                    {message && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className={`mb-6 p-3 rounded-lg border text-xs ${message.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'} flex items-center justify-center`}
                        >
                            {message.text}
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-200">
                    {(activeTab === 'list' || activeTab === 'kanban') && isAuthenticated && (
                        <div className="p-4 sm:p-6 pb-4 flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 border-b border-slate-200">
                            <div className="flex items-center gap-4">
                                <h3 className="text-lg font-semibold text-slate-900">
                                    {isTrashView ? 'Trash Section' : activeTab === 'kanban' ? 'Sales Pipeline' : 'Submitted Applications'}
                                </h3>
                                <div className="hidden lg:flex items-center gap-2">
                                    <button
                                        onClick={() => setActiveTab('single')}
                                        className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition-colors"
                                    >
                                        + New Lead
                                    </button>
                                    {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.SALES?.add) && (
                                        <button
                                            onClick={() => setActiveTab('bulk')}
                                            className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-colors"
                                        >
                                            Bulk Upload
                                        </button>
                                    )}
                                    {selectedLeadIds.length > 0 && activeTab === 'list' && (
                                        <button
                                            onClick={() => setShowBulkAssignModal(true)}
                                            className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-2"
                                        >
                                            Bulk Assign ({selectedLeadIds.length})
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
                                {/* Program Logic Filters */}
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-50 p-2 sm:p-1.5 rounded-xl border border-slate-200 w-full sm:w-auto">
                                    <select 
                                        value={selectedProgram}
                                        onChange={handleProgramChange}
                                        className="bg-transparent text-xs font-semibold text-slate-700 px-2 py-1 sm:py-0.5 outline-none min-w-[120px] cursor-pointer w-full sm:w-auto"
                                    >
                                        <option value="">All Brands/Programs</option>
                                        {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                    
                                    {selectedProgram && (
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 border-t sm:border-t-0 sm:border-l border-slate-200 pt-2 sm:pt-0 sm:pl-2 w-full sm:w-auto">
                                            <select 
                                                value={selectedSubProgram}
                                                onChange={handleSubProgramChange}
                                                className="bg-transparent text-xs font-semibold text-indigo-600 px-2 py-1 sm:py-0.5 outline-none min-w-[120px] cursor-pointer w-full sm:w-auto"
                                            >
                                                <option value="">All Categories</option>
                                                {subPrograms.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                                            </select>
                                            
                                            {selectedSubProgram && (
                                                <select 
                                                    value={selectedCourse}
                                                    onChange={handleCourseChange}
                                                    className="bg-transparent text-xs font-semibold text-emerald-600 px-2 py-1 sm:py-0.5 outline-none min-w-[120px] border-t sm:border-t-0 sm:border-l border-slate-200 pt-2 sm:pt-0 sm:pl-2 cursor-pointer w-full sm:w-auto"
                                                >
                                                    <option value="">All Courses</option>
                                                    {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                </select>
                                            )}
                                        </div>
                                    )}
                                    
                                    {(selectedProgram || selectedSubProgram || selectedCourse) && (
                                        <button 
                                            onClick={() => {
                                                setSelectedProgram('');
                                                setSelectedSubProgram('');
                                                setSelectedCourse('');
                                                setSubPrograms([]);
                                                setCourses([]);
                                            }}
                                            className="p-1 text-slate-400 hover:text-rose-500 transition-colors self-end sm:self-center"
                                            title="Clear Filters"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>

                                {/* Pipeline & Assignee Filters */}
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-indigo-50/50 p-2 sm:p-1.5 rounded-xl border border-indigo-100 w-full sm:w-auto">
                                    <select 
                                        value={selectedStageFilter}
                                        onChange={(e) => setSelectedStageFilter(e.target.value)}
                                        className="bg-transparent text-xs font-semibold text-indigo-700 px-2 py-1 sm:py-0.5 outline-none min-w-[120px] cursor-pointer w-full sm:w-auto"
                                    >
                                        <option value="">All Pipeline Stages</option>
                                        {pipelineStages.map(stage => (
                                            <option key={stage.id} value={stage.id || stage.name}>
                                                {stage.name}
                                            </option>
                                        ))}
                                    </select>
                                    
                                    <div className="hidden sm:block w-px h-4 bg-indigo-200"></div>

                                    <select 
                                        value={selectedAssigneeFilter}
                                        onChange={(e) => setSelectedAssigneeFilter(e.target.value)}
                                        className="bg-transparent text-xs font-semibold text-indigo-700 px-2 py-1 sm:py-0.5 outline-none min-w-[120px] cursor-pointer w-full sm:w-auto"
                                    >
                                        <option value="">All Sales Reps</option>
                                        <option value="unassigned">Unassigned Leads</option>
                                        {salesUsers.map(u => (
                                            <option key={u.id} value={u.id}>
                                                {u.first_name} {u.last_name}
                                            </option>
                                        ))}
                                    </select>

                                    {(selectedStageFilter || selectedAssigneeFilter) && (
                                        <button 
                                            onClick={() => {
                                                setSelectedStageFilter('');
                                                setSelectedAssigneeFilter('');
                                            }}
                                            className="p-1 text-indigo-400 hover:text-rose-500 transition-colors self-end sm:self-center"
                                            title="Clear Pipeline Filters"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center gap-3 w-full sm:w-auto">
                                    <button
                                        onClick={() => setIsTrashView(!isTrashView)}
                                        className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-initial ${isTrashView ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                                    >
                                        <Trash2 size={14} />
                                        {isTrashView ? 'View Active' : 'View Trash'}
                                    </button>
                                    <div className="relative flex-1 sm:flex-initial">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                        <input
                                            type="text"
                                            placeholder="Search students..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 focus:border-indigo-500 outline-none text-xs w-full sm:w-48 md:w-56"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'list' && isAuthenticated ? (
                        <div>
                            {/* Desktop View Table (hidden on mobile) */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-left border-collapse min-w-[1000px]">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200">
                                            <th className="px-6 py-3 w-10">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedLeadIds.length === filteredStudents.length && filteredStudents.length > 0}
                                                    onChange={toggleAllLeads}
                                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                                />
                                            </th>
                                            <th className="px-6 py-3 text-xs font-semibold uppercase text-slate-500 tracking-wider">Student</th>
                                            <th className="px-6 py-3 text-xs font-semibold uppercase text-slate-500 tracking-wider">Contact</th>
                                            <th className="px-6 py-3 text-xs font-semibold uppercase text-slate-500 tracking-wider">Program</th>
                                            <th className="px-6 py-3 text-xs font-semibold uppercase text-slate-500 tracking-wider">Application Info</th>
                                            <th className="px-6 py-3 text-xs font-semibold uppercase text-slate-500 tracking-wider">Assigned To</th>
                                            <th className="px-6 py-3 text-xs font-semibold uppercase text-slate-500 tracking-wider">Amount</th>
                                            <th className="px-6 py-3 text-xs font-semibold uppercase text-slate-500 tracking-wider">Transaction ID</th>
                                            <th className="px-6 py-3 text-xs font-semibold uppercase text-slate-500 tracking-wider">Status</th>
                                            <th className="px-6 py-3 text-xs font-semibold uppercase text-slate-500 tracking-wider text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-xs divide-y divide-slate-100">
                                        {loading ? (
                                            <tr><td colSpan="8" className="px-6 py-8 text-center text-slate-400 font-medium">Loading records...</td></tr>
                                        ) : filteredStudents.length > 0 ? (
                                            filteredStudents.map((student) => (
                                                <tr key={student.id} className={`hover:bg-slate-50/50 transition-colors ${selectedLeadIds.includes(student.id) ? 'bg-indigo-50/30' : ''}`}>
                                                    <td className="px-6 py-3.5">
                                                        <input 
                                                            type="checkbox"
                                                            checked={selectedLeadIds.includes(student.id)}
                                                            onChange={() => toggleLeadSelection(student.id)}
                                                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                                        />
                                                    </td>
                                                    <td className="px-6 py-3.5">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-7 h-7 shrink-0 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-700 font-semibold text-[10px]">
                                                                {(student.first_name?.[0] || '')}{(student.last_name?.[0] || '')}
                                                            </div>
                                                            <div>
                                                                <div 
                                                                    className="font-semibold text-slate-900 hover:text-indigo-600 cursor-pointer transition-colors"
                                                                    onClick={() => setSelectedStudentProfile(student)}
                                                                >
                                                                    {student.first_name} {student.last_name}
                                                                </div>
                                                                <div className="text-[10px] text-slate-400">ID: {student.crm_student_id || student.id}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3.5">
                                                        <div className="text-slate-700 font-medium">{student.mobile}</div>
                                                        <div className="text-[10px] text-slate-400">{student.email}</div>
                                                    </td>
                                                    <td className="px-6 py-3.5">
                                                        <div className="font-semibold text-slate-800">{student.program_name}</div>
                                                        <div className="text-[10px] text-slate-500">{student.sub_program_name || student.course_name || student.lms_course_names || '-'}</div>
                                                    </td>
                                                    <td className="px-6 py-3.5">
                                                        <div className="max-w-[200px] space-y-1">
                                                            {student.dynamic_values_list?.filter(v => v.value && v.value.trim() !== '').slice(0, 3).map(val => (
                                                                <div key={val.id} className="text-[10px] leading-tight flex gap-1 truncate">
                                                                    <span className="font-semibold text-slate-400 shrink-0">{val.field_label}:</span>
                                                                    <span className="text-slate-600 truncate">{val.value}</span>
                                                                </div>
                                                            ))}
                                                            {student.dynamic_values_list?.filter(v => v.value && v.value.trim() !== '').length > 3 && (
                                                                <div className="text-[10px] text-indigo-500 font-semibold italic">
                                                                    +{student.dynamic_values_list.filter(v => v.value && v.value.trim() !== '').length - 3} more...
                                                                </div>
                                                            )}
                                                            {!student.dynamic_values_list?.filter(v => v.value && v.value.trim() !== '').length && (
                                                                <span className="text-[10px] text-slate-300 italic">No custom data</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3.5">
                                                        <div className="font-semibold text-slate-900">₹{student.total_paid || 0}</div>
                                                    </td>
                                                    <td className="px-6 py-3.5">
                                                        <div className="font-medium text-slate-800">{student.transactions_list?.[0]?.transaction_id || '-'}</div>
                                                        {student.transactions_list?.length > 1 && (
                                                            <div className="text-[10px] text-indigo-500 font-semibold mt-1">+{student.transactions_list.length - 1} more</div>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-3.5">
                                                        {student.transactions_list?.length > 0 || student.is_paid ? (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-green-50 text-green-700 text-[10px] font-medium">
                                                                Paid
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium">
                                                                Pending
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-3.5 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <button
                                                                onClick={() => setSelectedStudentProfile(student)}
                                                                className="p-1.5 bg-indigo-50 text-indigo-600 rounded-md hover:bg-indigo-100 transition-all"
                                                                title="View Profile"
                                                            >
                                                                <FileText size={14} />
                                                            </button>

                                                            {!isTrashView ? (
                                                                <>
                                                                    {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.SALES?.edit) && (
                                                                        <button
                                                                            onClick={() => handleEditClick(student)}
                                                                            className="p-1.5 bg-amber-50 text-amber-600 rounded-md hover:bg-amber-100 transition-all"
                                                                            title="Edit"
                                                                        >
                                                                            <Edit2 size={14} />
                                                                        </button>
                                                                    )}
                                                                    {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.SALES?.delete) && (
                                                                        <button
                                                                            onClick={() => handleDelete(student.id)}
                                                                            className="p-1.5 bg-rose-50 text-rose-600 rounded-md hover:bg-rose-100 transition-all"
                                                                            title="Move to Trash"
                                                                        >
                                                                            <Trash2 size={14} />
                                                                        </button>
                                                                    )}
                                                                </>
                                                            ) : (
                                                                <>
                                                                    {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.SALES?.edit) && (
                                                                        <button
                                                                            onClick={() => handleRestore(student.id)}
                                                                            className="p-1.5 bg-green-50 text-green-600 rounded-md hover:bg-green-100 transition-all"
                                                                            title="Restore"
                                                                        >
                                                                            <RotateCcw size={14} />
                                                                        </button>
                                                                    )}
                                                                    {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.SALES?.delete) && (
                                                                        <button
                                                                            onClick={() => handlePermanentDelete(student.id)}
                                                                            className="p-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-all"
                                                                            title="Delete Permanently"
                                                                        >
                                                                            <Trash size={14} />
                                                                        </button>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr><td colSpan="8" className="px-6 py-8 text-center text-slate-400 font-medium">No applications found.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Card View (shown only on small screens) */}
                            <div className="md:hidden divide-y divide-slate-100">
                                {loading ? (
                                    <div className="p-6 text-center text-slate-400 font-medium">Loading records...</div>
                                ) : filteredStudents.length > 0 ? (
                                    filteredStudents.map((student) => (
                                        <div key={student.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                                            {/* Top Header Row: Avatar, Name, Status */}
                                            <div className="flex items-start justify-between gap-3 mb-3">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-9 h-9 shrink-0 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-700 font-semibold text-xs">
                                                        {(student.first_name?.[0] || '')}{(student.last_name?.[0] || '')}
                                                    </div>
                                                    <div>
                                                        <div 
                                                            className="font-semibold text-slate-900 hover:text-indigo-600 cursor-pointer transition-colors text-sm"
                                                            onClick={() => setSelectedStudentProfile(student)}
                                                        >
                                                            {student.first_name} {student.last_name}
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 font-medium">ID: {student.crm_student_id || student.id}</div>
                                                    </div>
                                                </div>
                                                <div>
                                                    {student.transactions_list?.length > 0 || student.is_paid ? (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-[10px] font-semibold">
                                                            Paid
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold">
                                                            Pending
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Details Grid */}
                                            <div className="grid grid-cols-2 gap-3 text-xs mb-4 bg-slate-50/60 p-3 rounded-lg border border-slate-100">
                                                <div>
                                                    <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">Contact</div>
                                                    <div className="text-slate-700 font-semibold">{student.mobile}</div>
                                                    <div className="text-[10px] text-slate-500 break-all">{student.email}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">Program</div>
                                                    <div className="text-slate-800 font-semibold truncate">{student.program_name}</div>
                                                    <div className="text-[10px] text-slate-500 truncate">{student.sub_program_name || student.course_name || student.lms_course_names || '-'}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">Payment</div>
                                                    <div className="text-slate-900 font-semibold">₹{student.total_paid || 0}</div>
                                                    <div className="text-[10px] text-slate-500 truncate" title={student.transactions_list?.[0]?.transaction_id}>
                                                        Txn: {student.transactions_list?.[0]?.transaction_id || '-'}
                                                        {student.transactions_list?.length > 1 && ` (+${student.transactions_list.length - 1})`}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">Custom Fields</div>
                                                    <div className="space-y-0.5 max-w-full">
                                                        {student.dynamic_values_list?.filter(v => v.value && v.value.trim() !== '').slice(0, 2).map(val => (
                                                            <div key={val.id} className="text-[10px] leading-tight flex gap-1 truncate">
                                                                <span className="font-semibold text-slate-400 shrink-0">{val.field_label}:</span>
                                                                <span className="text-slate-600 truncate">{val.value}</span>
                                                            </div>
                                                        ))}
                                                        {student.dynamic_values_list?.filter(v => v.value && v.value.trim() !== '').length > 2 && (
                                                            <div className="text-[10px] text-indigo-500 font-semibold italic">
                                                                +{student.dynamic_values_list.filter(v => v.value && v.value.trim() !== '').length - 2} more...
                                                            </div>
                                                        )}
                                                        {!student.dynamic_values_list?.filter(v => v.value && v.value.trim() !== '').length && (
                                                            <span className="text-[10px] text-slate-400 italic">No custom data</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Action Buttons Row */}
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => setSelectedStudentProfile(student)}
                                                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-all text-xs font-semibold flex-1"
                                                >
                                                    <FileText size={14} />
                                                    Profile
                                                </button>

                                                {!isTrashView ? (
                                                    <>
                                                        {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.SALES?.edit) && (
                                                            <button
                                                                onClick={() => handleEditClick(student)}
                                                                className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-all text-xs font-semibold flex-1"
                                                            >
                                                                <Edit2 size={14} />
                                                                Edit
                                                            </button>
                                                        )}
                                                        {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.SALES?.delete) && (
                                                            <button
                                                                onClick={() => handleDelete(student.id)}
                                                                className="p-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-all"
                                                                title="Move to Trash"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.SALES?.edit) && (
                                                            <button
                                                                onClick={() => handleRestore(student.id)}
                                                                className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-all text-xs font-semibold flex-1"
                                                            >
                                                                <RotateCcw size={14} />
                                                                Restore
                                                            </button>
                                                        )}
                                                        {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.SALES?.delete) && (
                                                            <button
                                                                onClick={() => handlePermanentDelete(student.id)}
                                                                className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all"
                                                                title="Delete Permanently"
                                                            >
                                                                <Trash size={14} />
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-6 text-center text-slate-400 font-medium">No applications found.</div>
                                )}
                            </div>

                            {/* Footer / Pagination Toolbar */}
                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                    <p className="text-xs text-slate-500 font-medium">
                                        Showing <span className="text-slate-900 font-semibold">{filteredStudents.length}</span> of <span className="text-slate-900 font-semibold">{studentPagination.count}</span> applications
                                    </p>
                                </div>
                                <div className="flex gap-2 w-full sm:w-auto">
                                    <button
                                        onClick={() => setStudentPage(p => Math.max(1, p - 1))}
                                        disabled={!studentPagination.previous || loading}
                                        className="px-3.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 disabled:opacity-50 transition-colors hover:bg-slate-50 shadow-sm flex-1 sm:flex-initial"
                                    >
                                        Previous
                                    </button>
                                    <button
                                        onClick={() => setStudentPage(p => p + 1)}
                                        disabled={!studentPagination.next || loading}
                                        className="px-3.5 py-1.5 bg-indigo-600 border border-indigo-600 rounded-lg text-xs font-semibold text-white disabled:opacity-50 transition-colors hover:bg-indigo-700 shadow-sm flex-1 sm:flex-initial"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : activeTab === 'dashboard' && isAuthenticated ? (
                        <div className="bg-slate-50 min-h-[500px]">
                            <CRMDashboard 
                                onStatClick={async (type, value) => {
                                    if (type === 'stage') {
                                        setSelectedStageFilter(value);
                                        setActiveTab('list');
                                    }
                                    if (type === 'assignee') {
                                        setSelectedAssigneeFilter(value);
                                        setActiveTab('list');
                                    }
                                    if (type === 'all') {
                                        setSelectedStageFilter('');
                                        setSelectedAssigneeFilter('');
                                        setActiveTab('list');
                                    }
                                    if (type === 'single') {
                                        try {
                                            const res = await api.get(`students/${value}/`);
                                            setSelectedStudentProfile(res.data);
                                        } catch(e) {
                                            console.error("Failed to load student profile", e);
                                        }
                                    }
                                }}
                                onBdeClick={setSelectedBdeId}
                            />
                        </div>
                    ) : activeTab === 'tasks' && isAuthenticated ? (
                        <div className="bg-slate-50 min-h-[500px]">
                            <CRMTasks />
                        </div>
                    ) : activeTab === 'campaigns' && isAuthenticated ? (
                        <div className="bg-slate-50 min-h-[500px]">
                            <CRMCampaigns />
                        </div>
                    ) : activeTab === 'kanban' && isAuthenticated ? (
                        <div className="p-4 sm:p-6 bg-slate-50 min-h-[500px]">
                            <KanbanBoard 
                                program={selectedProgram}
                                subProgram={selectedSubProgram}
                                course={selectedCourse}
                                searchTerm={searchTerm}
                            />
                        </div>
                    ) : activeTab === 'bulk' && isAuthenticated ? (
                        <div className="p-6">
                            <div className="max-w-md mx-auto text-center">
                                <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                </div>
                                <h3 className="text-base font-semibold text-slate-900 mb-1">Upload Student Data</h3>
                                <p className="text-xs text-slate-500 mb-6">Upload your CSV or Excel file to process multiple student records at once.</p>

                                <form onSubmit={handleBulkUpload} className="space-y-4">
                                    <div className="relative border border-dashed border-slate-200 rounded-xl p-6 hover:border-indigo-500 transition-colors bg-slate-50/50">
                                        <input
                                            type="file"
                                            onChange={handleBulkFileChange}
                                            accept=".csv, .xlsx, .xls"
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            required
                                        />
                                        <div className="text-center">
                                            <p className="text-xs font-semibold text-slate-700">
                                                {bulkFile ? bulkFile.name : "Click to upload or drag and drop"}
                                            </p>
                                            <p className="text-[10px] text-slate-500 mt-1">XLSX, CSV up to 10MB</p>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <select
                                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
                                            value={formData.campaign_id}
                                            onChange={(e) => setFormData(prev => ({ ...prev, campaign_id: e.target.value }))}
                                        >
                                            <option value="">No Campaign (Organic/Legacy)</option>
                                            {campaigns.filter(c => c.status === 'ACTIVE').map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={loading || !bulkFile}
                                        className="w-full py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {loading ? 'Processing...' : 'Start Upload'}
                                    </button>
                                </form>

                                {bulkResponse && (
                                    <div className="mt-6 text-left bg-slate-50 rounded-lg p-4 border border-slate-200">
                                        <h4 className="text-xs font-bold text-slate-900 mb-1.5 font-sans">Results</h4>
                                        <p className="text-xs text-green-600 font-semibold">✓ {bulkResponse.success_count} records processed successfully</p>
                                        {bulkResponse.errors?.length > 0 && (
                                            <div className="mt-3">
                                                <p className="text-xs text-red-600 font-bold mb-1.5">Errors ({bulkResponse.errors.length})</p>
                                                <ul className="list-disc list-inside text-[10px] text-red-500 space-y-1 max-h-32 overflow-y-auto">
                                                    {bulkResponse.errors.map((err, i) => <li key={i}>{err}</li>)}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="p-6">
                            {/* Step 1: Program Selection */}
                            <div className="mb-6">
                                <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center">
                                    <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mr-2 text-xs font-bold">1</span>
                                    Program Selection
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                                    {(!isPublicView || !selectedProgram) ? (
                                        <SelectField
                                            label="Select Program"
                                            value={selectedProgram}
                                            onChange={handleProgramChange}
                                            options={programs}
                                            required
                                        />
                                    ) : (
                                        <div className="flex flex-col">
                                            <label className="text-xs font-semibold text-slate-600 mb-1.5">Selected Program</label>
                                            <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 font-semibold text-xs">
                                                {programs.find(p => p.id === parseInt(selectedProgram))?.name}
                                            </div>
                                        </div>
                                    )}


                                    {hasSubPrograms && (
                                        <SelectField
                                            label="Select Category / Sub-Program"
                                            value={selectedSubProgram}
                                            onChange={handleSubProgramChange}
                                            options={subPrograms}
                                            required
                                        />
                                    )}

                                    {hasCourses && (
                                        <SelectField
                                            label="Select Course/Subject"
                                            value={selectedCourse}
                                            onChange={handleCourseChange}
                                            options={courses}
                                            required
                                        />
                                    )}
                                    
                                    <div className="flex flex-col">
                                        <label className="text-xs font-semibold text-slate-600 mb-1.5">Campaign (Optional)</label>
                                        <div className="relative">
                                            <select
                                                className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 focus:border-indigo-500 outline-none text-xs text-slate-700 shadow-sm appearance-none"
                                                value={formData.campaign_id}
                                                onChange={(e) => setFormData(prev => ({ ...prev, campaign_id: e.target.value }))}
                                            >
                                                <option value="">No Campaign (Organic)</option>
                                                {campaigns.filter(c => c.status === 'ACTIVE').map(c => (
                                                    <option key={c.id} value={c.id}>{c.name}</option>
                                                ))}
                                            </select>
                                            <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400">
                                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-col">
                                        <label className="text-xs font-semibold text-slate-600 mb-1.5">Assigned To</label>
                                        <div className="relative">
                                            <select
                                                className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 focus:border-indigo-500 outline-none text-xs text-slate-700 shadow-sm appearance-none"
                                                value={formData.assigned_to || ''}
                                                onChange={(e) => setFormData(prev => ({ ...prev, assigned_to: e.target.value }))}
                                            >
                                                <option value="">Unassigned</option>
                                                {salesUsers.map(u => (
                                                    <option key={u.id} value={u.id}>{u.name}</option>
                                                ))}
                                            </select>
                                            <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400">
                                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Student Form (Fully Dynamic) */}
                            {selectedProgram && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="space-y-6"
                                >
                                    <hr className="border-slate-100" />

                                    {/* Application Form (Fully Dynamic) */}
                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center">
                                            <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mr-2 text-xs font-bold">2</span>
                                            Application Details
                                        </h3>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {dynamicFields.map(field => (
                                                <div key={field.id} className={field.field_type === 'file' ? 'md:col-span-2' : ''}>
                                                    <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
                                                        {field.label} {field.is_required && <span className="text-red-500">*</span>}
                                                    </label>
                                                    {field.field_type === 'dropdown' ? (
                                                        <div className="relative">
                                                            <select
                                                                className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 focus:border-indigo-500 outline-none text-xs text-slate-700 shadow-sm appearance-none"
                                                                value={dynamicValues[field.id] || ''}
                                                                onChange={(e) => handleDynamicChange(e, field.id)}
                                                                required={field.is_required}
                                                            >
                                                                <option value="">Select {field.label}</option>
                                                                {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                            </select>
                                                            <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400">
                                                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                                                            </div>
                                                        </div>
                                                    ) : field.field_type === 'file' ? (
                                                        <div className="p-3 border border-dashed border-slate-200 rounded-lg hover:border-indigo-400 transition-colors bg-slate-50">
                                                            <input
                                                                type="file"
                                                                onChange={(e) => handleDynamicFileChange(e, field.id)}
                                                                required={field.is_required}
                                                                className="block w-full text-xs text-slate-500 file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <input
                                                            type={field.field_type}
                                                            placeholder={`Enter ${field.label}`}
                                                            className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 focus:border-indigo-500 outline-none text-xs text-slate-700 shadow-sm placeholder:text-slate-400"
                                                            value={dynamicValues[field.id] || ''}
                                                            onChange={(e) => handleDynamicChange(e, field.id)}
                                                            required={field.is_required}
                                                        />
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>


                                    <div className="pt-4">
                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className="w-full py-2 bg-indigo-600 text-white rounded-lg font-semibold text-xs hover:bg-indigo-700 transition-all disabled:opacity-50"
                                        >
                                            {loading ? <span className="flex items-center justify-center"><svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Submission in progress...</span> : "Submit Application"}
                                        </button>
                                        <p className="text-center text-[10px] text-slate-400 mt-3">By submitting this form, you agree to our terms and conditions.</p>
                                    </div>
                                </motion.div>
                            )}
                        </form>
                    )}
                </div>
            </div>
            {/* Student Profile Modal */}
            {selectedStudentProfile && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-xl p-4 sm:p-6 border border-slate-200 w-full max-w-xl shadow-lg max-h-[90vh] overflow-y-auto custom-scrollbar"
                    >
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex items-center gap-3 text-left">
                                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-sm font-bold">
                                    {(selectedStudentProfile.first_name?.[0] || '')}{(selectedStudentProfile.last_name?.[0] || '')}
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-slate-900">{selectedStudentProfile.first_name} {selectedStudentProfile.last_name}</h2>
                                    <p className="text-xs text-slate-500 font-medium">{selectedStudentProfile.crm_student_id}</p>
                                </div>
                            </div>
                            <div className="flex gap-1.5">
                                <button
                                    onClick={() => {
                                        handleEditClick(selectedStudentProfile);
                                        setSelectedStudentProfile(null);
                                    }}
                                    className="p-1.5 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-all"
                                    title="Edit Profile"
                                >
                                    <Edit2 size={14} />
                                </button>
                                <button
                                    onClick={() => setSelectedStudentProfile(null)}
                                    className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Live Wise LMS Data */}
                            <div className="md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200 text-left">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                        Live Wise LMS Status
                                    </h3>
                                    {loadingWise ? (
                                        <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Real-time Connection</span>
                                    )}
                                </div>

                                {wiseData && !wiseData.error_message ? (
                                    <div className="space-y-4">
                                        {/* Fees */}
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Due Balance</p>
                                                <p className="font-bold text-rose-600 text-sm">₹{wiseData.fee_details?.due_fee || 0}</p>
                                            </div>
                                            <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Total Paid</p>
                                                <p className="font-bold text-emerald-600 text-sm">₹{wiseData.fee_details?.paid_fee || 0}</p>
                                            </div>
                                            <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Attendance</p>
                                                <p className="font-bold text-slate-700 text-sm">{wiseData.attendance || 0} Sessions</p>
                                            </div>
                                        </div>

                                        {/* Enrolled Courses */}
                                        <div className="text-left">
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 ml-0.5">Currently Enrolled Wise Batches</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {wiseData.enrolled_courses?.length > 0 ? (
                                                    wiseData.enrolled_courses.map(course => (
                                                        <div key={course.id} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-medium flex items-center gap-1.5">
                                                            <div className="w-1 h-1 bg-indigo-400 rounded-full" />
                                                            {course.name}
                                                        </div>
                                                    ))
                                                ) : (
                                                    <p className="text-slate-400 text-xs italic ml-0.5">No active enrollments found in Wise.</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : !loadingWise ? (
                                    <div className="text-center py-4 bg-white/50 rounded-lg border border-dashed border-slate-200">
                                        <p className="text-slate-400 text-xs font-semibold italic">No Live Wise Data for this profile yet.</p>
                                        <p className="text-[9px] text-slate-400 uppercase tracking-wider mt-0.5">Sync might be required or profile is missing LMS ID</p>
                                    </div>
                                ) : (
                                    <div className="h-16 flex items-center justify-center">
                                        <div className="w-6 h-6 border-2 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                                    </div>
                                )}
                            </div>

                            {/* Program Info */}
                            <div className="md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200 text-left">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Enrollment Details</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                                    <div>
                                        <p className="text-[10px] text-slate-500 mb-0.5">Program</p>
                                        <p className="font-semibold text-xs text-slate-800">{selectedStudentProfile.program_name}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-500 mb-0.5">Sub-Program</p>
                                        <p className="font-semibold text-xs text-slate-800">{selectedStudentProfile.sub_program_name || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-500 mb-0.5">Course</p>
                                        <p className="font-semibold text-xs text-slate-800">{selectedStudentProfile.course_name || '-'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Base Contact Info */}
                            <div className="md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200 text-left">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Contact Info</h3>
                                    <div className="flex gap-2">
                                        {selectedStudentProfile.mobile && (
                                            <a href={`tel:${selectedStudentProfile.mobile}`} title="Call" className="p-1.5 bg-white border border-slate-200 rounded-md text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-colors shadow-sm">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                            </a>
                                        )}
                                        {selectedStudentProfile.mobile && (
                                            <a href={`sms:${selectedStudentProfile.mobile}`} title="SMS" className="p-1.5 bg-white border border-slate-200 rounded-md text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-colors shadow-sm">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                                            </a>
                                        )}
                                        {selectedStudentProfile.mobile && (
                                            <a href={`https://wa.me/${selectedStudentProfile.mobile.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" title="WhatsApp" className="p-1.5 bg-white border border-slate-200 rounded-md text-slate-500 hover:text-green-500 hover:border-green-200 transition-colors shadow-sm">
                                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                                            </a>
                                        )}
                                        {selectedStudentProfile.email && (
                                            <a href={`mailto:${selectedStudentProfile.email}`} title="Email" className="p-1.5 bg-white border border-slate-200 rounded-md text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-colors shadow-sm">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                            </a>
                                        )}
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                    <div>
                                        <p className="text-[10px] text-slate-500 mb-0.5">Mobile</p>
                                        <p className="font-semibold text-xs text-slate-800">{selectedStudentProfile.mobile || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-500 mb-0.5">Email</p>
                                        <p className="font-semibold text-xs text-slate-800">{selectedStudentProfile.email || '-'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Dynamic Fields Groups */}
                            <div className="md:col-span-2 space-y-4">
                                {['INITIAL', 'ACADEMIC'].map(group => {
                                    const groupFields = selectedStudentProfile.dynamic_values_list?.filter(val => val.field_group === group);
                                    if (!groupFields || groupFields.length === 0) return null;

                                    return (
                                        <div key={group} className="text-left">
                                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                                {group === 'INITIAL' ? 'Initial Application (Sales)' : 'Academic/Post-Admission Details'}
                                            </h3>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 bg-slate-50 border border-slate-200 p-3 sm:p-4 rounded-xl">
                                                {groupFields.map((val) => (
                                                    <div key={val.id}>
                                                        <p className="text-[10px] text-slate-500 mb-0.5">{val.field_label}</p>
                                                        <p className="font-semibold text-xs text-slate-800">{val.value || '-'}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                                {!selectedStudentProfile.dynamic_values_list?.length && (
                                    <div className="text-left">
                                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Form Details</h3>
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                                            <p className="text-slate-400 text-xs italic">No custom fields filled.</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Pipeline Status */}
                            <div className="md:col-span-2 text-left bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 mt-2">
                                <h3 className="text-xs font-bold text-indigo-900 uppercase tracking-wider mb-2">Sales Pipeline Status</h3>
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                                    <select
                                        value={pendingPipelineStatus}
                                        onChange={(e) => setPendingPipelineStatus(e.target.value)}
                                        className="flex-1 text-xs font-semibold border border-indigo-200 rounded-lg p-2 bg-white outline-none text-indigo-700 shadow-sm"
                                    >
                                        {pipelineStages.map(stage => (
                                            <option key={stage.id} value={stage.id || stage.name}>
                                                {stage.name}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => handleStatusChange(pendingPipelineStatus)}
                                        disabled={pendingPipelineStatus === (selectedStudentProfile.lead_status || 'NEW')}
                                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                                            pendingPipelineStatus !== (selectedStudentProfile.lead_status || 'NEW')
                                                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                                                : 'bg-indigo-200 text-indigo-400 cursor-not-allowed'
                                        }`}
                                    >
                                        {pendingPipelineStatus !== (selectedStudentProfile.lead_status || 'NEW') ? 'Save Status' : 'Saved'}
                                    </button>
                                </div>
                            </div>

                            {/* Activity Log / Interactions */}
                            <div className="md:col-span-2 text-left bg-slate-50 border border-slate-200 rounded-xl p-4 mt-2">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Activity Timeline</h3>
                                
                                {/* Log New Activity Form */}
                                <div className="mb-4 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                    <div className="flex gap-2 mb-2">
                                        <select 
                                            value={interactionType} 
                                            onChange={(e) => setInteractionType(e.target.value)}
                                            className="text-xs border border-slate-200 rounded-md p-1.5 bg-slate-50 outline-none text-slate-700 font-medium"
                                        >
                                            <option value="NOTE">Log Note</option>
                                            <option value="CALL">Logged Call</option>
                                            <option value="WHATSAPP">WhatsApp Sent</option>
                                            <option value="EMAIL">Email Sent</option>
                                            <option value="MEETING">Meeting Had</option>
                                        </select>
                                    </div>
                                    <textarea 
                                        value={interactionNotes}
                                        onChange={(e) => setInteractionNotes(e.target.value)}
                                        placeholder={`What happened during this ${interactionType.toLowerCase()}?`}
                                        className="w-full text-xs p-2 border border-slate-200 rounded-md outline-none focus:border-indigo-400 bg-slate-50 resize-none h-16 mb-2"
                                    />
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                        <div className="flex items-center gap-2">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase">Follow-up:</label>
                                            <input 
                                                type="datetime-local" 
                                                value={nextFollowupDate}
                                                onChange={(e) => setNextFollowupDate(e.target.value)}
                                                className="text-xs p-1.5 border border-slate-200 rounded-md outline-none focus:border-indigo-400 bg-white text-slate-700"
                                            />
                                        </div>
                                        <button 
                                            onClick={handleLogInteraction}
                                            disabled={!interactionNotes.trim()}
                                            className="bg-indigo-600 text-white text-[10px] font-bold px-4 py-2 rounded-md disabled:opacity-50 hover:bg-indigo-700 transition-colors w-full sm:w-auto"
                                        >
                                            Save Activity
                                        </button>
                                    </div>
                                </div>

                                {/* Timeline History */}
                                <div className="space-y-3">
                                    {loadingInteractions ? (
                                        <p className="text-slate-400 text-xs italic">Loading history...</p>
                                    ) : interactions.length > 0 ? (
                                        interactions.map((interaction) => (
                                            <div key={interaction.id} className="flex gap-3 bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                                                <div className="mt-0.5">
                                                    {interaction.interaction_type === 'CALL' ? <span className="text-blue-500 bg-blue-50 p-1.5 rounded-full block"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg></span> :
                                                     interaction.interaction_type === 'WHATSAPP' ? <span className="text-green-500 bg-green-50 p-1.5 rounded-full block"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg></span> :
                                                     interaction.interaction_type === 'EMAIL' ? <span className="text-slate-600 bg-slate-100 p-1.5 rounded-full block"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg></span> :
                                                     <span className="text-slate-500 bg-slate-100 p-1.5 rounded-full block"><FileText size={14} /></span>
                                                    }
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex justify-between items-start mb-0.5">
                                                        <p className="text-xs font-bold text-slate-800">{interaction.interaction_type}</p>
                                                        <p className="text-[10px] text-slate-400 font-medium">
                                                            {new Date(interaction.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                                        </p>
                                                    </div>
                                                    <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{interaction.notes}</p>
                                                    {interaction.audio_recording && (
                                                        <div className="mt-2">
                                                            <audio controls className="h-8 w-full max-w-xs">
                                                                <source src={interaction.audio_recording.startsWith('http') ? interaction.audio_recording : `${api.defaults.baseURL.split('/api')[0]}${interaction.audio_recording}`} type="audio/mp4" />
                                                                Your browser does not support the audio element.
                                                            </audio>
                                                        </div>
                                                    )}
                                                    {interaction.author_name && (
                                                        <p className="text-[9px] text-slate-400 mt-1 italic">Logged by {interaction.author_name}</p>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-slate-400 text-xs italic text-center py-4">No activities logged yet.</p>
                                    )}
                                </div>
                            </div>

                            {/* Documents */}
                            <div className="md:col-span-2 text-left">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Uploaded Documents</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {selectedStudentProfile.documents_list?.length > 0 ? (
                                        selectedStudentProfile.documents_list.map((doc) => (
                                            <a
                                                key={doc.id}
                                                href={doc.file.startsWith('http') ? doc.file : `${api.defaults.baseURL.split('/api')[0]}${doc.file}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center gap-2.5 p-2 bg-slate-50 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50/50 transition-all group"
                                            >
                                                <div className="w-8 h-8 rounded bg-white flex items-center justify-center text-slate-400 group-hover:text-indigo-600 border border-slate-200 shadow-sm">
                                                    <FileText size={16} />
                                                </div>
                                                <div className="flex-1 overflow-hidden">
                                                    <p className="text-xs font-semibold text-slate-800 truncate">{doc.document_type}</p>
                                                    <p className="text-[10px] text-slate-400">Click to view</p>
                                                </div>
                                            </a>
                                        ))
                                    ) : (
                                        <p className="text-slate-400 text-xs italic">No documents uploaded.</p>
                                    )}
                                </div>
                            </div>

                            {/* Transactions */}
                            <div className="md:col-span-2 text-left">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Payment Information</h3>
                                {selectedStudentProfile.transactions_list?.length > 0 ? (
                                    <div className="bg-emerald-50/30 border border-emerald-200 p-4 rounded-xl">
                                        {selectedStudentProfile.transactions_list.map((txn) => (
                                            <div key={txn.id} className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 border-b border-emerald-100 last:border-b-0 pb-3 last:pb-0 mb-3 last:mb-0">
                                                <div>
                                                    <p className="text-[10px] text-emerald-700/80 mb-0.5">Transaction ID</p>
                                                    <p className="font-semibold text-xs text-emerald-900 truncate">{txn.transaction_id || '-'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-emerald-700/80 mb-0.5">Amount</p>
                                                    <p className="font-semibold text-xs text-emerald-900">₹{txn.amount || '-'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-emerald-700/80 mb-0.5">Date</p>
                                                    <p className="font-semibold text-xs text-emerald-900">{new Date(txn.date).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="bg-amber-50/50 border border-amber-200 p-3 rounded-lg text-center">
                                        <p className="text-amber-800 text-xs font-medium">No payment record found.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-100">
                            <button
                                onClick={() => setSelectedStudentProfile(null)}
                                className="w-full py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-all"
                            >
                                Close Profile
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Edit Student Modal */}
            {editingStudent && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-xl p-4 sm:p-6 border border-slate-200 w-full max-w-xl shadow-lg max-h-[90vh] overflow-y-auto custom-scrollbar"
                    >
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <Edit2 className="text-indigo-600" size={16} />
                                Edit Application
                            </h2>
                            <button onClick={() => setEditingStudent(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleUpdateStudent} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                                <div className="md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200 text-left">
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Program Selection</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-left">
                                        <div>
                                            <label className="text-[10px] font-semibold text-slate-600 mb-1 block">Program <span className="text-red-500">*</span></label>
                                            <div className="relative">
                                                <select
                                                    className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs outline-none focus:border-indigo-500 shadow-sm appearance-none"
                                                    value={editFormData.program_type || ''}
                                                    onChange={handleEditProgramChange}
                                                    required
                                                >
                                                    <option value="">Select Program</option>
                                                    {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                </select>
                                                <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400">
                                                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-semibold text-slate-600 mb-1 block">Sub-Program</label>
                                            <div className="relative">
                                                <select
                                                    className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs outline-none focus:border-indigo-500 shadow-sm appearance-none"
                                                    value={editFormData.sub_program || ''}
                                                    onChange={handleEditSubProgramChange}
                                                >
                                                    <option value="">Select Sub-Program</option>
                                                    {editSubPrograms.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                                                </select>
                                                <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400">
                                                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-semibold text-slate-600 mb-1 block">Course</label>
                                            <div className="relative">
                                                <select
                                                    className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs outline-none focus:border-indigo-500 shadow-sm appearance-none"
                                                    value={editFormData.course || ''}
                                                    onChange={(e) => setEditFormData(prev => ({ ...prev, course: e.target.value }))}
                                                >
                                                    <option value="">Select Course</option>
                                                    {editCourses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                </select>
                                                <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400">
                                                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-semibold text-slate-600 mb-1 block">Assigned To</label>
                                            <div className="relative">
                                                <select
                                                    className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs outline-none focus:border-indigo-500 shadow-sm appearance-none"
                                                    value={editFormData.assigned_to || ''}
                                                    onChange={(e) => setEditFormData(prev => ({ ...prev, assigned_to: e.target.value }))}
                                                >
                                                    <option value="">Unassigned</option>
                                                    {salesUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                                </select>
                                                <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400">
                                                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="md:col-span-2 border-b border-slate-100 pb-1.5 text-left">
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Core Information</h4>
                                </div>

                                <InputField
                                    label="First Name"
                                    name="first_name"
                                    value={editFormData.first_name || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, first_name: e.target.value })}
                                    required
                                    className="text-left"
                                />
                                <InputField
                                    label="Last Name"
                                    name="last_name"
                                    value={editFormData.last_name || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, last_name: e.target.value })}
                                    className="text-left"
                                />
                                <InputField
                                    label="Mobile Number"
                                    name="mobile"
                                    value={editFormData.mobile || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, mobile: e.target.value })}
                                    required
                                    className="text-left"
                                />
                                <InputField
                                    label="Email Address"
                                    name="email"
                                    value={editFormData.email || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                                    className="text-left"
                                />

                                {['INITIAL', 'ACADEMIC'].map(group => {
                                    const groupFields = dynamicFields.filter(f => f.field_group === group && !['First Name', 'Mobile Number', 'Contact Number', 'Mobile'].includes(f.label));
                                    if (groupFields.length === 0) return null;

                                    return (
                                        <React.Fragment key={group}>
                                            <div className="md:col-span-2 border-b border-slate-100 pt-3 pb-1.5 text-left">
                                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                                    {group === 'INITIAL' ? 'Initial Application Details' : 'Academic Coordinator Data Entry'}
                                                </h4>
                                            </div>
                                            {groupFields.map(field => (
                                                <div key={field.id} className={field.field_type === 'file' ? 'md:col-span-2 text-left' : 'text-left'}>
                                                    <label className="text-[10px] font-semibold text-slate-600 mb-1 block">{field.label}</label>
                                                    {field.field_type === 'dropdown' ? (
                                                        <div className="relative">
                                                            <select
                                                                className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs outline-none focus:border-indigo-500 shadow-sm appearance-none"
                                                                value={editFormData.dynamic_values?.[field.id] || ''}
                                                                onChange={(e) => handleEditDynamicChange(field.id, e.target.value)}
                                                            >
                                                                <option value="">Select {field.label}</option>
                                                                {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                            </select>
                                                            <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400">
                                                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                                                            </div>
                                                        </div>
                                                    ) : field.field_type !== 'file' ? (
                                                        <input
                                                            type={field.field_type}
                                                            className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs outline-none focus:border-indigo-500 shadow-sm"
                                                            value={editFormData.dynamic_values?.[field.id] || ''}
                                                            onChange={(e) => handleEditDynamicChange(field.id, e.target.value)}
                                                        />
                                                    ) : (
                                                        <div className="p-3 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-center">
                                                            <p className="text-[10px] text-slate-400 italic font-medium">File uploads (like {field.label}) can only be added via the application form.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </React.Fragment>
                                    );
                                })}
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setEditingStudent(null)}
                                    className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-all disabled:opacity-50"
                                >
                                    {loading ? (
                                        <div className="flex items-center justify-center gap-1.5">
                                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            <span>Saving...</span>
                                        </div>
                                    ) : 'Update Details'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
            {/* BDE Report Modal */}
            <BDEReport bdeId={selectedBdeId} onClose={() => setSelectedBdeId(null)} />

        </div>
    );
};

export default SalesModule;
