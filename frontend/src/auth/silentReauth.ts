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
      let source: 'fedcm' | 'onetap' = 'fedcm';
      let idToken = await runFedCM();
      if (!idToken) {
        idToken = await runOneTap();
        source = 'onetap';
      }
      if (!idToken) return false;
      await googleIdTokenLogin(idToken, source);
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

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let gisScriptLoading: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if ((globalThis as any).google?.accounts?.id) {
    gisScriptLoading = null;
    return Promise.resolve();
  }
  if (gisScriptLoading) return gisScriptLoading;
  gisScriptLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SCRIPT_SRC;
    s.async = true;
    s.onload = () => {
      gisScriptLoading = null;
      resolve();
    };
    s.onerror = () => {
      gisScriptLoading = null;
      reject(new Error('gis_load_failed'));
    };
    document.head.appendChild(s);
  });
  return gisScriptLoading;
}

async function runOneTap(): Promise<string | null> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) return null;

  try {
    await loadGis();
  } catch {
    return null;
  }

  const gis = (globalThis as any).google?.accounts?.id;
  if (!gis) return null;

  return new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    gis.initialize({
      client_id: clientId,
      auto_select: true,
      callback: (response: { credential?: string }) => {
        finish(response?.credential ?? null);
      },
    });
    gis.prompt((notification: any) => {
      if (notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.()) {
        finish(null);
      }
    });
    setTimeout(() => finish(null), 4000);
  });
}

export const SILENT_REAUTH_JUST_LOGGED_OUT_KEY = JUST_LOGGED_OUT_KEY;

/** Exposed only for unit tests — resets module-level state between test runs. */
export function _resetModuleState() {
  inFlight = null;
  gisScriptLoading = null;
}
