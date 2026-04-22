import { googleIdTokenLogin } from '../api/auth';

const JUST_LOGGED_OUT_KEY = 'orbis.just_logged_out';

let inFlight: Promise<boolean> | null = null;

export async function trySilentReauth(): Promise<boolean> {
  if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(JUST_LOGGED_OUT_KEY)) {
    return false;
  }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const idToken = await runFedCM();
      if (!idToken) return false;
      await googleIdTokenLogin(idToken, 'fedcm');
      return true;
    } catch (err) {
      console.warn('silentReauth: id-token exchange failed', err);
      return false;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

async function runFedCM(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (!('IdentityCredential' in window)) return null;
  if (!navigator.credentials) return null;

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) return null;

  try {
    const credential = await (navigator.credentials.get as any)({
      identity: {
        providers: [
          {
            configURL: 'https://accounts.google.com/gsi/fedcm.json',
            clientId,
          },
        ],
      },
      mediation: 'optional',
    });
    return (credential as any)?.token ?? null;
  } catch {
    return null;
  }
}

export const SILENT_REAUTH_JUST_LOGGED_OUT_KEY = JUST_LOGGED_OUT_KEY;
