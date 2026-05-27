import axios, { AxiosError } from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  withCredentials: true, // send httpOnly cookies on every request
});

api.interceptors.request.use((config) => {
  config.headers['X-Request-ID'] = crypto.randomUUID();
  return config;
});

// ── Auto-refresh on 401 ────────────────────────────────────────────────────────
// When the access token cookie expires (15 min), the server returns 401.
// We transparently call /auth/refresh (which uses the refresh token cookie),
// set new cookies, then retry the original request — the user never notices.

let isRefreshing = false;
let pendingQueue: Array<{ resolve: () => void; reject: (e: unknown) => void }> = [];

function drainQueue(error?: unknown) {
  pendingQueue.forEach(p => (error ? p.reject(error) : p.resolve()));
  pendingQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (err: AxiosError<{ error?: string; code?: string }>) => {
    const status  = err.response?.status;
    const message = err.response?.data?.error;
    const orig    = err.config as typeof err.config & { _retry?: boolean };

    // ── 401: try to refresh ────────────────────────────────────────────────
    if (status === 401 && !orig?._retry) {
      // Avoid calling /auth/refresh for the refresh/logout routes themselves
      const url = orig?.url ?? '';
      if (url.includes('/auth/refresh') || url.includes('/auth/logout') || url.includes('/auth/login') || url.includes('/auth/google')) {
        // Refresh itself failed → force logout
        const { useAuthStore } = await import('../store/auth.store');
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(err);
      }

      if (isRefreshing) {
        // Another refresh is in flight — queue this request
        return new Promise((resolve, reject) => {
          pendingQueue.push({
            resolve: () => resolve(api(orig!)),
            reject,
          });
        });
      }

      orig!._retry   = true;
      isRefreshing   = true;

      try {
        const { data } = await api.post<{ accessToken: string }>('/auth/refresh');
        // Store new in-memory access token for socket.io
        const { useAuthStore } = await import('../store/auth.store');
        useAuthStore.getState().setAccessToken(data.accessToken);

        drainQueue();
        return api(orig!); // retry original request (new cookie is set)
      } catch (refreshErr) {
        drainQueue(refreshErr);
        const { useAuthStore } = await import('../store/auth.store');
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    // ── 403 ───────────────────────────────────────────────────────────────
    if (status === 403) {
      toast.error(message || 'You do not have permission to perform this action');
      return Promise.reject(err);
    }

    // ── 429 ───────────────────────────────────────────────────────────────
    if (status === 429) {
      toast.error('Too many requests. Please slow down and try again.');
      return Promise.reject(err);
    }

    // ── Network error ──────────────────────────────────────────────────────
    if (!err.response) {
      toast.error('Network error. Please check your connection.');
      return Promise.reject(err);
    }

    return Promise.reject(err);
  },
);

export default api;
