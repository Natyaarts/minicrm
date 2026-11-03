import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import FestiveGreetingModal from './FestiveGreetingModal';
import Forbidden from '../pages/Forbidden';              // NEW
import { onForbidden } from '../auth/forbiddenBus';      // NEW

function Layout() {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [blocked, setBlocked] = useState(false);       // NEW
    const [toast, setToast] = useState('');              // NEW
    const { pathname } = useLocation();                  // NEW

    // Reset the 403 screen whenever the user navigates to another page
    useEffect(() => {
        setBlocked(false);
    }, [pathname]);

    // Listen for 403s emitted by the axios interceptor
    useEffect(() => {
        return onForbidden(({ method }) => {
            if (method === 'get') {
                setBlocked(true);                        // page data denied: show 403 page
            } else {
                setToast('You do not have permission to perform this action.');
                setTimeout(() => setToast(''), 4000);
            }
        });
    }, []);

    return (
        <div className="flex h-screen w-full bg-slate-50 text-slate-900 font-sans overflow-hidden">
            <Sidebar isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} />
            <div className="flex-1 flex flex-col min-w-0 w-full overflow-hidden relative">
                <Navbar onMenuClick={() => setIsMobileMenuOpen(true)} />
                <main className="flex-1 w-full overflow-x-hidden overflow-y-auto p-4 md:p-6 bg-slate-50/50">
                    {blocked ? <Forbidden /> : <Outlet />}
                </main>
            </div>
            <FestiveGreetingModal />

            {/* Simple permission toast (replace with your toast library if you have one) */}
            {toast && (
                <div className="fixed bottom-6 right-6 z-[100] bg-red-600 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-lg">
                    {toast}
                </div>
            )}
        </div>
    );
}

export default Layout;