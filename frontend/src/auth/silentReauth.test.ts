import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api/auth', () => ({
  googleIdTokenLogin: vi.fn(),
}));

import { trySilentReauth } from './silentReauth';
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
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id');
    sessionStorage.clear();
  });

  afterEach(() => {
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
    const ok = await trySilentReauth();
    // FedCM failure falls through to One Tap which is unavailable in jsdom,
    // so end state is false. Covered in Task 5 once One Tap is wired in.
    expect(ok).toBe(false);
    expect(googleIdTokenLogin).not.toHaveBeenCalled();
  });
});
