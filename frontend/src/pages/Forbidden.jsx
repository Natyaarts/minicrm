// src/pages/Forbidden.jsx
import { Link } from 'react-router-dom';

export default function Forbidden() {
    return (
        <div className="flex items-center justify-center h-full min-h-[60vh]">
            <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 shadow-sm max-w-md w-full">
                <h1 className="text-6xl font-black text-slate-800">403</h1>
                <h2 className="text-lg font-bold text-slate-800 mt-2">Access Forbidden</h2>
                <p className="text-sm text-slate-500 mt-2">
                    You don't have permission to view this page.
                </p>
                <Link
                    to="/"
                    className="inline-block mt-6 bg-amber-500 text-white font-bold px-6 py-2.5 rounded-xl hover:bg-amber-600 transition"
                >
                    Go to Dashboard
                </Link>
            </div>
        </div>
    );
}