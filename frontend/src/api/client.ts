import axios, { AxiosError } from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['X-Request-ID'] = crypto.randomUUID();
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (err: AxiosError<{ error?: string; code?: string }>) => {
    const status = err.response?.status;
    const message = err.response?.data?.error;

    if (status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      return Promise.reject(err);
    }

    if (status === 403) {
      toast.error(message || 'You do not have permission to perform this action');
      return Promise.reject(err);
    }

    if (status === 429) {
      toast.error('Too many requests. Please slow down and try again.');
      return Promise.reject(err);
    }

    if (!err.response) {
      toast.error('Network error. Please check your connection.');
      return Promise.reject(err);
    }

    return Promise.reject(err);
  }
);

export default api;
