import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
const getBaseUrl = () => {
  // Hardcoded tunnel URL to bypass Windows Firewall and WiFi isolation completely
  return 'https://ten-coins-throw.loca.lt/api/';
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

// Interceptor to add token to every request
client.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('userToken');
    if (token) {
      config.headers.Authorization = `Token ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default client;
