import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        const result = await login(username, password);
        if (result.success) {
            navigate('/');
        } else {
            setError(result.error);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50">
            <div className="w-full max-w-md p-10 bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white">
                <div className="text-center mb-10">
                    <h2 className="text-4xl font-extrabold mb-3 bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                        Welcome Back
                    </h2>
                    <p className="text-slate-500 font-medium">Sign in to Natya CRM</p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-semibold text-center animate-shake">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 text-slate-900 outline-none transition-all font-medium placeholder-slate-400"
                            placeholder="Enter your username"
                        />
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide">Password</label>
                            <a href="#" className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">Forgot Password?</a>
                        </div>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 text-slate-900 outline-none transition-all font-medium placeholder-slate-400"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        className="w-full py-4 px-4 bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all duration-200 transform hover:-translate-y-1 active:translate-y-0"
                    >
                        Sign In
                    </button>
                </form>

                <div className="mt-8 text-center text-sm text-slate-400 font-medium">
                    &copy; 2026 Natya CRM. All rights reserved.
                </div>
            </div>
        </div>
    );
}

export default Login;
