# Deployment

## Docker Compose (Development)

The `docker-compose.yml` at project root provides infrastructure services:

```yaml
services:
  neo4j:
    image: neo4j:5-community
    ports:
      - "7474:7474"   # Browser UI
      - "7687:7687"   # Bolt protocol
    environment:
      NEO4J_AUTH: neo4j/orbis_dev_password
    volumes:
      - neo4j_data:/data
      - ./infra/neo4j:/import

  ollama:
    image: ollama/ollama:latest
    container_name: orbis-ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
```

The backend and frontend are **not containerized** — they run directly for faster iteration.

### Starting services

```bash
docker compose up -d          # Start Neo4j + Ollama
docker compose down           # Stop services
docker compose down -v        # Stop + delete volumes (resets data)
```

### Neo4j Initialization

On first run, apply the schema constraints and indexes:

```bash
# Via Neo4j Browser (http://localhost:7474) or cypher-shell:
cat infra/neo4j/init.cypher | docker exec -i orb_project-neo4j-1 cypher-shell -u neo4j -p orbis_dev_password
```

This creates:
- Uniqueness constraints on `Person.user_id` and `Person.orb_id`
- Indexes on node `uid` fields
- Vector indexes (1536 dimensions, cosine) for semantic search

## Environment Variables

All configuration is via environment variables. See `.env.example` for the full list.

### Required for production

> **Fail-fast**: set `ENV` to anything other than `development` in production. The app refuses to start if any of the secrets below are left at their placeholder values — this is enforced by a Pydantic validator in `backend/app/config.py`. The same validator plus `backend/app/graph/encryption.py` also refuses to boot without a persistent `ENCRYPTION_KEY`, because an auto-generated key would make previously encrypted PII unrecoverable on the next restart.

| Variable | Purpose |
|----------|---------|
| `ENV` | Must be set to a non-`development` value (e.g. `production`, `staging`) to enable fail-fast |
| `NEO4J_URI` | Neo4j Bolt connection string |
| `NEO4J_USER` | Neo4j username |
| `NEO4J_PASSWORD` | Neo4j password (must not be `orbis_dev_password`) |
| `JWT_SECRET` | Strong random secret for JWT signing (generate with `python -c "import secrets; print(secrets.token_urlsafe(32))"`) |
| `ENCRYPTION_KEY` | Fernet key for PII encryption (generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`) |
| `FRONTEND_URL` | Frontend origin for CORS |

Optional: set `ENCRYPTION_KEYS_HISTORIC` to a comma-separated list of previous Fernet keys when rotating. New writes use `ENCRYPTION_KEY`; reads transparently try the historic keys for legacy ciphertext.

### Optional

| Variable | Default | Purpose |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | — | For embedding checks |
| `LLM_PROVIDER` | `ollama` | CV classifier: `ollama` or `claude` |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama endpoint |
| `OLLAMA_MODEL` | `llama3.2:3b` | Ollama model |
| `CLAUDE_MODEL` | `claude-opus-4-6` | Claude model for CV extraction |
| `GOOGLE_CLIENT_ID` | — | Google OAuth (not yet active) |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth (not yet active) |

## MCP Server

The MCP server runs as a separate process:

```bash
cd backend
uv run python -m mcp_server.server
```

It connects to Neo4j independently and exposes 6 tools via streamable-http transport for AI agent access to orb data.

## Running the Backend

```bash
cd backend
uv sync --all-extras
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Add `--reload` for development. The app validates Neo4j connectivity on startup.

## Running the Frontend

### Development

```bash
cd frontend
npm ci
npm run dev
```

### Production build

```bash
cd frontend
npm run build    # Output in frontend/dist/
npm run preview  # Preview the built app
```

The production build (`tsc -b && vite build`) type-checks and bundles to `frontend/dist/`. Serve with any static file server; configure it to proxy `/api/*` requests to the backend.
