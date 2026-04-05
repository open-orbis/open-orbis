import { create } from 'zustand';
import { adminLogin } from '../api/admin';

interface AdminAuthState {
  adminToken: string | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

export const useAdminAuthStore = create<AdminAuthState>((set) => ({
  adminToken: sessionStorage.getItem('orbis_admin_token'),
  loading: false,
  error: null,

  login: async (username: string, password: string) => {
    set({ loading: true, error: null });
    try {
      const token = await adminLogin(username, password);
      sessionStorage.setItem('orbis_admin_token', token);
      set({ adminToken: token, loading: false });
      return true;
    } catch {
      set({ error: 'Invalid credentials', loading: false });
      return false;
    }
  },

  logout: () => {
    sessionStorage.removeItem('orbis_admin_token');
    set({ adminToken: null });
  },
}));
