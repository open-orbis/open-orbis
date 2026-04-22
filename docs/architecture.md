# Architecture

## Overview

Orbis is a personal knowledge graph platform that transforms CVs into interactive 3D graph visualizations. Users upload a PDF CV, an LLM extracts structured data, and the result is stored in Neo4j as a graph of interconnected professional entities (skills, experiences, education, etc.).

## System Components

```
┌─────────────┐     /api proxy      ┌──────────────┐      Bolt       ┌─────────┐
│   Frontend   │ ──────────────────► │   Backend    │ ──────────────► │  Neo4j  │
│  React/Vite  │  localhost:5173     │   FastAPI    │  localhost:7687 │   5.x   │
│   port 5173  │                     │   port 8000  │                 └─────────┘
└─────────────┘                     └──────┬───────┘
                                           │
                                    ┌──────┴───────┐
                                    │  LLM Layer   │
                                    │              │
                                    ├─ Vertex AI   │ Gemini (default)
                                    ├─ Ollama      │ localhost:11434
                                    └─ Claude CLI  │ subprocess
                                                   │
                                    ┌──────────────┘
                                    │  Cloud Tasks │ background CV processing
                                    │  PostgreSQL  │ cv_jobs, drafts, ideas, snapshots
                                    │  MCP Server  │ streamable-http
                                    └──────────────┘
```

## Backend Architecture

### App Factory (`app/main.py`)

The FastAPI app uses a lifespan context manager:
- **Startup:** connects to Neo4j, runs a probe query to validate connectivity; initialises `cv_jobs` PostgreSQL table via `jobs_db.ensure_table()`
- **Shutdown:** closes the Neo4j driver

Middleware stack (outermost first):
1. `SlowAPIMiddleware` — rate limiting on public endpoints
2. `CORSMiddleware` — allows frontend origin plus any additional origins from `CORS_EXTRA_ORIGINS`

### Module Responsibilities

| Module | Responsibility |
|--------|---------------|
| `auth/` | JWT creation/validation, OAuth (Google/LinkedIn), GDPR consent, account deletion, MCP API keys, refresh tokens, OAuth 2.1 authorization server (DCR, authorize, token, revoke, grants), OAuth PostgreSQL DAL |
| `cv/` | PDF text extraction, LLM classification with fallback chain, graph persistence, Cloud Tasks dispatch (`cloud_tasks.py`), background job state (`jobs_db.py`), job router (`jobs_router.py`) |
| `graph/` | Neo4j driver singleton, all Cypher queries, Fernet encryption, embedding generation |
| `orbs/` | Graph CRUD (nodes, relationships, profile), share tokens, access grants, connection requests, visibility management |
| `notes/` | Free-text note enhancement via LLM (classify to node type + properties) |
| `search/` | Vector similarity search (5 indexes) + fuzzy text search (Cypher + Python fallback) |
| `export/` | Public orb export as JSON, JSON-LD (Schema.org), or PDF (fpdf2) |
| `drafts/` | Draft notes CRUD (create, list, update, delete) |
| `ideas/` | Feature idea / feedback submission (source: `idea` or `feedback`) and admin listing |
| `snapshots/` | Orb version snapshots (save, restore, delete, auto-create on CV import) |
| `mcp_server/` | MCP server exposing 5 tools for AI agent access to orb data (API key auth) |

### Dependency Injection

- `get_db()` — returns the Neo4j async driver instance
- `get_current_user()` — extracts and validates JWT from `Authorization: Bearer` header, returns `{user_id, email}`

### CV Processing Pipeline

Async pipeline with background processing via Cloud Tasks:

```
POST /cv/upload or /cv/import
    │
    ▼
1. Store document (GCS or local encrypted file)
2. Create cv_jobs row (status=queued) in PostgreSQL
3. Dispatch Cloud Task → POST /cv/process-job
4. Return {job_id, status: "queued"} immediately
    │
    ▼ (Cloud Task / asyncio.create_task in local dev)
Stage 1: Load PDF from storage
    │
    ▼
Stage 2: PDF → Text (PyMuPDF/fitz)
    │
    ▼
Stage 3: LLM Classification
    ├─ Primary: Vertex AI (Gemini, default for production)
    ├─ Fallback chain: configurable via LLM_FALLBACK_CHAIN
    ├─ Retry: up to 2 retries on parse failure
    ├─ Fallback 1: Rule-based regex parser (6-language section detection)
    └─ Fallback 2: Raw text lines as unmatched[] (up to 50 lines)
    │
    ▼
Stage 4: Store result in cv_jobs.result_json + send email notification
    │
    ▼
Stage 5: User polls GET /cv/job/{job_id} → result
    │
    ▼
Stage 6: User Review + Confirm
    ├─ Frontend shows extracted nodes for editing (tabbed by node type)
    ├─ Any entries the LLM could not classify (`result.unmatched[]`) are persisted to the user's drafts collection via `POST /drafts` — the user can later enhance and promote them into nodes manually instead of losing the raw text (#359).
    └─ POST /cv/confirm: wipes existing graph, MERGE nodes with dedup keys, creates USED_SKILL links
```

Text input is capped at 12,000 characters. The LLM provider is controlled by `LLM_PROVIDER` and `LLM_FALLBACK_CHAIN` config settings.

**CV profile fields vs. identity fields.** The LLM-extracted profile block (email, phone, headline, social URLs, …) is merged onto `:Person` by `POST /cv/confirm` through a strict allowlist in `backend/app/cv/router.py::_CV_PROFILE_WRITABLE_FIELDS`. `email` is deliberately **not** on that list — `:Person.email` is the OAuth sign-up address and the sole destination for every transactional email (activation, CV-ready/failed, access grants). Letting an LLM reading an arbitrary PDF rewrite it would silently reroute all notifications and, when the CV belongs to a third party, also exposes that third party's address to admins (#394).

**CV completion notifications.** When the background job transitions to `succeeded` or `failed`, `app.cv.jobs_router._send_success_email` / `_send_failure_email` read `:Person.email`, decrypt it, and dispatch `send_cv_ready_email` / `send_cv_failed_email` (templates in `backend/app/email/templates.py`). Delivery is best-effort: a send failure is logged but does not flip the job status.

### Authentication Flow

```
POST /auth/google or /auth/linkedin
    │
    ├─ Exchange OAuth code for user info
    ├─ Lookup user by provider ID in Neo4j
    ├─ If not found: CREATE Person node
    ├─ If found and p.email ≠ provider email: heal p.email to the provider value (#394)
    └─ Return JWT (HS256, short-lived) + set HttpOnly refresh token cookie
```

The heal step exists because older sessions could allow `POST /cv/confirm` to overwrite `:Person.email` with the CV-parsed address. OAuth is the identity of record, so every login snaps the stored email back to whatever the provider claims.

JWT validation on protected endpoints via `HTTPBearer` scheme. Refresh tokens support token rotation — each refresh revokes the old token and issues a new pair. In production, the refresh token cookie uses `SameSite=None; Secure` and is scoped to `path=/`.

### Encryption

Fernet symmetric encryption for PII fields (`email`, `phone`, `address`). Key from `ENCRYPTION_KEY` env var; auto-generated in dev mode if missing (data won't survive restarts).

## Frontend Architecture

### State Management

Five Zustand stores:
- **authStore** — user session, token (localStorage-backed), login/logout
- **orbStore** — graph data (person + nodes + links), CRUD actions with automatic re-fetch
- **filterStore** — keyword-based node filtering (persisted to localStorage)
- **dateFilterStore** — date range slider state for temporal filtering
- **undoStore** — undo/redo stack for graph mutations

### API Layer

Axios instance with base URL controlled by `VITE_API_URL` env var (defaults to `/api`). Vite dev server proxies `/api/*` to `localhost:8000` (stripping the prefix). In production, `VITE_API_URL` can be set to the full Cloud Run service URL. Request interceptor injects JWT; response interceptor clears token on 401.

### 3D Graph Rendering

Two distinct 3D contexts:
1. **HeroOrb** (landing page) — CSS-animated SVG composition matching the GDG DevFest 2026 poster mark (`print/openorbis-a3-poster.html`): outer halo, 4 tilted orbital rings, 4 ring-bound satellite nodes that orbit via CSS `offset-path`, a slowly-rotating background "constellation" group, and a central node styled after the top-left myorbis logo. No WebGL on first paint — landing is now the lightest route.
2. **OrbGraph3D** (main app) — react-force-graph-3d with custom THREE.js node rendering, shared geometry pool, node object cache, animated orbital rings, background star field

Performance optimizations: shared geometry (never recreated), node object cache (invalidated on data/filter changes), direct refs for animated objects, single `requestAnimationFrame` loop, ref-based state to avoid React re-renders.

### Notable UI Surfaces on `/myorbis`

- **Orbis Pulse** (`components/graph/OrbisStatsOverlay.tsx`) — floating metrics panel. Current metric set: *Top Hub* (clickable, expands to neighbor list), *Orphan Nodes* (clickable, expands to list), *Active Nodes / Active Edges* (plus "visible" subcounts under filters), *Avg Edges/Node* (replaced the older "density" metric in #354), *Skill Coverage*, *Freshness*. A *Suggest a metric* cell lets users submit feedback via `POST /ideas`. Panel collapses to a pill on small screens (`compactOpen` state). Dismissible via the `dismissed` state; pill returns to re-open.
- **Share panel** (`components/graph/SharePanel.tsx`) — visibility switch, public/filtered URL rows, share-token management, access grants, and access-request (connection request) review. Each URL row exposes `Copy URL` + `Show QR` actions.
- **QR share modal** (`components/graph/QrShareModal.tsx`) — renders a violet-on-white QR for any share URL (#365). SVG is rasterized client-side for PNG download at 4× scale; no center logo. Called from both the public link row and each share-token row.
- **Pending connection-requests dropdown** (`components/graph/PendingConnectionsDropdown.tsx`) — header-level inbox of access requests backed by `backend/app/orbs/access_requests.py`. Accept creates an `AccessGrant` (with optional filters); reject marks the request resolved.
- **Guided tour** (`components/GuidedTour.tsx`) — react-joyride overlay; 13 steps covering graph, header controls, connections dropdown, notes, search, user menu, Orbis Pulse, add-entry, visibility, and chatbox. Auto-triggers for new users; re-runnable from Settings.

### Z-index tiers

Overlays in the frontend share a conscious stacking scale — pick the right tier instead of guessing, so metric tooltips never slip behind a toast and a modal never slips behind the ChatBox:

| Tier | Range | Used for |
|---|---|---|
| **Base** | default | 3D graph canvas, static page content |
| **Pulse background** | `z-[30]` | Orbis Pulse compact pill + desktop panel |
| **ChatBox** | `z-[40]` | Floating bottom chat/search bar |
| **Pulse mobile sheet** | `z-[41]` backdrop / `z-[42]` panel | Mobile Orbis Pulse bottom sheet |
| **Header** | `z-[50]` | Top-of-page OrbView header |
| **UserMenu dropdown** | `z-[50]` | Avatar menu (inherits header context) |
| **Toast** | `z-[100]` | Transient toast notifications |
| **ProfileEditor modal** | `z-[130]` | Profile editor (portaled) |
| **AccountSettings modal** | `z-[200]` | Account settings (portaled) |
| **Metric info tooltip** | `z-[1000]` backdrop / `z-[1001]` panel | Orbis Pulse metric `(i)` tooltip — **must always win** (#387) |

**Rules of thumb:**
- New overlays pick the **lowest tier** that still wins over the surfaces they need to sit above. Don't jump straight to the top tier unless the UX really demands it.
- Modals rendered via `createPortal` should live in the **Modal** tier (`z-[130]`–`z-[200]`) — not a bespoke value.
- The **Metric info tier (`1000`)** is reserved for tooltips/explanations that must pierce through every modal. Don't reuse it for ordinary modals.

### Routing

| Path | Page | Auth |
|------|------|------|
| `/` | LandingPage | Public |
| `/auth/callback` | AuthCallbackPage | Public |
| `/auth/linkedin/callback` | LinkedInCallbackPage | Public |
| `/create` | CreateOrbPage | Required |
| `/myorbis` | OrbViewPage | Required |
| `/myorbis/connected-ai` | ConnectedAiPage | Required |
| `/oauth/authorize` | OAuthConsentPage | Public (redirects to login if unauthenticated) |
| `/cv-export` | CvExportPage | Required |
| `/privacy` | PrivacyPolicyPage | Public |
| `/activate` | ActivatePage | Required (not activated) |
| `/admin` | AdminPage | Required + is_admin |
| `/:orbId` | SharedOrbPage | Public |

## MCP Server

Separate process (`python -m mcp_server.server`) exposing 5 tools via streamable-http transport. Connects to Neo4j independently (own driver instance).

### Authentication

All MCP requests require either an `X-MCP-Key` header or an `Authorization: Bearer` header carrying an OAuth access token. Missing or invalid credentials return 401 before reaching any tool.

**Transport auth** supports three credential modes, resolved in order by `APIKeyMiddleware`:

- `orbk_...` (`X-MCP-Key`) — resolves to a `user_id` via `app.auth.mcp_keys`. Used by the orb owner connecting their own AI agent. Full access to the owner's orb; visibility filtering at the tool layer for public orbs.
- `orbs_...` (`X-MCP-Key`) — resolves to a `ShareContext(orb_id, keywords, hidden_node_types, token_id)` via `app.orbs.share_token.validate_share_token_for_mcp`. Scoped to one orb; filters auto-applied.
- `oauth_...` (`Authorization: Bearer`) — resolves via the `oauth_access_tokens` PostgreSQL table. When the grant was issued in `restricted` access mode the associated `share_token_id` is loaded from Neo4j to rebuild the `ShareContext`; filters are applied exactly as for `orbs_...` credentials. Full-mode grants behave like `orbk_...`.

Per-credential rate limits (`mcp_server/rate_limit.py`): 300/min for user keys, 120/min for share tokens and OAuth tokens. Share-mode requests also trigger a fire-and-forget `increment_mcp_use` Cypher update so the owner sees `mcp_use_count` / `mcp_last_used_at` on each token in the Share panel.

**Storage split:** OAuth grant state (clients, codes, access tokens, refresh tokens) lives entirely in PostgreSQL (`oauth_*` tables — see `docs/database.md`). The share-token filters that the middleware layers on top of restricted OAuth grants are stored in Neo4j (`ShareToken` nodes). The two stores are joined lazily at request time: the OAuth DAL reads `share_token_id` from PostgreSQL, then the MCP middleware fetches the corresponding Neo4j node to reconstruct the filter context.

For the full design rationale see `docs/superpowers/specs/2026-04-21-mcp-share-token-auth-design.md` and `docs/superpowers/specs/2026-04-21-mcp-oauth-authorization-design.md`.

### Access Control

MCP tools support a two-tiered access model:
- **Owner bypass:** If the API key owner is the orb owner, full unfiltered access (no share token needed)
- **Share-token grant:** Non-owners must provide a valid `token` parameter; privacy filters from the token are applied to the response

### Tools

- `orbis_get_summary` — high-level orb overview (node counts by type)
- `orbis_get_full_orb` — full graph data (person + nodes + links)
- `orbis_get_nodes_by_type` — nodes filtered by label
- `orbis_get_connections` — relationships for a specific node
- `orbis_get_skills_for_experience` — skills linked to a work experience/project via `USED_SKILL`
