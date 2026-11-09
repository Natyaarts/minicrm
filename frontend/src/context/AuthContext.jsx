import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';
import { secureLogin } from '../api/secureLogin';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkAuth = async () => {
            const token = localStorage.getItem('token');
            if (token) {
                try {
                    const response = await api.get('auth/me/');
                    setUser(response.data);
                } catch (error) {
                    console.error('Auth check failed:', error);
                    localStorage.removeItem('token');
                    setUser(null);
                }
            }
            setLoading(false);
        };

        checkAuth();
    }, []);

    const login = async (username, password) => {
        try {
            const { token } = await secureLogin(username, password);
            localStorage.setItem('token', token);
            const me = await api.get('auth/me/');   // fresh from the server, not from the login body
            setUser(me.data);
            return { success: true, user: me.data };
        } catch (error) {
            localStorage.removeItem('token');
            console.error('Login failed:', error);
            if (error.status === 429 || error.response?.status === 429) {
                return { success: false, error: 'Too many attempts. Please wait a minute and try again.' };
            }
            return { success: false, error: error.response?.data?.error || error.message || 'Login failed' };
        }
    };

    const logout = async () => {
        try {
            await api.post('auth/logout/');
        } catch (error) {
            console.error('Server logout error:', error);
        } finally {
            localStorage.removeItem('token');
            setUser(null);
        }
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
