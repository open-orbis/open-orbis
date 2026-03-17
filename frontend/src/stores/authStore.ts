import { create } from 'zustand';
import { devLogin, getMe, type UserInfo } from '../api/auth';

interface AuthState {
  user: UserInfo | null;
  token: string | null;
  loading: boolean;
  setToken: (token: string) => void;
  fetchUser: () => Promise<void>;
  loginDev: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('orbis_token'),
  loading: false,

  setToken: (token: string) => {
    localStorage.setItem('orbis_token', token);
    set({ token });
  },

  fetchUser: async () => {
    set({ loading: true });
    try {
      const user = await getMe();
      set({ user, loading: false });
    } catch {
      localStorage.removeItem('orbis_token');
      set({ user: null, token: null, loading: false });
    }
  },

  loginDev: async () => {
    set({ loading: true });
    try {
      const { access_token, user } = await devLogin();
      localStorage.setItem('orbis_token', access_token);
      set({ token: access_token, user, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  logout: () => {
    localStorage.removeItem('orbis_token');
    set({ user: null, token: null });
  },
}));
