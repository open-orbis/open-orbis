# Persistent Login — Silent Re-Auth Design

**Issue:** #406 — feat(auth): persistent login — stop logging users out while they are still active

**Status:** Draft for review

**Author:** Brainstormed 2026-04-22

## Goal

A user who signs in to Orbis once should stay signed in on every device and browser, forever, without seeing a login screen — unless they explicitly sign out or an admin revokes their account. Reaching the end of a session token lifetime should be invisible to them.

## Non-goals

- Orbis as an identity provider for third parties (see #16).
- LinkedIn-provider silent re-auth. LinkedIn does not expose a FedCM-compatible or silent-prompt flow; LinkedIn users keep today's explicit "Sign in with LinkedIn" on expiry. Covered for ~80%+ of sign-ins via the Google path.
- Cross-device session management UI (device list, "log out everywhere" button). Deferred — worthwhile later but orthogonal.
- Refresh-token mirroring into `localStorage`. Safari ITP is less aggressive toward HTTP-set cookies than toward JS-set ones, so an `XSS → localStorage → token exfiltration` risk is not worth its marginal ITP benefit.

## Current state (why today fails the "never logout" bar)

From `backend/app/auth/`:

- Access JWT — 15 min TTL (`jwt_expire_minutes=15`, `config.py:26`).
- Refresh cookie — 30 day TTL, **sliding**. Every successful `/auth/refresh` rotates to a new token with a fresh 30-day expiry, so daily-active users theoretically stay signed in indefinitely.
- Cookie: single `__session` packed as `{access_jwt}|{refresh_token}`, `max_age` = refresh TTL.
- Rotation: on rotation, family revocation on reuse detection.

Failure modes that surface as "I got logged out":

1. **Users returning after >30 days** — refresh cookie expired → explicit sign-in.
2. **Users switching browsers or devices** — no cookie on the new surface → explicit sign-in.
3. **Safari 1st-party-cookie purge (ITP)** — less severe for HTTP-set cookies than reported; still a tail risk.
4. **Two-tab refresh races** — both tabs 401 at once, both call refresh, the loser presents a now-rotated token, family gets revoked, both tabs logged out.

## Proposed approach — Google silent re-auth via FedCM + One Tap

Re-establish the session invisibly (or with a single tap) by asking Google for a fresh ID token when the Orbis cookie is gone. This is the pattern Gmail, Calendar, and other Google-dependent apps use to feel "always logged in."

**Chrome / Firefox:** FedCM API → browser-mediated silent flow, no UI after first opt-in.

**Safari / FedCM-unavailable browsers:** Google Identity Services (GIS) One Tap → small "Continue as …" prompt, single tap confirms.

**LinkedIn / Google-signed-out / prompt dismissed:** fall through to the existing landing page with sign-in buttons (no regression).

## Architecture

Three additions, one tweak:

### 1. `frontend/src/auth/silentReauth.ts` (new)

Single entry point:

```ts
export async function trySilentReauth(): Promise<boolean>
```

Order of operations:

1. **FedCM detection** — `'IdentityCredential' in window && 'credentials' in navigator`. If true, call `navigator.credentials.get({ identity: { providers: [{ configURL: 'https://accounts.google.com/gsi/fedcm.json', clientId: VITE_GOOGLE_CLIENT_ID }] } })`. On success, the returned credential carries a Google ID token.
2. **One Tap fallback** — lazily load `https://accounts.google.com/gsi/client`, call `google.accounts.id.initialize({ client_id, callback, auto_select: true })`, `google.accounts.id.prompt()`. The callback receives a `CredentialResponse.credential` (the ID token).
3. **POST to backend** — `/api/auth/google-id-token` with `{ id_token }`. On 200, `fetchUser()` repopulates the auth store and `trySilentReauth` returns `true`.
4. **Any failure** — return `false`. Caller decides what to do.

**Sign-out respect.** `trySilentReauth` first checks `sessionStorage.getItem('orbis.just_logged_out')`. If present, short-circuits to `false` immediately. Set this key in the `/auth/logout` frontend handler; it naturally clears at tab close. Prevents "Sign out" from being a no-op.

**In-flight guard.** Module-level `silentReauthPromise: Promise<boolean> | null` shared across concurrent callers — parallel 401s converge on one FedCM call.

### 2. `POST /api/auth/google-id-token` (new backend endpoint)

In `backend/app/auth/router.py`:

```python
class GoogleIdTokenRequest(BaseModel):
    id_token: str
    source: Literal["fedcm", "onetap"] | None = None  # telemetry hint

@router.post("/google-id-token")
@limiter.limit("5/minute")
async def google_id_token_login(
    body: GoogleIdTokenRequest,
    request: Request,
    response: Response,
    db: AsyncDriver = Depends(get_db),
) -> dict:
    """Verify a Google-issued ID token and issue an Orbis session.

    Called by the frontend silent-re-auth flow (FedCM or GIS One Tap).
    Shares user-upsert logic with /auth/google; the only difference is
    that here we trust a Google-signed JWT directly instead of exchanging
    an authorization code.
    """
```

Flow:
1. `claims = await verify_google_id_token(body.id_token)` — raises 401 on any validation failure.
2. Enforce `claims.get("email_verified") is True` — same gate as `/auth/google`.
3. `user = await _upsert_person(db, claims)` — reuse existing Google upsert path.
4. `raw, token_id, expires_at = await issue_refresh_token(db, user_id=user.id, ttl_days=settings.refresh_token_expire_days, user_agent=request.headers["user-agent"])`.
5. `access = create_jwt(user.id, claims["email"])`.
6. `set_auth_cookies(response, access_token=access, refresh_raw=raw, refresh_expires_at=expires_at)`.
7. Return `{"status": "ok", "source": "id_token"}`.

Rate limit 5/min per IP — enough for legitimate page-loads, restrictive enough to blunt credential stuffing.

### 3. `backend/app/auth/service.py` — `verify_google_id_token()` helper

```python
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

async def verify_google_id_token(raw: str) -> dict:
    """Return verified Google claims or raise HTTPException."""
    try:
        # google-auth is synchronous; run in a threadpool to avoid
        # blocking the event loop on JWKS fetches.
        claims = await asyncio.to_thread(
            google_id_token.verify_oauth2_token,
            raw,
            google_requests.Request(),
            settings.google_client_id,
        )
    except google.auth.exceptions.TransportError as exc:
        logger.warning("google_id_token: JWKS fetch failed: %s", exc)
        raise HTTPException(503, detail="verify_unavailable") from exc
    except ValueError:
        raise HTTPException(401, detail="invalid_id_token") from None

    iss = claims.get("iss")
    if iss not in {"accounts.google.com", "https://accounts.google.com"}:
        raise HTTPException(401, detail="invalid_id_token")
    return claims
```

Error handling never leaks *which* check failed (signature, audience, expiry) — standard OAuth hygiene.

Requires adding `google-auth` to `backend/pyproject.toml` (currently transitive via `anthropic` but not pinned in Orbis's own deps).

### 4. `frontend/src/api/client.ts` — extend the 401 handler

Today's flow: 401 → `/auth/refresh` → retry; on refresh failure, dispatch `orbis:session-expired`.

New flow inserts `trySilentReauth()` between refresh failure and the dispatch:

```ts
// pseudo-diff
if (refreshFailed) {
  if (!original._triedSilentReauth) {
    original._triedSilentReauth = true;
    const ok = await trySilentReauth();
    if (ok) return client.request(original);
  }
  window.dispatchEvent(new CustomEvent('orbis:session-expired'));
  return Promise.reject(refreshError);
}
```

`_triedSilentReauth` loop guard prevents pathological re-attempts on the same logical request.

### Bonus — refresh-race fix (cheap, high value)

In the same PR, address two-tab refresh races: when `/auth/refresh` returns 401 but the cookie was rotated by another tab in the last 500ms, the original request already has a valid session — we just need to retry. Tracked by a module-level timestamp `lastSuccessfulRefreshAt`; if `Date.now() - lastSuccessfulRefreshAt < 500`, retry the original request once before surfacing the failure.

### Config tweak

`backend/app/config.py`:

```python
refresh_token_expire_days: int = 365   # was 30
```

Cookie sliding already in place; this just extends the absolute cap for users who genuinely don't open Orbis for a year.

## Data flow — four scenarios

**1. Active user, JWT expired, refresh cookie valid** (today's behavior, unchanged):

`/api/foo → 401 → /auth/refresh → 200 → retry → 200`. User never notices.

**2. Returning user, refresh cookie expired, Chrome/Firefox:**

`/api/auth/me → 401 → /auth/refresh → 401 → trySilentReauth() → FedCM fires silently → Google returns ID token → POST /auth/google-id-token → 200 (cookie set) → fetchUser → render`. Zero visible UI. ~300–500ms.

**3. Returning user, refresh cookie expired, Safari:**

Same path, FedCM unsupported → falls through to GIS One Tap → "Continue as Alessandro" prompt → single tap → ID token → cookie. ~1s including the tap.

**4. All silent paths fail** (signed out of Google, FedCM blocked, LinkedIn account, etc.):

`trySilentReauth() → false → dispatch orbis:session-expired → existing handler routes to /`. User clicks explicit sign-in button as today. No regression.

## Error handling

| Condition | Response |
|---|---|
| ID-token signature mismatch | `401 invalid_id_token` (opaque) |
| ID-token expired | `401 invalid_id_token` |
| `email_verified=false` | `401 invalid_id_token` |
| Wrong audience | `401 invalid_id_token` |
| JWKS fetch transient failure | `503 verify_unavailable` (frontend may retry next page-load) |
| Rate-limit exceeded | `429` |
| FedCM user dismissal | Fallback to One Tap |
| GIS script load failure | Return `false` |
| Refresh + silent both fail | `orbis:session-expired` dispatched (existing handler) |
| Explicit `/auth/logout` | `sessionStorage['orbis.just_logged_out']` short-circuits silent re-auth until tab close |

## Security considerations

- **ID token verification** uses `google-auth`'s official helper, which covers signature, issuer, audience, and expiry. Issuer must be `accounts.google.com` or `https://accounts.google.com` — hard-coded allow-list.
- **Rate limit** on `/auth/google-id-token` keeps credential stuffing / JWKS scraping at bay.
- **No raw ID tokens persisted** — the backend verifies once, extracts claims, discards. Only the derived Orbis refresh token hits Neo4j (as today).
- **Sign-out still works.** `sessionStorage['orbis.just_logged_out']` gates silent re-auth. The moment a new tab opens (past the logout), silent re-auth resumes — this is deliberate and matches the "never logout" goal. Explicit full sign-out is a single-tab action by design.
- **Family-revocation on reuse detection** is unchanged from today. The refresh-race bonus is a *pre-emptive* retry that avoids *legitimate* races from triggering revocation; it does not weaken revocation on actual reuse.
- **Telemetry** (`source=google_code | id_token_fedcm | id_token_onetap`) lets us notice silently if silent re-auth stops working in prod. No PII logged.

## Testing

### Backend unit tests (`tests/unit/test_auth_google_id_token.py`, new)

- Happy path — valid mocked token → 200 + `__session` cookie + user upserted
- Wrong audience → 401 `invalid_id_token`
- Expired `exp` claim → 401
- `email_verified=false` → 401
- Issuer not Google → 401
- JWKS fetch failure → 503 `verify_unavailable`
- Rate limit: 6th request within a minute → 429
- New-user path: unseen `sub` → creates Person node with claims (email, name, picture)
- Existing-user path: same `sub` reused → no duplicate Person

### Backend config test (`tests/unit/test_config.py`, extend)

- `settings.refresh_token_expire_days == 365` by default.

### Frontend unit tests (`src/auth/silentReauth.test.ts`, new)

- FedCM supported + returns token → POST succeeds → returns `true`
- FedCM supported + user dismisses → fallback to One Tap → success → `true`
- FedCM unsupported → goes straight to One Tap
- Both paths reject → returns `false`
- Backend returns 401 → `false` (does not throw)
- In-flight guard: two simultaneous callers share one promise
- `orbis.just_logged_out` set → returns `false` without touching Google APIs

### Frontend client interceptor test (extend `client.test.ts` if it exists; add minimal one if not)

- 401 → refresh fails → silent succeeds → original request retried → 200
- 401 → refresh fails → silent fails → `orbis:session-expired` dispatched
- `_triedSilentReauth` loop guard prevents re-attempts on the same request
- Refresh-race: cookie rotated within 500ms window → original request retried once before surfacing failure

### Integration / E2E

FedCM + One Tap require real Google infra and browser chrome. Meaningful automated coverage would need Playwright against staging with a dedicated Google test account and manual FedCM opt-in priming — cost/benefit doesn't justify now. Manual smoke-test checklist below covers deployment verification.

## Manual smoke-test checklist (to run post-deploy on staging)

- [ ] **Chrome, signed into Google:** sign in to Orbis → devtools → delete `__session` cookie → reload → lands on `/myorbis` silently.
- [ ] **Firefox, signed into Google:** same as above.
- [ ] **Safari, signed into Google:** same setup → One Tap prompt appears at top-right → single tap → session restored.
- [ ] **LinkedIn account, expired session:** cookie deleted → reload → lands on landing page (no regression, no spurious silent attempt).
- [ ] **Signed out of Google + Orbis cookie deleted:** reload → silent re-auth no-ops → landing page.
- [ ] **Explicit `/auth/logout`:** click Sign out → cookie cleared → reload same tab → stays signed out (does NOT silently re-auth).
- [ ] **Two tabs open, JWT expires simultaneously:** both 401 at once → one rotates, the other retries successfully; neither gets logged out.
- [ ] **Mobile Safari:** same as desktop Safari — One Tap adapts to the small viewport.
- [ ] **Incognito Chrome:** third-party cookies blocked → One Tap may fail → graceful landing-page fallback.

## Rollout

- **Phase 1** (this spec): code lands, feature active by default behind config flag `SILENT_REAUTH_ENABLED` (default `true`, set `false` for emergency disable).
- **Phase 2** (follow-up, deferred): device-management UI, "log out everywhere" button, session observability dashboard for support.

## Open questions (to resolve during implementation, not blocking spec)

- Which GIS client ID do we use? The existing `VITE_GOOGLE_CLIENT_ID` should work as long as `https://accounts.google.com/gsi/fedcm.json` is registered for that client in Google Cloud Console.
- FedCM's `autoReauthn` vs. `mediation: 'optional'` — which gives the smoothest first-opt-in UX? Decide during implementation after testing both.
- Should the refresh-race fix ship in the same PR or a separate micro-PR? Including it here keeps the PR focused on "fix auto-logout," which is the right unit.
