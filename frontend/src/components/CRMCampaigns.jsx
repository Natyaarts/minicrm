import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { motion } from 'framer-motion';
import { Plus, X, Search, BarChart, Calendar, DollarSign, Users, ExternalLink, Edit2, Link, Upload, TrendingUp, CheckCircle, Clock, Download, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

const CRMCampaigns = () => {
    const { user: authUser } = useAuth();
    
    // Tab State
    const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'campaigns', 'leads'

    useEffect(() => {
        if (authUser) {
            const isManager = authUser.role === 'SUPER_ADMIN' || authUser.role === 'ADMIN' || authUser.is_manager;
            if (!isManager && (activeTab === 'dashboard' || activeTab === 'campaigns')) {
                setActiveTab('leads');
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
    
    // Leads Data
    const [leads, setLeads] = useState([]);
    const [leadsLoading, setLeadsLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [sortOrder, setSortOrder] = useState('desc');
    const [salesUsers, setSalesUsers] = useState([]);
    const [pipelineStages, setPipelineStages] = useState({});
    const [leadsStartDate, setLeadsStartDate] = useState('');
    const [leadsEndDate, setLeadsEndDate] = useState('');
    
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
        budget: '', start_date: '', end_date: '', description: ''
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
        } else if (activeTab === 'leads') {
            fetchSalesUsers();
            fetchPipelineStages();
            fetchPrograms();
        }
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 'leads') {
            fetchLeads();
        }
    }, [activeTab, currentPage, leadsStartDate, leadsEndDate]);

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
    
    const fetchLeads = async () => {
        setLeadsLoading(true);
        try {
            let url = `students/?campaign_only=true&page=${currentPage}`;
            if (leadsStartDate) url += `&start_date=${leadsStartDate}`;
            if (leadsEndDate) url += `&end_date=${leadsEndDate}`;
            const res = await api.get(url); 
            setLeads(res.data.results || res.data || []);
            if (res.data.count !== undefined) {
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
                budget: '', start_date: '', end_date: '', description: ''
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
        if (e.target.checked) setSelectedLeads(leads.map(l => l.id));
        else setSelectedLeads([]);
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
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });

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
                                        <td className="px-6 py-4 whitespace-nowrap text-center font-medium text-green-600">
                                            {rep.converted}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right font-bold text-indigo-600">
                                            {rep.conversion_rate}%
                                        </td>
                                    </tr>
                                ))}
                                {sales_report.length === 0 && (
                                    <tr><td colSpan="5" className="px-6 py-8 text-center text-slate-500">No sales team data available</td></tr>
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
                                        <button 
                                            onClick={() => {
                                                setEditingCampaign(campaign);
                                                setFormData({
                                                    name: campaign.name, platform: campaign.platform, status: campaign.status,
                                                    budget: campaign.budget, start_date: campaign.start_date || '', end_date: campaign.end_date || '', description: campaign.description || ''
                                                });
                                                setIsCreateModalOpen(true);
                                            }}
                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
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
                                <div className="flex items-center justify-between text-xs text-slate-500">
                                    <div className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5" />
                                        <span>{new Date(campaign.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <span>Budget: ₹{parseFloat(campaign.budget).toLocaleString()}</span>
                                </div>
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
                 {/* Bulk Action Bar */}
                 <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="relative max-w-xs w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                        <input
                            type="text"
                            placeholder="Search leads..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 text-sm"
                        />
                    </div>
                    
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500/20">
                        <input 
                            type="date" 
                            value={leadsStartDate} 
                            onChange={(e) => { setLeadsStartDate(e.target.value); setCurrentPage(1); }} 
                            className="px-3 py-2 text-sm outline-none bg-transparent border-r border-slate-200 text-slate-700" 
                        />
                        <span className="px-2 text-slate-400 text-sm">to</span>
                        <input 
                            type="date" 
                            value={leadsEndDate} 
                            onChange={(e) => { setLeadsEndDate(e.target.value); setCurrentPage(1); }} 
                            className="px-3 py-2 text-sm outline-none bg-transparent text-slate-700" 
                        />
                        {(leadsStartDate || leadsEndDate) && (
                            <button 
                                onClick={() => { setLeadsStartDate(''); setLeadsEndDate(''); setCurrentPage(1); }}
                                className="px-2 py-1 mr-1 text-xs font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-3 p-2 bg-indigo-50 rounded-xl border border-indigo-100">
                        <button onClick={handleExportCSV} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors mr-2 shadow-sm">
                            <Download className="w-4 h-4" /> Export
                        </button>
                        <span className="text-sm text-indigo-700 font-medium px-2 border-l border-indigo-200 pl-4">
                            {selectedLeads.length} leads selected
                        </span>
                        <select 
                            className="text-sm bg-white border border-indigo-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                            value={assignSalesUserId}
                            onChange={(e) => setAssignSalesUserId(e.target.value)}
                        >
                            <option value="">Assign to Sales Rep...</option>
                            {salesUsers.map(user => (
                                <option key={user.id} value={user.id}>{user.name}</option>
                            ))}
                        </select>
                        <button 
                            onClick={handleBulkAssign}
                            disabled={isAssigning || selectedLeads.length === 0 || !assignSalesUserId}
                            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isAssigning ? 'Assigning...' : 'Assign'}
                        </button>
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
                                    {sortedLeads.map((lead) => (
                                        <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <input 
                                                    type="checkbox" 
                                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                    checked={selectedLeads.includes(lead.id)}
                                                    onChange={() => toggleLeadSelection(lead.id)}
                                                />
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-slate-800">{lead.first_name} {lead.last_name}</div>
                                                <div className="text-xs text-slate-400 font-mono mt-0.5">{lead.crm_student_id}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-slate-700">{lead.mobile || '—'}</div>
                                                <div className="text-xs text-slate-500 mt-0.5">{lead.email || ''}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {lead.assigned_to_name ? (
                                                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                                        {lead.assigned_to_name}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-slate-400 italic">Unassigned</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2.5 py-1 text-[10px] font-bold rounded-md uppercase tracking-wide ${
                                                    lead.lead_status === 'Pending' || lead.lead_status === 'NEW' ? 'bg-amber-50 text-amber-600' :
                                                    lead.lead_status === 'Enrolled' || lead.lead_status === '4' ? 'bg-green-50 text-green-600' :
                                                    'bg-slate-100 text-slate-600'
                                                }`}>
                                                    {pipelineStages[lead.lead_status] || lead.lead_status || 'Pending'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-500">
                                                {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : '—'}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button 
                                                    onClick={() => handleEditLeadClick(lead)}
                                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-100"
                                                    title="Edit Lead"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
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
                <div className="flex bg-slate-100 p-1 rounded-xl w-full md:w-auto">
                    {(authUser?.role === 'SUPER_ADMIN' || authUser?.role === 'ADMIN' || authUser?.is_manager) && (
                        <>
                            <button 
                                onClick={() => setActiveTab('dashboard')}
                                className={`flex-1 md:flex-none px-6 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'dashboard' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Dashboard
                            </button>
                            <button 
                                onClick={() => setActiveTab('campaigns')}
                                className={`flex-1 md:flex-none px-6 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'campaigns' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Campaigns
                            </button>
                        </>
                    )}
                    <button 
                        onClick={() => setActiveTab('leads')}
                        className={`flex-1 md:flex-none px-6 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'leads' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Leads Table
                    </button>
                </div>
            </div>

            {/* Tab Contents */}
            <div className="mt-6">
                {activeTab === 'dashboard' && renderDashboard()}
                {activeTab === 'campaigns' && renderCampaigns()}
                {activeTab === 'leads' && renderLeadsTable()}
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
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
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
