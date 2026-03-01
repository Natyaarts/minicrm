import axios from 'axios';

// In production, use a relative URL so it goes through Nginx on the same server.
// In development (localhost), fall back to the local dev server.
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const baseURL = import.meta.env.VITE_API_BASE_URL || (isLocalhost ? 'http://localhost:8000/api/' : '/api/');

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

export default api;
