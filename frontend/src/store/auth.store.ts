import { create } from 'zustand';
import { User } from '../types';

interface AuthState {
  user: User | null;
  /** Short-lived JWT kept in memory only (never localStorage).
   *  Used exclusively for socket.io auth since httpOnly cookies
   *  cannot be read by JavaScript. All HTTP API calls rely on the cookie. */
  accessToken: string | null;
  /** True while the initial /auth/me check is in flight on app mount. */
  isLoading: boolean;

  setUser: (user: User | null) => void;
  setAccessToken: (token: string | null) => void;
  logout: () => void;
  isAdmin: () => boolean;
  isManager: () => boolean;
  isSuperAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isLoading: true,

  setUser: (user) => set({ user, isLoading: false }),
  setAccessToken: (accessToken) => set({ accessToken }),

  logout: () => {
    // Cookie is cleared by the server (/auth/logout).
    // We only reset local state here.
    set({ user: null, accessToken: null, isLoading: false });
  },

  isAdmin:      () => ['SUPER_ADMIN', 'MANAGER'].includes(get().user?.role ?? ''),
  isSuperAdmin: () => get().user?.role === 'SUPER_ADMIN',
  isManager:    () => ['SUPER_ADMIN', 'MANAGER'].includes(get().user?.role ?? ''),
}));
