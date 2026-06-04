import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import {
    LayoutDashboard,
    Users,
    UserSquare2,
    GraduationCap,
    BookOpen,
    ClipboardEdit,
    Settings,
    LogOut,
    Sparkles,
    Library,
    X,
    UserCircle,
    BarChart2,
    Building2,
    ChevronDown,
    ChevronRight,
    Briefcase,
    CalendarCheck,
    CalendarDays,
    Wallet,
    CheckSquare,
    Star
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

const sidebarSections = [
    {
        title: 'Academics',
        module: 'ACADEMIC_HIERARCHY',
        items: [
            { icon: LayoutDashboard, label: 'Dashboard', path: '/', module: 'COMMON' },
            { icon: BookOpen, label: 'Academic Hierarchy', path: '/academic', module: 'ACADEMIC_HIERARCHY' },
            { icon: ClipboardEdit, label: 'Coordinator Module', path: '/academic-coordinator', module: 'COORDINATOR' },
            { icon: BookOpen, label: 'Teacher Module', path: '/teacher', module: 'TEACHER' },
            { icon: Library, label: 'Courses', path: '/courses', module: 'COURSES' },
            { icon: BarChart2, label: 'Analytics', path: '/analytics', module: 'ANALYTICS' },
            { icon: CalendarDays, label: 'Master Calendar', path: '/calendar', module: 'COMMON' },
        ]
    },
    {
        title: 'CRM Module',
        module: 'SALES',
        items: [
            { icon: LayoutDashboard, label: 'Dashboard', path: '/crm/dashboard', module: 'SALES' },
            { icon: Sparkles, label: 'Campaigns', path: '/crm/campaigns', module: 'SALES' },
            { icon: Users, label: 'Pipeline', path: '/crm/pipeline', module: 'SALES' },
            { icon: ClipboardEdit, label: 'Leads Table', path: '/crm/leads', module: 'SALES' },
            { icon: CheckSquare, label: 'Tasks', path: '/crm/tasks', module: 'SALES' },
            { icon: GraduationCap, label: 'Mentor Module', path: '/mentor', module: 'MENTOR' },
            { icon: UserSquare2, label: 'Student Portal', path: '/student', module: 'STUDENT' },
            { icon: Sparkles, label: 'App Creator', path: '/crm/builder', module: 'ADMIN' },
        ]
    },
    {
        title: 'HRMS Module',
        module: 'WORKFORCE',
        items: [
            { icon: Building2, label: 'Workforce Hub', path: '/hrms', module: 'WORKFORCE' },
            { icon: CalendarCheck, label: 'Attendance', path: '/hrms/attendance', module: 'ATTENDANCE' },
            { icon: Wallet, label: 'Payroll', path: '/hrms/payroll', module: 'PAYROLL' },
            { icon: CalendarDays, label: 'Leave Management', path: '/hrms/leaves', module: 'LEAVES' },
            { icon: Briefcase, label: 'Asset Management', path: '/hrms/assets', module: 'WORKFORCE' },
            { icon: CheckSquare, label: 'Tasks', path: '/hrms/tasks', module: 'WORKFORCE' },
            { icon: Star, label: 'Performance Reviews', path: '/hrms/performance', module: 'WORKFORCE' },
            { icon: UserSquare2, label: 'Employee Lifecycle', path: '/hrms/lifecycle', module: 'WORKFORCE' },
        ]
    },
    {
        title: 'Administrative',
        module: 'ADMIN',
        items: [
            { icon: UserCircle, label: 'Staff Directory', path: '/users', module: 'STAFF_DIRECTORY' },
            { icon: Wallet, label: 'Finance Manager', path: '/finance', module: 'ADMIN' },
        ]
    }
];

function Sidebar({ isMobileMenuOpen, setIsMobileMenuOpen }) {
    const location = useLocation();
    const { user, logout } = useAuth();
    const [openSections, setOpenSections] = useState({
        Academics: true,
        'HRMS Module': true,
        Administrative: true
    });

    const toggleSection = (title) => {
        setOpenSections(prev => ({ ...prev, [title]: !prev[title] }));
    };

    const displayName = user ? (user.first_name ? `${user.first_name} ${user.last_name} ` : user.username) : 'Guest';
    const userRole = user?.role || 'User';

    const checkPermission = (item) => {
        if (!user) return false;
        if (user.role === 'SUPER_ADMIN' || user.is_superuser) return true;
        if (item.label === 'Dashboard' && user.role === 'STUDENT') return false;
        if (item.label === 'Teacher Module' && user.role === 'TEACHER') return true;
        if (item.label === 'Teacher Module' && user.role !== 'SUPER_ADMIN') return false;
        
        // Allow Employees to see relevant HRMS modules
        const employeeModules = ['Workforce Hub', 'Attendance', 'Leave Management', 'Tasks', 'Performance Reviews', 'Payroll', 'Asset Management', 'Employee Lifecycle'];
        if (employeeModules.includes(item.label) && user.role === 'EMPLOYEE') return true;

        if (item.module === 'COMMON') return true;

        const modulePerms = user.permissions?.[item.module];
        return modulePerms?.view === true;
    };

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
                "w-60 bg-slate-50 border-r border-slate-200 flex flex-col h-full z-50 font-sans transition-transform duration-300 ease-in-out",
                "fixed inset-y-0 left-0 md:relative md:translate-x-0",
                isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <div className="px-5 py-4 border-b border-slate-200/60 flex justify-between items-center bg-white relative z-10">
                    <Link to="/" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3">
                        <div className="h-10 w-auto flex items-center justify-center shrink-0">
                            <img src="/logo.png" alt="Logo" className="h-full w-auto object-contain" />
                        </div>
                        <div>
                            <h1 className="text-base font-bold text-slate-800 tracking-tight leading-none">
                                Natya<span className="text-rose-600">.</span>
                            </h1>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">ERP</p>
                        </div>
                    </Link>
                    <button
                        className="md:hidden p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                        onClick={() => setIsMobileMenuOpen(false)}
                    >
                        <X size={18} />
                    </button>
                </div>

                <nav className="flex-1 px-3 py-3 space-y-3 overflow-y-auto custom-scrollbar relative z-10">
                    {sidebarSections.map((section) => {
                        const filteredItems = section.items.filter(checkPermission);
                        if (filteredItems.length === 0) return null;

                        const isOpen = openSections[section.title];

                        return (
                            <div key={section.title} className="space-y-1">
                                <button
                                    onClick={() => toggleSection(section.title)}
                                    className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hover:text-rose-600 transition-colors group"
                                >
                                    <span>{section.title}</span>
                                    {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                </button>

                                <AnimatePresence initial={false}>
                                    {isOpen && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2, ease: "easeInOut" }}
                                            className="overflow-hidden space-y-0.5"
                                        >
                                            {filteredItems.map((item) => {
                                                const isActive = item.path === '/'
                                                    ? location.pathname === '/'
                                                    : (location.pathname === item.path || (location.pathname.startsWith(item.path + '/') && !filteredItems.some(sibling => sibling.path !== item.path && location.pathname.startsWith(sibling.path))));

                                                return (
                                                    <Link
                                                        key={item.path}
                                                        to={item.disabled ? '#' : item.path}
                                                        onClick={() => !item.disabled && setIsMobileMenuOpen(false)}
                                                        className={clsx(
                                                            "block relative",
                                                            item.disabled && "opacity-50 cursor-not-allowed"
                                                        )}
                                                    >
                                                        <div className={twMerge(
                                                            clsx(
                                                                "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-200 group font-semibold text-xs relative z-10",
                                                                isActive
                                                                    ? "text-white shadow-sm"
                                                                    : "text-slate-600 hover:bg-slate-200/50 hover:text-rose-700"
                                                            )
                                                        )}>
                                                            {isActive && (
                                                                <motion.div
                                                                    layoutId="sidebar-active-bg"
                                                                    className="absolute inset-0 bg-rose-600 rounded-lg -z-10"
                                                                    initial={false}
                                                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                                                />
                                                            )}

                                                            <item.icon
                                                                size={16}
                                                                className={clsx(
                                                                    "transition-colors duration-200",
                                                                    isActive ? "text-white" : "text-slate-400 group-hover:text-rose-500"
                                                                )}
                                                            />
                                                            <span className={isActive ? "text-white" : ""}>{item.label}</span>
                                                            {item.disabled && (
                                                                <span className="ml-auto text-[8px] font-bold bg-slate-100 text-slate-400 px-1 py-0.5 rounded uppercase">Soon</span>
                                                            )}
                                                        </div>
                                                    </Link>
                                                );
                                            })}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </nav>

                <div className="p-3 border-t border-slate-200 bg-white relative z-10 space-y-3">
                    <div className="flex items-center gap-2.5 px-2">
                        <div className="w-8 h-8 rounded-full bg-rose-500 shrink-0">
                            <img
                                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=ffffff&color=be123c&bold=true`}
                                className="w-full h-full rounded-full"
                                alt="Profile"
                            />
                        </div >
                        <div className="overflow-hidden">
                            <h4 className="text-xs font-bold text-slate-800 truncate leading-none">{displayName}</h4>
                            <p className="text-[9px] font-semibold text-slate-400 truncate uppercase tracking-wider mt-1">{userRole.replace('_', ' ')}</p>
                        </div>
                    </div >
                    <button
                        onClick={logout}
                        className="flex items-center justify-center gap-1.5 w-full py-1.5 bg-slate-50 hover:bg-rose-50 hover:text-rose-600 border border-slate-100 hover:border-rose-100 rounded-lg text-[10px] font-semibold text-slate-600 transition-colors shadow-sm"
                    >
                        <LogOut size={12} />
                        Disconnect
                    </button>
                </div>
            </aside>
        </>
    );
}

export default Sidebar;
