import axios from 'axios';

// Determina a URL da API baseado no hostname
const getBaseURL = () => {
  if (typeof window === 'undefined') {
    // Server-side (build-time) - sempre retorna produção
    return 'https://api.dropapp.com.br/api';
  }
  
  // Client-side - verifica o hostname
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Development local
    return 'http://localhost:4000/api';
  }
  
  // Production (Vercel, qualquer outro host)
  return 'https://api.dropapp.com.br/api';
};

const BASE = getBaseURL();

if (typeof window !== 'undefined') {
  console.log('🔌 API Base URL:', BASE, '| Hostname:', window.location.hostname);
}

export const api = axios.create({ baseURL: BASE, withCredentials: true });

export const setAuthToken = (token?: string) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    if (process.env.NODE_ENV === 'development') console.log('✅ Token set in axios:', token.substring(0, 20) + '...');
  } else {
    delete api.defaults.headers.common['Authorization'];
    if (process.env.NODE_ENV === 'development') console.log('❌ Token removed from axios');
  }
};

// Garante que toda request tenha o Authorization header, mesmo que setAuthToken
// ainda não tenha sido chamado (evita race condition no boot do app, quando o
// AuthContext está hidratando e hooks como useNotifications já disparam fetch).
api.interceptors.request.use((config) => {
  if (!config.headers['Authorization'] && typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
  }
  if (process.env.NODE_ENV === 'development') {
    const auth = config.headers['Authorization'];
    console.log('📡 Request to', config.url, 'Auth header:', auth ? 'present' : 'missing');
  }
  return config;
}, (error) => {
  if (process.env.NODE_ENV === 'development') console.error('Request error:', error);
  return Promise.reject(error);
});

// Add response interceptor for debugging
api.interceptors.response.use((response) => {
  return response;
}, (error) => {
  if (error.response?.status === 403) {
    if (process.env.NODE_ENV === 'development') console.error('❌ 403 Forbidden:', error.response?.data);
  } else if (error.response?.status === 401) {
    if (process.env.NODE_ENV === 'development') console.error('❌ 401 Unauthorized:', error.response?.data);
  }
  return Promise.reject(error);
});

export default api;
