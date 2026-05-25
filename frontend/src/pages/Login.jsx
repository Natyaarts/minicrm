import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!username || !password) {
            setError('Please enter both username and password');
            return;
        }
        setError('');
        setIsLoading(true);
        const result = await login(username, password);
        setIsLoading(false);
        if (result.success) {
            if (result.user.role === 'STUDENT') {
                navigate('/student');
            } else {
                navigate('/');
            }
        } else {
            setError(result.error);
        }
    };

    return (
        <div className="min-h-screen flex font-sans bg-[#0a0a0a]">
            {/* LEFT SIDE: Simple Branding */}
            <div className="hidden lg:flex flex-col items-center justify-center w-1/2 bg-[#050505] border-r border-white/5 p-12 text-center">
                <img src="/logo.png" alt="Natya Logo" className="w-full max-w-sm h-auto object-contain" />
                <h1 className="text-3xl font-bold text-white mt-8 mb-3 tracking-tight">Natya Arts Academy</h1>
                <p className="text-slate-400 text-base max-w-sm">
                    Premium ERP portal designed exclusively for our students, mentors, and staff.
                </p>
            </div>

            {/* RIGHT SIDE: Simple Login Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-[#0a0a0a]">
                <div className="w-full max-w-md p-8 bg-[#111111] border border-white/10 rounded-2xl shadow-2xl">
                    
                    {/* Mobile Logo Fallback */}
                    <div className="lg:hidden text-center mb-8">
                        <img src="/logo.png" alt="Natya Logo" className="w-32 h-auto object-contain mx-auto mb-4" />
                        <h2 className="text-2xl font-bold text-white mb-1">Natya ERP</h2>
                        <p className="text-slate-400 text-sm">Please sign in to continue</p>
                    </div>

                    <div className="hidden lg:block text-center mb-8">
                        <h2 className="text-3xl font-bold text-white mb-2">Sign In</h2>
                        <p className="text-slate-400 text-sm">Access your dashboard</p>
                    </div>

                    {error && (
                        <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-5">
                        <div>
                            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Username</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-amber-500 transition-colors"
                                placeholder="Enter username"
                                disabled={isLoading}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-amber-500 transition-colors"
                                placeholder="••••••••"
                                disabled={isLoading}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3.5 mt-4 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-lg transition-colors disabled:opacity-50"
                        >
                            {isLoading ? "Authenticating..." : "Sign In"}
                        </button>
                    </form>

                </div>
            </div>
        </div>
    );
}

export default Login;
