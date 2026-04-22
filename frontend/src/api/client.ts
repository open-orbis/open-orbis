import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { trySilentReauth } from '../auth/silentReauth';

// Cookies are set by the backend on /auth/google|linkedin|refresh, scoped
// to /api for the access cookie and /auth for the refresh cookie. They
// are httpOnly so JS can't read them — the only signal we have for "am
// I logged in" is whether /auth/me returns 200 or 401.
const API_BASE = import.meta.env.VITE_API_URL || '/api';

const client = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// 401 → refresh → retry, with a single in-flight guard so parallel
// requests that all 401 in a burst only trigger one /auth/refresh.
let refreshInFlight: Promise<void> | null = null;

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retriedAfterRefresh?: boolean;
  _triedSilentReauth?: boolean;
}

async function refreshSession(): Promise<void> {
  await axios.post(`${API_BASE}/auth/refresh`, undefined, { withCredentials: true });
}

client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as RetryableConfig | undefined;

    if (status !== 401 || !original) {
      return Promise.reject(error);
    }

    // Never try to refresh from within /auth/* — infinite loop risk.
    // /auth/me is also excluded: a 401 on the initial session probe simply
    // means the user is not logged in, not that a session expired.
    const url = original.url || '';
    if (url.startsWith('/auth/refresh') || url.startsWith('/auth/logout') || url.startsWith('/auth/me')) {
      return Promise.reject(error);
    }

    // Already retried once after refresh and still 401 — try silent re-auth
    // before giving up entirely.
    if (original._retriedAfterRefresh) {
      if (!original._triedSilentReauth) {
        original._triedSilentReauth = true;
        try {
          const silentOk = await trySilentReauth();
          if (silentOk) {
            return client.request(original);
          }
        } catch {
          // trySilentReauth never throws today, but be defensive — any
          // unexpected throw must not break the session-expired fallback.
        }
      }
      window.dispatchEvent(new CustomEvent('orbis:session-expired'));
      return Promise.reject(error);
    }

    try {
      if (!refreshInFlight) {
        refreshInFlight = refreshSession().finally(() => {
          refreshInFlight = null;
        });
      }
      await refreshInFlight;
    } catch (refreshError) {
      // Refresh failed — try silent re-auth before declaring session expired.
      if (!original._triedSilentReauth) {
        original._triedSilentReauth = true;
        try {
          const silentOk = await trySilentReauth();
          if (silentOk) {
            original._retriedAfterRefresh = true;
            return client.request(original);
          }
        } catch {
          // trySilentReauth never throws today, but be defensive — any
          // unexpected throw must not break the session-expired fallback.
        }
      }
      window.dispatchEvent(new CustomEvent('orbis:session-expired'));
      return Promise.reject(refreshError);
    }

    original._retriedAfterRefresh = true;
    return client.request(original);
  }
);

export default client;
