# Orbis — Project Guide

> Machine-readable overview for Claude Code sessions and developer onboarding.

## Tech Stack

- **Backend:** FastAPI (Python 3.10+), Neo4j 5 (Community), Anthropic Claude API, Ollama (local fallback)
- **Frontend:** React 19 + TypeScript, Vite 8, Three.js / React Three Fiber, Tailwind CSS v4, Zustand 5
- **Auth:** JWT (HS256) — dev-login only for now, Google OAuth scaffolded but not wired
- **Package managers:** uv (backend), npm (frontend)
- **Linting:** Ruff (backend, line-length 88), ESLint flat config (frontend)
- **CI:** GitHub Actions — lint (both stacks), unit tests (75% coverage min), CV extraction quality regression

## Repository Layout

```
backend/
  app/
    auth/        # JWT auth, dev-login, GDPR consent, account lifecycle
    cv/          # CV PDF parsing (PyMuPDF), LLM classification (Ollama/Claude CLI), rule-based fallback
    graph/       # Neo4j async driver, Cypher queries, Fernet encryption, embeddings (placeholder)
    orbs/        # Orb (knowledge graph) CRUD, filter tokens for privacy-aware sharing
    notes/       # LLM-enhanced note-to-node conversion
    search/      # Semantic (vector index) and fuzzy text search
    export/      # Public orb export (JSON, JSON-LD, PDF)
    main.py      # FastAPI app factory, middleware (CORS, SlowAPI), router registration
    config.py    # Pydantic Settings (env-based)
    rate_limit.py # SlowAPI limiter (30/min on public endpoints)
    dependencies.py # get_db, get_current_user (JWT bearer)
  mcp_server/    # MCP server exposing orb graph to AI agents (6 tools)
  tests/
    unit/        # pytest unit tests (mocked Neo4j, no external deps)
    integration/ # CV extraction quality tests (calls real Claude CLI)
    fixtures/    # Sample CV text + golden JSON baselines
    lib/         # Graph comparator (fuzzy matching, F1/recall/composite scoring)
frontend/
  src/
    api/         # Axios client (baseURL /api, auth interceptor, 401 redirect)
    components/  # React components by domain (graph/, editor/, chat/, cv/, drafts/, landing/, onboarding/)
    pages/       # Page-level components (Landing, CreateOrb, OrbView, SharedOrb, CvExport, About, Privacy)
    stores/      # Zustand stores (auth, orb, filter, dateFilter, toast)
docs/            # Detailed documentation (see below)
infra/           # Neo4j init script (constraints, indexes, vector indexes)
```

## Key Conventions

- Backend formatting: `ruff format` (line-length 88, double quotes)
- Backend linting: `ruff check .` (rules: E, W, F, I, C4, B, UP, C90, SIM, ARG, PTH; max complexity 12)
- Frontend linting: `eslint .` (flat config with typescript-eslint + react-hooks + react-refresh)
- Tests: `cd backend && uv run pytest tests/unit/ -v --cov=app --cov-fail-under=75`
- All Person node PII fields (email, phone, address) are Fernet-encrypted at rest
- Environment config: `.env` (both backend and root), see `.env.example` for template
- No pre-commit hooks — linting enforced via CI only
- Backend runs directly (not containerized): `cd backend && uv run uvicorn app.main:app --reload`
- Frontend runs directly: `cd frontend && npm run dev`

## Services (Docker Compose)

- **Neo4j:** ports 7474 (browser), 7687 (bolt) — auth: neo4j/orbis_dev_password
- **Ollama:** port 11434
- **Backend API:** port 8000 (run locally, not in Docker)
- **Frontend dev:** port 5173 (Vite dev server with /api proxy to backend)

## Quick Commands

```bash
# Backend
cd backend
uv sync --all-extras          # Install deps
uv run uvicorn app.main:app --reload  # Start API
uv run ruff check .           # Lint
uv run ruff format .          # Format
uv run pytest tests/unit/ -v --cov=app --cov-fail-under=75  # Tests

# Frontend
cd frontend
npm ci                        # Install deps
npm run dev                   # Start dev server
npm run lint                  # ESLint
npm run build                 # Type-check + build

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

When making architectural changes, update both this file and the relevant docs.

## Pre-PR Documentation Check (for Claude Code)

Before creating any pull request, you MUST:

1. Run `git diff main...HEAD` to review all changes in the branch
2. Assess whether changes affect project structure, architecture, API, conventions, or infrastructure
3. If they do, update `CLAUDE.md` and/or the relevant `docs/*.md` file before committing
4. Add a "## Documentation" section to the PR description listing which docs were updated, or "No doc changes needed" if the changes are purely internal/cosmetic
