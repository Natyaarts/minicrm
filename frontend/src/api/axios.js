import axios from 'axios';

// In production, use a relative URL so it goes through Nginx on the same server.
// In development (localhost), fall back to the local dev server.
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const baseURL = (window.location.hostname.includes('natyaarts.org') || !isLocalhost)
    ? '/api/'
    : (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/');

const api = axios.create({
    baseURL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Token ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            const requestUrl = error.config?.url || '';
            const isLoginRequest = requestUrl.includes('auth/login');
            if (!isLoginRequest) {
                localStorage.removeItem('token');
                // Redirect if currently on a protected page
                if (window.location.pathname !== '/login') {
                    window.location.href = '/login';
                }
            }
        }
        return Promise.reject(error);
    }
);

export default api;
