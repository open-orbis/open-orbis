# Persistent Login (Silent Re-Auth) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Orbis feel "never-logout" by silently re-establishing the user's session via Google FedCM (Chrome/Firefox) or GIS One Tap (Safari) when the refresh cookie is gone. Closes #406.

**Architecture:** One new backend endpoint (`POST /auth/google-id-token`) that verifies a Google ID token and mints the normal `__session` cookie. One new frontend module (`silentReauth.ts`) invoked from the axios 401 handler between the refresh attempt and the `session-expired` dispatch. Refresh TTL bumped 30d → 365d. LinkedIn users and fully-signed-out users gracefully fall back to the existing landing-page sign-in (no regression).

**Tech Stack:** FastAPI + `google-auth` library (backend); React 19 + vanilla `navigator.credentials` FedCM API + GIS (`https://accounts.google.com/gsi/client`) on the frontend.

**Spec:** `docs/superpowers/specs/2026-04-22-persistent-login-silent-reauth-design.md`

---

## Task 1: Add `google-auth` dependency + `verify_google_id_token` helper

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/app/auth/service.py`
- Create: `backend/tests/unit/test_verify_google_id_token.py`

- [ ] **Step 1: Add the dep**

Open `backend/pyproject.toml` and add `google-auth` to the `dependencies` list (alphabetical):

```toml
    "google-auth>=2.30.0",
```

Run:

```bash
cd backend && uv sync --all-extras
```

Expected: installs `google-auth` and its transitive deps (`rsa`, `pyasn1-modules`, `cachetools`).

- [ ] **Step 2: Write the failing test**

Create `backend/tests/unit/test_verify_google_id_token.py`:

```python
"""Unit tests for verify_google_id_token."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi import HTTPException
from google.auth.exceptions import TransportError

from app.auth.service import verify_google_id_token


@pytest.mark.asyncio
async def test_happy_path_returns_claims():
    fake_claims = {
        "sub": "google-sub-123",
        "email": "alice@example.com",
        "email_verified": True,
        "name": "Alice",
        "picture": "https://example.com/a.png",
        "iss": "https://accounts.google.com",
        "aud": "test-client-id",
    }
    with (
        patch("app.auth.service.settings") as mock_settings,
        patch(
            "app.auth.service.google_id_token.verify_oauth2_token",
            return_value=fake_claims,
        ),
    ):
        mock_settings.google_client_id = "test-client-id"
        claims = await verify_google_id_token("fake.jwt.token")
    assert claims["sub"] == "google-sub-123"
    assert claims["email"] == "alice@example.com"


@pytest.mark.asyncio
async def test_invalid_signature_raises_401():
    with patch(
        "app.auth.service.google_id_token.verify_oauth2_token",
        side_effect=ValueError("invalid signature"),
    ):
        with pytest.raises(HTTPException) as exc:
            await verify_google_id_token("bad.token")
    assert exc.value.status_code == 401
    assert exc.value.detail == "invalid_id_token"


@pytest.mark.asyncio
async def test_wrong_issuer_raises_401():
    fake_claims = {
        "sub": "x",
        "email": "x@x.com",
        "email_verified": True,
        "iss": "https://evil.example.com",  # not Google
        "aud": "test-client-id",
    }
    with (
        patch("app.auth.service.settings") as mock_settings,
        patch(
            "app.auth.service.google_id_token.verify_oauth2_token",
            return_value=fake_claims,
        ),
    ):
        mock_settings.google_client_id = "test-client-id"
        with pytest.raises(HTTPException) as exc:
            await verify_google_id_token("fake.jwt.token")
    assert exc.value.status_code == 401
    assert exc.value.detail == "invalid_id_token"


@pytest.mark.asyncio
async def test_jwks_transport_error_raises_503():
    with patch(
        "app.auth.service.google_id_token.verify_oauth2_token",
        side_effect=TransportError("jwks fetch failed"),
    ):
        with pytest.raises(HTTPException) as exc:
            await verify_google_id_token("fake.jwt.token")
    assert exc.value.status_code == 503
    assert exc.value.detail == "verify_unavailable"
```

- [ ] **Step 3: Run test to verify failure**

```bash
cd backend && uv run pytest tests/unit/test_verify_google_id_token.py -v
```

Expected: fails because `verify_google_id_token` does not exist yet.

- [ ] **Step 4: Implement the helper**

Open `backend/app/auth/service.py`. At the top, add:

```python
import asyncio

from google.auth import exceptions as google_auth_exceptions
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from fastapi import HTTPException
```

At the bottom of the file, add:

```python
_GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


async def verify_google_id_token(raw: str) -> dict:
    """Verify a Google-issued ID token and return its claims.

    Raises HTTPException(401, 'invalid_id_token') on any validation
    failure (signature, audience, expiry, issuer, malformed). Raises
    HTTPException(503, 'verify_unavailable') if Google's JWKS endpoint
    is transiently unreachable — the frontend can retry on the next
    page load rather than being forced back to the sign-in page.
    """
    try:
        # google-auth is synchronous and fetches JWKS over the network;
        # run it off the event loop to avoid blocking other requests.
        claims = await asyncio.to_thread(
            google_id_token.verify_oauth2_token,
            raw,
            google_requests.Request(),
            settings.google_client_id,
        )
    except google_auth_exceptions.TransportError as exc:
        logger.warning("google_id_token: JWKS fetch failed: %s", exc)
        raise HTTPException(status_code=503, detail="verify_unavailable") from exc
    except ValueError:
        # verify_oauth2_token raises ValueError for every validation failure;
        # do not leak which one to the caller.
        raise HTTPException(status_code=401, detail="invalid_id_token") from None

    if claims.get("iss") not in _GOOGLE_ISSUERS:
        raise HTTPException(status_code=401, detail="invalid_id_token")
    return claims
```

- [ ] **Step 5: Run test to verify pass**

```bash
cd backend && uv run pytest tests/unit/test_verify_google_id_token.py -v
```

Expected: all 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/pyproject.toml backend/uv.lock backend/app/auth/service.py backend/tests/unit/test_verify_google_id_token.py
git commit -m "feat(auth): verify_google_id_token helper + google-auth dep"
```

---

## Task 2: Bump refresh-token TTL default 30d → 365d

**Files:**
- Modify: `backend/app/config.py:30`
- Modify: `backend/tests/unit/test_config.py` (create if missing)

- [ ] **Step 1: Write failing test**

Create or extend `backend/tests/unit/test_config.py` with:

```python
from app.config import settings


def test_refresh_token_ttl_default_is_one_year():
    """Defaults to 365 days so refresh cookies don't force monthly re-sign-in.

    Sliding window already in place in /auth/refresh; this is the absolute
    cap for genuinely dormant sessions.
    """
    assert settings.refresh_token_expire_days == 365
```

Run:

```bash
cd backend && uv run pytest tests/unit/test_config.py::test_refresh_token_ttl_default_is_one_year -v
```

Expected: fails, default is 30.

- [ ] **Step 2: Update config**

`backend/app/config.py:30`:

```python
    refresh_token_expire_days: int = 365
```

- [ ] **Step 3: Run test to verify pass**

```bash
cd backend && uv run pytest tests/unit/test_config.py::test_refresh_token_ttl_default_is_one_year -v
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add backend/app/config.py backend/tests/unit/test_config.py
git commit -m "feat(auth): extend refresh-token TTL default to 365 days

Sliding window already in /auth/refresh, so daily-active users were
already evergreen — but the hard 30-day cap forced users who visit
less often to re-sign-in. 365 days matches consumer-app norms and is
well within Safari's HTTP-set-cookie absolute cap."
```

---

## Task 3: `POST /auth/google-id-token` endpoint

**Files:**
- Modify: `backend/app/auth/router.py`
- Create: `backend/tests/unit/test_google_id_token_router.py`

- [ ] **Step 1: Inspect the existing Google flow**

Read `backend/app/auth/router.py` around the `/google` endpoint. Identify the Person-upsert helper (it will be either `_upsert_google_person` or inline in the handler). The new endpoint reuses the same upsert logic.

- [ ] **Step 2: Write the happy-path failing test**

Create `backend/tests/unit/test_google_id_token_router.py`:

```python
"""Unit tests for POST /auth/google-id-token."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


HAPPY_CLAIMS = {
    "sub": "google-sub-abc",
    "email": "alice@example.com",
    "email_verified": True,
    "name": "Alice Smith",
    "picture": "https://example.com/a.png",
    "iss": "https://accounts.google.com",
    "aud": "test-client-id",
}


def test_happy_path_issues_session_cookie(client):
    with (
        patch(
            "app.auth.router.verify_google_id_token",
            AsyncMock(return_value=HAPPY_CLAIMS),
        ),
        patch(
            "app.auth.router._upsert_google_person",
            AsyncMock(return_value={"user_id": "u-1", "email": "alice@example.com"}),
        ),
        patch(
            "app.auth.router.issue_refresh_token",
            AsyncMock(return_value=("raw-refresh-token", "tok-id", __import__("datetime").datetime(2027, 4, 22))),
        ),
    ):
        resp = client.post(
            "/auth/google-id-token",
            json={"id_token": "fake.jwt.token"},
        )
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    assert "__session" in resp.cookies


def test_rejects_unverified_email(client):
    unverified = {**HAPPY_CLAIMS, "email_verified": False}
    with patch(
        "app.auth.router.verify_google_id_token",
        AsyncMock(return_value=unverified),
    ):
        resp = client.post(
            "/auth/google-id-token",
            json={"id_token": "fake.jwt.token"},
        )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "invalid_id_token"


def test_verify_failure_surfaces_401(client):
    from fastapi import HTTPException

    with patch(
        "app.auth.router.verify_google_id_token",
        AsyncMock(side_effect=HTTPException(401, detail="invalid_id_token")),
    ):
        resp = client.post(
            "/auth/google-id-token",
            json={"id_token": "bad.token"},
        )
    assert resp.status_code == 401


def test_source_field_accepted(client):
    """source is an optional telemetry hint — request must succeed."""
    with (
        patch(
            "app.auth.router.verify_google_id_token",
            AsyncMock(return_value=HAPPY_CLAIMS),
        ),
        patch(
            "app.auth.router._upsert_google_person",
            AsyncMock(return_value={"user_id": "u-1", "email": "alice@example.com"}),
        ),
        patch(
            "app.auth.router.issue_refresh_token",
            AsyncMock(return_value=("raw", "id", __import__("datetime").datetime(2027, 4, 22))),
        ),
    ):
        resp = client.post(
            "/auth/google-id-token",
            json={"id_token": "fake.jwt.token", "source": "fedcm"},
        )
    assert resp.status_code == 200


def test_rate_limit_6th_request_is_throttled(client):
    """SlowAPI 5/minute keyed on client IP."""
    with (
        patch(
            "app.auth.router.verify_google_id_token",
            AsyncMock(return_value=HAPPY_CLAIMS),
        ),
        patch(
            "app.auth.router._upsert_google_person",
            AsyncMock(return_value={"user_id": "u-1", "email": "alice@example.com"}),
        ),
        patch(
            "app.auth.router.issue_refresh_token",
            AsyncMock(return_value=("raw", "id", __import__("datetime").datetime(2027, 4, 22))),
        ),
    ):
        responses = [
            client.post(
                "/auth/google-id-token",
                json={"id_token": f"token-{i}"},
            )
            for i in range(6)
        ]
    # First 5 succeed, 6th is throttled.
    assert [r.status_code for r in responses[:5]] == [200, 200, 200, 200, 200]
    assert responses[5].status_code == 429
```

Run:

```bash
cd backend && uv run pytest tests/unit/test_google_id_token_router.py -v
```

Expected: fails — endpoint doesn't exist.

- [ ] **Step 3: Add the Pydantic request model**

In `backend/app/auth/router.py`, near the other Pydantic models (search for existing `class` definitions ending with `Request` or similar), add:

```python
from typing import Literal


class GoogleIdTokenRequest(BaseModel):
    id_token: str
    source: Literal["fedcm", "onetap"] | None = None  # telemetry hint
```

- [ ] **Step 4: Implement the endpoint**

Add to `backend/app/auth/router.py`, near the existing `/google` endpoint:

```python
from app.auth.service import verify_google_id_token


@router.post("/google-id-token")
@limiter.limit("5/minute")
async def google_id_token_login(
    request: Request,
    response: Response,
    body: GoogleIdTokenRequest,
    db: AsyncDriver = Depends(get_db),
):
    """Verify a Google ID token and mint an Orbis session cookie.

    Called by the frontend silent-re-auth flow (FedCM or GIS One Tap),
    which already has a Google-signed JWT in hand and just needs Orbis
    to trust it in lieu of re-running the authorization-code dance.
    """
    claims = await verify_google_id_token(body.id_token)
    if not claims.get("email_verified"):
        raise HTTPException(status_code=401, detail="invalid_id_token")

    user = await _upsert_google_person(db, claims)

    raw, _token_id, expires_at = await issue_refresh_token(
        db,
        user_id=user["user_id"],
        ttl_days=settings.refresh_token_expire_days,
        user_agent=request.headers.get("user-agent", ""),
    )
    access = create_jwt(user["user_id"], user["email"])
    set_auth_cookies(
        response,
        access_token=access,
        refresh_raw=raw,
        refresh_expires_at=expires_at,
    )
    logger.info(
        "auth: id-token login user=%s source=%s",
        user["user_id"],
        body.source or "unknown",
    )
    return {"status": "ok", "source": "id_token"}
```

If `_upsert_google_person` does not exist as a named helper today (the logic may be inline in the `/google` handler), extract it before implementing. Sketch:

```python
async def _upsert_google_person(db: AsyncDriver, claims: dict) -> dict:
    # Move the existing /google Person upsert block here verbatim.
    # Return {"user_id": ..., "email": ...}.
    ...
```

Then have the existing `/google` handler call this helper so the two endpoints stay in lock-step forever.

- [ ] **Step 5: Run tests to verify pass**

```bash
cd backend && uv run pytest tests/unit/test_google_id_token_router.py -v
```

Expected: all 5 tests pass.

- [ ] **Step 6: Rerun full auth test suite as a regression check**

```bash
cd backend && uv run pytest tests/unit/ -k auth -v
```

Expected: no failures — the refactor of `_upsert_google_person` should leave `/google` behavior identical.

- [ ] **Step 7: Commit**

```bash
git add backend/app/auth/router.py backend/tests/unit/test_google_id_token_router.py
git commit -m "feat(auth): POST /auth/google-id-token for silent re-auth

Verifies a Google-issued ID token (from FedCM or GIS One Tap on the
frontend) and issues the same __session cookie /auth/google produces.
Shares the Person upsert with /auth/google via a new private helper
so the two login paths can never drift.

Rate-limited 5/min per IP."
```

---

## Task 4: Frontend `silentReauth.ts` — FedCM path

**Files:**
- Create: `frontend/src/auth/silentReauth.ts`
- Create: `frontend/src/auth/silentReauth.test.ts`
- Modify: `frontend/src/api/auth.ts` (add the `/auth/google-id-token` helper)

- [ ] **Step 1: Add the API helper**

In `frontend/src/api/auth.ts`, add at the bottom:

```ts
export async function googleIdTokenLogin(
  idToken: string,
  source: 'fedcm' | 'onetap',
): Promise<void> {
  await client.post('/auth/google-id-token', { id_token: idToken, source });
}
```

- [ ] **Step 2: Write the failing test (FedCM happy path)**

Create `frontend/src/auth/silentReauth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/auth', () => ({
  googleIdTokenLogin: vi.fn(),
}));

import { trySilentReauth } from './silentReauth';
import { googleIdTokenLogin } from '../api/auth';

function stubFedCM(idToken: string | null) {
  const fakeCredential = idToken ? { token: idToken } : null;
  // jsdom does not implement the Credential Management API
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
    sessionStorage.clear();
  });

  it('returns true when FedCM returns an ID token and backend accepts it', async () => {
    stubFedCM('google.id.token');
    (googleIdTokenLogin as any).mockResolvedValue(undefined);

    const ok = await trySilentReauth();
    expect(ok).toBe(true);
    expect(googleIdTokenLogin).toHaveBeenCalledWith('google.id.token', 'fedcm');
    unstubFedCM();
  });

  it('returns false when FedCM resolves with null (user dismissed)', async () => {
    stubFedCM(null);
    const ok = await trySilentReauth();
    // FedCM failure falls through to One Tap which is unavailable in jsdom,
    // so end state is false. Covered in Task 5 once One Tap is wired in.
    expect(ok).toBe(false);
    expect(googleIdTokenLogin).not.toHaveBeenCalled();
    unstubFedCM();
  });
});
```

Run:

```bash
cd frontend && npx vitest run src/auth/silentReauth.test.ts
```

Expected: fails — module does not exist.

- [ ] **Step 3: Implement FedCM-only module**

Create `frontend/src/auth/silentReauth.ts`:

```ts
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
    } catch {
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
```

Export the session-storage key so the authStore can use it:

```ts
export const SILENT_REAUTH_JUST_LOGGED_OUT_KEY = JUST_LOGGED_OUT_KEY;
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd frontend && npx vitest run src/auth/silentReauth.test.ts
```

Expected: 2/2 pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/auth/silentReauth.ts frontend/src/auth/silentReauth.test.ts frontend/src/api/auth.ts
git commit -m "feat(auth): silentReauth module with FedCM path

Step 1 of silent re-establishment of the Orbis session when the
refresh cookie is gone. Chrome/Firefox users who are signed into
Google via the same browser profile will now skip the sign-in
screen entirely. One Tap fallback for other browsers follows in
the next commit."
```

---

## Task 5: Frontend `silentReauth` — One Tap fallback

**Files:**
- Modify: `frontend/src/auth/silentReauth.ts`
- Modify: `frontend/src/auth/silentReauth.test.ts`

- [ ] **Step 1: Write failing test for fallback order**

Append to `frontend/src/auth/silentReauth.test.ts`:

```ts
describe('trySilentReauth — One Tap fallback', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
  });

  it('falls back to One Tap when FedCM resolves with null', async () => {
    stubFedCM(null);
    // Simulate GIS being available and firing the callback with an ID token.
    const originalGoogle = (globalThis as any).google;
    (globalThis as any).google = {
      accounts: {
        id: {
          initialize: vi.fn((opts: any) => {
            // Fire the callback asynchronously as the real GIS lib does.
            setTimeout(() => opts.callback({ credential: 'onetap.id.token' }), 0);
          }),
          prompt: vi.fn(),
        },
      },
    };
    (googleIdTokenLogin as any).mockResolvedValue(undefined);

    const ok = await trySilentReauth();
    expect(ok).toBe(true);
    expect(googleIdTokenLogin).toHaveBeenCalledWith('onetap.id.token', 'onetap');

    (globalThis as any).google = originalGoogle;
    unstubFedCM();
  });

  it('returns false when neither FedCM nor One Tap produce a token', async () => {
    stubFedCM(null);
    const originalGoogle = (globalThis as any).google;
    (globalThis as any).google = {
      accounts: {
        id: {
          initialize: vi.fn((opts: any) => {
            // Never call the callback — simulates user dismissal / rate limit.
          }),
          prompt: vi.fn((notification: (n: any) => void) => {
            setTimeout(() => notification({ isNotDisplayed: () => true }), 0);
          }),
        },
      },
    };

    const ok = await trySilentReauth();
    expect(ok).toBe(false);
    expect(googleIdTokenLogin).not.toHaveBeenCalled();

    (globalThis as any).google = originalGoogle;
    unstubFedCM();
  });
});
```

Run to confirm failure:

```bash
cd frontend && npx vitest run src/auth/silentReauth.test.ts
```

Expected: 2 new tests fail.

- [ ] **Step 2: Add One Tap fallback in `silentReauth.ts`**

Extend the `inFlight` body:

```ts
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
    } catch {
      return false;
    } finally {
      inFlight = null;
    }
  })();
```

Add `runOneTap()` at the bottom:

```ts
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let gisScriptLoading: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if ((globalThis as any).google?.accounts?.id) return Promise.resolve();
  if (gisScriptLoading) return gisScriptLoading;
  gisScriptLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('gis_load_failed'));
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
    // Safety timeout — One Tap can stall silently on some browsers.
    setTimeout(() => finish(null), 4000);
  });
}
```

- [ ] **Step 3: Run tests**

```bash
cd frontend && npx vitest run src/auth/silentReauth.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/auth/silentReauth.ts frontend/src/auth/silentReauth.test.ts
git commit -m "feat(auth): One Tap fallback for Safari / FedCM-unavailable

When FedCM is unsupported or returns no credential, fall through to
Google Identity Services' One Tap. Loads GIS lazily on first use,
auto-select mode on, 4-second safety timeout in case the prompt
stalls silently."
```

---

## Task 6: Sign-out-respect hook

**Files:**
- Modify: `frontend/src/stores/authStore.ts`
- Modify: `frontend/src/auth/silentReauth.test.ts`

- [ ] **Step 1: Write failing test**

Append to `silentReauth.test.ts`:

```ts
it('short-circuits when orbis.just_logged_out is set', async () => {
  sessionStorage.setItem('orbis.just_logged_out', '1');
  stubFedCM('should.not.be.used');
  const ok = await trySilentReauth();
  expect(ok).toBe(false);
  expect(googleIdTokenLogin).not.toHaveBeenCalled();
  unstubFedCM();
});
```

Run:

```bash
cd frontend && npx vitest run src/auth/silentReauth.test.ts
```

Expected: passes (already implemented in Task 4). Kept as a regression fence.

- [ ] **Step 2: Hook into authStore.logout() and clear on successful login**

In `frontend/src/stores/authStore.ts`, modify the `logout` action and both login paths:

```ts
  loginGoogle: async (code: string) => {
    set({ loading: true });
    try {
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
```

- [ ] **Step 3: Verify no existing auth tests broke**

```bash
cd frontend && npx vitest run src/stores/ src/auth/
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/stores/authStore.ts frontend/src/auth/silentReauth.test.ts
git commit -m "feat(auth): honor explicit logout in silent re-auth

Setting sessionStorage['orbis.just_logged_out'] on logout prevents
silentReauth from instantly re-establishing the session the user
just explicitly tore down. Cleared naturally when the tab closes,
which matches the 'tab-scoped intent to stay signed out' we want."
```

---

## Task 7: Axios interceptor integration + loop guard

**Files:**
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/api/client.test.ts` (if not present)

- [ ] **Step 1: Write failing test**

Create `frontend/src/api/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import client from './client';

vi.mock('../auth/silentReauth', () => ({
  trySilentReauth: vi.fn(),
}));

import { trySilentReauth } from '../auth/silentReauth';

describe('axios interceptor — silent re-auth integration', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(client);
    vi.resetAllMocks();
  });

  it('401 + refresh-fail + silent-success → retries and succeeds', async () => {
    let call = 0;
    mock.onGet('/foo').reply(() => {
      call += 1;
      return call === 1 ? [401, {}] : [200, { ok: true }];
    });
    mock.onPost('/auth/refresh').reply(401);
    (trySilentReauth as any).mockResolvedValue(true);

    const res = await client.get('/foo');
    expect(res.data).toEqual({ ok: true });
    expect(trySilentReauth).toHaveBeenCalledOnce();
  });

  it('401 + refresh-fail + silent-fail → dispatches session-expired', async () => {
    mock.onGet('/foo').reply(401);
    mock.onPost('/auth/refresh').reply(401);
    (trySilentReauth as any).mockResolvedValue(false);

    const handler = vi.fn();
    window.addEventListener('orbis:session-expired', handler);
    await expect(client.get('/foo')).rejects.toThrow();
    expect(handler).toHaveBeenCalledOnce();
    window.removeEventListener('orbis:session-expired', handler);
  });

  it('loop guard: silent re-auth only tried once per request', async () => {
    mock.onGet('/foo').reply(401);
    mock.onPost('/auth/refresh').reply(401);
    (trySilentReauth as any).mockResolvedValue(true);
    // After silent succeeds, retry still fails — we must NOT try silent again.
    await expect(client.get('/foo')).rejects.toThrow();
    expect(trySilentReauth).toHaveBeenCalledOnce();
  });
});
```

Install `axios-mock-adapter` if not already present:

```bash
cd frontend && npm i -D axios-mock-adapter
```

Run:

```bash
cd frontend && npx vitest run src/api/client.test.ts
```

Expected: fails — interceptor doesn't call trySilentReauth.

- [ ] **Step 2: Implement the hook**

In `frontend/src/api/client.ts`, extend the response interceptor. Current pseudo-structure:

```ts
// After refresh attempt, if still 401:
//   dispatch session-expired
//   reject
```

New structure:

```ts
// After refresh attempt, if still 401:
//   if (!original._triedSilentReauth) {
//     original._triedSilentReauth = true;
//     const ok = await trySilentReauth();
//     if (ok) return client.request(original);
//   }
//   dispatch session-expired
//   reject
```

Specifically, find the block that currently dispatches `orbis:session-expired`. Before it, add:

```ts
import { trySilentReauth } from '../auth/silentReauth';

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retriedAfterRefresh?: boolean;
  _triedSilentReauth?: boolean;
}
```

And in the interceptor, at the point where refresh has failed:

```ts
if (!original._triedSilentReauth) {
  original._triedSilentReauth = true;
  const silentOk = await trySilentReauth();
  if (silentOk) {
    return client.request(original);
  }
}
window.dispatchEvent(new CustomEvent('orbis:session-expired'));
return Promise.reject(refreshError);
```

- [ ] **Step 3: Run tests**

```bash
cd frontend && npx vitest run src/api/client.test.ts
```

Expected: all 3 pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/api/client.test.ts frontend/package.json frontend/package-lock.json
git commit -m "feat(auth): wire silent re-auth into axios 401 handler

Between refresh-fail and session-expired dispatch, try silentReauth.
On success, retry the original request transparently. On failure,
fall through to the existing landing-page redirect. Loop guard
(_triedSilentReauth) ensures a stuck silent-success-then-still-401
scenario doesn't fire silent re-auth repeatedly."
```

---

## Task 8: Refresh-race pre-emptive retry

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/client.test.ts`

- [ ] **Step 1: Write failing test**

Append to `client.test.ts`:

```ts
describe('axios interceptor — refresh race', () => {
  let mock: MockAdapter;
  beforeEach(() => {
    mock = new MockAdapter(client);
    vi.resetAllMocks();
  });

  it('retries original request when another tab rotated the cookie <500ms ago', async () => {
    // Tab B "just refreshed" in the background — simulated by calling
    // /auth/refresh successfully right before tab A's burst.
    mock.onPost('/auth/refresh').replyOnce(200);
    let call = 0;
    mock.onGet('/foo').reply(() => {
      call += 1;
      return call === 1 ? [401, {}] : [200, { ok: true }];
    });

    // Prime the success marker by performing one refresh.
    await client.post('/auth/refresh');

    // Second refresh (from our 401 flow) fails because the token was
    // already rotated. But because the success marker is <500ms old,
    // the interceptor should retry the original request once anyway.
    mock.onPost('/auth/refresh').replyOnce(401);

    const res = await client.get('/foo');
    expect(res.data).toEqual({ ok: true });
  });
});
```

Expected: fails — behavior not implemented.

- [ ] **Step 2: Implement race fix**

In `client.ts`, add:

```ts
let lastSuccessfulRefreshAt = 0;
const REFRESH_RACE_WINDOW_MS = 500;

async function refreshSession(): Promise<void> {
  await axios.post(`${API_BASE}/auth/refresh`, undefined, { withCredentials: true });
  lastSuccessfulRefreshAt = Date.now();
}
```

And in the 401 handler, before the silent-re-auth attempt:

```ts
if (Date.now() - lastSuccessfulRefreshAt < REFRESH_RACE_WINDOW_MS) {
  return client.request(original);
}
```

- [ ] **Step 3: Run tests**

```bash
cd frontend && npx vitest run src/api/client.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/api/client.test.ts
git commit -m "fix(auth): retry original request after cross-tab refresh race

When another tab successfully refreshed within the last 500ms, a
fresh __session cookie is already on the request even though this
tab's /auth/refresh call failed. Retry the original request once
before surfacing failure — prevents spurious family-revocation and
false session-expired toasts when the user has multiple tabs open."
```

---

## Task 9: Kill switch — `SILENT_REAUTH_ENABLED` env var

**Files:**
- Modify: `frontend/src/auth/silentReauth.ts`
- Modify: `frontend/src/auth/silentReauth.test.ts`
- Modify: `frontend/src/vite-env.d.ts`
- Modify: `frontend/.env.example`

- [ ] **Step 1: Add env var declaration**

In `frontend/src/vite-env.d.ts`, add:

```ts
  readonly VITE_SILENT_REAUTH_ENABLED?: string;
```

In `frontend/.env.example`, add:

```
# Set to "false" to disable silent-re-auth (FedCM + One Tap) for emergency
# rollback. Default behavior is enabled.
VITE_SILENT_REAUTH_ENABLED=true
```

- [ ] **Step 2: Write failing test**

Append to `silentReauth.test.ts`:

```ts
it('short-circuits when VITE_SILENT_REAUTH_ENABLED=false', async () => {
  vi.stubEnv('VITE_SILENT_REAUTH_ENABLED', 'false');
  stubFedCM('ignored.token');
  const ok = await trySilentReauth();
  expect(ok).toBe(false);
  expect(googleIdTokenLogin).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  unstubFedCM();
});
```

Expected: fails — no check.

- [ ] **Step 3: Implement check**

At the top of `trySilentReauth` body (before the just_logged_out check):

```ts
  if (import.meta.env.VITE_SILENT_REAUTH_ENABLED === 'false') {
    return false;
  }
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run src/auth/silentReauth.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/auth/silentReauth.ts frontend/src/auth/silentReauth.test.ts frontend/src/vite-env.d.ts frontend/.env.example
git commit -m "feat(auth): VITE_SILENT_REAUTH_ENABLED kill switch

Set to 'false' at build time (CI env / Dockerfile) to disable FedCM
and One Tap and force the explicit-sign-in path. Default: enabled."
```

---

## Task 10: Documentation updates

**Files:**
- Modify: `docs/api.md`
- Modify: `docs/architecture.md`
- Modify: `docs/deployment.md`
- Modify: `CLAUDE.md` (rate-limit cheatsheet in `rate_limit.py` comment)

- [ ] **Step 1: Add new endpoint to `docs/api.md`**

Find the `## Auth` section. Add:

```markdown
### `POST /auth/google-id-token`

Accept a Google-issued ID token (from frontend FedCM or GIS One Tap)
and issue the same `__session` cookie as `/auth/google`. Used by the
silent re-auth flow — not for interactive sign-in.

**Body:** `{ id_token: string, source?: "fedcm" | "onetap" }`

**Responses:**
- `200 { status: "ok", source: "id_token" }` + `Set-Cookie: __session=...`
- `401 { detail: "invalid_id_token" }` — signature / audience / expiry / issuer / `email_verified=false`
- `503 { detail: "verify_unavailable" }` — Google JWKS transient failure
- `429` — rate limit (5/min per IP)
```

- [ ] **Step 2: Update `docs/architecture.md`**

Find the auth-flow section. Add one paragraph:

```markdown
**Silent re-auth.** When `/auth/refresh` fails and the user originally
signed in with Google, the frontend (`src/auth/silentReauth.ts`) calls
FedCM (Chrome/Firefox) or GIS One Tap (Safari) to obtain a fresh Google
ID token, POSTs it to `/auth/google-id-token`, and receives a new
`__session` cookie. LinkedIn users and users signed out of Google
fall back to the explicit sign-in landing page.
```

- [ ] **Step 3: Update `docs/deployment.md`**

In the "Frontend build-time variables" table (added in the MCP-OAuth PR), add:

```markdown
| `VITE_SILENT_REAUTH_ENABLED` | `true` | `false` disables the FedCM + One Tap silent re-auth path. Emergency switch; default on. |
```

- [ ] **Step 4: Update rate-limit cheatsheet**

In `backend/app/rate_limit.py` top-of-file docstring and in CLAUDE.md's `rate_limit.py` line, add:

```
- /auth/google-id-token 5/min per IP
```

- [ ] **Step 5: Commit**

```bash
git add docs/api.md docs/architecture.md docs/deployment.md backend/app/rate_limit.py CLAUDE.md
git commit -m "docs: persistent-login silent re-auth

- api.md: POST /auth/google-id-token reference
- architecture.md: silent re-auth flow summary
- deployment.md: VITE_SILENT_REAUTH_ENABLED kill switch
- rate_limit.py + CLAUDE.md: 5/min cap for /auth/google-id-token"
```

---

## Task 11: Final verification pass

- [ ] **Step 1: Backend full suite**

```bash
cd backend && uv run pytest tests/unit/ -v --cov=app --cov-fail-under=50
```

Expected: all unit tests pass, coverage ≥ 50%.

- [ ] **Step 2: Backend lint + format**

```bash
cd backend && uv run ruff check . && uv run ruff format --check .
```

Expected: clean.

- [ ] **Step 3: Frontend full suite**

```bash
cd frontend && npx vitest run
```

Expected: the pre-existing filterStore + e2e failures are the only reds (documented in CLAUDE.md / earlier PRs). All new auth tests green.

- [ ] **Step 4: Frontend lint + build**

```bash
cd frontend && npm run lint && npm run build
```

Expected: lint zero errors (warnings OK); build succeeds.

- [ ] **Step 5: Manual smoke (dev server)**

Start the stack:

```bash
docker compose up -d                    # Neo4j
cd backend && uv run uvicorn app.main:app --reload &
cd frontend && npm run dev
```

Checklist (tick each):

- [ ] Sign in with Google. Confirm session works.
- [ ] DevTools → Application → Cookies → delete `__session`. Reload `/myorbis`.
  - [ ] **Chrome:** lands on `/myorbis` silently (no login screen flash).
  - [ ] **Firefox:** same.
  - [ ] **Safari:** One Tap prompt appears; single click restores session.
- [ ] Click "Sign out". Reload the same tab. Stays signed out (no silent re-auth).
- [ ] Open a new tab. Reload. Now silent re-auth fires (tab-scoped flag).
- [ ] Sign in with LinkedIn. Delete cookie. Reload. Lands on landing page (no silent attempt, no regression).
- [ ] Open two tabs. In tab A, DevTools → Application → Cookies → delete `__session`. In tab B, perform any action that hits the backend. Neither tab should log the user out.

- [ ] **Step 6: If everything green — done. If anything fails — investigate and commit the fix.**
