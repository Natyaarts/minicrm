import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';

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
        <div className="flex min-h-screen bg-white font-sans">
            {/* Left Side - Brand Section (Visible on desktop) */}
            <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-[#FFD700] via-[#FFC107] to-[#FFB300] items-center justify-center p-12 overflow-hidden">
                {/* Decorative Elements */}
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-white/20 rounded-full blur-3xl" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-black/5 rounded-full blur-3xl" />
                
                <div className="relative z-10 text-center space-y-8 max-w-md">
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                        className="bg-white/90 p-8 rounded-[3rem] shadow-2xl backdrop-blur-sm border border-white/50"
                    >
                        <img src="/logo.png" alt="Natya Logo" className="w-64 h-auto mx-auto object-contain" />
                    </motion.div>
                </div>
                
                {/* Bottom decorative text */}
                <div className="absolute bottom-10 left-10 right-10 flex justify-between items-center text-slate-900/40 text-[10px] font-black uppercase tracking-[0.2em]">
                    <span>Natya Arts Academy</span>
                    <span>v2.0.4 Premium</span>
                </div>
            </div>

            {/* Right Side - Login Form Section */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-12 bg-slate-50 lg:bg-white">
                <div className="w-full max-w-md space-y-8">
                    {/* Mobile Logo (Hidden on desktop) */}
                    <div className="lg:hidden text-center mb-8">
                        <div className="inline-block p-4 bg-amber-400 rounded-3xl shadow-lg mb-4">
                            <img src="/logo.png" alt="Logo" className="h-16 w-auto object-contain" />
                        </div>
                    </div>

                    <div className="text-left">
                        <h2 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Welcome Back</h2>
                        <p className="text-slate-500 font-bold">Sign in to access your dashboard</p>
                    </div>

                    {error && (
                        <motion.div 
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-xs font-black flex items-center gap-3"
                        >
                            <span className="w-6 h-6 bg-rose-600 text-white rounded-full flex items-center justify-center shrink-0">!</span>
                            {error}
                        </motion.div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Username</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-amber-100 focus:border-amber-400 text-slate-900 outline-none transition-all font-bold placeholder-slate-300"
                                placeholder="e.g. admin_natya"
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between items-center px-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Password</label>
                            </div>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-amber-100 focus:border-amber-400 text-slate-900 outline-none transition-all font-bold placeholder-slate-300"
                                placeholder="••••••••"
                            />
                        </div>

                        <button
                            type="submit"
                            className="w-full py-5 bg-slate-900 text-white font-black rounded-2xl shadow-xl shadow-slate-200 hover:bg-rose-600 hover:shadow-rose-200 transition-all duration-300 transform hover:-translate-y-1 active:translate-y-0"
                        >
                            Log In to System
                        </button>
                    </form>

                    <div className="pt-8 text-center">
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">
                            &copy; 2026 Natya Arts ERP System
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Login;
