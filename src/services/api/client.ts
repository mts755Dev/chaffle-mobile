import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '../../constants';
import { supabase } from '../supabase/client';

// Create axios instance pointing to the Next.js backend
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach auth token if available
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
      }
    } catch {
      // No session available
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle common errors
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Handle unauthorized - could trigger logout
      console.warn('Unauthorized request - session may have expired');
    }
    if (error.response?.status === 403) {
      console.warn('Forbidden - insufficient permissions');
    }
    if (!error.response) {
      console.error('Network error - no response received');
    }
    return Promise.reject(error);
  }
);

export default apiClient;
