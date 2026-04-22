import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import axios from 'axios';

// Mock silentReauth before importing client (which imports it at module level).
vi.mock('../auth/silentReauth', () => ({
  trySilentReauth: vi.fn(),
}));

// Mock the raw axios module so refreshSession() (which calls axios.post) can be
// controlled by tests. We keep the axios.create() behaviour intact so the
// intercepted `client` instance is still usable with MockAdapter.
const axiosPostSpy = vi.spyOn(axios, 'post');

import { trySilentReauth } from '../auth/silentReauth';
import client from './client';

describe('axios interceptor — silent re-auth integration', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(client);
    vi.resetAllMocks();
    // By default, refresh succeeds (resolved = no error thrown).
    axiosPostSpy.mockResolvedValue({ status: 200 });
  });

  afterEach(() => {
    mock.restore();
  });

  it('401 + refresh-fail + silent-success → retries and succeeds', async () => {
    let call = 0;
    mock.onGet('/foo').reply(() => {
      call += 1;
      // First call → 401 (triggers refresh path), second call → 200 (after silent reauth retry).
      return call === 1 ? [401, {}] : [200, { ok: true }];
    });
    // Make refresh fail so we fall into the silent-reauth branch.
    axiosPostSpy.mockRejectedValue(Object.assign(new Error('refresh failed'), { response: { status: 401 } }));
    (trySilentReauth as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const res = await client.get('/foo');
    expect(res.data).toEqual({ ok: true });
    expect(trySilentReauth).toHaveBeenCalledOnce();
  });

  it('401 + refresh-fail + silent-fail → dispatches session-expired', async () => {
    mock.onGet('/foo').reply(401);
    axiosPostSpy.mockRejectedValue(Object.assign(new Error('refresh failed'), { response: { status: 401 } }));
    (trySilentReauth as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const handler = vi.fn();
    window.addEventListener('orbis:session-expired', handler);
    await expect(client.get('/foo')).rejects.toThrow();
    expect(handler).toHaveBeenCalledOnce();
    window.removeEventListener('orbis:session-expired', handler);
  });

  it('loop guard: silent re-auth only tried once per request', async () => {
    // Every request returns 401 — this simulates silent-reauth "succeeding"
    // (trySilentReauth returns true) but the retry still getting a 401.
    // The guard must prevent a second silent-reauth call.
    mock.onGet('/foo').reply(401);
    axiosPostSpy.mockRejectedValue(Object.assign(new Error('refresh failed'), { response: { status: 401 } }));
    (trySilentReauth as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    // The retry after silent-success will 401 again, hitting _retriedAfterRefresh
    // (which was set before the retry), then checking _triedSilentReauth (already
    // true) → falls through to session-expired without calling trySilentReauth again.
    await expect(client.get('/foo')).rejects.toThrow();
    expect(trySilentReauth).toHaveBeenCalledOnce();
  });
});

describe('axios interceptor — refresh race', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(client);
    vi.resetAllMocks();
  });

  afterEach(() => {
    mock.restore();
  });

  it('retries original request when another tab rotated the cookie <500ms ago', async () => {
    // Phase 1: Prime lastSuccessfulRefreshAt by running a full 401→refresh→retry
    // cycle through the interceptor. This sets lastSuccessfulRefreshAt = Date.now().
    axiosPostSpy.mockResolvedValueOnce({ status: 200 });
    let primeCall = 0;
    mock.onGet('/prime').reply(() => {
      primeCall += 1;
      return primeCall === 1 ? [401, {}] : [200, { primed: true }];
    });
    await client.get('/prime');

    // Phase 2: Now within the 500ms race window, trigger a new 401 on /foo.
    // /auth/refresh fails (token already rotated by "tab A"), but the race
    // window is still open, so the interceptor retries /foo once — second call succeeds.
    axiosPostSpy.mockRejectedValueOnce(
      Object.assign(new Error('token already rotated'), { response: { status: 401 } }),
    );

    let fooCall = 0;
    mock.onGet('/foo').reply(() => {
      fooCall += 1;
      return fooCall === 1 ? [401, {}] : [200, { ok: true }];
    });

    const res = await client.get('/foo');
    expect(res.data).toEqual({ ok: true });
    // trySilentReauth should NOT have been called — the race window handled it.
    expect(trySilentReauth).not.toHaveBeenCalled();
  });
});
