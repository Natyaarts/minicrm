import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
const getBaseUrl = () => {
  // Point to the live production server domain
  return 'https://natyaarts.org/api/';
};

const API_URL = getBaseUrl();

const client = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Bypass-Tunnel-Reminder': 'true',
    'ngrok-skip-browser-warning': 'true',
  },
});

// Interceptor to add token and fix relative URLs
client.interceptors.request.use(
  async (config) => {
    if (
      typeof config.url === 'string' &&
      config.url.startsWith('/') &&
      !/^https?:\/\//i.test(config.url)
    ) {
      config.url = config.url.slice(1);
    }

    try {
      const token = await AsyncStorage.getItem('userToken');
      if (token && token.trim()) {
        if (!config.headers) {
          config.headers = {};
        }
        config.headers.Authorization = `Token ${token.trim()}`;
      }
    } catch (storageErr) {
      console.warn('[API Client] Error reading userToken from storage:', storageErr);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor to handle auth and network failures with safe dev logging
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const url = error.config?.url || 'unknown';

    if (status === 401) {
      // Safe development logging without exposing sensitive tokens or credentials
      console.warn(`[API Auth] 401 Unauthorized received for endpoint: ${url}`);
    } else if (status === 403) {
      console.warn(`[API Auth] 403 Forbidden received for endpoint: ${url}`);
    } else if (!error.response) {
      console.warn(`[API Network] Network/Connection failure for endpoint: ${url}`);
    }

    return Promise.reject(error);
  }
);

export default client;

