import React, { useState, useEffect } from 'react';
import { Sparkles, X, Heart, PartyPopper, MessageSquare, Send } from 'lucide-react';
import api from '../api/axios';

const THEME_STYLES = {
  ONAM: { bg: 'from-amber-500 via-orange-500 to-yellow-400', badge: 'Onam Wishes 🌾🌸', icon: '🌸', accent: 'bg-amber-500' },
  DIWALI: { bg: 'from-purple-900 via-indigo-800 to-amber-500', badge: 'Diwali Mubarak 🪔✨', icon: '🪔', accent: 'bg-indigo-600' },
  NEW_YEAR: { bg: 'from-blue-900 via-slate-900 to-indigo-900', badge: 'Happy New Year 🎉🥂', icon: '🎉', accent: 'bg-blue-600' },
  CHRISTMAS: { bg: 'from-emerald-800 via-green-900 to-red-700', badge: 'Merry Christmas 🎄⭐', icon: '🎄', accent: 'bg-emerald-600' },
  EID: { bg: 'from-emerald-900 via-teal-800 to-amber-400', badge: 'Eid Mubarak 🌙✨', icon: '🌙', accent: 'bg-teal-600' },
  BIRTHDAY: { bg: 'from-pink-500 via-rose-500 to-purple-600', badge: 'Happy Birthday 🎂🎈', icon: '🎂', accent: 'bg-pink-600' },
  HOLI: { bg: 'from-fuchsia-600 via-pink-500 to-amber-400', badge: 'Happy Holi 🎨✨', icon: '🎨', accent: 'bg-fuchsia-600' },
  COMPANY_MILESTONE: { bg: 'from-blue-600 via-indigo-600 to-violet-700', badge: 'Milestone Celebration 🏆🚀', icon: '🏆', accent: 'bg-blue-600' },
  CUSTOM: { bg: 'from-slate-800 via-slate-900 to-gray-900', badge: 'Special Announcement 🌟', icon: '🌟', accent: 'bg-slate-800' }
};

export default function FestiveGreetingModal() {
  const [greeting, setGreeting] = useState(null);
  const [visible, setVisible] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    fetchActiveGreeting();
  }, []);

  const fetchActiveGreeting = async () => {
    try {
      const res = await api.get('hrms/festive-greetings/active/');
      const list = Array.isArray(res.data) ? res.data : (res.data?.results || []);
      if (list.length > 0) {
        const activeItem = list[0];
        setGreeting(activeItem);
        setComments(activeItem.comments || []);
        const dismissedId = localStorage.getItem(`festive_dismissed_${activeItem.id}`);
        if (!dismissedId) {
          setVisible(true);
        }
      }
    } catch (err) {
      console.log('No active festive greeting:', err);
    }
  };

  const handleDismiss = () => {
    if (greeting) {
      localStorage.setItem(`festive_dismissed_${greeting.id}`, 'true');
    }
    setVisible(false);
  };

  const handlePostWish = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !greeting) return;
    try {
      setPosting(true);
      const res = await api.post('hrms/festive-greeting-comments/', {
        greeting: greeting.id,
        content: newComment
      });
      setComments(prev => [...prev, res.data]);
      setNewComment('');
    } catch (err) {
      console.error('Failed to post wish:', err);
    } finally {
      setPosting(false);
    }
  };

  if (!visible || !greeting) return null;

  const style = THEME_STYLES[greeting.theme] || THEME_STYLES.CUSTOM;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-white/20 relative flex flex-col max-h-[90vh]">
        {/* Close Button */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 z-20 w-9 h-9 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Banner Area */}
        <div className={`h-52 bg-gradient-to-r ${style.bg} p-6 text-white relative flex flex-col justify-end overflow-hidden shrink-0`}>
          {greeting.banner_image ? (
            <img src={greeting.banner_image} alt={greeting.title} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute top-6 right-6 text-7xl opacity-30 animate-pulse">{style.icon}</div>
          )}

          <div className="relative z-10">
            <span className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-md px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider text-white mb-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              {style.badge}
            </span>
            <h2 className="text-2xl font-black drop-shadow-md leading-tight">{greeting.title}</h2>
            {greeting.sub_title && (
              <p className="text-xs text-white/90 font-medium drop-shadow mt-0.5">{greeting.sub_title}</p>
            )}
          </div>
        </div>

        {/* Content & Wishes Container */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <p className="text-sm text-slate-700 leading-relaxed font-medium">
              "{greeting.message}"
            </p>
          </div>

          {/* Public Wishes Thread */}
          <div>
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">
              Public Team Wishes & Messages ({comments.length})
            </h4>

            <div className="space-y-2 mb-4 max-h-40 overflow-y-auto pr-1">
              {comments.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No wishes posted yet. Be the first to wish them!</p>
              ) : (
                comments.map((c, idx) => (
                  <div key={c.id || idx} className="bg-amber-50/60 p-3 rounded-xl border border-amber-100/80">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-amber-900">{c.author_name || 'Team Member'}</span>
                      <span className="text-[10px] text-amber-600 font-medium">{new Date(c.created_at || Date.now()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <p className="text-xs text-slate-700 font-medium">{c.content}</p>
                  </div>
                ))
              )}
            </div>

            {/* Send Wish Form */}
            <form onSubmit={handlePostWish} className="flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Type your birthday wish or message..."
                className="flex-1 bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                type="submit"
                disabled={posting || !newComment.trim()}
                className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-4 py-2 rounded-xl text-xs transition disabled:opacity-50 flex items-center gap-1 shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Wish 🎂</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
