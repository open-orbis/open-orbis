# Orbis — Project Guide

> Machine-readable overview for Claude Code sessions and developer onboarding.

## Tech Stack

- **Backend:** FastAPI (Python 3.10+), Neo4j 5 (Community), Anthropic Claude API, Ollama (local fallback), Resend (transactional email)
- **Frontend:** React 19 + TypeScript, Vite 8, Three.js / React Three Fiber, Tailwind CSS v4, Zustand 5
- **Auth:** JWT (HS256) — Google + LinkedIn OAuth, invite-code activation gate for closed beta
- **Package managers:** uv (backend), npm (frontend)
- **Linting:** Ruff (backend, line-length 88), ESLint flat config (frontend)
- **CI:** GitHub Actions — lint (both stacks), unit tests (75% coverage min), CV extraction quality regression

## Repository Layout

```
backend/
  app/
    auth/        # JWT auth, Google/LinkedIn OAuth, GDPR consent, account lifecycle, invite code activation, MCP API keys, refresh tokens
    admin/       # Closed-beta admin: invite codes CRUD, beta config toggle, pending users (approve/approve-all with email), funnel metrics, insights, user management, CV jobs tab (list + cancel)
    email/       # Transactional email via Resend (activation notifications, invite codes, CV ready/failed/cancelled)
    cv/          # CV PDF parsing (PyMuPDF), LLM classification (Vertex AI/Ollama/Claude CLI), rule-based fallback, Cloud Tasks dispatch (cloud_tasks.py), PostgreSQL job state (jobs_db.py), job router (jobs_router.py)
    graph/       # Neo4j async driver, Cypher queries, Fernet encryption (MultiFernet + historic keys), node-property allowlist, LLM usage tracking, embeddings (placeholder)
    orbs/        # Orb (knowledge graph) CRUD, share tokens, access grants, connection requests, visibility management
    notes/       # LLM-enhanced note-to-node conversion
    search/      # Semantic (vector index) and fuzzy text search
    export/      # Public orb export (JSON, JSON-LD, PDF)
    drafts/      # Draft notes CRUD
    ideas/       # Feature idea / feedback submission (source: "idea" or "feedback")
    snapshots/   # Orb version snapshots (save, restore, delete)
    main.py      # FastAPI app factory, middleware (CORS, SlowAPI), router registration, cv_jobs table init on startup
    config.py    # Pydantic Settings (env-based). New settings: cloud_tasks_queue, cloud_tasks_location, cloud_run_url, cloud_run_service_account, cors_extra_origins
    rate_limit.py # SlowAPI limiter keyed on user_id (authenticated) / IP (public). Explicit caps on LLM endpoints: /cv/upload 3/min, /cv/import 3/min, /notes/enhance 10/min.
    dependencies.py # get_db, get_current_user (JWT bearer), require_admin
  mcp_server/    # MCP server exposing orb graph to AI agents (6 tools, API key auth via X-MCP-Key)
  tests/
    unit/        # pytest unit tests (mocked Neo4j, no external deps)
    integration/ # CV extraction quality tests (calls real Claude CLI)
    fixtures/    # Sample CV text + golden JSON baselines
    lib/         # Graph comparator (fuzzy matching, F1/recall/composite scoring)
frontend/
  src/
    api/         # Axios client (baseURL /api, auth interceptor, 401 redirect)
    components/  # React components by domain (graph/, editor/, chat/, cv/, drafts/, landing/, onboarding/, layout/, profile/, sharing/)
    pages/       # Page-level components (Landing, AuthCallback, LinkedInCallback, CreateOrb, OrbView, SharedOrb, CvExport, Privacy, Activate, Admin)
    stores/      # Zustand stores (auth, orb, filter, dateFilter, toast, undo)
docs/            # Detailed documentation (see below)
infra/           # Neo4j init script (constraints, indexes, vector indexes)
```

## Key Conventions

- **Git commits:** Do NOT add `Co-Authored-By` lines. Commit as the git user only.
- Backend formatting: `ruff format` (line-length 88, double quotes)
- Backend linting: `ruff check .` (rules: E, W, F, I, C4, B, UP, C90, SIM, ARG, PTH; max complexity 12)
- Frontend linting: `eslint .` (flat config with typescript-eslint + react-hooks + react-refresh)
- Tests: `cd backend && uv run pytest tests/unit/ -v --cov=app --cov-fail-under=50`
- All Person node PII fields (email, phone, address) are Fernet-encrypted at rest. `ENV` must be non-`development` in production — the backend refuses to start with placeholder `JWT_SECRET`, `ENCRYPTION_KEY`, or `NEO4J_PASSWORD` (see `backend/app/config.py`).
- All node writes (`cv._persist_nodes`, `orbs.add_node`, `orbs.update_node`) must route properties through `sanitize_node_properties` from `app.graph.node_schema` before `encrypt_properties` — the allowlist is the single chokepoint against LLM-driven prompt injection poisoning the graph.
- MCP server: all requests require `X-MCP-Key` header (resolved to `user_id` via `app.auth.mcp_keys`). Missing key returns 401.
- Environment config: `.env` (both backend and root), see `.env.example` for template
- No pre-commit hooks — linting enforced via CI only
- Backend runs directly (not containerized): `cd backend && uv run uvicorn app.main:app --reload`
- Frontend runs directly: `cd frontend && npm run dev`

## Services (Docker Compose)

- **Neo4j:** ports 7474 (browser), 7687 (bolt) — auth: neo4j/orbis_dev_password
- **Ollama:** port 11434
- **Backend API:** port 8000 (run locally, not in Docker)
- **Frontend dev:** port 5173 (Vite dev server with /api proxy to backend)
- **Resend:** transactional email (no self-hosted service — SaaS via API key)

## Quick Commands

```bash
# Backend
cd backend
uv sync --all-extras          # Install deps
uv run uvicorn app.main:app --reload  # Start API
uv run ruff check .           # Lint
uv run ruff format --check .  # Format check (CI uses this)
uv run ruff format .          # Format (auto-fix)
uv run pytest tests/unit/ -v --cov=app --cov-fail-under=50  # Tests

# Frontend
cd frontend
npm ci                        # Install deps
npm run dev                   # Start dev server
npm run lint                  # ESLint
npm run build                 # Type-check + build
npm run e2e                   # Playwright E2E (all browsers)
npm run e2e:ui                # Playwright interactive UI mode

# Cross-browser manual testing (macOS)
./scripts/cross-browser-test.sh  # Open site in all installed browsers

# Infrastructure
docker compose up -d          # Start Neo4j + Ollama
```

## Documentation

Detailed docs live in `docs/`. Key files:

- `docs/architecture.md` — system design, data flow, module interactions
- `docs/api.md` — API endpoint reference (routes, methods, auth, payloads)
- `docs/onboarding.md` — local setup, prerequisites, first-run steps
- `docs/database.md` — Neo4j schema, node types, relationships, encryption
- `docs/testing.md` — test strategy, running tests, CI pipelines, coverage
- `docs/deployment.md` — production setup, Docker, environment variables
- `docs/cv-extraction-quality.md` — CV extraction quality metrics and CI
- `docs/cross-browser-checklist.md` — manual cross-browser smoke test checklist
- `docs/llm-provider-benchmark.md` — LLM provider evaluation for CV extraction
- `docs/invitation-system.md` — invite code system and closed-beta flow
- `docs/navigation-flow.md` — user-flow state diagrams (pages, modals, guards)
- `docs/navigation-actions.yaml` — action catalog for every UI interaction
- `docs/agent-navigation-guide.md` — agent traversal strategy for UX evaluation

When making architectural changes, update both this file and the relevant docs.

When adding/removing pages, routes, modals, or interactive elements, update `docs/navigation-flow.md` and `docs/navigation-actions.yaml` accordingly.

## Pre-PR Documentation Check (for Claude Code)

Before creating any pull request, you MUST:

1. Run `git diff main...HEAD` to review all changes in the branch.
2. For each change, ask which of these docs it could affect — don't skip this check even for small PRs:

   | Change type | Likely doc(s) to touch |
   |---|---|
   | New or renamed API endpoint, changed payload shape, new rate-limit tier | `docs/api.md` |
   | New Neo4j node type, relationship, constraint, or index | `docs/database.md` |
   | New backend module or cross-module data flow | `docs/architecture.md` |
   | New page, modal, dropdown, or overlay on `/myorbis` (or change to an existing one) | `docs/navigation-flow.md` **and** `docs/navigation-actions.yaml` |
   | New `data-tour` target or changed guided-tour step list | `docs/navigation-flow.md` (tour step count + order) |
   | New Cloud Run flag, env var, or deploy-time policy change | `docs/deployment.md` |
   | New env var or first-run command | `docs/onboarding.md` |
   | Test threshold or fixture convention change | `docs/testing.md` / `docs/cv-extraction-quality.md` |

3. Update the relevant files in the **same PR** as the code change. Never defer doc updates — history shows the gap accumulates faster than you'd expect (see #368).
4. Add a "## Documentation" section to the PR description listing which docs were updated, or "No doc changes needed" if the changes are purely internal/cosmetic. If you claim "no doc changes needed", spot-check the table above one more time before trusting that claim.
