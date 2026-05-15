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
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 md:p-20 bg-white">
                <div className="w-full max-w-md space-y-10">
                    {/* Mobile Logo Container (Enlarged & Refined) */}
                    <div className="lg:hidden flex flex-col items-center mb-10">
                        <motion.div 
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 100 }}
                            className="w-40 h-40 bg-gradient-to-br from-[#FFD700] to-[#FFB300] rounded-[3rem] shadow-2xl shadow-amber-200/50 flex items-center justify-center p-6 mb-8 relative overflow-hidden"
                        >
                            {/* Inner glow effect */}
                            <div className="absolute inset-0 bg-white/20 rounded-full blur-2xl transform -translate-x-1/2 -translate-y-1/2" />
                            <img src="/logo.png" alt="Logo" className="w-full h-auto max-h-full object-contain relative z-10" />
                        </motion.div>
                        <h2 className="text-4xl font-black text-slate-900 tracking-tight">Welcome Back</h2>
                        <div className="h-1 w-12 bg-rose-600 rounded-full mt-3 mb-1" />
                        <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Premium ERP System</p>
                    </div>

                    <div className="hidden lg:block">
                        <h2 className="text-5xl font-black text-slate-900 tracking-tight mb-3">Welcome Back</h2>
                        <p className="text-slate-500 font-bold text-lg">Sign in to access your dashboard</p>
                    </div>

                    {error && (
                        <motion.div 
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="p-5 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-xs font-black flex items-center gap-3 shadow-sm"
                        >
                            <div className="w-8 h-8 bg-rose-600 text-white rounded-full flex items-center justify-center shrink-0 shadow-md shadow-rose-200">!</div>
                            {error}
                        </motion.div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-8">
                        <div className="space-y-3">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Username</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full px-8 py-5 bg-slate-50 border border-slate-100 rounded-[1.5rem] focus:ring-4 focus:ring-amber-100 focus:border-amber-400 text-slate-900 outline-none transition-all duration-300 font-bold placeholder-slate-300"
                                placeholder="Your username"
                            />
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center px-1">
                                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Password</label>
                            </div>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-8 py-5 bg-slate-50 border border-slate-100 rounded-[1.5rem] focus:ring-4 focus:ring-amber-100 focus:border-amber-400 text-slate-900 outline-none transition-all duration-300 font-bold placeholder-slate-300"
                                placeholder="••••••••"
                            />
                        </div>

                        <button
                            type="submit"
                            className="w-full py-5 bg-slate-900 text-white font-black text-lg rounded-[1.5rem] shadow-2xl shadow-slate-200 hover:bg-rose-600 hover:shadow-rose-200 transition-all duration-500 transform hover:-translate-y-1 active:translate-y-0"
                        >
                            Log In to System
                        </button>
                    </form>

                    <div className="pt-12 text-center">
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em]">
                            &copy; 2026 Natya Arts &bull; Premium ERP
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Login;
