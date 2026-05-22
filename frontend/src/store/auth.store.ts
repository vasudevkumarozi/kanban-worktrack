import { create } from 'zustand';
import { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  isAdmin: () => boolean;
  isManager: () => boolean;
  isSuperAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem('token'),
  setAuth: (user, token) => {
    localStorage.setItem('token', token);
    set({ user, token });
  },
  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, token: null });
  },
  isAdmin: () => ['SUPER_ADMIN', 'MANAGER'].includes(get().user?.role || ''),
  isSuperAdmin: () => get().user?.role === 'SUPER_ADMIN',
  isManager: () => ['SUPER_ADMIN', 'MANAGER'].includes(get().user?.role || ''),
}));
