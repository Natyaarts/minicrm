import { Bell, Search, UserCircle, HelpCircle, Settings, Menu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function Navbar({ onMenuClick }) {
    const { user } = useAuth();
    const displayName = user ? (user.first_name ? `${user.first_name} ${user.last_name}` : user.username) : 'Guest';
    const role = user?.role || 'User';

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
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <span className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-400 shadow-sm">⌘ K</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 md:gap-6">
                <div className="hidden sm:flex items-center gap-2">
                    <button className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-all relative group">
                        <HelpCircle size={22} />
                        <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">Support</span>
                    </button>
                    <button className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-all relative group">
                        <Bell size={22} />
                        <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
                    </button>
                    <button className="p-2 md:p-3 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-all relative group">
                        <Bell size={22} />
                        <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
                    </button>
                    <button className="hidden sm:block p-3 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-all relative group">
                        <Settings size={22} />
                    </button>
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
