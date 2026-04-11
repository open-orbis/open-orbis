import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

// Cookies are set by the backend on /auth/google|linkedin|refresh, scoped
// to /api for the access cookie and /auth for the refresh cookie. They
// are httpOnly so JS can't read them — the only signal we have for "am
// I logged in" is whether /auth/me returns 200 or 401.
const client = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// 401 → refresh → retry, with a single in-flight guard so parallel
// requests that all 401 in a burst only trigger one /auth/refresh.
let refreshInFlight: Promise<void> | null = null;

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retriedAfterRefresh?: boolean;
}

async function refreshSession(): Promise<void> {
  await axios.post('/api/auth/refresh', undefined, { withCredentials: true });
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
    const url = original.url || '';
    if (url.startsWith('/auth/refresh') || url.startsWith('/auth/logout')) {
      return Promise.reject(error);
    }

    // Already retried once and still 401 — stop here and surface the failure.
    if (original._retriedAfterRefresh) {
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
      window.dispatchEvent(new CustomEvent('orbis:session-expired'));
      return Promise.reject(refreshError);
    }

    original._retriedAfterRefresh = true;
    return client.request(original);
  }
);

export default client;
