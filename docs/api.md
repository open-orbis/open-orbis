# API Reference

Base URL: `http://localhost:8000` (dev) — frontend proxies via `/api` prefix.

## Authentication

All protected endpoints require `Authorization: Bearer <jwt>`. JWT is obtained via Google or LinkedIn OAuth.

Admin endpoints additionally require `is_admin = true` on the Person node (returns 403 otherwise).

## Health Check

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Returns `{"status": "ok"}` |

## Auth (`/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/google` | No | Exchange Google OAuth code for JWT. Creates Person on first login. |
| POST | `/auth/linkedin` | No | Exchange LinkedIn OAuth code for JWT. Creates Person on first login. |
| GET | `/auth/me` | JWT | Returns current user info including `activated`, `is_admin`, `gdpr_consent`, `deletion_requested_at` |
| POST | `/auth/activate` | JWT | Validate and consume invite code. Sets `signup_code` on Person. 403 if invalid/used. |
| POST | `/auth/gdpr-consent` | JWT | Sets GDPR consent flag on Person node |
| DELETE | `/auth/me` | JWT | Soft-deletes account (30-day grace period via `deletion_requested_at`) |
| POST | `/auth/me/recover` | JWT | Cancel pending account deletion |
| POST | `/auth/refresh` | JWT | Rotate refresh token (returns new access + refresh tokens) |
| POST | `/auth/logout` | JWT | Revoke refresh token and clear session |
| POST | `/auth/waitlist/join` | JWT | Opt in to waitlist (sets `waitlist_joined_at` on Person) |
| POST | `/auth/api-keys` | JWT | Create MCP API key (returns raw key once; server stores SHA-256 hash). Keys use `orbk_` prefix. |
| GET | `/auth/api-keys` | JWT | List user's API keys (metadata only — `key_id`, `label`, `created_at`, `last_used_at`) |
| DELETE | `/auth/api-keys/{key_id}` | JWT | Revoke an API key |
| POST | `/auth/google-id-token` | No | Silent re-auth: accept a Google-issued ID token (FedCM or GIS One Tap) and issue a new `__session` cookie. Rate-limited 5/min per IP. |

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

## Admin (`/admin`)

All endpoints require `is_admin = true` on the authenticated Person.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/stats` | Admin | Aggregated stats: registered count, pending activation, invite code counts |
| GET | `/admin/beta-config` | Admin | Read `invite_code_required` toggle state |
| PATCH | `/admin/beta-config` | Admin | Update `invite_code_required` (true = codes required, false = open platform) |
| GET | `/admin/access-codes` | Admin | List all invite codes with status (used/available/inactive) |
| POST | `/admin/access-codes` | Admin | Create single invite code (`{code, label?}`). Default UI-generated format is `XXXX-XXXX` (4 alphanumerics + `-` + 4 alphanumerics); any 3–64 character custom code is also accepted. |
| POST | `/admin/access-codes/batch` | Admin | Batch create codes (`{count, prefix?, label?}`). Empty/omitted `prefix` → codes in default `XXXX-XXXX` format; non-empty prefix → legacy `{prefix}-{suffix}` format for campaign tagging. |
| PATCH | `/admin/access-codes/{code}` | Admin | Toggle code active/inactive |
| DELETE | `/admin/access-codes/{code}` | Admin | Delete unused code |
| GET | `/admin/pending-users` | Admin | List users registered but not yet activated |
| GET | `/admin/funnel` | Admin | Waitlist funnel metrics: daily signups/activations, conversion rate (`?days=30`) |
| GET | `/admin/insights` | Admin | Provider breakdown, avg activation time, code attribution, engagement distribution, LLM usage insights |
| GET | `/admin/users` | Admin | List all users (paginated) |
| GET | `/admin/users/{user_id}` | Admin | User detail including `llm_usage` list and `llm_usage_summary` |
| POST | `/admin/users/{user_id}/activate` | Admin | Manually activate a single user and send activation email (best-effort). |
| POST | `/admin/users/activate-batch` | Admin | Batch activate multiple users and send activation emails. |
| POST | `/admin/users/{user_id}/promote` | Admin | Promote user to admin |
| POST | `/admin/users/{user_id}/demote` | Admin | Remove admin role from user |
| DELETE | `/admin/users/{user_id}` | Admin | Permanently delete a user |

## Orbs (`/orbs`)

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| GET | `/orbs/me` | JWT | — | Full orb: person + nodes + links |
| PUT | `/orbs/me` | JWT | — | Update Person profile fields. `email` is **not** in the accepted schema — it is the OAuth sign-up address and can only be changed by re-authenticating with a different provider account (#394). |
| PUT | `/orbs/me/orb-id` | JWT | — | Claim/update public orb_id (409 if taken) |
| POST | `/orbs/me/profile-image` | JWT | — | Upload profile image as base64 (max 2MB) |
| DELETE | `/orbs/me/profile-image` | JWT | — | Clear profile image |
| POST | `/orbs/me/nodes` | JWT | — | Create node (any type) linked to Person |
| PUT | `/orbs/me/nodes/{uid}` | JWT | — | Update node properties |
| DELETE | `/orbs/me/nodes/{uid}` | JWT | — | Delete node |
| POST | `/orbs/me/link-skill` | JWT | — | Add `USED_SKILL` relationship |
| POST | `/orbs/me/unlink-skill` | JWT | — | Remove `USED_SKILL` relationship |
| DELETE | `/orbs/me/content` | JWT | — | Discard all orb nodes/links (preserves account, CVs, drafts, snapshots) |
| PUT | `/orbs/me/visibility` | JWT | — | Set orb visibility: `public` \| `restricted` |
| PUT | `/orbs/me/public-filters` | JWT | — | Save global public-view privacy filters (`keywords`, `hidden_node_types`) |
| GET | `/orbs/me/public-filters` | JWT | — | Retrieve saved public-view filters |
| POST | `/orbs/me/share-tokens` | JWT | — | Create share token with optional keyword/hidden-type filters, label, and expiry |
| GET | `/orbs/me/share-tokens` | JWT | — | List all share tokens (active + revoked) |
| DELETE | `/orbs/me/share-tokens/{token_id}` | JWT | — | Revoke a share token |
| POST | `/orbs/me/access-grants` | JWT | — | Grant a specific email access to a `restricted` orb (sends notification email) |
| GET | `/orbs/me/access-grants` | JWT | — | List active access grants on current user's orb |
| DELETE | `/orbs/me/access-grants/{grant_id}` | JWT | — | Revoke an access grant |
| PUT | `/orbs/me/access-grants/{grant_id}/filters` | JWT | — | Update keyword/hidden-type filters for a specific access grant |
| POST | `/orbs/{orb_id}/connection-requests` | JWT | — | Request access to a restricted orb |
| GET | `/orbs/{orb_id}/connection-requests/me` | JWT | — | Check if current user has a pending request for this orb |
| GET | `/orbs/me/connection-requests` | JWT | — | List pending connection requests on the current user's orb |
| POST | `/orbs/me/connection-requests/{request_id}/accept` | JWT | — | Accept a connection request (creates AccessGrant with optional filters) |
| POST | `/orbs/me/connection-requests/{request_id}/reject` | JWT | — | Reject a connection request |
| GET | `/orbs/{orb_id}` | JWT optional | 30/min | Public orb view. `private` → 403; `public` → requires `?token=` share token; `restricted` → requires auth and email on allowlist (owner bypass) |

## CV (`/cv`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/cv/upload` | JWT | Upload PDF (max 10MB). Requires GDPR consent. Stores document, dispatches Cloud Task, returns `{job_id, status: "queued"}` immediately. |
| POST | `/cv/confirm` | JWT | Persist confirmed nodes to Neo4j. Wipes existing graph first. Accepts `document_id` to track metadata. The `profile.email` field in the payload is **dropped server-side** (allowlist in `_CV_PROFILE_WRITABLE_FIELDS`) so the CV-parsed address never overwrites `:Person.email` — see #394. |
| POST | `/cv/import` | JWT | Import supplementary document (PDF, DOCX, TXT). Stores document, dispatches Cloud Task, returns `{job_id, status: "queued"}` immediately. |
| POST | `/cv/import-confirm` | JWT | Merge imported nodes into existing orb (no wipe). Accepts `document_id` to track metadata. |
| GET | `/cv/documents` | JWT | List document metadata for current user (up to 3, ordered by date desc). |
| GET | `/cv/documents/{document_id}/download` | JWT | Download a specific stored document (decrypted). |
| GET | `/cv/download` | JWT | Download the latest uploaded CV (backward compat, delegates to documents endpoint). |
| GET | `/cv/processing-count` | No | Count of PDFs currently being processed. |
| GET | `/cv/progress` | JWT | Background job progress for current user's CV processing (reads from `cv_jobs` PostgreSQL table). |
| GET | `/cv/job/{job_id}` | JWT | Get status and result for a specific CV processing job (owner-only). Returns `result` field when `status = "succeeded"`. |
| POST | `/cv/process-job` | Cloud Tasks OIDC | Internal endpoint called by Cloud Tasks to execute the CV extraction pipeline for a queued job. Not callable by end users. |

### CV Upload/Import Response (async)

```json
{
  "job_id": "uuid-string",
  "status": "queued"
}
```

The client should poll `GET /cv/job/{job_id}` until `status` is `succeeded` or `failed`. On success the response includes a `result` field with the extracted nodes.

On the `succeeded` / `failed` transition the worker also dispatches a best-effort transactional email (`send_cv_ready_email` / `send_cv_failed_email`) to the address stored on `:Person.email` — i.e. the OAuth sign-up address (#394). Email delivery is decoupled from job status; a Resend failure is logged but does not re-queue the job.

### Confirm Request Body

```json
{
  "nodes": [...],
  "relationships": [...],
  "cv_owner_name": "John Doe",
  "document_id": "uuid-from-upload-response",
  "original_filename": "resume.pdf",
  "file_size_bytes": 204800,
  "page_count": 3
}
```

When `document_id` is provided, the confirm endpoint records document metadata (including `entities_count` and `edges_count` computed from the nodes/relationships). If the user already has 3 documents, the oldest is automatically evicted.

### Document Metadata Response (`GET /cv/documents`)

```json
[
  {
    "document_id": "uuid",
    "original_filename": "resume.pdf",
    "uploaded_at": "2026-04-09T12:00:00+00:00",
    "file_size_bytes": 204800,
    "page_count": 3,
    "entities_count": 42,
    "edges_count": 15
  }
]
```

## Versions (`/orbs/me/versions`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/orbs/me/versions` | JWT | List orb snapshots (metadata only, up to 3, ordered by date desc) |
| POST | `/orbs/me/versions` | JWT | Manually save current orb state as a snapshot |
| POST | `/orbs/me/versions/{snapshot_id}/restore` | JWT | Restore orb from a snapshot (current state saved first) |
| DELETE | `/orbs/me/versions/{snapshot_id}` | JWT | Delete a specific snapshot |

Snapshots are automatically created before destructive CV imports (`POST /cv/confirm`). Up to 3 snapshots per user; oldest is evicted when a 4th is created. Restoring always saves the current state first so the restore is undoable.

### Snapshot Metadata Response (`GET /orbs/me/versions`)

```json
[
  {
    "snapshot_id": "uuid",
    "user_id": "user-id",
    "created_at": "2026-04-09T12:00:00+00:00",
    "trigger": "cv_import",
    "label": "Before CV import",
    "node_count": 42,
    "edge_count": 15
  }
]
```

## Export (`/export`)

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| GET | `/export/{orb_id}` | No | 30/min | Export orb as JSON, JSON-LD, or PDF |

Query params: `?format=json|jsonld|pdf`, `?filter_token=`, `?filter_keyword=`, `?include_photo=true|false`

## Notes (`/notes`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/notes/enhance` | JWT | LLM-enhanced note classification. Takes free text + target language + existing skills, returns structured node type + properties + suggested skill links. |

## Search (`/search`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/search/semantic` | JWT | Vector similarity search across 5 Neo4j indexes |
| POST | `/search/text` | JWT | Fuzzy text search on own orb |
| POST | `/search/text/public` | No | Fuzzy text search on any public orb (supports `?filter_token=`) |

## Drafts (`/drafts`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/drafts` | JWT | List all draft notes for current user |
| POST | `/drafts` | JWT | Create a new draft note |
| PUT | `/drafts/{uid}` | JWT | Update a draft note |
| DELETE | `/drafts/{uid}` | JWT | Delete a draft note |

Drafts are also auto-populated by the CV flow: any entries the LLM returns in `result.unmatched[]` (lines it could not classify into a node type) are POSTed to `/drafts` by the frontend before the user enters the review step (#359), so no raw text is silently dropped. The user can then enhance and promote those drafts into nodes manually.

## Ideas (`/ideas`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/ideas` | JWT | Submit a feature idea or feedback. Body: `{text, source}` where `source` is `"idea"` (default) or `"feedback"`. |
| GET | `/admin/ideas` | Admin | List all submitted ideas/feedback. Optional `?source=idea\|feedback` filter. |
| DELETE | `/admin/ideas/{idea_id}` | Admin | Delete an idea or feedback entry. |

## Admin CV Jobs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/cv-jobs` | Admin | Paginated list of all CV processing jobs. Optional `?status=queued\|running\|succeeded\|failed\|cancelled` filter. Returns `CVJobsPage` with user name/email resolved. |
| POST | `/admin/cv-jobs/{job_id}/cancel` | Admin | Cancel a queued or running CV job. |

## MCP Server

MCP requests are authenticated via the `X-MCP-Key` header. See `docs/architecture.md` for the full server design.

### MCP share-token auth

In addition to user API keys (`orbk_...`), the MCP server accepts share
tokens as transport credentials. A request with a header like:

```
X-MCP-Key: orbs_<share-token-id>
```

is scoped to the orb the share token was minted for. The token's
`keywords` and `hidden_node_types` filters are auto-applied to every
tool response; the tool-level `orb_id` and `token` arguments are
ignored — the share context is authoritative.

**Rate limits** (per credential, sliding 60s window, in-memory per
process):
- User keys (`orbk_...`): 300 requests/minute
- Share tokens (`orbs_...`): 120 requests/minute

Rate-limit denials return `429` with a `Retry-After: <seconds>` header.

**Audit**: `GET /api/orbs/me/share-tokens` returns two new fields per
token: `mcp_last_used_at` (nullable ISO datetime) and `mcp_use_count`
(integer, default 0). Both update on every successful share-mode MCP
request.

### MCP OAuth bearer auth

The MCP server also accepts OAuth access tokens issued by the authorization
server below:

```
Authorization: Bearer oauth_<token>
```

The token is resolved to a `user_id` + optional `share_token_id` (when the
grant was issued in `restricted` access mode) via the `oauth_access_tokens`
PostgreSQL table. Share-token filters are applied automatically — the same
pipeline as `orbs_...` credentials. See [OAuth 2.1 authorization server](#oauth-21-authorization-server) below.

## OAuth 2.1 authorization server

Full design rationale: `docs/superpowers/specs/2026-04-21-mcp-oauth-authorization-design.md`.

The authorization server is mounted directly on the main FastAPI app at
`/oauth/*`. All `/oauth/*` and `/.well-known/*` paths must be reverse-proxied
to the backend — see [deployment notes](#frontend-proxy-requirements).

### Discovery endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/.well-known/oauth-authorization-server` | No | RFC 8414 metadata: `issuer`, `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `revocation_endpoint`, `scopes_supported` (`["orbis.read"]`), `grant_types_supported`, `response_types_supported`, `token_endpoint_auth_methods_supported` (`["none", "client_secret_post"]`), `code_challenge_methods_supported` (`["S256"]`). |
| GET | `/.well-known/oauth-protected-resource` | No | MCP 2025-03 resource metadata on the MCP server, advertising the authorization server URL. |

### Dynamic Client Registration

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| POST | `/oauth/register` | No | 10/IP/day | RFC 7591 Dynamic Client Registration. |

Request body:

```json
{
  "client_name": "My AI Agent",
  "redirect_uris": ["https://example.com/callback"],
  "token_endpoint_auth_method": "none",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"]
}
```

- `redirect_uris` must be non-empty; each URI must use HTTPS or `http://localhost`.
- `token_endpoint_auth_method`: `"none"` (public client, PKCE only) or `"client_secret_post"` (confidential client).
- `grant_types` default: `["authorization_code", "refresh_token"]`.
- `response_types` default: `["code"]`.

Response `201 Created`:

```json
{
  "client_id": "uuid",
  "client_name": "My AI Agent",
  "redirect_uris": ["https://example.com/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none",
  "client_secret": "..."
}
```

`client_secret` is only present for confidential clients (`token_endpoint_auth_method = "client_secret_post"`).

### Authorization endpoint

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/oauth/authorize` | JWT (optional) | Returns consent context as JSON. |
| POST | `/oauth/authorize` | JWT | Submit consent decision. |

**GET** — returns one of:
- `{"login_required": true, "next": "/oauth/authorize?..."}` if user is not authenticated.
- Full client context when authenticated: `{client_id, client_name, registered_at, registered_from_ip, redirect_uri, scope}`.

**POST** — body (JSON):

```json
{
  "client_id": "uuid",
  "redirect_uri": "https://example.com/callback",
  "state": "opaque-state-value",
  "code_challenge": "base64url-sha256-of-verifier",
  "code_challenge_method": "S256",
  "scope": "orbis.read",
  "access_mode": "full",
  "share_token_id": null
}
```

- `code_challenge_method` must be `"S256"`.
- `scope` must be `"orbis.read"`.
- `access_mode`: `"full"` (full orb access) or `"restricted"` (filtered via a share token).
- `share_token_id`: required when `access_mode = "restricted"` — must be a valid, unrevoked share token owned by the authenticated user.

Response `200`:

```json
{
  "code": "random-auth-code",
  "state": "opaque-state-value",
  "redirect_uri": "https://example.com/callback"
}
```

The frontend constructs the redirect using these values (`?code=...&state=...`). A deny action returns `{error: "access_denied"}` so the frontend can redirect with `?error=access_denied`.

### Token endpoint

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/oauth/token` | Client credentials in body | Code exchange or refresh rotation. |

Form-encoded body for code exchange:

```
grant_type=authorization_code
&code=<auth-code>
&redirect_uri=https://example.com/callback
&client_id=<uuid>
&code_verifier=<pkce-verifier>
```

For confidential clients also include `client_secret=<secret>`.

Refresh rotation:

```
grant_type=refresh_token
&refresh_token=refresh_<token>
&client_id=<uuid>
```

Response `200`:

```json
{
  "access_token": "oauth_<opaque>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "refresh_<opaque>",
  "scope": "orbis.read"
}
```

- PKCE S256 is required for all clients.
- Refresh tokens are rotated on every use — old token is revoked, new token issued.
- Refresh-token reuse (presenting an already-consumed token) triggers **full-chain revocation** (RFC 6749 §6): the entire rotation chain is revoked.
- Refresh tokens are bound to `client_id`; presenting a token with a mismatched client returns `401`.

### Revocation endpoint

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/oauth/revoke` | No (RFC 7009) | Revoke an access token or refresh token. |

Form-encoded body:

```
token=<token-value>
&token_type_hint=access_token
```

`token_type_hint` is optional. Always returns `200 OK` regardless of whether the token existed.

### User-facing grant management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/oauth/grants` | JWT | List all active OAuth grants for the current user. Returns `{grants: [...]}`. |
| DELETE | `/api/oauth/grants/{client_id}` | JWT | Revoke all tokens for a specific client (user self-service). |

### Admin OAuth endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/oauth/clients` | Admin | List the 200 most recent DCR registrations. |
| POST | `/api/admin/oauth/clients/{client_id}/disable` | Admin | Disable a client — all future token requests with this `client_id` return `401`. |
