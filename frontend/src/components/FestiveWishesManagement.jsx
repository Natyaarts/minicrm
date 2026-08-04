import React, { useState, useEffect } from 'react';
import { Sparkles, Calendar, Image as ImageIcon, Send, Trash2, CheckCircle2, AlertCircle, Eye, RefreshCw, Layers, MessageSquare } from 'lucide-react';
import api from '../api/axios';

const THEME_PRESETS = [
  { id: 'ONAM', name: 'Onam Festival 🌾🌸', bg: 'from-amber-500 via-orange-500 to-yellow-400', bannerBg: '#FEF3C7', textColor: '#92400E', icon: '🌸' },
  { id: 'DIWALI', name: 'Diwali Festival 🪔✨', bg: 'from-purple-900 via-indigo-800 to-amber-500', bannerBg: '#EEF2FF', textColor: '#3730A3', icon: '🪔' },
  { id: 'NEW_YEAR', name: 'New Year 🎉🥂', bg: 'from-blue-900 via-slate-900 to-indigo-900', bannerBg: '#E0F2FE', textColor: '#075985', icon: '🎉' },
  { id: 'CHRISTMAS', name: 'Christmas 🎄⭐', bg: 'from-emerald-800 via-green-900 to-red-700', bannerBg: '#DCFCE7', textColor: '#166534', icon: '🎄' },
  { id: 'EID', name: 'Eid Mubarak 🌙✨', bg: 'from-emerald-900 via-teal-800 to-amber-400', bannerBg: '#CCFBF1', textColor: '#115E59', icon: '🌙' },
  { id: 'BIRTHDAY', name: 'Birthday Wish 🎂🎈', bg: 'from-pink-500 via-rose-500 to-purple-600', bannerBg: '#FCE7F3', textColor: '#9D174D', icon: '🎂' },
  { id: 'HOLI', name: 'Holi Colors 🎨✨', bg: 'from-fuchsia-600 via-pink-500 to-amber-400', bannerBg: '#FEE2E2', textColor: '#991B1B', icon: '🎨' },
  { id: 'COMPANY_MILESTONE', name: 'Company Milestone 🏆🚀', bg: 'from-blue-600 via-indigo-600 to-violet-700', bannerBg: '#EFF6FF', textColor: '#1E40AF', icon: '🏆' },
  { id: 'CUSTOM', name: 'Custom Festival / Announcement 🌟', bg: 'from-slate-800 via-slate-900 to-gray-900', bannerBg: '#F3F4F6', textColor: '#1F2937', icon: '🌟' },
];

export default function FestiveWishesManagement() {
  const [greetings, setGreetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [previewGreeting, setPreviewGreeting] = useState(null);

  const [formData, setFormData] = useState({
    title: '',
    sub_title: '',
    message: '',
    theme: 'ONAM',
    target_audience: 'ALL',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    is_active: true,
    banner_image: null,
    banner_preview: ''
  });

  useEffect(() => {
    fetchGreetings();
  }, []);

  const fetchGreetings = async () => {
    try {
      setLoading(true);
      const res = await api.get('hrms/festive-greetings/');
      const list = Array.isArray(res.data) ? res.data : (res.data?.results || []);
      setGreetings(list);
    } catch (err) {
      console.error('Failed to fetch festive greetings:', err);
      setGreetings([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData({
        ...formData,
        banner_image: file,
        banner_preview: URL.createObjectURL(file)
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const form = new FormData();
      form.append('title', formData.title);
      form.append('sub_title', formData.sub_title);
      form.append('message', formData.message);
      form.append('theme', formData.theme);
      form.append('target_audience', formData.target_audience);
      form.append('start_date', formData.start_date);
      if (formData.end_date) form.append('end_date', formData.end_date);
      form.append('is_active', formData.is_active);
      if (formData.banner_image) {
        form.append('banner_image', formData.banner_image);
      }

      await api.post('hrms/festive-greetings/', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setShowModal(false);
      setFormData({
        title: '',
        sub_title: '',
        message: '',
        theme: 'ONAM',
        target_audience: 'ALL',
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        is_active: true,
        banner_image: null,
        banner_preview: ''
      });
      fetchGreetings();
    } catch (err) {
      console.error('Failed to save festive greeting:', err);
      alert('Failed to save festive greeting: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id, currentStatus) => {
    try {
      await api.patch(`hrms/festive-greetings/${id}/`, { is_active: !currentStatus });
      fetchGreetings();
    } catch (err) {
      console.error('Failed to toggle status:', err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this festive greeting?')) return;
    try {
      await api.delete(`hrms/festive-greetings/${id}/`);
      fetchGreetings();
    } catch (err) {
      console.error('Failed to delete greeting:', err);
    }
  };

  const selectedThemePreset = THEME_PRESETS.find(t => t.id === formData.theme) || THEME_PRESETS[0];

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-amber-500" />
            HR Festive Wishes & Special Day Greetings
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Broadcast theme posters, festival greetings (Onam, Diwali, New Year), and special announcements across Web & Mobile apps!
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-amber-500/20 hover:from-amber-600 hover:to-orange-700 transition"
        >
          <Sparkles className="w-5 h-5" />
          + Create Festive Wish / Banner
        </button>
      </div>

      {/* Grid of Existing Wishes */}
      {loading ? (
        <div className="flex justify-center items-center h-48">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
        </div>
      ) : greetings.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm max-w-2xl mx-auto">
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
            🌾
          </div>
          <h3 className="text-lg font-bold text-slate-800">No Festive Greetings Created Yet</h3>
          <p className="text-sm text-slate-500 mt-1 mb-6">
            Create festive wishes for special occasions like Onam, Diwali, New Year, or Birthdays to greet all employees & students when they open the CRM!
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="bg-amber-500 text-white font-bold px-6 py-2.5 rounded-xl hover:bg-amber-600 transition"
          >
            Create First Festive Wish
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {greetings.map((g) => {
            const themeObj = THEME_PRESETS.find(t => t.id === g.theme) || THEME_PRESETS[0];
            return (
              <div key={g.id} className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-md transition flex flex-col">
                {/* Banner Preview Header */}
                <div className={`h-40 bg-gradient-to-r ${themeObj.bg} p-6 relative flex flex-col justify-end text-white overflow-hidden`}>
                  {g.banner_image ? (
                    <img src={g.banner_image} alt={g.title} className="absolute inset-0 w-full h-full object-cover opacity-60" />
                  ) : (
                    <div className="absolute top-3 right-3 text-5xl opacity-40">{themeObj.icon}</div>
                  )}
                  <div className="relative z-10">
                    <span className="inline-block bg-white/20 backdrop-blur-md text-white text-xs font-extrabold px-2.5 py-1 rounded-full mb-2">
                      {themeObj.name}
                    </span>
                    <h3 className="text-xl font-black drop-shadow-md">{g.title}</h3>
                    {g.sub_title && <p className="text-xs text-white/90 drop-shadow line-clamp-1">{g.sub_title}</p>}
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <p className="text-xs text-slate-600 line-clamp-3 mb-4 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                      "{g.message}"
                    </p>

                    <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500 mb-4">
                      <span className="bg-slate-100 px-2.5 py-1 rounded-md flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {g.start_date} {g.end_date ? `to ${g.end_date}` : '(Ongoing)'}
                      </span>
                      <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-md border border-amber-200">
                        Audience: {g.target_audience}
                      </span>
                    </div>
                  </div>

                  {/* Comments Summary Pill */}
                  {g.comments && g.comments.length > 0 ? (
                    <div className="mb-4 bg-gradient-to-r from-amber-50 to-orange-50 p-3 rounded-2xl border border-amber-200/80 shadow-xs">
                      <div className="flex items-center justify-between text-xs font-black text-amber-900 mb-2">
                        <span className="flex items-center gap-1.5">
                          <MessageSquare className="w-4 h-4 text-amber-600" />
                          💬 {g.comments.length} Team Wishes Received
                        </span>
                      </div>
                      <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                        {g.comments.slice(-4).map((c, cIdx) => (
                          <div key={c.id || cIdx} className="text-xs text-slate-800 bg-white p-2 rounded-xl border border-amber-100/90 shadow-2xs flex justify-between items-center">
                            <span className="font-bold text-amber-950">{c.author_name}: <span className="font-normal text-slate-700">{c.content}</span></span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                      <span className="text-xs text-slate-400 font-medium italic">No team wishes posted yet</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <button
                      onClick={() => toggleActive(g.id, g.is_active)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                        g.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <CheckCircle2 className={`w-3.5 h-3.5 ${g.is_active ? 'text-emerald-600' : 'text-slate-400'}`} />
                      {g.is_active ? 'Active' : 'Inactive'}
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPreviewGreeting(g)}
                        className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition flex items-center gap-1 text-xs font-bold"
                        title="Preview"
                      >
                        <Eye className="w-4 h-4" />
                        <span>Preview</span>
                      </button>
                      <button
                        onClick={() => handleDelete(g.id)}
                        className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden border border-slate-100 my-8">
            <div className="bg-slate-900 text-white p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-500/20 text-amber-400 rounded-xl flex items-center justify-center text-xl font-bold">
                  🌸
                </div>
                <div>
                  <h3 className="text-lg font-extrabold">Create Festive Wish / HR Banner</h3>
                  <p className="text-xs text-slate-400">Configure theme, poster image, and greetings for employees & students</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white font-bold text-xl">
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2">
              {/* Form Input */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto border-r border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Select Theme</label>
                  <select
                    value={formData.theme}
                    onChange={(e) => setFormData({ ...formData, theme: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none"
                  >
                    {THEME_PRESETS.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Happy Onam! 🌸🌾"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Sub-Title / Tagline</label>
                  <input
                    type="text"
                    placeholder="e.g. Wishing you prosperity, peace and happiness!"
                    value={formData.sub_title}
                    onChange={(e) => setFormData({ ...formData, sub_title: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm font-medium text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Detailed Message</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Enter your detailed HR festival wish to all staff and students..."
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Upload Theme Poster / Banner Image</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Start Date</label>
                    <input
                      type="date"
                      required
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-semibold text-slate-800 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">End Date (Optional)</label>
                    <input
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-semibold text-slate-800 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Target Audience</label>
                  <select
                    value={formData.target_audience}
                    onChange={(e) => setFormData({ ...formData, target_audience: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none"
                  >
                    <option value="ALL">All Users & Students</option>
                    <option value="EMPLOYEES">All Staff & Employees</option>
                    <option value="SALES">Sales Team</option>
                    <option value="MENTORS">Mentors & Academic Staff</option>
                    <option value="STUDENTS">Students Only</option>
                  </select>
                </div>

                <div className="pt-3 flex gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-amber-500/20 hover:from-amber-600 hover:to-orange-700 transition flex items-center justify-center gap-2"
                  >
                    {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    {saving ? 'Publishing...' : 'Publish Festive Greeting'}
                  </button>
                </div>
              </form>

              {/* Live Card Preview */}
              <div className="p-6 bg-slate-50 flex flex-col justify-center items-center">
                <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-3">Live Banner Preview</span>
                
                <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
                  <div className={`h-48 bg-gradient-to-r ${selectedThemePreset.bg} p-6 text-white relative flex flex-col justify-end overflow-hidden`}>
                    {formData.banner_preview ? (
                      <img src={formData.banner_preview} alt="Poster" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <div className="absolute top-4 right-4 text-6xl opacity-30">{selectedThemePreset.icon}</div>
                    )}
                    <div className="relative z-10">
                      <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-extrabold text-white mb-2 inline-block">
                        {selectedThemePreset.name}
                      </span>
                      <h4 className="text-2xl font-black">{formData.title || 'Happy Festive Season! 🌸'}</h4>
                      <p className="text-xs text-white/90 font-medium mt-0.5">{formData.sub_title || 'Wishing you and your family infinite joy!'}</p>
                    </div>
                  </div>

                  <div className="p-5">
                    <p className="text-xs text-slate-600 leading-relaxed mb-5">
                      {formData.message || 'May this festival bring good health, prosperity, and happiness to your home!'}
                    </p>
                    <button className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black py-2.5 rounded-xl shadow-md text-xs uppercase tracking-wider flex items-center justify-center gap-1.5">
                      <span>Celebrate & Wish Back 🎉</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full Screen Preview Modal */}
      {previewGreeting && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in duration-200">
            <button
              onClick={() => setPreviewGreeting(null)}
              className="absolute top-4 right-4 z-20 w-8 h-8 bg-black/40 text-white rounded-full flex items-center justify-center font-bold"
            >
              ✕
            </button>
            <div className={`h-56 bg-gradient-to-r ${THEME_PRESETS.find(t => t.id === previewGreeting.theme)?.bg || 'from-amber-500 to-orange-500'} p-6 text-white relative flex flex-col justify-end overflow-hidden`}>
              {previewGreeting.banner_image && (
                <img src={previewGreeting.banner_image} alt={previewGreeting.title} className="absolute inset-0 w-full h-full object-cover" />
              )}
              <div className="relative z-10">
                <h3 className="text-3xl font-black drop-shadow-md">{previewGreeting.title}</h3>
                {previewGreeting.sub_title && <p className="text-sm text-white/90 font-medium drop-shadow mt-1">{previewGreeting.sub_title}</p>}
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-700 leading-relaxed mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                {previewGreeting.message}
              </p>
              <button
                onClick={() => setPreviewGreeting(null)}
                className="w-full bg-amber-500 text-white font-extrabold py-3 rounded-xl shadow-lg hover:bg-amber-600 transition"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
