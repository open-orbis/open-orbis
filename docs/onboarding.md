# Onboarding — Local Setup

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.10+ | [python.org](https://www.python.org/) |
| uv | latest | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Node.js | 20+ | [nodejs.org](https://nodejs.org/) |
| Docker + Docker Compose | latest | [docker.com](https://www.docker.com/) |
| Claude CLI | latest | `npm install -g @anthropic-ai/claude-code` (optional, for CV classification with Claude) |

## First-Time Setup

### 1. Clone and configure environment

```bash
git clone https://github.com/Brotherhood94/orb_project.git
cd orb_project
cp .env.example .env
```

Edit `.env` and set at minimum:
- `ENV=development` — controls fail-fast on insecure placeholders (see `docs/deployment.md` for production behavior).
- `JWT_SECRET` — any random string (change from default `change-me`).
- `ENCRYPTION_KEY` — optional in development: if left blank, the backend generates a Fernet key on first start and persists it to `backend/.local_encryption_key` (gitignored) so encrypted PII survives restarts. To set one explicitly, generate with: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.
- `ANTHROPIC_API_KEY` — if using Claude for CV classification.

### 2. Start infrastructure services

```bash
docker compose up -d
```

This starts:
- **Neo4j** on ports 7474 (browser UI) and 7687 (Bolt)
- **Ollama** on port 11434

Verify Neo4j is running: open http://localhost:7474 and log in with `neo4j` / `orbis_dev_password`.

### 3. Install and start the backend

```bash
cd backend
uv sync --all-extras
uv run uvicorn app.main:app --reload
```

The API starts on http://localhost:8000. Verify: `curl http://localhost:8000/health` should return `{"status":"ok"}`.

On first startup, the app connects to Neo4j and runs a probe query. If Neo4j isn't ready yet, restart the backend.

### 4. Install and start the frontend

```bash
cd frontend
npm ci
npm run dev
```

The dev server starts on http://localhost:5173 with hot module replacement. API calls to `/api/*` are proxied to the backend.

### 5. (Optional) Pull Ollama model

If using Ollama for CV classification:

```bash
docker exec orbis-ollama ollama pull llama3.2:3b
```

### 6. Login and create your orb

1. Open http://localhost:5173
2. Click the login button — this calls `POST /auth/dev-login` which creates a dev user
3. Choose "Upload CV" or "Manual Entry" to start building your knowledge graph

## Development Workflow

### Running linters

```bash
# Backend
cd backend
uv run ruff check .       # Lint
uv run ruff format .      # Auto-format

# Frontend
cd frontend
npm run lint              # ESLint
```

### Running tests

```bash
cd backend
uv run pytest tests/unit/ -v --cov=app --cov-fail-under=50
```

Integration tests (CV extraction quality) require Claude CLI credentials:
```bash
uv run pytest tests/integration/ -v -s -m integration
```

### Backend Makefile shortcuts

```bash
cd backend
make install   # uv sync --all-extras
make lint      # ruff check
make format    # ruff format
make test      # pytest
```

## LLM Provider Configuration

The CV classification pipeline supports two LLM providers, controlled by `LLM_PROVIDER` in `.env`:

| Provider | Value | Requirements |
|----------|-------|-------------|
| Ollama | `ollama` (default) | Ollama running + model pulled |
| Claude | `claude` | Claude CLI installed + authenticated |

Claude is called via CLI subprocess (`claude -p`), not the Anthropic SDK directly.

## Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Purpose | Default |
|----------|---------|---------|
| `ENV` | Runtime environment. Non-`development` triggers fail-fast on placeholder secrets. | `development` |
| `NEO4J_URI` | Neo4j Bolt connection | `bolt://localhost:7687` |
| `NEO4J_PASSWORD` | Neo4j auth | `orbis_dev_password` |
| `JWT_SECRET` | JWT signing key | `change-me` |
| `ENCRYPTION_KEY` | Fernet key for PII encryption. Empty in dev → auto-generated at `backend/.local_encryption_key`. Required in production. | `""` |
| `ENCRYPTION_KEYS_HISTORIC` | Comma-separated legacy Fernet keys used only for decrypting data written before a rotation. | `""` |
| `LLM_PROVIDER` | CV classifier: `ollama` or `claude` | `ollama` |
| `OLLAMA_MODEL` | Ollama model name | `llama3.2:3b` |
| `CLAUDE_MODEL` | Claude model for CV extraction | `claude-opus-4-6` |
| `FRONTEND_URL` | CORS allowed origin | `http://localhost:5173` |
