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
                                    ├─ Ollama      │ localhost:11434
                                    └─ Claude CLI  │ subprocess
                                                   │
                                    ┌──────────────┘
                                    │  MCP Server  │ streamable-http
                                    └──────────────┘
```

## Backend Architecture

### App Factory (`app/main.py`)

The FastAPI app uses a lifespan context manager:
- **Startup:** connects to Neo4j, runs a probe query to validate connectivity
- **Shutdown:** closes the Neo4j driver

Middleware stack (outermost first):
1. `SlowAPIMiddleware` — rate limiting on public endpoints
2. `CORSMiddleware` — allows frontend origin only

### Module Responsibilities

| Module | Responsibility |
|--------|---------------|
| `auth/` | JWT creation/validation, OAuth (Google/LinkedIn), GDPR consent, account deletion, MCP API keys, refresh tokens |
| `cv/` | PDF text extraction, LLM classification with fallback chain, graph persistence |
| `graph/` | Neo4j driver singleton, all Cypher queries, Fernet encryption, embedding generation |
| `orbs/` | Graph CRUD (nodes, relationships, profile), share tokens, access grants, connection requests, visibility management |
| `messages/` | Inbox (send, list, reply, read, delete), welcome message on registration |
| `notes/` | Free-text note enhancement via LLM (classify to node type + properties) |
| `search/` | Vector similarity search (5 indexes) + fuzzy text search (Cypher + Python fallback) |
| `export/` | Public orb export as JSON, JSON-LD (Schema.org), or PDF (fpdf2) |
| `drafts/` | Draft notes CRUD (create, list, update, delete) |
| `ideas/` | Feature idea / feedback submission and admin listing |
| `snapshots/` | Orb version snapshots (save, restore, delete, auto-create on CV import) |
| `mcp_server/` | MCP server exposing 5 tools for AI agent access to orb data (API key auth) |

### Dependency Injection

- `get_db()` — returns the Neo4j async driver instance
- `get_current_user()` — extracts and validates JWT from `Authorization: Bearer` header, returns `{user_id, email}`

### CV Processing Pipeline

Three-stage pipeline with fallback chain:

```
PDF Upload
    │
    ▼
Stage 1: PDF → Text (PyMuPDF/fitz, runs in thread pool)
    │
    ▼
Stage 2: LLM Classification
    ├─ Primary: Ollama or Claude CLI (configurable via LLM_PROVIDER)
    ├─ Retry: up to 2 retries on parse failure
    ├─ Fallback 1: Rule-based regex parser (6-language section detection)
    └─ Fallback 2: Raw text lines as unmatched[] (up to 50 lines)
    │
    ▼
Stage 3: User Review + Confirm
    ├─ Frontend shows extracted nodes for editing
    └─ POST /cv/confirm: wipes existing graph, MERGE nodes with dedup keys, creates USED_SKILL links
```

Text input is capped at 12,000 characters. Claude is called via CLI subprocess (`claude -p --output-format json`), not the Anthropic SDK.

### Authentication Flow

```
POST /auth/dev-login
    │
    ├─ Lookup user by ID in Neo4j
    ├─ If not found: CREATE Person node + send welcome message
    └─ Return JWT (HS256, 24h expiry) with {sub: user_id, email}
```

JWT validation on protected endpoints via `HTTPBearer` scheme. Refresh tokens support token rotation — each refresh revokes the old token and issues a new pair.

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

Axios instance at `/api` base URL. Vite dev server proxies `/api/*` to `localhost:8000` (stripping the prefix). Request interceptor injects JWT; response interceptor clears token on 401.

### 3D Graph Rendering

Two distinct 3D contexts:
1. **HeroOrb** (landing page) — React Three Fiber with animated sphere, particles, rays, and Bloom post-processing
2. **OrbGraph3D** (main app) — react-force-graph-3d with custom THREE.js node rendering, shared geometry pool, node object cache, animated orbital rings, background star field

Performance optimizations: shared geometry (never recreated), node object cache (invalidated on data/filter changes), direct refs for animated objects, single `requestAnimationFrame` loop, ref-based state to avoid React re-renders.

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
