import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api/auth', () => ({
  googleIdTokenLogin: vi.fn(),
}));

import { trySilentReauth, _resetModuleState } from './silentReauth';
import { googleIdTokenLogin } from '../api/auth';

function stubFedCM(idToken: string | null) {
  const fakeCredential = idToken ? { token: idToken } : null;
  (globalThis as any).navigator.credentials = {
    get: vi.fn().mockResolvedValue(fakeCredential),
  };
  (globalThis as any).IdentityCredential = class {};
}

function unstubFedCM() {
  delete (globalThis as any).navigator.credentials;
  delete (globalThis as any).IdentityCredential;
}

describe('trySilentReauth — FedCM path', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    _resetModuleState();
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id');
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    unstubFedCM();
    vi.unstubAllEnvs();
  });

  it('returns true when FedCM returns an ID token and backend accepts it', async () => {
    stubFedCM('google.id.token');
    (googleIdTokenLogin as any).mockResolvedValue(undefined);

    const ok = await trySilentReauth();
    expect(ok).toBe(true);
    expect(googleIdTokenLogin).toHaveBeenCalledWith('google.id.token', 'fedcm');
  });

  it('returns false when FedCM resolves with null (user dismissed)', async () => {
    stubFedCM(null);
    // Stub document.createElement so the GIS script tag fires onerror immediately,
    // causing loadGis to reject and runOneTap to return null.
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'script') {
        // Trigger onerror on next microtask so loadGis rejects fast.
        Promise.resolve().then(() => el.onerror?.(new Event('error')));
      }
      return el;
    });

    const promise = trySilentReauth();
    await vi.runAllTimersAsync();
    const ok = await promise;
    expect(ok).toBe(false);
    expect(googleIdTokenLogin).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('short-circuits when orbis.just_logged_out is set', async () => {
    sessionStorage.setItem('orbis.just_logged_out', '1');
    stubFedCM('should.not.be.used');
    const ok = await trySilentReauth();
    expect(ok).toBe(false);
    expect(googleIdTokenLogin).not.toHaveBeenCalled();
  });
});

describe('trySilentReauth — One Tap fallback', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    _resetModuleState();
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id');
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as any).google;
    unstubFedCM();
    vi.unstubAllEnvs();
  });

  it('falls back to One Tap when FedCM resolves with null', async () => {
    stubFedCM(null);
    (globalThis as any).google = {
      accounts: {
        id: {
          initialize: vi.fn((opts: any) => {
            setTimeout(() => opts.callback({ credential: 'onetap.id.token' }), 0);
          }),
          prompt: vi.fn(),
        },
      },
    };
    (googleIdTokenLogin as any).mockResolvedValue(undefined);

    const promise = trySilentReauth();
    await vi.runAllTimersAsync();
    const ok = await promise;
    expect(ok).toBe(true);
    expect(googleIdTokenLogin).toHaveBeenCalledWith('onetap.id.token', 'onetap');
  });

  it('returns false when neither FedCM nor One Tap produce a token', async () => {
    stubFedCM(null);
    (globalThis as any).google = {
      accounts: {
        id: {
          initialize: vi.fn(),
          prompt: vi.fn((notification: (n: any) => void) => {
            setTimeout(() => notification({ isNotDisplayed: () => true }), 0);
          }),
        },
      },
    };

    const promise = trySilentReauth();
    await vi.runAllTimersAsync();
    const ok = await promise;
    expect(ok).toBe(false);
    expect(googleIdTokenLogin).not.toHaveBeenCalled();
  });
});
