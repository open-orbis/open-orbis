# MCP OAuth 2.1 Authorization Server — Design Spec

**Date:** 2026-04-21
**Status:** Design approved, awaiting implementation plan

## Goal

Let Orbis users connect AI clients that don't accept static bearer tokens
(ChatGPT, claude.ai web, Gemini) to their own Orbis data via a standard
OAuth 2.1 / MCP 2025-03 flow. The user clicks "Add Orbis" in their AI
client, consents in a browser, and is done — no JSON config, no
copy-paste.

This sits **alongside** the existing `X-MCP-Key` paths (user API keys
`orbk_…` and share tokens `orbs_…`), which stay indefinitely for
clients that are happy with config-file bearer auth (Cursor, Cline,
Claude Code CLI).

## Problem

The MCP share-token work (merged earlier) covers two use cases cleanly:

1. **Power users** — mint an `orbk_` user API key, drop it into a config file.
2. **Owner → stranger's AI** — mint an `orbs_` share token with filters, share the copy-paste JSON.

The third use case — **user connecting their own AI assistant (ChatGPT,
Claude web, Gemini) to their own Orbis data** — is blocked because
those clients require OAuth 2.0 flows, not static bearer tokens.
Adding an OAuth authorization server unlocks every major AI client in
one move.

## Design Decisions

| # | Question | Choice | Why |
|---|---|---|---|
| 1 | What does an OAuth token grant? | **A+: user-equivalent by default, optional share-token overlay at consent time.** | Matches Slack/Google/Notion pattern; reuses existing `_current_share_context` / `_check_access` plumbing from the share-token work; supports both "my AI reads my data" and "this AI sees a filtered view" in one consent flow. |
| 2 | Token format? | **Opaque bearer, DB-lookup on each request.** | Matches repo's existing pattern (`orbk_`, `orbs_`, refresh tokens are all opaque). Instant revocation. No JWKS complexity. Per-request DB hit is already paid by the share-token audit counter. |
| 3 | Coexistence with `X-MCP-Key`? | **Three auth modes, all permanent.** `orbk_` (power users), `orbs_` (copy-paste share), `Authorization: Bearer oauth_` (OAuth clients). | Each use case has different optimal UX; forcing one path breaks the others. Middleware already handles prefix-dispatch; one more branch is trivial. |
| 4 | Dynamic Client Registration policy? | **Open DCR, PKCE-mandatory, S256-only.** | Required by MCP 2025-03 for auto-discovery. Security boundary is the per-user consent screen (decision 1). Rate limit on `/oauth/register` + admin audit log handle abuse. |

## Architecture

### Three auth modes, one middleware

`APIKeyMiddleware.dispatch` in `backend/mcp_server/auth.py` gains a
third branch alongside the existing `orbk_` / `orbs_` handlers:

```
Request
  │
  ├─ X-MCP-Key: orbk_…          → resolve_api_key → _current_user_id
  ├─ X-MCP-Key: orbs_…          → validate_share_token_for_mcp
  │                                → _current_share_context
  ├─ Authorization: Bearer oauth_  → resolve_oauth_token → one of:
  │                                ├─ _current_user_id     (Full mode)
  │                                └─ _current_share_context (Restricted mode)
  └─ (none / other)             → 401
```

Everything below the middleware — rate limiter, `_resolve_scope`,
`_check_access`, the five tools — is already share-context-aware from
the share-token PR. OAuth bolts on **without changing any downstream
code**.

### Auth server lives in the main backend

`backend/app/oauth/` on the FastAPI app that serves `/api/*` today. Not
a separate service:

- Shares the Postgres + Neo4j connections already open.
- Consent screen uses the existing session cookie — no cross-domain
  cookie dance.
- No operational cost of a new service at low volume.

The MCP server (`backend/mcp_server/`, deployed separately on Cloud
Run) gets direct Postgres access to resolve OAuth tokens on each
request. Alternative "MCP server calls main API to resolve" is rejected
on latency grounds — tokens are validated on every tool call.

## Data Model (Postgres)

All new tables; no migrations touch existing data.

### `oauth_clients`

```sql
CREATE TABLE oauth_clients (
  client_id                    UUID PRIMARY KEY,
  client_secret_hash           TEXT,          -- sha256; NULL for public (PKCE-only)
  client_name                  TEXT NOT NULL, -- from DCR metadata
  redirect_uris                TEXT[] NOT NULL,
  token_endpoint_auth_method   TEXT NOT NULL DEFAULT 'none',
  registered_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  registered_from_ip           INET,          -- audit trail
  registered_user_agent        TEXT,          -- audit trail
  disabled_at                  TIMESTAMPTZ    -- admin disable without delete
);
CREATE INDEX idx_oauth_clients_registered_at ON oauth_clients(registered_at DESC);
```

### `oauth_authorization_codes` (short-lived, single-use)

```sql
CREATE TABLE oauth_authorization_codes (
  code                  TEXT PRIMARY KEY,      -- 32-byte urlsafe
  client_id             UUID NOT NULL REFERENCES oauth_clients(client_id),
  user_id               TEXT NOT NULL,         -- Person.user_id (Neo4j)
  share_token_id        TEXT,                  -- NULL = Full, set = Restricted
  scope                 TEXT NOT NULL DEFAULT 'orbis.read',
  redirect_uri          TEXT NOT NULL,         -- exact match at exchange time
  code_challenge        TEXT NOT NULL,         -- PKCE
  code_challenge_method TEXT NOT NULL,         -- must be 'S256'
  expires_at            TIMESTAMPTZ NOT NULL,  -- 5 min
  consumed_at           TIMESTAMPTZ            -- single-use
);
CREATE INDEX idx_oauth_codes_expires ON oauth_authorization_codes(expires_at);
```

### `oauth_access_tokens`

```sql
CREATE TABLE oauth_access_tokens (
  token_hash      TEXT PRIMARY KEY,       -- sha256 of opaque token
  client_id       UUID NOT NULL REFERENCES oauth_clients(client_id),
  user_id         TEXT NOT NULL,
  share_token_id  TEXT,                   -- NULL = Full
  scope           TEXT NOT NULL,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,   -- 1 hour
  revoked_at      TIMESTAMPTZ,
  last_used_at    TIMESTAMPTZ             -- fire-and-forget per request
);
CREATE INDEX idx_oauth_access_user ON oauth_access_tokens(user_id);
CREATE INDEX idx_oauth_access_expires ON oauth_access_tokens(expires_at);
```

### `oauth_refresh_tokens`

```sql
CREATE TABLE oauth_refresh_tokens (
  token_hash      TEXT PRIMARY KEY,
  client_id       UUID NOT NULL REFERENCES oauth_clients(client_id),
  user_id         TEXT NOT NULL,
  share_token_id  TEXT,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,   -- 30 days
  revoked_at      TIMESTAMPTZ,
  rotated_to      TEXT                    -- token_hash of replacement
);
CREATE INDEX idx_oauth_refresh_user ON oauth_refresh_tokens(user_id);
```

**TTLs:**

- Access token: 1 hour (short enough that revocation lag is tolerable)
- Refresh token: 30 days with rotation (RFC 6749 §6)

**Why hash, not clear-store:**

Tokens are returned to the client in clear exactly once at issue time.
The DB stores `sha256(token)` only — a DB dump does not expose live
bearer credentials. Lookup per request is `sha256(incoming) == row.token_hash`.

**Reference semantics:**

`user_id` and `share_token_id` reference Neo4j primary keys as strings
(no FK constraint — same convention as existing `Person.user_id`
references from Postgres-side `cv_jobs`).

## Endpoints

All under `backend/app/oauth/`.

### Discovery (public, unauthenticated)

- `GET /.well-known/oauth-authorization-server` (RFC 8414)
- `GET /.well-known/oauth-protected-resource` (MCP 2025-03, served by the MCP server)

Returns static metadata describing issuer, endpoints, scopes
(`orbis.read`), grant types (`authorization_code`, `refresh_token`),
code-challenge methods (`S256` only).

### Registration

- `POST /oauth/register` — RFC 7591.
  Rate-limited to **10 registrations/IP/day** via `slowapi`.
  Validates `redirect_uris` (must be absolute HTTPS or `localhost:*`).
  Rejects `token_endpoint_auth_method` values other than `none` or
  `client_secret_post`.
  Returns `client_id` (and `client_secret` if confidential client
  requested).

### Authorization

- `GET /oauth/authorize?response_type=code&client_id=…&…`

  Server-side checks:
  1. `client_id` exists, not disabled.
  2. `redirect_uri` matches one of the client's registered URIs exactly.
  3. `code_challenge_method == 'S256'`.
  4. User is authenticated (session cookie); if not, redirect to
     `/login?next=<full-authorize-url>`.

  If all checks pass, renders the React consent page (below).

- `POST /oauth/authorize`

  Form submit from consent. Payload: `client_id`, `state`,
  `code_challenge`, `code_challenge_method`, `redirect_uri`, and the
  user's choice — either `access_mode=full` or `access_mode=restricted`
  with `share_token_id=<id>`.

  Creates an `oauth_authorization_codes` row (5-minute TTL), redirects
  to `<redirect_uri>?code=<code>&state=<state>`.

### Token exchange

- `POST /oauth/token` with `grant_type=authorization_code` —
  Validates the code (exists, not consumed, not expired), marks
  `consumed_at = now()`, verifies PKCE
  (`base64url(sha256(code_verifier)) == code_challenge`), issues access
  + refresh tokens, returns clear tokens in the response body.

- `POST /oauth/token` with `grant_type=refresh_token` —
  Validates the refresh token (exists, not revoked, not rotated),
  rotates: marks old `revoked_at=now()`, sets `rotated_to=<new_hash>`,
  issues new access + refresh pair. If a revoked/rotated token is
  presented, the **entire chain** (all refresh tokens descending from
  it) is revoked per RFC 6749 §6 — detects leaked tokens.

### Revocation

- `POST /oauth/revoke` (RFC 7009) — accepts `access_token` OR
  `refresh_token`. Hashes, sets `revoked_at = now()`. Always returns
  200 per spec (idempotent, opaque to unauthenticated callers).

## User-facing UX

### Consent screen (`GET /oauth/authorize` → React page)

```
┌──────────────────────────────────────────────────────┐
│  ChatGPT wants to access your Orbis data.            │
│                                                      │
│  ○ Full access                                       │
│    ChatGPT reads your own orb, shared orbs, and any  │
│    public orbs you access.                           │
│                                                      │
│  ○ Restricted access                                 │
│    Use a share token to limit what ChatGPT sees.     │
│    [ Recruiter view (hides: skill)       ▾ ]         │
│    [ + Create new share token... ]                   │
│                                                      │
│  Registered: 2026-04-21 · from IP x.x.x.x            │
│  Client ID: <uuid>                                   │
│                                                      │
│  [ Deny ]                            [ Allow ]       │
└──────────────────────────────────────────────────────┘
```

- **"+ Create new share token..."** opens the existing share-token
  minting modal inline; on success, the new token pops into the
  dropdown.
- The `registered_at` / `registered_from_ip` / `client_id` footer lets
  users spot phishy clients (day-old registration from an odd IP for a
  "ChatGPT" client should raise suspicion).

### `/myorbis/connected-ai`

New React page listing active OAuth grants for the current user:

```
┌────────────────────────────────────────────────────────────────┐
│  Connected AI clients                                          │
│  AI agents that can read your Orbis data via OAuth.            │
│                                                                │
│  ChatGPT                                         [ Revoke ]    │
│  Full access · Connected 2 days ago · Last used 4h ago         │
│                                                                │
│  Cursor (macbook-pro)                            [ Revoke ]    │
│  Restricted: "Recruiter view" · Connected last week            │
│  Last used 1h ago                                              │
└────────────────────────────────────────────────────────────────┘
```

Rows grouped by `(client_id, user_id, share_token_id)`. The
`share_token_id` link jumps to the share-token row on the Share panel
so the user can inspect / edit its filters.

API:
- `GET /api/oauth/grants` — returns the current user's grants.
- `DELETE /api/oauth/grants/{client_id}` — revokes all
  access + refresh tokens for that `(user_id, client_id)` pair.
  Idempotent.

### Admin visibility (`/admin` → new panel)

- Recent DCR registrations (for abuse surveillance).
- Recent authorization grants (who approved what).
- Disable any client (`disabled_at = now()`) — prevents new auth flows,
  doesn't touch already-issued tokens.
- Emergency force-revoke any grant.

## Revocation Semantics

| Trigger | Effect |
|---|---|
| User clicks Revoke on `/myorbis/connected-ai` | All tokens for `(user_id, client_id)` marked `revoked_at=now()`. Next MCP call → 401. AI client enters its error state (typically prompts user to reconnect). |
| User revokes backing share token (Restricted grants only) | **Cascade**: `revoke_share_token` now also updates `oauth_access_tokens` / `oauth_refresh_tokens` where `share_token_id == $tid` to set `revoked_at`. User sees the row vanish from `/myorbis/connected-ai`. |
| User deletes Orbis account | Existing account-delete cascade extended to `DELETE FROM oauth_{clients_no,access_tokens,refresh_tokens,authorization_codes}` for that `user_id`. |
| Admin disables a client | `disabled_at` set on `oauth_clients`. Existing tokens keep working; new auth flows (`/oauth/authorize`) return 403. |

## Middleware Integration on MCP Server

In `backend/mcp_server/auth.py`:

```python
elif raw_auth := request.headers.get("authorization"):
    if not raw_auth.startswith("Bearer "):
        return 401
    token = raw_auth[len("Bearer "):]
    grant = await resolve_oauth_token(driver_or_pg, token)
    if grant is None:
        return 401 "invalid, expired, or revoked access token"
    if grant.share_token_id:
        ctx = await load_share_context_for_grant(driver, grant)
        share_token_reset = _current_share_context.set(ctx)
    else:
        user_token_reset = _current_user_id.set(grant.user_id)
```

`resolve_oauth_token` queries Postgres:

```sql
SELECT user_id, share_token_id, scope
FROM oauth_access_tokens
WHERE token_hash = $1
  AND revoked_at IS NULL
  AND expires_at > now();
```

Fire-and-forget `UPDATE oauth_access_tokens SET last_used_at = now() WHERE token_hash = $1`
scheduled via `asyncio.create_task` — same pattern as the share-token
`increment_mcp_use`.

Rate-limit bucket keys extend unchanged: OAuth tokens in Full mode key
on `u:<user_id>` (same as `orbk_`), Restricted mode keys on
`s:<share_token_id>` (same as `orbs_`).

## Testing

### Backend unit tests (mocked Postgres + Neo4j)

| File | Covers |
|---|---|
| `test_oauth_register.py` | DCR happy path; duplicate redirect_uri rejection; IP rate limit; `client_secret_hash` only for confidential |
| `test_oauth_authorize.py` | PKCE validation (S256-only); `redirect_uri` exact-match; unauthed → 302 to `/login?next=…`; consent POST creates auth code with correct `share_token_id` |
| `test_oauth_token.py` | Code-exchange happy path; code-reuse detection; PKCE verifier mismatch; refresh rotation; refresh reuse triggers chain revocation |
| `test_oauth_revoke.py` | Access revoke; refresh revoke; idempotency for unknown tokens |
| `test_oauth_resolver.py` | Valid bearer → grant dict; expired/revoked → None; hash-only lookup |
| `test_mcp_oauth_middleware.py` | Bearer with `share_token_id=NULL` sets `_current_user_id`; with share_token_id sets `_current_share_context`; invalid bearer → 401; `X-MCP-Key` paths unchanged (regression) |
| `test_oauth_grants_router.py` | `GET /api/oauth/grants` scoped to current user; `DELETE /api/oauth/grants/:id` revokes only that user's tokens |
| `test_oauth_cascade.py` | ShareToken revoke cascades; user delete cascades |

### Frontend unit tests (Vitest)

| File | Covers |
|---|---|
| `ConsentPage.test.tsx` | Client name + IP + UA render; Full/Restricted toggle; dropdown lists user's tokens; "Create new" opens minting flow; form submit POSTs correct share_token_id |
| `ConnectedAiClientsPage.test.tsx` | List renders from API; Restricted row shows token label as link; Revoke hits DELETE endpoint and removes row |

### End-to-end integration

One new test file, opt-in marker, real Postgres + Neo4j:
full dance — register → authorize → exchange → MCP call returns
data → revoke → MCP call returns 401.

## Rollout

**Phase 1 — ship the code, soft-launch** (this PR chain):
- All endpoints land.
- `/.well-known/…` returns valid metadata.
- `/myorbis/connected-ai` accessible.
- No in-product CTA advertising the feature (avoid support load until
  stable).

**Phase 2 — promote to users** (follow-up PR):
- Banner in the Share panel: "Connect ChatGPT / Claude / Gemini →".
- Documentation with client-specific setup guides.

**Phase 3 — pre-register flagship clients**:
- Seed `oauth_clients` rows for ChatGPT, Claude, Gemini with known
  redirect URIs and a `pre_registered=true` flag.
- Consent screen for pre-registered clients shows a checkmark and
  official icon, reducing phishing-client risk.

**Rollback:**
`OAUTH_ENABLED=false` env flag causes `/oauth/*` routes to return 503
and the MCP middleware to skip the Bearer branch. No data changes
needed.

## Migration

None. Purely additive (new Postgres tables, new endpoints, new React
page). The `X-MCP-Key` paths are unchanged and unaffected.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| DCR abuse — attacker registers many clients | Medium | 10/IP/day rate limit; admin alert on spike; per-client consent is still the security boundary |
| Consent phishing — attacker registers a "ChatGPT" client with their own redirect | Medium | Consent page surfaces `registered_at` / `registered_from_ip` / `client_id` so user can spot suspicious origin; Phase 3 pre-registered clients show a checkmark |
| Leaked refresh token | Low | Rotation on every refresh; reuse detection → chain revocation |
| Postgres access from MCP server increases blast radius | Low | New Cloud Run IAM policy constrains to oauth_* tables only |
| Token binding confusion when user revokes a share token still wired to an OAuth grant | Medium | Cascade revoke: share-token revoke also marks associated OAuth tokens revoked; row disappears from `/myorbis/connected-ai` |
| Rate-limit bucket collision between OAuth tokens and `orbk_` tokens sharing a user_id | Low | Both intentionally share `u:<user_id>` bucket — the same user shouldn't get double the budget by holding both |

## Success Criteria

- A user signed into claude.ai web clicks "Add Orbis" in Remote MCP
  settings, is redirected through consent, and lands back in Claude
  with Orbis tools available.
- Same flow works for ChatGPT's MCP Connectors settings.
- Gemini CLI / Code Assist continues to work with existing
  `X-MCP-Key` snippets (no regression).
- User revoking from `/myorbis/connected-ai` terminates the AI
  client's access within the next tool call.
- All existing `orbk_` and `orbs_` flows pass their test suites
  unchanged.

## Out of Scope (explicit follow-ups)

- **OIDC layer** (ID tokens, UserInfo endpoint). Orbis isn't an
  identity provider for third parties; we authenticate against Google
  / LinkedIn.
- **Per-tool OAuth scopes** (`orbis.summary.read`, etc.). MCP tools
  are themselves the permission granularity; re-gating via OAuth scope
  is duplicate.
- **JWT access tokens**. YAGNI until volume demands it.
- **Device code flow** (RFC 8628). Useful for TV/CLI without a
  browser; not currently needed by the MCP client ecosystem.
- **Scoped-to-one-orb tokens**. Option B from the brainstorming —
  rejected because A+ (user-equivalent with optional share-token
  overlay) covers the same use cases with less UI complexity.
