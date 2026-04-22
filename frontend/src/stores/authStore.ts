import { create } from 'zustand';
import { getMe, googleLogin, linkedinLogin, logoutBackend, type UserInfo } from '../api/auth';

interface AuthState {
  user: UserInfo | null;
  // `loading` is true while we're probing the backend for the current
  // session. It starts true so route guards render a spinner on first
  // mount until /auth/me has resolved (success or 401).
  loading: boolean;
  fetchUser: () => Promise<void>;
  loginGoogle: (code: string) => Promise<void>;
  loginLinkedIn: (code: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  fetchUser: async () => {
    set({ loading: true });
    try {
      const user = await getMe();
      set({ user, loading: false });
    } catch {
      // 401 or network failure — treat as logged out. The axios response
      // interceptor in api/client.ts already tries /auth/refresh before
      // the error reaches here, so we only land here if refresh also failed.
      set({ user: null, loading: false });
    }
  },

  loginGoogle: async (code: string) => {
    set({ loading: true });
    try {
      // The backend sets httpOnly access + refresh cookies on this call.
      // The response body still carries UserInfo for convenience.
      const { user } = await googleLogin(code);
      // A successful explicit sign-in clears any stale "just_logged_out"
      // sentinel from an earlier logout in the same tab — otherwise a
      // subsequent silent re-auth after session expiry would be blocked.
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('orbis.just_logged_out');
      }
      set({ user, loading: false });
    } catch {
      set({ loading: false });
      throw new Error('Google login failed');
    }
  },

  loginLinkedIn: async (code: string) => {
    set({ loading: true });
    try {
      const { user } = await linkedinLogin(code);
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('orbis.just_logged_out');
      }
      set({ user, loading: false });
    } catch {
      set({ loading: false });
      throw new Error('LinkedIn login failed');
    }
  },

  logout: async () => {
    try {
      await logoutBackend();
    } catch {
      // Even if the server call fails we still clear client state so the
      // user is not stuck with a half-logged-in UI.
    }
    // Tell silent re-auth not to instantly re-establish the session we
    // just explicitly tore down. Cleared on next successful login, or
    // when the tab closes.
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('orbis.just_logged_out', '1');
    }
    set({ user: null, loading: false });
  },
}));
