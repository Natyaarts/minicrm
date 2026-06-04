import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const getBaseUrl = () => {
  if (__DEV__) {
    // If running on Web platform (browser)
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.location) {
        const hostname = window.location.hostname;
        return `http://${hostname}:8000/api/`;
      }
    }
    // If running on Native platforms (Expo Go / Emulator)
    const hostUri = Constants.expoConfig?.hostUri;
    if (hostUri) {
      const ip = hostUri.split(':')[0];
      return `http://${ip}:8000/api/`;
    }
    // Fallback to active system IP
    return 'http://192.168.220.34:8000/api/';
  }
  return 'https://natyaarts.org/api/';
};

const API_URL = getBaseUrl();

const client = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
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
