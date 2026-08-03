import React, { useState, useEffect } from 'react';
import { Sparkles, X, Heart, PartyPopper } from 'lucide-react';
import api from '../api';

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
  const [wished, setWished] = useState(false);

  useEffect(() => {
    fetchActiveGreeting();
  }, []);

  const fetchActiveGreeting = async () => {
    try {
      const res = await api.get('hrms/festive-greetings/active/');
      if (res.data && res.data.length > 0) {
        const activeItem = res.data[0];
        // Check if user already dismissed this specific greeting today
        const dismissedId = localStorage.getItem(`festive_dismissed_${activeItem.id}`);
        if (!dismissedId) {
          setGreeting(activeItem);
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

  const handleWishBack = () => {
    setWished(true);
    setTimeout(() => {
      handleDismiss();
    }, 2000);
  };

  if (!visible || !greeting) return null;

  const style = THEME_STYLES[greeting.theme] || THEME_STYLES.CUSTOM;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-white/20 relative">
        {/* Close Button */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 z-20 w-9 h-9 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Banner Area */}
        <div className={`h-64 bg-gradient-to-r ${style.bg} p-8 text-white relative flex flex-col justify-end overflow-hidden`}>
          {greeting.banner_image ? (
            <img src={greeting.banner_image} alt={greeting.title} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute top-6 right-6 text-7xl opacity-30 animate-pulse">{style.icon}</div>
          )}

          <div className="relative z-10">
            <span className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-md px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider text-white mb-3">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              {style.badge}
            </span>
            <h2 className="text-3xl font-black drop-shadow-md leading-tight">{greeting.title}</h2>
            {greeting.sub_title && (
              <p className="text-sm text-white/90 font-medium drop-shadow mt-1">{greeting.sub_title}</p>
            )}
          </div>
        </div>

        {/* Content & Wishes */}
        <div className="p-6">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-6">
            <p className="text-sm text-slate-700 leading-relaxed text-center font-medium">
              "{greeting.message}"
            </p>
          </div>

          {wished ? (
            <div className="bg-emerald-50 text-emerald-800 font-bold p-4 rounded-2xl text-center border border-emerald-200 flex items-center justify-center gap-2 animate-bounce">
              <PartyPopper className="w-5 h-5 text-emerald-600" />
              <span>Thank you! Happy Celebrations to you too! 🎉🌸</span>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={handleWishBack}
                className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-black py-3 rounded-2xl shadow-lg shadow-amber-500/25 transition text-sm flex items-center justify-center gap-2"
              >
                <Heart className="w-4 h-4 fill-white" />
                <span>Celebrate & Wish Back 🎉</span>
              </button>

              <button
                onClick={handleDismiss}
                className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-2xl text-xs transition"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
