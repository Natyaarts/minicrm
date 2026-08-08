import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { motion } from 'framer-motion';
import { Plus, X, Search, BarChart, Calendar, DollarSign, Users, ExternalLink, Edit2, Trash2, Link, Upload, TrendingUp, CheckCircle, Clock, Download, ArrowUpDown, ChevronLeft, ChevronRight, Phone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

const CRMCampaigns = () => {
    const { user: authUser } = useAuth();
    
    // Tab State
    const [activeTab, setActiveTab] = useState('assigned'); 

    useEffect(() => {
        if (authUser) {
            const isAdmin = authUser.role === 'SUPER_ADMIN' || authUser.role === 'ADMIN';
            if (!isAdmin && (activeTab === 'dashboard' || activeTab === 'campaigns')) {
                setActiveTab('assigned');
            } else if (isAdmin && activeTab === 'assigned' && !activeTab) {
                setActiveTab('dashboard');
            }
        }
    }, [authUser]);

    // Data States
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Dashboard Data
    const [dashboardData, setDashboardData] = useState(null);
    const [dashboardLoading, setDashboardLoading] = useState(true);
    const [dashboardStartDate, setDashboardStartDate] = useState('');
    const [dashboardEndDate, setDashboardEndDate] = useState('');
    
    // Assigned Dashboard Data
    const [assignedStats, setAssignedStats] = useState(null);
    const [assignedStatsLoading, setAssignedStatsLoading] = useState(false);

    // Leads Data
    const [leads, setLeads] = useState([]);
    const [leadsLoading, setLeadsLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalLeadsCount, setTotalLeadsCount] = useState(0);
    const [sortOrder, setSortOrder] = useState('desc');
    const [salesUsers, setSalesUsers] = useState([]);
    const [pipelineStages, setPipelineStages] = useState({});
    const [leadsStartDate, setLeadsStartDate] = useState('');
    const [leadsEndDate, setLeadsEndDate] = useState('');
    const [selectedAssigneeFilter, setSelectedAssigneeFilter] = useState('');
    const [selectedStageFilter, setSelectedStageFilter] = useState('');
    
    // UI States for Campaigns
    const [searchTerm, setSearchTerm] = useState('');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingCampaign, setEditingCampaign] = useState(null);
    const [isWebhooksModalOpen, setIsWebhooksModalOpen] = useState(false);
    const [webhooks, setWebhooks] = useState([]);
    
    // Bulk Upload state
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [uploadFile, setUploadFile] = useState(null);
    const [uploadCampaignId, setUploadCampaignId] = useState('');
    const [uploadProgramId, setUploadProgramId] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [programs, setPrograms] = useState([]);
    
    // Edit Lead state
    const [editingLead, setEditingLead] = useState(null);
    const [leadFormData, setLeadFormData] = useState({
        first_name: '', last_name: '', email: '', mobile: '', lead_status: ''
    });
    const [isSavingLead, setIsSavingLead] = useState(false);
    
    // Form state
    const [formData, setFormData] = useState({
        name: '', platform: 'OTHER', status: 'ACTIVE', 
        budget: '', start_date: '', end_date: '', description: '', section: 'BOTH',
        // Meta Facebook Lead Ads fields
        meta_page_id: '', meta_form_id: '', meta_ad_id: '',
        meta_pixel_id: '', meta_access_token: '', meta_auto_import: false,
        auto_assign_to: []
    });

    // Bulk Assignment state
    const [selectedLeads, setSelectedLeads] = useState([]);
    const [assignSalesUserId, setAssignSalesUserId] = useState('');
    const [isAssigning, setIsAssigning] = useState(false);

    useEffect(() => {
        if (activeTab === 'dashboard') {
            fetchDashboardData();
        } else if (activeTab === 'campaigns') {
            fetchCampaigns();
            fetchWebhooks();
            fetchPrograms();
            fetchSalesUsers();
        } else if (activeTab === 'leads' || activeTab === 'assigned') {
            fetchSalesUsers();
            fetchPipelineStages();
            fetchPrograms();
        }
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 'leads' || activeTab === 'assigned') {
            fetchLeads(leadsStartDate, leadsEndDate, selectedAssigneeFilter, searchTerm, selectedStageFilter);
            fetchAssignedStats(leadsStartDate, leadsEndDate, selectedAssigneeFilter);
        }
    }, [activeTab, currentPage, leadsStartDate, leadsEndDate, selectedAssigneeFilter, searchTerm, selectedStageFilter]);

    const fetchDashboardData = async () => {
        setDashboardLoading(true);
        try {
            let url = 'crm/marketing-dashboard/';
            const params = new URLSearchParams();
            if (dashboardStartDate) params.append('start_date', dashboardStartDate);
            if (dashboardEndDate) params.append('end_date', dashboardEndDate);
            if (params.toString()) url += `?${params.toString()}`;
            
            const res = await api.get(url);
            setDashboardData(res.data);
        } catch (error) {
            console.error('Error fetching marketing dashboard data:', error);
        } finally {
            setDashboardLoading(false);
        }
    };

    const fetchAssignedStats = async (startDate, endDate, assignee) => {
        setAssignedStatsLoading(true);
        try {
            let url = 'crm/dashboard-stats/';
            const params = new URLSearchParams();
            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);
            if (assignee) params.append('assigned_to', assignee);
            if (params.toString()) url += `?${params.toString()}`;
            
            const res = await api.get(url);
            setAssignedStats(res.data);
        } catch (error) {
            console.error('Error fetching assigned dashboard stats:', error);
        } finally {
            setAssignedStatsLoading(false);
        }
    };

    const fetchCampaigns = async () => {
        setLoading(true);
        try {
            const res = await api.get('crm/campaigns/');
            setCampaigns(res.data.results || res.data || []);
        } catch (error) {
            console.error('Error fetching campaigns:', error);
            setCampaigns([]);
        } finally {
            setLoading(false);
        }
    };
    
    const fetchPrograms = async () => {
        try {
            const res = await api.get('programs/');
            setPrograms(res.data.results || res.data || []);
        } catch (error) {
            console.error('Error fetching programs:', error);
        }
    };
    
    const fetchLeads = async (startDate, endDate, assignee, search, stage) => {
        setLeadsLoading(true);
        try {
            let url = `students/?page=${currentPage}`;
            if (activeTab === 'leads') {
                url += `&campaign_only=true`;
            }
            if (stage !== 'DUPLICATE') {
                if (activeTab === 'assigned' && !assignee) {
                    url += `&assigned_to=assigned`;
                } else if (assignee) {
                    url += `&assigned_to=${assignee}`;
                }
            }
            if (startDate) url += `&start_date=${startDate}`;
            if (endDate) url += `&end_date=${endDate}`;
            if (search) url += `&search=${encodeURIComponent(search)}`;
            if (stage) {
                url += `&lead_status=${encodeURIComponent(stage)}`;
            } else {
                url += `&hide_converted=true`;
            }
            if (stage === 'DUPLICATE') {
                // Ensure hide_converted is not passed in url params
                url = url.replace('&hide_converted=true', '');
            }

            console.log('[fetchLeads] URL:', url);
            const res = await api.get(url); 
            setLeads(res.data.results || res.data || []);
            if (res.data.count !== undefined) {
                setTotalLeadsCount(res.data.count);
                setTotalPages(Math.ceil(res.data.count / 20));
            }
        } catch (error) {
            console.error('Error fetching leads:', error);
        } finally {
            setLeadsLoading(false);
        }
    };
    
    const fetchSalesUsers = async () => {
        try {
            const res = await api.get('crm/sales-users/');
            setSalesUsers(res.data || []);
        } catch (error) {
            console.error('Error fetching sales users:', error);
        }
    };

    const fetchPipelineStages = async () => {
        try {
            const res = await api.get('crm/stages/');
            const stagesData = res.data.results || res.data || [];
            const stageMap = {};
            stagesData.forEach(stage => {
                stageMap[stage.id] = stage.name;
            });
            setPipelineStages(stageMap);
        } catch(err) {
            console.error('Error fetching pipeline stages:', err);
        }
    };
    const handleDeleteLead = async (leadId) => {
        if (!window.confirm("Are you sure you want to permanently delete this lead?")) {
            return;
        }
        try {
            await api.delete(`students/${leadId}/`);
            // Refresh leads list
            fetchLeads(startDate, endDate, selectedRep, searchInput, selectedStatus);
            // Refresh dashboard data as well
            if (authUser?.role === 'SUPER_ADMIN' || authUser?.role === 'ADMIN') {
                fetchDashboardData(dashboardStartDate, dashboardEndDate);
            }
        } catch (error) {
            console.error('Error deleting lead:', error);
            alert('Failed to delete lead. Check your permissions.');
        }
    };

    const fetchWebhooks = async () => {
        try {
            const res = await api.get('crm/webhook-endpoints/');
            setWebhooks(res.data.results || res.data || []);
        } catch (error) {
            console.error('Error fetching webhooks:', error);
        }
    };

    const handleSaveCampaign = async (e) => {
        e.preventDefault();
        try {
            const payload = { ...formData };
            if (!payload.start_date) payload.start_date = null;
            if (!payload.end_date) payload.end_date = null;
            if (!payload.budget) payload.budget = 0;

            if (editingCampaign) {
                await api.put(`crm/campaigns/${editingCampaign.id}/`, payload);
            } else {
                await api.post('crm/campaigns/', payload);
            }
            
            setIsCreateModalOpen(false);
            setEditingCampaign(null);
            setFormData({
                name: '', platform: 'OTHER', status: 'ACTIVE', 
                budget: '', start_date: '', end_date: '', description: '', section: 'BOTH',
                meta_page_id: '', meta_form_id: '', meta_ad_id: '',
                meta_pixel_id: '', meta_access_token: '', meta_auto_import: false,
                auto_assign_to: []
            });
            fetchCampaigns();
        } catch (error) {
            console.error('Error saving campaign:', error);
            alert('Failed to save campaign');
        }
    };

    const handleBulkUpload = async (e) => {
        e.preventDefault();
        if (!uploadFile || !uploadCampaignId) {
            alert('Please select a campaign and a CSV file.');
            return;
        }

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', uploadFile);
        if (uploadProgramId) {
            formData.append('program_id', uploadProgramId);
        }

        try {
            const res = await api.post(`crm/campaigns/${uploadCampaignId}/bulk_upload/`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            alert(res.data.message || 'Upload successful!');
            setIsUploadModalOpen(false);
            setUploadFile(null);
            if(activeTab === 'dashboard') fetchDashboardData();
        } catch (error) {
            console.error('Error uploading CSV:', error);
            alert(error.response?.data?.error || 'Failed to upload CSV. Please try again.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleBulkAssign = async () => {
        if (selectedLeads.length === 0) return alert('Select at least one lead.');
        if (!assignSalesUserId) return alert('Select a sales user to assign to.');
        
        setIsAssigning(true);
        try {
            const res = await api.post('crm/leads/bulk_assign/', {
                lead_ids: selectedLeads,
                sales_user_id: assignSalesUserId
            });
            alert(res.data.message || 'Leads assigned successfully!');
            setSelectedLeads([]);
            fetchLeads(); // Refresh table
        } catch(error) {
            console.error('Error bulk assigning:', error);
            alert('Failed to assign leads.');
        } finally {
            setIsAssigning(false);
        }
    };

    const toggleLeadSelection = (id) => {
        setSelectedLeads(prev => 
            prev.includes(id) ? prev.filter(leadId => leadId !== id) : [...prev, id]
        );
    };
    const selectAllLeads = (e) => {
        if (e.target.checked) {
            // Only select leads that are not duplicates
            setSelectedLeads(leads.filter(l => l.lead_status !== 'DUPLICATE').map(l => l.id));
        } else {
            setSelectedLeads([]);
        }
    };

    const filteredCampaigns = campaigns.filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.platform.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    const filteredLeads = leads.filter(l => 
        (l.first_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (l.last_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (l.mobile && l.mobile.includes(searchTerm))
    );

    const sortedLeads = [...filteredLeads].sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (timeA === timeB || isNaN(timeA) || isNaN(timeB)) {
            return sortOrder === 'asc' ? a.id - b.id : b.id - a.id;
        }
        return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
    });

    const getAssigneeDisplayName = () => {
        if (selectedAssigneeFilter === 'unassigned') return 'Unassigned Leads';
        if (!selectedAssigneeFilter) return activeTab === 'assigned' ? 'All Assigned Reps' : 'All Sales Reps';
        const found = salesUsers.find(u => u.id.toString() === selectedAssigneeFilter.toString());
        if (found) {
            return found.name || (found.first_name ? `${found.first_name} ${found.last_name || ''}`.trim() : found.username || `User #${found.id}`);
        }
        return `User #${selectedAssigneeFilter}`;
    };

    const statusCounts = leads.reduce((acc, lead) => {
        const statusName = pipelineStages[lead.lead_status] || lead.lead_status || 'NEW LEAD';
        acc[statusName] = (acc[statusName] || 0) + 1;
        return acc;
    }, {});

    const handleExportCSV = () => {
        const headers = ["Lead ID", "First Name", "Last Name", "Email", "Mobile", "Status", "Date Created", "Assigned To"];
        const csvContent = [
            headers.join(","),
            ...sortedLeads.map(lead => [
                lead.crm_student_id,
                lead.first_name,
                lead.last_name,
                lead.email,
                lead.mobile,
                pipelineStages[lead.lead_status] || lead.lead_status || 'Pending',
                lead.created_at ? new Date(lead.created_at).toLocaleDateString() : '',
                lead.assigned_to_name || 'Unassigned'
            ].map(val => `"${(val || '').toString().replace(/"/g, '""')}"`).join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Leads_Export_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleEditLeadClick = (lead) => {
        setEditingLead(lead);
        setLeadFormData({
            first_name: lead.first_name || '',
            last_name: lead.last_name || '',
            email: lead.email || '',
            mobile: lead.mobile || '',
            lead_status: lead.lead_status || ''
        });
    };

    const handleSaveLead = async (e) => {
        e.preventDefault();
        setIsSavingLead(true);
        try {
            await api.patch(`students/${editingLead.id}/`, leadFormData);
            fetchLeads(); // Refresh leads
            setEditingLead(null);
        } catch (error) {
            console.error('Error saving lead:', error);
            alert('Failed to save lead details.');
        } finally {
            setIsSavingLead(false);
        }
    };

    const renderDashboard = () => {
        if (dashboardLoading) return <div className="text-center py-10">Loading Dashboard...</div>;
        if (!dashboardData) return null;

        const { summary, chart_data, sales_report } = dashboardData;

        return (
            <div className="space-y-6">
                {/* Date Filter */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-indigo-500" />
                        Dashboard Date Filter
                    </h3>
                    <div className="flex items-center gap-3">
                        <input 
                            type="date" 
                            className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500/30 outline-none"
                            value={dashboardStartDate}
                            onChange={(e) => setDashboardStartDate(e.target.value)}
                        />
                        <span className="text-slate-400">to</span>
                        <input 
                            type="date" 
                            className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500/30 outline-none"
                            value={dashboardEndDate}
                            onChange={(e) => setDashboardEndDate(e.target.value)}
                        />
                        <button 
                            onClick={fetchDashboardData}
                            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                        >
                            Apply Filter
                        </button>
                        {(dashboardStartDate || dashboardEndDate) && (
                            <button 
                                onClick={() => {
                                    setDashboardStartDate('');
                                    setDashboardEndDate('');
                                    // small timeout to allow state to clear before fetching
                                    setTimeout(() => fetchDashboardData(), 0);
                                }}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium rounded-lg transition-colors"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-500 font-medium mb-1">Total Ad Spend</p>
                            <h3 className="text-2xl font-bold text-slate-800">₹{parseFloat(summary.total_spend || 0).toLocaleString()}</h3>
                        </div>
                        <div className="w-12 h-12 bg-green-50 text-green-600 rounded-full flex items-center justify-center">
                            <DollarSign className="w-6 h-6" />
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-500 font-medium mb-1">Total Leads Generated</p>
                            <h3 className="text-2xl font-bold text-slate-800">{summary.total_leads}</h3>
                        </div>
                        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
                            <Users className="w-6 h-6" />
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-500 font-medium mb-1">Total Converted</p>
                            <h3 className="text-2xl font-bold text-slate-800">{summary.total_converted}</h3>
                        </div>
                        <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                    </div>
                </div>

                {/* Charts */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h3 className="text-lg font-bold text-slate-800 mb-6">Leads Generated (Last 30 Days)</h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chart_data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                <RechartsTooltip 
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Line type="monotone" dataKey="leads" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Sales Team Report */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-6 border-b border-slate-100">
                        <h3 className="text-lg font-bold text-slate-800">Sales Team Conversion Report</h3>
                        <p className="text-sm text-slate-500">Track individual sales performance based on assigned leads.</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                    <th className="px-6 py-4 font-semibold">Sales Representative</th>
                                    <th className="px-6 py-4 font-semibold text-center">Assigned Leads</th>
                                    <th className="px-6 py-4 font-semibold text-center">Contacted</th>
                                    <th className="px-6 py-4 font-semibold text-center">Total Talk Time</th>
                                    <th className="px-6 py-4 font-semibold text-center">Converted</th>
                                    <th className="px-6 py-4 font-semibold text-right">Conversion Rate</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {sales_report.map((rep) => (
                                    <tr key={rep.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-800">
                                            {rep.name}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center text-slate-600">
                                            {rep.assigned}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center text-slate-600">
                                            {rep.contacted}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center font-bold text-indigo-700">
                                            <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg text-xs border border-indigo-100">
                                                ⏱️ {rep.formatted_call_duration || '0s'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center font-medium text-green-600">
                                            {rep.converted}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right font-bold text-indigo-600">
                                            {rep.conversion_rate}%
                                        </td>
                                    </tr>
                                ))}
                                {sales_report.length === 0 && (
                                    <tr><td colSpan="6" className="px-6 py-8 text-center text-slate-500">No sales team data available</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    const renderCampaigns = () => {
        return (
            <div className="space-y-6">
                {/* Search & Actions */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="relative max-w-md w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                        <input
                            type="text"
                            placeholder="Search campaigns..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-sm"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => { fetchWebhooks(); setIsWebhooksModalOpen(true); }}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                        >
                            <Link className="w-4 h-4" />
                            Webhooks API
                        </button>
                        <button
                            onClick={() => setIsUploadModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-teal-700 bg-teal-50 border border-teal-100 rounded-xl hover:bg-teal-100 transition-colors"
                        >
                            <Upload className="w-4 h-4" />
                            Bulk Upload
                        </button>
                        <button
                            onClick={() => { setEditingCampaign(null); setIsCreateModalOpen(true); }}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200"
                        >
                            <Plus className="w-4 h-4" />
                            New Campaign
                        </button>
                    </div>
                </div>

                {/* Campaigns Grid */}
                {loading ? (
                    <div className="flex justify-center items-center py-20">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    </div>
                ) : filteredCampaigns.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-slate-100">
                        <BarChart className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <h3 className="text-lg font-medium text-slate-800">No campaigns found</h3>
                        <p className="text-slate-500 mt-1">Create your first marketing campaign to get started.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredCampaigns.map((campaign) => (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                key={campaign.id}
                                className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-all group"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">{campaign.platform}</span>
                                        <h3 className="text-lg font-bold text-slate-800 mt-1">{campaign.name}</h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2.5 py-1 text-[10px] font-bold rounded-md uppercase tracking-wide ${
                                            campaign.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 
                                            campaign.status === 'PAUSED' ? 'bg-amber-100 text-amber-700' : 
                                            'bg-slate-100 text-slate-700'
                                        }`}>
                                            {campaign.status}
                                        </span>
                                        {campaign.meta_auto_import && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-blue-600 text-white rounded-md" title="Meta Lead Ads Auto-Import Active">
                                                <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                                                META
                                            </span>
                                        )}
                                        <button 
                                            onClick={() => {
                                                setEditingCampaign(campaign);
                                                setFormData({
                                                    name: campaign.name, platform: campaign.platform, status: campaign.status,
                                                    budget: campaign.budget, start_date: campaign.start_date || '', end_date: campaign.end_date || '',
                                                    description: campaign.description || '', section: campaign.section || 'BOTH',
                                                    // Meta fields
                                                    meta_page_id: campaign.meta_page_id || '',
                                                    meta_form_id: campaign.meta_form_id || '',
                                                    meta_ad_id: campaign.meta_ad_id || '',
                                                    meta_pixel_id: campaign.meta_pixel_id || '',
                                                    meta_access_token: campaign.meta_access_token || '',
                                                    meta_auto_import: campaign.meta_auto_import || false,
                                                    auto_assign_to: campaign.auto_assign_to || []
                                                });
                                                setIsCreateModalOpen(true);
                                            }}
                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-slate-100 hover:border-indigo-100 shadow-2xs"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-100 mb-4">
                                    <div>
                                        <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                                            <Users className="w-3.5 h-3.5" />
                                            <span className="text-xs">Leads Generated</span>
                                        </div>
                                        <p className="font-semibold text-slate-800">{campaign.lead_count || 0}</p>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                                            <DollarSign className="w-3.5 h-3.5" />
                                            <span className="text-xs">Cost Per Lead</span>
                                        </div>
                                        <p className="font-semibold text-emerald-600">
                                            ₹{campaign.lead_count > 0 ? (campaign.budget / campaign.lead_count).toFixed(2) : '0.00'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
                                    <div className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5" />
                                        <span>{new Date(campaign.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <span>Budget: ₹{parseFloat(campaign.budget).toLocaleString()}</span>
                                </div>

                                {/* Campaign Webhook URL copy link section */}
                                {campaign.webhook_url && (
                                    <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between bg-slate-50/50 p-2 rounded-xl border border-slate-100">
                                        <div className="truncate pr-2">
                                            <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Google Sheet API URL</span>
                                            <span className="text-[10px] font-mono text-slate-600 truncate block">{campaign.webhook_url}</span>
                                        </div>
                                        <button 
                                            onClick={() => {
                                                navigator.clipboard.writeText(campaign.webhook_url);
                                                alert("Campaign Webhook URL copied! Paste this into your Google Sheet settings.");
                                            }}
                                            className="px-2 py-1 text-[10px] font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg border border-indigo-100 transition-colors whitespace-nowrap"
                                            title="Copy URL to Clipboard"
                                        >
                                            Copy URL
                                        </button>
                                    </div>
                                )}
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const renderLeadsTable = () => {
        return (
            <div className="space-y-6">
                {/* Assigned Leads Performance Dashboard (Shown when Assigned Leads tab is active) */}
                {activeTab === 'assigned' && (
                    <div className="space-y-5">
                        {/* KPI Summary Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                            {/* Total Assigned */}
                            <div className="bg-white p-4.5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Assigned Leads</p>
                                    <h3 className="text-xl font-bold text-slate-900 mt-1">{assignedStats?.assigned_leads || 0}</h3>
                                    <p className="text-[10px] text-blue-600 font-medium mt-0.5">Assigned to sales reps</p>
                                </div>
                                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold">
                                    <Users className="w-5 h-5" />
                                </div>
                            </div>

                            {/* Contacted Leads */}
                            <div className="bg-white p-4.5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Contacted Leads</p>
                                    <h3 className="text-xl font-bold text-emerald-600 mt-1">{assignedStats?.contacted_leads || 0}</h3>
                                    <p className="text-[10px] text-emerald-600 font-medium mt-0.5">
                                        {assignedStats?.assigned_leads > 0 
                                            ? `${Math.round((assignedStats.contacted_leads / assignedStats.assigned_leads) * 100)}% Contacted` 
                                            : '0% Contacted'}
                                    </p>
                                </div>
                                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-bold">
                                    <Phone className="w-5 h-5" />
                                </div>
                            </div>

                            {/* Total Call Duration / Talk Time */}
                            <div className="bg-white p-4.5 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/30 to-white shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-[11px] font-semibold text-indigo-900 uppercase tracking-wider">Total Talk Time</p>
                                    <h3 className="text-xl font-bold text-indigo-700 mt-1">{assignedStats?.formatted_total_call_duration || '0s'}</h3>
                                    <p className="text-[10px] text-indigo-600 font-medium mt-0.5">Calls logged by team</p>
                                </div>
                                <div className="w-10 h-10 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center font-bold shadow-xs">
                                    <Clock className="w-5 h-5" />
                                </div>
                            </div>

                            {/* Pending Contact */}
                            <div className="bg-white p-4.5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Pending Contact</p>
                                    <h3 className="text-xl font-bold text-amber-600 mt-1">{assignedStats?.pending_leads || 0}</h3>
                                    <p className="text-[10px] text-amber-600 font-medium mt-0.5">Awaiting initial call</p>
                                </div>
                                <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center font-bold">
                                    <Clock className="w-5 h-5" />
                                </div>
                            </div>

                            {/* Converted */}
                            <div className="bg-white p-4.5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Converted / Enrolled</p>
                                    <h3 className="text-xl font-bold text-purple-600 mt-1">{assignedStats?.converted_leads || 0}</h3>
                                    <p className="text-[10px] text-purple-600 font-medium mt-0.5">Successfully enrolled</p>
                                </div>
                                <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center font-bold">
                                    <CheckCircle className="w-5 h-5" />
                                </div>
                            </div>
                        </div>

                        {/* Dynamic Pipeline Stages Breakdown Cards */}
                        {assignedStats?.pipeline_stages?.length > 0 && (
                            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">Dynamic Pipeline Stages Breakdown</h3>
                                        <p className="text-xs text-slate-500 mt-0.5">Real-time distribution of leads across all dynamic pipeline stages (click any stage to filter).</p>
                                    </div>
                                    {selectedStageFilter && (
                                        <button 
                                            onClick={() => { setSelectedStageFilter(''); setCurrentPage(1); }}
                                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1 rounded-lg transition-colors"
                                        >
                                            Show All Stages
                                        </button>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3">
                                    {assignedStats.pipeline_stages.map((stage) => {
                                        const isSelected = selectedStageFilter === stage.id;
                                        return (
                                            <div 
                                                key={stage.id}
                                                onClick={() => {
                                                    if (isSelected) setSelectedStageFilter('');
                                                    else setSelectedStageFilter(stage.id);
                                                    setCurrentPage(1);
                                                }}
                                                className={`p-3.5 rounded-xl border text-center transition-all cursor-pointer ${
                                                    isSelected 
                                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-300' 
                                                        : 'bg-slate-50/80 text-slate-800 border-slate-200 hover:bg-white hover:border-indigo-300 hover:shadow-sm'
                                                }`}
                                            >
                                                <p className={`text-[11px] font-semibold truncate ${isSelected ? 'text-indigo-100' : 'text-slate-500'}`}>
                                                    {stage.name}
                                                </p>
                                                <h4 className={`text-xl font-bold mt-0.5 ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                                                    {stage.count}
                                                </h4>
                                                <span className={`text-[9px] font-bold inline-block mt-1 px-2 py-0.5 rounded-full ${
                                                    isSelected ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'
                                                }`}>
                                                    {assignedStats.total_leads > 0 
                                                        ? `${Math.round((stage.count / assignedStats.total_leads) * 100)}%` 
                                                        : '0%'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Agent Activity & Contact Progress Breakdown */}
                        {assignedStats?.leaderboard?.length > 0 && (
                            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">Agent Contact & Assignment Performance</h3>
                                        <p className="text-xs text-slate-500 mt-0.5">Overview of assigned leads and contact progress per sales representative (click any agent to filter).</p>
                                    </div>
                                    {selectedAssigneeFilter && (
                                        <button 
                                            onClick={() => setSelectedAssigneeFilter('')}
                                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1 rounded-lg transition-colors"
                                        >
                                            Show All Agents
                                        </button>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {assignedStats.leaderboard.map((rep) => {
                                        const contactRate = rep.assigned > 0 ? Math.round((rep.contacted / rep.assigned) * 100) : 0;
                                        const isSelected = selectedAssigneeFilter === rep.id.toString();
                                        return (
                                            <div 
                                                key={rep.id} 
                                                onClick={() => {
                                                    if (isSelected) setSelectedAssigneeFilter('');
                                                    else setSelectedAssigneeFilter(rep.id.toString());
                                                    setCurrentPage(1);
                                                }}
                                                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                                                    isSelected 
                                                        ? 'bg-indigo-50/90 border-indigo-400 ring-2 ring-indigo-500/20 shadow-sm' 
                                                        : 'bg-slate-50/70 border-slate-200 hover:border-indigo-300 hover:bg-white'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                                                            {rep.name?.[0] || 'A'}
                                                        </div>
                                                        <div>
                                                            <h4 className="font-bold text-slate-900 text-xs">{rep.name}</h4>
                                                            <p className="text-[10px] text-slate-500 font-medium">{rep.assigned} Assigned Leads</p>
                                                        </div>
                                                    </div>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${contactRate >= 70 ? 'bg-emerald-100 text-emerald-700' : contactRate >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-700'}`}>
                                                        {contactRate}% Contacted
                                                    </span>
                                                </div>

                                                <div className="space-y-1.5 mt-2">
                                                    <div className="flex items-center justify-between text-[11px] font-medium text-slate-600">
                                                        <span>Contacted: <strong className="text-emerald-700">{rep.contacted}</strong></span>
                                                        <span className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-bold text-[10px] border border-indigo-100">
                                                            ⏱️ {rep.formatted_call_duration || '0s'} ({rep.total_calls || 0} calls)
                                                        </span>
                                                    </div>
                                                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                        <div 
                                                            className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                                                            style={{ width: `${contactRate}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Active Selection Status & Date Breakdown Banner */}
                {(selectedAssigneeFilter || leadsStartDate || leadsEndDate || selectedStageFilter) && (
                    <div className="bg-white p-4.5 rounded-2xl shadow-sm border border-slate-200/80 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs border border-indigo-100">
                                    <Users className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="font-bold text-slate-900 text-sm">
                                            {getAssigneeDisplayName()}
                                        </h4>
                                        {(leadsStartDate || leadsEndDate) && (
                                            <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full font-medium border border-slate-200/60 flex items-center gap-1">
                                                <Calendar className="w-3 h-3 text-slate-400" />
                                                {leadsStartDate || 'Start'} → {leadsEndDate || 'Today'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 self-start sm:self-auto">
                                <div className="bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-xl text-xs font-semibold text-indigo-900">
                                    {selectedAssigneeFilter === 'unassigned' ? 'Total Unassigned' : 'Total Assigned'}: <strong className="text-indigo-600 text-sm ml-1">{assignedStats?.assigned_leads ?? totalLeadsCount}</strong> Leads
                                </div>
                                <button 
                                    onClick={() => { setLeadsStartDate(''); setLeadsEndDate(''); setSelectedAssigneeFilter(''); setSelectedStageFilter(''); setSearchTerm(''); setCurrentPage(1); }}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                    title="Reset filters"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Status Breakdown Pills */}
                        <div className="pt-1">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Status Breakdown</span>
                                {selectedStageFilter && (
                                    <button 
                                        onClick={() => setSelectedStageFilter('')}
                                        className="text-[11px] text-indigo-600 hover:underline font-semibold"
                                    >
                                        Show All Statuses
                                    </button>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                {(assignedStats?.pipeline_stages?.length > 0 
                                    ? assignedStats.pipeline_stages 
                                    : Object.keys(statusCounts).map(name => ({ id: name, name, count: statusCounts[name] }))
                                ).map((st) => {
                                    const statusName = st.name;
                                    const count = st.count;
                                    const stageId = st.id;
                                    const isSelected = selectedStageFilter === stageId || selectedStageFilter === statusName;

                                    const sLower = statusName.toLowerCase();
                                    let badgeStyle = "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200";
                                    let countBg = "bg-slate-200 text-slate-800";

                                    if (sLower.includes('positive') || sLower.includes('enrolled') || sLower.includes('converted')) {
                                        badgeStyle = isSelected ? "bg-emerald-600 text-white border-emerald-600 shadow-sm" : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100";
                                        countBg = isSelected ? "bg-white/20 text-white" : "bg-emerald-200/80 text-emerald-900";
                                    } else if (sLower.includes('follow') || sLower.includes('pending') || sLower.includes('trial')) {
                                        badgeStyle = isSelected ? "bg-amber-600 text-white border-amber-600 shadow-sm" : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100";
                                        countBg = isSelected ? "bg-white/20 text-white" : "bg-amber-200/80 text-amber-900";
                                    } else if (sLower.includes('not answer') || sLower.includes('dropped') || sLower.includes('busy')) {
                                        badgeStyle = isSelected ? "bg-rose-600 text-white border-rose-600 shadow-sm" : "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100";
                                        countBg = isSelected ? "bg-white/20 text-white" : "bg-rose-200/80 text-rose-900";
                                    } else if (sLower.includes('new')) {
                                        badgeStyle = isSelected ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100";
                                        countBg = isSelected ? "bg-white/20 text-white" : "bg-indigo-200/80 text-indigo-900";
                                    }

                                    return (
                                        <button
                                            key={stageId || statusName}
                                            onClick={() => {
                                                if (isSelected) setSelectedStageFilter('');
                                                else setSelectedStageFilter(stageId);
                                                setCurrentPage(1);
                                            }}
                                            className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${badgeStyle} ${
                                                isSelected ? 'scale-105 shadow-sm font-bold ring-2 ring-indigo-500/20' : ''
                                            }`}
                                        >
                                            <span>{statusName}</span>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${countBg}`}>
                                                {count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                 {/* Filter & Action Bar */}
                 <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 space-y-3">
                    {/* Row 1: Search & Filter Inputs */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
                            {/* Search */}
                            <div className="relative flex-1 min-w-[180px] max-w-xs">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                                <input
                                    type="text"
                                    placeholder="Search leads..."
                                    value={searchTerm}
                                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-xs text-slate-800"
                                />
                            </div>
                            
                            {/* Assigned Person Filter */}
                            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500/20">
                                <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Assigned To:</span>
                                <select 
                                    value={selectedAssigneeFilter}
                                    onChange={(e) => { setSelectedAssigneeFilter(e.target.value); setCurrentPage(1); }}
                                    className="bg-transparent text-xs font-semibold text-indigo-700 outline-none cursor-pointer"
                                >
                                    <option value="" className="text-slate-900 bg-white">
                                        {activeTab === 'assigned' ? 'All Assigned Leads' : 'All Sales Reps'}
                                    </option>
                                    <option value="unassigned" className="text-slate-900 bg-white">Unassigned Leads</option>
                                    {salesUsers.map(user => (
                                        <option key={user.id} value={user.id} className="text-slate-900 bg-white">
                                            {user.name || (user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user.username || `User #${user.id}`)}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Status Filter */}
                            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500/20">
                                <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Status:</span>
                                <select 
                                    value={selectedStageFilter}
                                    onChange={(e) => { setSelectedStageFilter(e.target.value); setCurrentPage(1); }}
                                    className="bg-transparent text-xs font-semibold text-indigo-700 outline-none cursor-pointer"
                                >
                                    <option value="" className="text-slate-900 bg-white">All Statuses</option>
                                    <option value="DUPLICATE" className="text-red-700 bg-rose-50 font-bold">⚠️ DUPLICATE LEADS</option>
                                    {Object.keys(pipelineStages).map(stageId => (
                                        <option key={stageId} value={stageId} className="text-slate-900 bg-white">
                                            {pipelineStages[stageId]}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Quick Date Presets */}
                            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200/80">
                                <button 
                                    onClick={() => {
                                        const today = new Date().toISOString().split('T')[0];
                                        setLeadsStartDate(today);
                                        setLeadsEndDate(today);
                                        setCurrentPage(1);
                                    }}
                                    className="px-2 py-1 text-[11px] font-semibold text-slate-700 hover:text-indigo-600 hover:bg-white rounded-lg transition-all"
                                >
                                    Today
                                </button>
                                <button 
                                    onClick={() => {
                                        const y = new Date();
                                        y.setDate(y.getDate() - 1);
                                        const str = y.toISOString().split('T')[0];
                                        setLeadsStartDate(str);
                                        setLeadsEndDate(str);
                                        setCurrentPage(1);
                                    }}
                                    className="px-2 py-1 text-[11px] font-semibold text-slate-700 hover:text-indigo-600 hover:bg-white rounded-lg transition-all"
                                >
                                    Yesterday
                                </button>
                                <button 
                                    onClick={() => {
                                        const today = new Date();
                                        const firstDay = new Date(today);
                                        const day = today.getDay() || 7;
                                        if (day !== 1) firstDay.setDate(today.getDate() - (day - 1));
                                        setLeadsStartDate(firstDay.toISOString().split('T')[0]);
                                        setLeadsEndDate(today.toISOString().split('T')[0]);
                                        setCurrentPage(1);
                                    }}
                                    className="px-2 py-1 text-[11px] font-semibold text-slate-700 hover:text-indigo-600 hover:bg-white rounded-lg transition-all"
                                >
                                    This Week
                                </button>
                                <button 
                                    onClick={() => {
                                        const today = new Date();
                                        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                                        setLeadsStartDate(firstDay.toISOString().split('T')[0]);
                                        setLeadsEndDate(today.toISOString().split('T')[0]);
                                        setCurrentPage(1);
                                    }}
                                    className="px-2 py-1 text-[11px] font-semibold text-slate-700 hover:text-indigo-600 hover:bg-white rounded-lg transition-all"
                                >
                                    This Month
                                </button>
                            </div>

                            {/* Creation Date Filter */}
                            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500/20">
                                <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Date:</span>
                                <input 
                                    type="date" 
                                    value={leadsStartDate} 
                                    onChange={(e) => { setLeadsStartDate(e.target.value); setCurrentPage(1); }} 
                                    className="px-1 text-xs outline-none bg-transparent text-slate-700 font-medium" 
                                />
                                <span className="text-slate-400 text-xs">to</span>
                                <input 
                                    type="date" 
                                    value={leadsEndDate} 
                                    onChange={(e) => { setLeadsEndDate(e.target.value); setCurrentPage(1); }} 
                                    className="px-1 text-xs outline-none bg-transparent text-slate-700 font-medium" 
                                />
                            </div>

                            {(leadsStartDate || leadsEndDate || selectedAssigneeFilter || selectedStageFilter || searchTerm) && (
                                <button 
                                    onClick={() => { setLeadsStartDate(''); setLeadsEndDate(''); setSelectedAssigneeFilter(''); setSelectedStageFilter(''); setSearchTerm(''); setCurrentPage(1); }}
                                    className="px-2.5 py-1 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors flex items-center gap-1 border border-rose-200/60"
                                    title="Reset all filters"
                                >
                                    ✕ Clear Filters
                                </button>
                            )}
                        </div>
                    </div>
                    
                    {/* Row 2: Actions & Bulk Assignment Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-100">
                        <div className="text-xs font-medium text-slate-500">
                            Showing <strong className="text-slate-800">{leads.length}</strong> leads
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            <button onClick={handleExportCSV} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors shadow-xs">
                                <Download className="w-3.5 h-3.5 text-slate-500" /> Export CSV
                            </button>
                            <span className="text-xs text-indigo-700 font-semibold px-2 border-l border-slate-200 pl-3 whitespace-nowrap">
                                {selectedLeads.length} selected
                            </span>
                            <select 
                                className="text-xs bg-white border border-indigo-200 rounded-xl px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium"
                                value={assignSalesUserId}
                                onChange={(e) => setAssignSalesUserId(e.target.value)}
                            >
                                <option value="" className="text-slate-900 bg-white">Assign to Sales Rep...</option>
                                {salesUsers.map(user => (
                                    <option key={user.id} value={user.id} className="text-slate-900 bg-white">
                                        {user.name || (user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user.username || `User #${user.id}`)}
                                    </option>
                                ))}
                            </select>
                            <button 
                                onClick={handleBulkAssign}
                                disabled={isAssigning || selectedLeads.length === 0 || !assignSalesUserId}
                                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-xs"
                            >
                                {isAssigning ? 'Assigning...' : 'Assign'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Leads Table */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    {leadsLoading ? (
                        <div className="text-center py-10">Loading leads...</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                        <th className="px-6 py-4 w-12">
                                            <input 
                                                type="checkbox" 
                                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                onChange={selectAllLeads}
                                                checked={selectedLeads.length === leads.length && leads.length > 0}
                                            />
                                        </th>
                                        <th className="px-6 py-4 font-semibold">Lead Name & ID</th>
                                        <th className="px-6 py-4 font-semibold">Contact Info</th>
                                        <th className="px-6 py-4 font-semibold">Assigned To</th>
                                        <th className="px-6 py-4 font-semibold">Status</th>
                                        <th className="px-6 py-4 font-semibold cursor-pointer group" onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}>
                                            <div className="flex items-center gap-1.5">
                                                Date Created
                                                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                                            </div>
                                        </th>
                                        <th className="px-6 py-4 font-semibold text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {sortedLeads.map((lead) => {
                                        const isDuplicate = lead.lead_status === 'DUPLICATE';
                                        return (
                                            <tr key={lead.id} className={`transition-colors ${isDuplicate ? 'bg-red-50 text-red-900 font-medium border-l-4 border-red-500 hover:bg-red-100/75' : 'hover:bg-slate-50/50'}`}>
                                                <td className="px-6 py-4">
                                                    <input 
                                                        type="checkbox" 
                                                        disabled={isDuplicate}
                                                        title={isDuplicate ? "Duplicate leads cannot be assigned" : "Select lead for assignment"}
                                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed"
                                                        checked={selectedLeads.includes(lead.id)}
                                                        onChange={() => toggleLeadSelection(lead.id)}
                                                    />
                                                </td>
                                                <td className="px-6 py-4">
                                                     <div className={`font-medium ${isDuplicate ? 'text-red-950 font-bold' : 'text-slate-800'}`}>{lead.first_name} {lead.last_name}</div>
                                                     <div className="flex items-center gap-2 mt-0.5">
                                                         <span className={`text-[10px] font-mono ${isDuplicate ? 'text-red-700/80' : 'text-slate-400'}`}>{lead.crm_student_id}</span>
                                                         {lead.campaign_name && (
                                                             <span className={`text-[9px] font-bold px-1.5 py-0.25 rounded-md ${
                                                                 isDuplicate 
                                                                     ? 'bg-red-200/60 text-red-800 border border-red-300/40' 
                                                                     : 'bg-indigo-50 text-indigo-700 border border-indigo-100/50'
                                                             }`}>
                                                                 📢 {lead.campaign_name}
                                                             </span>
                                                         )}
                                                     </div>
                                                 </td>
                                                <td className="px-6 py-4">
                                                    <div className={`text-sm ${isDuplicate ? 'text-red-900 font-semibold' : 'text-slate-700'}`}>{lead.mobile || '—'}</div>
                                                    <div className={`text-xs mt-0.5 ${isDuplicate ? 'text-red-700/80' : 'text-slate-500'}`}>{lead.email || ''}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {lead.assigned_to_name ? (
                                                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                                            {lead.assigned_to_name}
                                                        </span>
                                                    ) : (
                                                        <span className={`text-xs italic ${isDuplicate ? 'text-red-600/70 font-semibold' : 'text-slate-400'}`}>Unassigned</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2.5 py-1 text-[10px] font-bold rounded-md uppercase tracking-wide ${
                                                        isDuplicate ? 'bg-red-200 text-red-900 border border-red-300' :
                                                        lead.lead_status === 'Pending' || lead.lead_status === 'NEW' ? 'bg-amber-50 text-amber-600' :
                                                        lead.lead_status === 'Enrolled' || lead.lead_status === '4' ? 'bg-green-50 text-green-600' :
                                                        'bg-slate-100 text-slate-600'
                                                    }`}>
                                                        {isDuplicate ? '⚠️ DUPLICATE' : (pipelineStages[lead.lead_status] || lead.lead_status || 'Pending')}
                                                    </span>
                                                </td>
                                                <td className={`px-6 py-4 text-sm ${isDuplicate ? 'text-red-800' : 'text-slate-500'}`}>
                                                    {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : '—'}
                                                </td>
                                                <td className="px-6 py-4 text-right flex justify-end gap-1.5">
                                                     <button 
                                                         onClick={() => handleEditLeadClick(lead)}
                                                         className={`p-1.5 rounded-lg transition-colors border border-transparent ${isDuplicate ? 'text-red-500 hover:text-red-850 hover:bg-red-200/50' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-100'}`}
                                                         title="Edit Lead"
                                                     >
                                                         <Edit2 className="w-4 h-4" />
                                                     </button>
                                                     {authUser?.role === 'SUPER_ADMIN' && (
                                                         <button 
                                                             onClick={() => handleDeleteLead(lead.id)}
                                                             className={`p-1.5 rounded-lg transition-colors border border-transparent ${isDuplicate ? 'text-red-500 hover:text-red-850 hover:bg-red-200/50' : 'text-slate-400 hover:text-red-600 hover:bg-red-50 hover:border-red-100'}`}
                                                             title="Delete Lead"
                                                         >
                                                             <Trash2 className="w-4 h-4" />
                                                         </button>
                                                     )}
                                                 </td>
                                            </tr>
                                        );
                                    })}
                                    {sortedLeads.length === 0 && (
                                        <tr><td colSpan="6" className="px-6 py-8 text-center text-slate-500">No leads found</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                    
                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
                            <span className="text-sm text-slate-500">
                                Page <span className="font-medium text-slate-700">{currentPage}</span> of <span className="font-medium text-slate-700">{totalPages}</span>
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {/* Header & Tabs */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Marketing</h1>
                    <p className="text-slate-500 mt-1">Manage marketing sources, track budgets, and route leads.</p>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-xl w-full md:w-auto overflow-x-auto">
                    {(authUser?.role === 'SUPER_ADMIN' || authUser?.role === 'ADMIN') && (
                        <>
                            <button 
                                onClick={() => setActiveTab('dashboard')}
                                className={`px-5 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${activeTab === 'dashboard' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Dashboard
                            </button>
                            <button 
                                onClick={() => setActiveTab('campaigns')}
                                className={`px-5 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${activeTab === 'campaigns' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Campaigns
                            </button>
                        </>
                    )}
                    <button 
                        onClick={() => setActiveTab('leads')}
                        className={`px-5 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${activeTab === 'leads' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Leads Table
                    </button>
                    <button 
                        onClick={() => setActiveTab('assigned')}
                        className={`px-5 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${activeTab === 'assigned' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Assigned Leads
                    </button>
                </div>
            </div>

            {/* Tab Contents */}
            <div className="mt-6">
                {activeTab === 'dashboard' && renderDashboard()}
                {activeTab === 'campaigns' && renderCampaigns()}
                {(activeTab === 'leads' || activeTab === 'assigned') && renderLeadsTable()}
            </div>

            {/* Bulk Upload Modal */}
            {isUploadModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h2 className="text-lg font-bold text-slate-800">Bulk Upload Leads CSV</h2>
                            <button onClick={() => setIsUploadModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleBulkUpload} className="p-6 space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Select Campaign *</label>
                                <select required value={uploadCampaignId} onChange={(e) => setUploadCampaignId(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all">
                                    <option value="">-- Choose a Campaign --</option>
                                    {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Select Program</label>
                                <select value={uploadProgramId} onChange={(e) => setUploadProgramId(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all">
                                    <option value="">-- Default Program --</option>
                                    {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Upload CSV File *</label>
                                <input required type="file" accept=".csv" onChange={(e) => setUploadFile(e.target.files[0])} className="w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
                                <div className="flex items-center justify-between mt-2">
                                    <p className="text-[10px] text-slate-500 leading-relaxed">
                                        CSV must include columns: <b>Name</b>, <b>date</b>, <b>place</b>, <b>contact</b>, <b>email</b>, <b>tag</b>.
                                    </p>
                                    <a 
                                        href="data:text/csv;charset=utf-8,Name,date,place,contact,email,tag%0A" 
                                        download="leads_template.csv"
                                        className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold whitespace-nowrap flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded transition-colors"
                                    >
                                        <Download size={12} />
                                        Template
                                    </a>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                <button type="button" onClick={() => setIsUploadModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-xl">Cancel</button>
                                <button type="submit" disabled={isUploading} className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-50 flex items-center gap-2">
                                    {isUploading ? 'Uploading...' : 'Upload Leads'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}

            {/* Create Campaign Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h2 className="text-lg font-bold text-slate-800">{editingCampaign ? 'Edit Campaign' : 'Create New Campaign'}</h2>
                            <button onClick={() => { setIsCreateModalOpen(false); setEditingCampaign(null); }} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleSaveCampaign} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Campaign Name *</label>
                                <input required type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Platform</label>
                                    <select value={formData.platform} onChange={(e) => setFormData({...formData, platform: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none">
                                        <option value="FACEBOOK">Facebook Ads</option>
                                        <option value="GOOGLE">Google Ads</option>
                                        <option value="INSTAGRAM">Instagram Ads</option>
                                        <option value="LINKEDIN">LinkedIn Ads</option>
                                        <option value="WALKIN">Walk-in / Offline</option>
                                        <option value="OTHER">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                                    <select value={formData.status} onChange={(e) => setFormData({...formData, status: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none">
                                        <option value="ACTIVE">Active</option>
                                        <option value="PAUSED">Paused</option>
                                        <option value="COMPLETED">Completed</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Section</label>
                                    <select value={formData.section} onChange={(e) => setFormData({...formData, section: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none">
                                        <option value="BOTH">Both</option>
                                        <option value="CAREER_ACADEMY">Career Academy</option>
                                        <option value="REGULAR">Regular</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Budget (₹)</label>
                                <input type="number" step="0.01" value={formData.budget} onChange={(e) => setFormData({...formData, budget: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                                    <input type="date" value={formData.start_date} onChange={(e) => setFormData({...formData, start_date: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                                    <input type="date" value={formData.end_date} onChange={(e) => setFormData({...formData, end_date: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                                <textarea rows="3" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"></textarea>
                            </div>

                            {/* Meta Facebook Lead Ads Integration Section */}
                            {(formData.platform === 'FACEBOOK' || formData.platform === 'INSTAGRAM') && (
                                <div className="border border-blue-100 rounded-xl p-4 bg-blue-50/40 space-y-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
                                            <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                                        </div>
                                        <span className="text-sm font-semibold text-blue-800">Meta Lead Ads Auto-Import</span>
                                        <span className="text-xs text-blue-500 bg-blue-100 px-2 py-0.5 rounded-full">Optional</span>
                                    </div>
                                    <p className="text-xs text-blue-600">When enabled, leads from your Meta Lead Ad form automatically appear in the CRM Leads Table.</p>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Meta Page ID</label>
                                            <input type="text" placeholder="e.g. 123456789" value={formData.meta_page_id || ''} onChange={(e) => setFormData({...formData, meta_page_id: e.target.value})} className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Meta Form ID</label>
                                            <input type="text" placeholder="Lead Ad Form ID" value={formData.meta_form_id || ''} onChange={(e) => setFormData({...formData, meta_form_id: e.target.value})} className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Meta Pixel ID</label>
                                            <input type="text" placeholder="For Conversions API" value={formData.meta_pixel_id || ''} onChange={(e) => setFormData({...formData, meta_pixel_id: e.target.value})} className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Meta Ad ID <span className="text-slate-400">(optional)</span></label>
                                            <input type="text" placeholder="Specific Ad ID" value={formData.meta_ad_id || ''} onChange={(e) => setFormData({...formData, meta_ad_id: e.target.value})} className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">Page Access Token 🔒</label>
                                        <input type="password" placeholder="Meta Page Access Token (keep secret)" value={formData.meta_access_token || ''} onChange={(e) => setFormData({...formData, meta_access_token: e.target.value})} className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none" />
                                        <p className="text-xs text-slate-400 mt-1">Get this from Meta Business Settings → Pages → Your Page → Page Access Token</p>
                                    </div>
                                    <div className="flex items-center gap-3 pt-1">
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" checked={formData.meta_auto_import || false} onChange={(e) => setFormData({...formData, meta_auto_import: e.target.checked})} className="sr-only peer" />
                                            <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                        </label>
                                        <span className="text-sm text-slate-700 font-medium">Enable Auto-Import for this Campaign</span>
                                    </div>
                                </div>
                            )}

                            {/* Auto-Assignment Checklist (Permanently Visible) */}
                            <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-3">
                                <label className="block text-sm font-semibold text-slate-700">Auto-Assign Incoming Leads To (Round-Robin):</label>
                                <p className="text-[11px] text-slate-500">Selected active reps will receive new leads from this campaign sequentially.</p>
                                <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto bg-white p-2.5 rounded-lg border border-slate-200">
                                     {salesUsers
                                         .filter(user => {
                                             // If Campaign section is CAREER_ACADEMY, only show reps in CAREER_ACADEMY or BOTH
                                             if (formData.section === 'CAREER_ACADEMY') {
                                                 return user.sales_section === 'CAREER_ACADEMY' || user.sales_section === 'BOTH';
                                             }
                                             // If Campaign section is REGULAR, only show reps in REGULAR or BOTH
                                             if (formData.section === 'REGULAR') {
                                                 return user.sales_section === 'REGULAR' || user.sales_section === 'BOTH';
                                             }
                                             // Otherwise show all
                                             return true;
                                         })
                                         .map(user => {
                                             const userId = user.id;
                                             const isChecked = formData.auto_assign_to?.includes(userId);
                                             const displayName = user.name || (user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user.username || `User #${userId}`);
                                             return (
                                                 <label key={userId} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-md cursor-pointer text-xs font-medium text-slate-700">
                                                     <input 
                                                         type="checkbox"
                                                         checked={isChecked}
                                                         className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                         onChange={(e) => {
                                                             const list = formData.auto_assign_to || [];
                                                             if (e.target.checked) {
                                                                 setFormData({ ...formData, auto_assign_to: [...list, userId] });
                                                             } else {
                                                                 setFormData({ ...formData, auto_assign_to: list.filter(id => id !== userId) });
                                                             }
                                                         }}
                                                     />
                                                     {displayName}
                                                     <span className="text-[9px] bg-slate-100 text-slate-500 px-1 py-0.25 rounded-md ml-auto whitespace-nowrap">
                                                         {user.sales_section === 'BOTH' ? 'Both' : user.sales_section === 'CAREER_ACADEMY' ? 'Career' : 'Regular'}
                                                     </span>
                                                 </label>
                                             );
                                         })}
                                    {salesUsers.length === 0 && (
                                        <span className="text-slate-400 italic text-xs col-span-2">No active sales representatives found.</span>
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                <button type="button" onClick={() => { setIsCreateModalOpen(false); setEditingCampaign(null); }} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-xl">Cancel</button>
                                <button type="submit" className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl">Save Campaign</button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}


            {/* Webhooks API Modal (Existing structure, untouched functionality) */}
            {isWebhooksModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h2 className="text-lg font-bold text-slate-800">API & Webhooks Integration</h2>
                            <button onClick={() => setIsWebhooksModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-6">
                            <div className="bg-indigo-50 text-indigo-800 p-4 rounded-xl text-sm leading-relaxed border border-indigo-100">
                                <strong>How it works:</strong> You can automatically create leads in the CRM by sending a POST request to any of your active Webhook URLs. This is perfect for integrating with Facebook Lead Ads, Zapier, or your own website forms.
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 mb-3 text-sm uppercase tracking-wider">Your Active Endpoints</h3>
                                {webhooks.length === 0 ? (
                                    <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl text-slate-500 text-sm">
                                        No webhook endpoints configured. Please create one via the Django Admin panel.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {webhooks.map(wh => (
                                            <div key={wh.id} className="p-4 border border-slate-200 rounded-xl bg-slate-50">
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="font-semibold text-slate-800">{wh.name}</span>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${wh.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>{wh.is_active ? 'Active' : 'Inactive'}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <code className="text-xs bg-slate-200 text-slate-700 px-2 py-1 rounded block w-full overflow-x-auto whitespace-nowrap">
                                                        {window.location.origin}/api/crm/webhooks/{wh.secret_token}/lead/
                                                    </code>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 mb-3 text-sm uppercase tracking-wider">Expected JSON Payload</h3>
                                <div className="bg-slate-900 text-slate-300 p-4 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed">
                                    {`{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com",
  "mobile": "9876543210",
  "course_name": "Full Stack Dev",
  "campaign_name": "Summer FB Ads" // Matches with existing Campaign name
}`}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Edit Lead Modal */}
            {editingLead && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
                    >
                        <div className="flex justify-between items-center p-5 border-b border-slate-100">
                            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                <Users className="w-5 h-5 text-indigo-500" />
                                Edit Lead Info
                            </h3>
                            <button onClick={() => setEditingLead(null)} className="text-slate-400 hover:text-red-500 transition-colors bg-slate-50 hover:bg-red-50 p-1.5 rounded-lg">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveLead} className="p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">First Name</label>
                                    <input 
                                        type="text" 
                                        required 
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                                        value={leadFormData.first_name}
                                        onChange={(e) => setLeadFormData({...leadFormData, first_name: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Last Name</label>
                                    <input 
                                        type="text" 
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                                        value={leadFormData.last_name}
                                        onChange={(e) => setLeadFormData({...leadFormData, last_name: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Mobile Phone (e.g. 91944...)</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                                    value={leadFormData.mobile}
                                    onChange={(e) => setLeadFormData({...leadFormData, mobile: e.target.value})}
                                    placeholder="Enter accurate phone number..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email Address</label>
                                <input 
                                    type="email" 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                                    value={leadFormData.email}
                                    onChange={(e) => setLeadFormData({...leadFormData, email: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Pipeline Status</label>
                                <select 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                                    value={leadFormData.lead_status}
                                    onChange={(e) => setLeadFormData({...leadFormData, lead_status: e.target.value})}
                                >
                                    <option value="">-- Select Status --</option>
                                    {Object.entries(pipelineStages).map(([id, name]) => (
                                        <option key={id} value={id}>{name}</option>
                                    ))}
                                    <option value="NEW">New Lead</option>
                                </select>
                            </div>

                            {/* Meta Lead Quality Feedback Section */}
                            {editingLead?.meta_lead_id && (
                                <div className="border border-blue-100 rounded-xl p-3 bg-blue-50/40">
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <div className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center">
                                            <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                                        </div>
                                        <span className="text-xs font-semibold text-blue-800">Meta Lead Quality Feedback</span>
                                    </div>
                                    <p className="text-xs text-blue-600 mb-2">Your feedback is sent to Meta to improve ad targeting quality.</p>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                await fetch(`/api/crm/leads/${editingLead.id}/quality/`, {
                                                    method: 'PATCH',
                                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Token ${localStorage.getItem('token')}` },
                                                    body: JSON.stringify({ lead_quality: 'QUALITY' })
                                                });
                                                setEditingLead({...editingLead, lead_quality: 'QUALITY'});
                                            }}
                                            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center justify-center gap-1 ${editingLead?.lead_quality === 'QUALITY' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-green-700 border-green-300 hover:bg-green-50'}`}
                                        >
                                            ✅ Quality Lead
                                        </button>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                await fetch(`/api/crm/leads/${editingLead.id}/quality/`, {
                                                    method: 'PATCH',
                                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Token ${localStorage.getItem('token')}` },
                                                    body: JSON.stringify({ lead_quality: 'FAKE' })
                                                });
                                                setEditingLead({...editingLead, lead_quality: 'FAKE'});
                                            }}
                                            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center justify-center gap-1 ${editingLead?.lead_quality === 'FAKE' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-700 border-red-300 hover:bg-red-50'}`}
                                        >
                                            ❌ Fake / Junk
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                                <button type="button" onClick={() => setEditingLead(null)} className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 font-medium rounded-xl text-sm transition-colors">
                                    Cancel
                                </button>
                                <button type="submit" disabled={isSavingLead} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm transition-colors shadow-sm disabled:opacity-50">
                                    {isSavingLead ? 'Saving...' : 'Save Lead'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </div>
    );
};

export default CRMCampaigns;
