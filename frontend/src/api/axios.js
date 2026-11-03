import axios from 'axios';
import { emitForbidden } from '../auth/forbiddenBus';   // NEW

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
        const status = error.response?.status;

        if (status === 401) {
            const requestUrl = error.config?.url || '';
            const isLoginRequest = requestUrl.includes('auth/login');
            // Do not clear the MiniCRM session on third-party OAuth/integration authorization errors
            const isThirdPartyAuthError = requestUrl.includes('crm/google/') || requestUrl.includes('integrations/google');
            if (!isLoginRequest && !isThirdPartyAuthError) {
                localStorage.removeItem('token');
                // Redirect if currently on a protected page
                if (window.location.pathname !== '/login') {
                    window.location.href = '/login';
                }
            }
        }

        // NEW: permission denied. Let the Layout decide what to show.
        if (status === 403 && !error.config?.skipForbidden) {
            const requestUrl = error.config?.url || '';
            const isThirdPartyAuthError = requestUrl.includes('crm/google/') || requestUrl.includes('integrations/google');
            if (!isThirdPartyAuthError) {
                emitForbidden({
                    method: (error.config?.method || 'get').toLowerCase(),
                    url: requestUrl,
                });
            }
        }

        return Promise.reject(error);
    }
);

export default api;