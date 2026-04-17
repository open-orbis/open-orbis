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
| `auth/` | JWT creation/validation, OAuth (Google/LinkedIn), GDPR consent, account deletion, MCP API keys, refresh tokens |
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

### Authentication Flow

```
POST /auth/google or /auth/linkedin
    │
    ├─ Exchange OAuth code for user info
    ├─ Lookup user by provider ID in Neo4j
    ├─ If not found: CREATE Person node
    └─ Return JWT (HS256, short-lived) + set HttpOnly refresh token cookie
```

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
| `/cv-export` | CvExportPage | Required |
| `/privacy` | PrivacyPolicyPage | Public |
| `/activate` | ActivatePage | Required (not activated) |
| `/admin` | AdminPage | Required + is_admin |
| `/:orbId` | SharedOrbPage | Public |

## MCP Server

Separate process (`python -m mcp_server.server`) exposing 5 tools via streamable-http transport. Connects to Neo4j independently (own driver instance).

### Authentication

All MCP requests require an `X-MCP-Key` header containing a user-scoped API key (prefix `orbk_`). The `APIKeyMiddleware` validates the key by looking up its SHA-256 hash in Neo4j and resolves it to a `user_id`. Missing or invalid key returns 401 before reaching any tool.

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
