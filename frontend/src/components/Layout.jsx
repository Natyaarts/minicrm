import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

function Layout() {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    return (
        <div className="flex h-screen w-full bg-slate-50 text-slate-900 font-sans overflow-hidden">
            <Sidebar isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} />
            <div className="flex-1 flex flex-col min-w-0 w-full overflow-hidden relative">
                <Navbar onMenuClick={() => setIsMobileMenuOpen(true)} />
                <main className="flex-1 w-full overflow-x-hidden overflow-y-auto p-4 md:p-6 bg-slate-50/50">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}

export default Layout;
