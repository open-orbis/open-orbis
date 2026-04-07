import { create } from 'zustand';
import axios from 'axios';
import { getMe, googleLogin, linkedinLogin, type UserInfo } from '../api/auth';

interface AuthState {
  user: UserInfo | null;
  token: string | null;
  loading: boolean;
  setToken: (token: string) => void;
  fetchUser: () => Promise<void>;
  loginGoogle: (code: string) => Promise<void>;
  loginLinkedIn: (code: string) => Promise<void>;
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
    } catch (e) {
      // Wipe local session on any failure so we don't stay in a half-authenticated state.
      // 401 is already handled by the axios interceptor (dispatches session-expired).
      // 404 means the Person node is gone (orphaned token) → emit the same event so
      // the global handler shows a toast and routes us back to the landing page.
      localStorage.removeItem('orbis_token');
      set({ user: null, token: null, loading: false });
      if (axios.isAxiosError(e) && e.response?.status === 404) {
        window.dispatchEvent(new CustomEvent('orbis:session-expired'));
      }
    }
  },

  loginGoogle: async (code: string) => {
    set({ loading: true });
    try {
      const { access_token, user } = await googleLogin(code);
      localStorage.setItem('orbis_token', access_token);
      set({ token: access_token, user, loading: false });
    } catch {
      set({ loading: false });
      throw new Error('Google login failed');
    }
  },

  loginLinkedIn: async (code: string) => {
    set({ loading: true });
    try {
      const { access_token, user } = await linkedinLogin(code);
      localStorage.setItem('orbis_token', access_token);
      set({ token: access_token, user, loading: false });
    } catch {
      set({ loading: false });
      throw new Error('LinkedIn login failed');
    }
  },

  logout: () => {
    localStorage.removeItem('orbis_token');
    set({ user: null, token: null });
  },
}));
