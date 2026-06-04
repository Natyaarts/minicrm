import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { motion } from 'framer-motion';
import { Plus, X, Search, BarChart, Calendar, DollarSign, Users, ExternalLink, Edit2, Link } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const CRMCampaigns = () => {
    const { user: authUser } = useAuth();
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingCampaign, setEditingCampaign] = useState(null);
    const [isWebhooksModalOpen, setIsWebhooksModalOpen] = useState(false);
    const [webhooks, setWebhooks] = useState([]);
    
    // Form state
    const [formData, setFormData] = useState({
        name: '',
        platform: 'OTHER',
        status: 'ACTIVE',
        budget: '',
        start_date: '',
        end_date: '',
        description: ''
    });

    useEffect(() => {
        fetchCampaigns();
    }, []);

    const fetchCampaigns = async () => {
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
            console.error('Error saving campaign:', error.response?.data || error.message);
            alert("Failed to save campaign. Please check the inputs.");
        }
    };

    const handleEditClick = (campaign) => {
        setEditingCampaign(campaign);
        setFormData({
            name: campaign.name || '',
            platform: campaign.platform || 'OTHER',
            status: campaign.status || 'ACTIVE',
            budget: campaign.budget || '',
            start_date: campaign.start_date || '',
            end_date: campaign.end_date || '',
            description: campaign.description || ''
        });
        setIsCreateModalOpen(true);
    };

    const filteredCampaigns = campaigns.filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.platform.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-lg font-bold text-slate-800">Marketing Campaigns</h2>
                    <p className="text-xs text-slate-500">Manage lead generation sources and track cost per lead.</p>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input 
                            type="text" 
                            placeholder="Search campaigns..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
                        />
                    </div>
                    {(authUser?.role === 'SUPER_ADMIN' || authUser?.role === 'SALES') && (
                        <>
                            <button 
                                onClick={() => {
                                    fetchWebhooks();
                                    setIsWebhooksModalOpen(true);
                                }}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap border border-slate-200"
                            >
                                <Link size={14} />
                                Webhooks API
                            </button>
                            <button 
                                onClick={() => {
                                    setEditingCampaign(null);
                                    setFormData({
                                        name: '', platform: 'OTHER', status: 'ACTIVE', 
                                        budget: '', start_date: '', end_date: '', description: ''
                                    });
                                    setIsCreateModalOpen(true);
                                }}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap"
                            >
                                <Plus size={14} />
                                New Campaign
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="p-6">
                {loading ? (
                    <div className="text-center py-10 text-slate-400 text-sm">Loading campaigns...</div>
                ) : filteredCampaigns.length === 0 ? (
                    <div className="text-center py-10">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                            <BarChart className="text-slate-300" size={24} />
                        </div>
                        <p className="text-slate-500 text-sm font-medium">No campaigns found.</p>
                        <p className="text-slate-400 text-xs mt-1">Create your first campaign to track lead sources.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredCampaigns.map(campaign => (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                key={campaign.id} 
                                className="bg-white border border-slate-200 rounded-xl p-5 hover:border-indigo-300 hover:shadow-md transition-all group"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-1">{campaign.platform}</div>
                                        <h3 className="font-bold text-slate-800 text-sm leading-tight group-hover:text-indigo-700 transition-colors">{campaign.name}</h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                                            campaign.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 
                                            campaign.status === 'PAUSED' ? 'bg-amber-100 text-amber-700' : 
                                            'bg-slate-100 text-slate-600'
                                        }`}>
                                            {campaign.status}
                                        </span>
                                        {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.SALES?.edit) && (
                                            <button 
                                                onClick={() => handleEditClick(campaign)}
                                                className="text-slate-400 hover:text-indigo-600 transition-colors"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4 mb-4 pb-4 border-b border-slate-100">
                                    <div>
                                        <div className="text-[10px] text-slate-400 font-medium mb-0.5 flex items-center gap-1">
                                            <Users size={10} /> Leads Generated
                                        </div>
                                        <div className="text-lg font-bold text-slate-800">{campaign.lead_count}</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-slate-400 font-medium mb-0.5 flex items-center gap-1">
                                            <DollarSign size={10} /> Cost Per Lead
                                        </div>
                                        <div className="text-lg font-bold text-emerald-600">₹{campaign.cost_per_lead}</div>
                                    </div>
                                </div>

                                <div className="flex justify-between items-center text-[10px] text-slate-500">
                                    <div className="flex items-center gap-1">
                                        <Calendar size={12} className="text-slate-400" />
                                        {campaign.start_date ? new Date(campaign.start_date).toLocaleDateString() : 'No Start Date'}
                                    </div>
                                    <div className="font-medium">
                                        Budget: ₹{parseFloat(campaign.budget).toLocaleString()}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            {/* Create Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden"
                    >
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h3 className="font-bold text-slate-800">{editingCampaign ? 'Edit Campaign' : 'Create Campaign'}</h3>
                            <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveCampaign} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Campaign Name *</label>
                                <input 
                                    type="text" 
                                    required 
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500"
                                    value={formData.name}
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                    placeholder="e.g. Summer Bootcamp Meta Ads"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Platform</label>
                                    <select 
                                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500"
                                        value={formData.platform}
                                        onChange={e => setFormData({...formData, platform: e.target.value})}
                                    >
                                        <option value="FACEBOOK">Facebook Ads</option>
                                        <option value="GOOGLE">Google Ads</option>
                                        <option value="INSTAGRAM">Instagram Ads</option>
                                        <option value="LINKEDIN">LinkedIn Ads</option>
                                        <option value="WALKIN">Walk-in / Offline</option>
                                        <option value="OTHER">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                                    <select 
                                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500"
                                        value={formData.status}
                                        onChange={e => setFormData({...formData, status: e.target.value})}
                                    >
                                        <option value="ACTIVE">Active</option>
                                        <option value="PAUSED">Paused</option>
                                        <option value="COMPLETED">Completed</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Total Budget (₹)</label>
                                <input 
                                    type="number" 
                                    step="0.01"
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500"
                                    value={formData.budget}
                                    onChange={e => setFormData({...formData, budget: e.target.value})}
                                    placeholder="0.00"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
                                    <input 
                                        type="date" 
                                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500 text-slate-600"
                                        value={formData.start_date}
                                        onChange={e => setFormData({...formData, start_date: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">End Date</label>
                                    <input 
                                        type="date" 
                                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500 text-slate-600"
                                        value={formData.end_date}
                                        onChange={e => setFormData({...formData, end_date: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="pt-2">
                                <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-lg text-sm transition-colors">
                                    {editingCampaign ? 'Save Changes' : 'Create Campaign'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}

            {/* Webhooks Modal */}
            {isWebhooksModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white rounded-xl shadow-xl max-w-2xl w-full overflow-hidden"
                    >
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 className="font-bold text-slate-800">Zapier / Make.com Webhooks</h3>
                                <p className="text-[10px] text-slate-500 mt-0.5">Push leads directly into the CRM pipeline using these unique URLs.</p>
                            </div>
                            <button onClick={() => setIsWebhooksModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-6">
                            {webhooks.length === 0 ? (
                                <div className="text-center py-6 text-slate-500 text-sm">
                                    No webhooks configured yet. Admins can create Webhook Endpoints from the Django Admin panel.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {webhooks.map((hook) => (
                                        <div key={hook.id} className="p-4 border border-slate-200 rounded-lg bg-slate-50 relative group">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <h4 className="font-bold text-slate-800 text-sm">{hook.name}</h4>
                                                    <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-1">
                                                        <span className={`px-1.5 py-0.5 rounded ${hook.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                            {hook.is_active ? 'ACTIVE' : 'INACTIVE'}
                                                        </span>
                                                        Created: {new Date(hook.created_at).toLocaleDateString()}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="mt-3">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase">Webhook URL (POST)</label>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <code className="flex-1 block p-2 bg-slate-800 text-emerald-400 rounded text-[11px] overflow-x-auto whitespace-nowrap">
                                                        {hook.webhook_url}
                                                    </code>
                                                    <button 
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(hook.webhook_url);
                                                            alert("Webhook URL copied to clipboard!");
                                                        }}
                                                        className="px-3 py-2 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100 transition-colors text-xs font-bold"
                                                    >
                                                        Copy
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    
                                    <div className="mt-6 p-4 bg-indigo-50 border border-indigo-100 rounded-lg">
                                        <h4 className="font-bold text-indigo-900 text-sm mb-2">JSON Payload Format</h4>
                                        <p className="text-xs text-indigo-700 mb-3">Send a POST request to the webhook URL with this JSON body:</p>
                                        <pre className="text-[11px] bg-white p-3 rounded border border-indigo-100 text-slate-700 overflow-x-auto">
{`{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john.doe@example.com",
  "mobile": "9876543210",
  "campaign_id": 1, // Optional: Must match an ID from this Campaigns page
  "program_id": 1   // Optional: Maps to Program Type ID
}`}
                                        </pre>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
};

export default CRMCampaigns;
