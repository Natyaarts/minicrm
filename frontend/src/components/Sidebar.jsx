import { Link, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    UserSquare2,
    GraduationCap,
    BookOpen,
    Settings,
    LogOut,
    Sparkles,
    Library,
    X,
    UserCircle,
    BarChart2
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';

const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/', module: 'COMMON' },
    { icon: Users, label: 'Sales/Leads', path: '/sales', module: 'SALES' },
    { icon: GraduationCap, label: 'Mentor Module', path: '/mentor', module: 'MENTOR' },
    { icon: UserSquare2, label: 'Student Portal', path: '/student', module: 'STUDENT' },
    { icon: BookOpen, label: 'Academic', path: '/academic', module: 'ACADEMIC' },
    { icon: Library, label: 'Courses', path: '/courses', module: 'ACADEMIC' },
    { icon: BarChart2, label: 'Analytics', path: '/analytics', module: 'ANALYTICS' },
    { icon: UserCircle, label: 'Staff Directory', path: '/users', module: 'ADMIN' },
    { icon: Settings, label: 'Admin Panel', path: '/admin', module: 'ADMIN' },
];

function Sidebar({ isMobileMenuOpen, setIsMobileMenuOpen }) {
    const location = useLocation();
    const { user, logout } = useAuth();

    const displayName = user ? (user.first_name ? `${user.first_name} ${user.last_name} ` : user.username) : 'Guest';
    const displayEmail = user?.email || 'No Email';
    const userRole = user?.role || 'User';

    // Filter menu items based on permissions
    const filteredMenuItems = menuItems.filter(item => {
        if (!user) return false;
        if (user.role === 'SUPER_ADMIN' || user.is_superuser) return true;
        if (item.module === 'COMMON') return true;

        const modulePerms = user.permissions?.[item.module];
        return modulePerms?.view === true;
    });

    return (
        <>
            {/* Mobile Overlay */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            <aside className={clsx(
                "w-72 bg-[#FFFBF7]/90 backdrop-blur-2xl border-r border-white/50 flex flex-col h-full shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] z-50 font-sans relative overflow-hidden transition-transform duration-300 ease-in-out",
                "fixed inset-y-0 left-0 md:relative md:translate-x-0",
                isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                {/* Subtle Gradient Orbs for atmosphere (Natya Themes: Rose/Amber) */}
                <div className="absolute -top-20 -left-20 w-64 h-64 bg-rose-200/40 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-amber-200/40 rounded-full blur-3xl pointer-events-none" />

                <div className="p-8 relative z-10 flex justify-between items-center">
                    <Link to="/" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 mb-1 group">
                        <div className="w-10 h-10 bg-gradient-to-br from-rose-600 to-amber-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-rose-200 group-hover:scale-105 transition-transform duration-300">
                            <Sparkles size={20} fill="currentColor" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none group-hover:text-rose-600 transition-colors">
                                Natya<span className="text-rose-600">.</span>
                            </h1>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 group-hover:text-amber-500 transition-colors">CRM Suite</p>
                        </div>
                    </Link>
                    <button
                        className="md:hidden p-2 text-slate-400 hover:text-slate-700 hover:bg-white rounded-xl transition-colors"
                        onClick={() => setIsMobileMenuOpen(false)}
                    >
                        <X size={24} />
                    </button>
                </div>

                <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto custom-scrollbar relative z-10">
                    <div className="px-4 mb-3">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest opacity-70">Navigation</p>
                    </div>
                    {filteredMenuItems.map((item) => {
                        // Smart Active Check
                        const isActive = item.path === '/'
                            ? location.pathname === '/'
                            : (location.pathname === item.path || location.pathname.startsWith(item.path + '/'));

                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="block relative"
                            >
                                <div className={twMerge(
                                    clsx(
                                        "flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-300 group font-bold text-sm relative z-10",
                                        isActive
                                            ? "text-white shadow-lg shadow-rose-200"
                                            : "text-slate-500 hover:bg-white/60 hover:shadow-sm hover:text-rose-700"
                                    )
                                )}>
                                    {/* Active Background Gradient (Rose/Amber) */}
                                    {isActive && (
                                        <motion.div
                                            layoutId="sidebar-active-bg"
                                            className="absolute inset-0 bg-gradient-to-r from-rose-600 to-rose-500 rounded-2xl -z-10"
                                            initial={false}
                                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                        />
                                    )}

                                    <item.icon
                                        size={20}
                                        className={clsx(
                                            "transition-colors duration-300",
                                            isActive ? "text-white" : "text-slate-400 group-hover:text-rose-500"
                                        )}
                                    />
                                    <span className={isActive ? "text-white" : ""}>{item.label}</span>
                                </div>
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 relative z-10">
                    <div className="bg-white/60 backdrop-blur-md p-4 rounded-3xl border border-white shadow-sm hover:shadow-md transition-all duration-300 group">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full p-0.5 bg-gradient-to-tr from-rose-500 to-amber-500">
                                <img
                                    src={`https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=ffffff&color=be123c&bold=true`}
                                    className="w-full h-full rounded-full border-2 border-white"
                                    alt="Profile"
                                />
                            </div >
                            <div className="overflow-hidden">
                                <h4 className="text-sm font-black text-slate-800 truncate">{displayName}</h4>
                                <p className="text-[10px] font-bold text-slate-400 truncate uppercase tracking-widest mt-0.5">{userRole.replace('_', ' ')}</p>
                            </div>
                        </div >
                        <button
                            onClick={logout}
                            className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 border border-transparent hover:border-rose-100 rounded-xl text-xs font-bold text-slate-600 transition-all duration-200"
                        >
                            <LogOut size={14} strokeWidth={2.5} />
                            Disconnect
                        </button>
                    </div >
                </div >
            </aside >
        </>
    );
}

export default Sidebar;
