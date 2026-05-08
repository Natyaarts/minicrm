import { Bell, Search, UserCircle, HelpCircle, Menu, GraduationCap, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import NotificationCenter from './NotificationCenter';
import api from '../api/axios';

function Navbar({ onMenuClick }) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState({ students: [], batches: [], courses: [] });
    const [showResults, setShowResults] = useState(false);

    const displayName = user ? (user.first_name ? `${user.first_name} ${user.last_name}` : user.username) : 'Guest';
    const role = user?.role || 'User';

    useEffect(() => {
        const handleSearch = async () => {
            if (searchQuery.length < 2) {
                setSearchResults({ students: [], batches: [], courses: [] });
                return;
            }

            try {
                const [sRes, bRes, cRes] = await Promise.all([
                    api.get(`students/?search=${searchQuery}`),
                    api.get(`batches/?search=${searchQuery}`),
                    api.get(`courses/?search=${searchQuery}`)
                ]);

                setSearchResults({
                    students: sRes.data.results || sRes.data,
                    batches: bRes.data.results || bRes.data,
                    courses: cRes.data.results || cRes.data
                });
                setShowResults(true);
            } catch (err) {
                console.error("Search failed", err);
            }
        };

        const timer = setTimeout(handleSearch, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    return (
        <header className="h-16 md:h-20 bg-white/90 backdrop-blur-xl border-b border-slate-100 flex items-center justify-between px-4 md:px-8 z-10 sticky top-0 transition-all">
            <div className="flex items-center gap-2 md:gap-4 flex-1">
                {/* Mobile Menu Toggle */}
                <button
                    className="md:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                    onClick={onMenuClick}
                >
                    <Menu size={24} />
                </button>

                <div className="relative w-full max-w-lg group hidden sm:block">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
                    <input
                        type="text"
                        placeholder="Search students, batches, or courses..."
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-transparent rounded-2xl text-slate-700 placeholder-slate-400 focus:bg-white focus:border-indigo-100 focus:shadow-lg focus:shadow-indigo-100/50 focus:outline-none focus:ring-0 transition-all font-medium"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => setShowResults(true)}
                    />

                    {showResults && searchQuery.length >= 2 && (
                        <div className="absolute top-full left-0 w-full mt-2 bg-white border border-slate-100 rounded-3xl shadow-2xl p-4 z-50 animate-fadeIn overflow-hidden">
                            <div className="max-h-[70vh] overflow-y-auto custom-scrollbar space-y-4">
                                {searchResults.students.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 ml-2 flex items-center gap-2">
                                            <Users size={12} /> Students
                                        </p>
                                        <div className="space-y-1">
                                            {searchResults.students.slice(0, 5).map(s => (
                                                <button
                                                    key={s.id}
                                                    onClick={() => { navigate(`/sales?id=${s.id}`); setShowResults(false); setSearchQuery(''); }}
                                                    className="w-full text-left p-3 hover:bg-slate-50 rounded-2xl flex items-center justify-between group transition-colors"
                                                >
                                                    <div>
                                                        <p className="font-bold text-slate-700">{s.first_name} {s.last_name}</p>
                                                        <p className="text-xs text-slate-400">{s.crm_student_id}</p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {searchResults.batches.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 ml-2 flex items-center gap-2">
                                            <GraduationCap size={12} /> Batches
                                        </p>
                                        <div className="space-y-1">
                                            {searchResults.batches.slice(0, 3).map(b => (
                                                <button
                                                    key={b.id}
                                                    onClick={() => { navigate(`/mentor`); setShowResults(false); setSearchQuery(''); }}
                                                    className="w-full text-left p-3 hover:bg-slate-50 rounded-2xl flex items-center justify-between group transition-colors"
                                                >
                                                    <div>
                                                        <p className="font-bold text-slate-700">{b.name}</p>
                                                        <p className="text-xs text-slate-400">{b.course_name}</p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {searchResults.students.length === 0 && searchResults.batches.length === 0 && (
                                    <div className="p-8 text-center">
                                        <p className="text-sm font-bold text-slate-400">No results found for "{searchQuery}"</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2 md:gap-6">
                <div className="hidden sm:flex items-center gap-2">
                    <button className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-all relative group">
                        <HelpCircle size={22} />
                        <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">Support</span>
                    </button>

                    <NotificationCenter />

                </div>

                <div className="h-8 w-[1px] bg-slate-200 mx-1 md:mx-2 hidden sm:block"></div>

                <div className="flex items-center gap-3 cursor-pointer group">
                    <div className="text-right hidden md:block">
                        <p className="text-sm font-bold text-slate-700 group-hover:text-indigo-600 transition-colors">{displayName}</p>
                        <p className="text-xs text-slate-400 font-medium">{role}</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden ring-2 ring-transparent group-hover:ring-indigo-100 transition-all">
                        <UserCircle size={40} className="w-full h-full text-slate-400" />
                    </div>
                </div>
            </div>
        </header>
    );
}

export default Navbar;
