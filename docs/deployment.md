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

## CI/CD — Automated Deploy

Deployments are automated via GitHub Actions and triggered **only when a GitHub Release is published** (not on every merge to `main`).

### How it works

The workflow (`.github/workflows/deploy.yml`) runs two parallel jobs:

1. **Backend**: builds a Docker image with Cloud Build, deploys it to Cloud Run, then runs a health check against `/health/ready` (verifies the app responds and Neo4j is reachable)
2. **Frontend**: runs `npm ci && npm run build`, deploys to Firebase Hosting, then verifies the site returns HTTP 200

The release tag (e.g. `v1.0.0`) is used as the Docker image tag, so you can always trace a running revision back to a specific release.

### Creating a release (triggers deploy)

From the terminal:

```bash
gh release create v1.0.0 --title "v1.0.0" --notes "Release notes here"
```

Or from GitHub UI: **Releases** → **Draft a new release** → choose a tag, write notes, click **Publish release**.

### Monitoring the deploy

```bash
# Watch the workflow run live
gh run watch

# List recent deploy runs
gh run list --workflow=deploy.yml

# View logs of a specific run
gh run view <run-id> --log
```

The workflow shows green/red in GitHub Actions. If the health check fails, the workflow fails — you'll see it immediately.

### Verifying after deploy

Automated (runs in the workflow):
- Backend: `GET /health/ready` — returns `{"status": "ok", "neo4j": "connected"}`
- Frontend: `GET https://open-orbis.web.app` — returns HTTP 200

Manual verification:
```bash
# Backend health
curl https://<cloud-run-url>/health/ready

# Latest Cloud Run revision
gcloud run revisions list --service=orbis-api --region=europe-west1 --limit=3

# Frontend
curl -s -o /dev/null -w "%{http_code}" https://open-orbis.web.app
```

Functional smoke test: log in, open an orb, upload a CV.

### Cloud Run instance policy

Backend (`orbis-api`) deploys with `--min-instances=1` (see `.github/workflows/deploy.yml`). This keeps one warm instance live at all times, trading a small baseline cost for first-request latency — a cold start on this stack can add several seconds because the container has to initialise the Neo4j async driver and validate connectivity before it can answer. The MCP server (`orbis-mcp`) runs `--min-instances=0` since it's called infrequently by agent clients and cold-start cost is tolerable.

Rationale for `orbis-api` at `1` was landed in #363 — if you see it flipped back to `0`, expect user-visible latency regressions.

### GCP service accounts

| Service Account | Purpose | Created by |
|---|---|---|
| `orbis-api` | Runtime — used by Cloud Run when the app is running | `infra/gcp/setup.sh` |
| `github-deploy` | CI/CD — used by GitHub Actions to build and deploy | `infra/gcp/setup-ci-sa.sh` |

The `github-deploy` SA key is stored as the GitHub Secret `GCP_SA_KEY`.

### Manual deploy (fallback)

The manual deploy scripts remain available if you need to bypass CI:

```bash
./infra/gcp/deploy-backend.sh          # Deploy backend
./infra/gcp/deploy-backend.sh v1.0.0   # Deploy with specific tag
./infra/gcp/deploy-frontend.sh         # Deploy frontend
```

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

### Rotating the Fernet encryption key

PII fields (`email`, `phone`, `address` on `Person` nodes; PDF bytes in `backend/data/cv_files/`) are encrypted at rest with the active `ENCRYPTION_KEY`. The application supports zero-downtime key rotation via a dual-key window driven by `ENCRYPTION_KEYS_HISTORIC`. Rotate whenever you have reason to believe the current key has been leaked, or on a scheduled cadence (recommended: annually, or when offboarding anyone with production access).

The rotation is four phases. Each phase maps to a single config change + restart; nothing in the database is touched until the opportunistic re-encryption script in phase 3.

**Phase 0 — prepare a fresh key.** On a trusted workstation:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Call the output `NEW_KEY`. Record it in your secret manager alongside the current `OLD_KEY` (the value currently in `ENCRYPTION_KEY`).

**Phase 1 — deploy with both keys, old still primary.** Set environment:

```
ENCRYPTION_KEY=<OLD_KEY>
ENCRYPTION_KEYS_HISTORIC=<NEW_KEY>
```

Restart the backend. This phase changes nothing functionally — `MultiFernet` still decrypts with `OLD_KEY` first — but it verifies every node in your cluster has loaded the new key before you promote it. Watch the logs for `Ignoring invalid key in ENCRYPTION_KEYS_HISTORIC` warnings; if any appear, fix `NEW_KEY` and redo this phase before continuing.

**Phase 2 — promote `NEW_KEY` as primary.** Swap:

```
ENCRYPTION_KEY=<NEW_KEY>
ENCRYPTION_KEYS_HISTORIC=<OLD_KEY>
```

Restart. New writes are encrypted with `NEW_KEY`; existing ciphertext still decrypts because `OLD_KEY` is in the historic list. This is the longest-lived phase — it stays in place until every PII field has been re-encrypted with the new key, which happens opportunistically on any read-modify-write path, plus explicitly via the script in phase 3.

**Phase 3 — bulk re-encrypt to close the window.** To force every remaining `OLD_KEY` ciphertext to migrate, run the following admin one-shot from a backend shell (e.g., `uv run python`):

```python
import asyncio
from app.graph.encryption import decrypt_value, encrypt_value, ENCRYPTED_FIELDS
from app.graph.neo4j_client import get_driver

async def re_encrypt_all_persons() -> int:
    driver = await get_driver()
    updated = 0
    async with driver.session() as session:
        result = await session.run("MATCH (p:Person) RETURN p.user_id AS uid, p AS node")
        records = [r async for r in result]
    for r in records:
        user_id = r["uid"]
        node = dict(r["node"])
        new_props: dict = {}
        for field in ENCRYPTED_FIELDS:
            ct = node.get(field)
            if not ct:
                continue
            try:
                pt = decrypt_value(ct)
            except Exception:
                # Already failed under the historic key — leave it alone.
                continue
            # encrypt_value always uses the primary (NEW) key.
            new_props[field] = encrypt_value(pt)
        if new_props:
            async with driver.session() as session:
                await session.run(
                    "MATCH (p:Person {user_id: $uid}) SET p += $props",
                    uid=user_id, props=new_props,
                )
            updated += 1
    await driver.close()
    return updated

print(asyncio.run(re_encrypt_all_persons()))
```

For the encrypted CV files on disk (`backend/data/cv_files/*.pdf.enc`), the same pattern applies with `decrypt_bytes` / `encrypt_bytes` — there are rarely many of these, so a shell loop is usually enough.

**Phase 4 — drop the old key.** After the script reports a stable zero-delta run (no more ciphertext can still be decrypted by `OLD_KEY` alone) and after your backup retention window has rolled over the old ciphertext, remove `OLD_KEY` from the environment:

```
ENCRYPTION_KEY=<NEW_KEY>
ENCRYPTION_KEYS_HISTORIC=
```

Restart. Rotation complete. Revoke `OLD_KEY` in your secret manager.

If any of the above goes wrong mid-flight, rolling back is always "put the old key back in `ENCRYPTION_KEYS_HISTORIC` and restart" — `MultiFernet` will find it again on the next read.

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
| `REFRESH_TOKEN_EXPIRE_DAYS` | `365` | Refresh token lifetime in days. Default raised to 365 to support the persistent-login / silent re-auth flow. |

### OAuth 2.1 authorization server

| Variable | Default | Purpose |
|----------|---------|---------|
| `OAUTH_ENABLED` | `true` | Kill switch. Set to `false` to return `503` on all `/oauth/*` routes and skip the `Authorization: Bearer oauth_` branch in the MCP server. Useful for staged rollouts or emergency disablement. |
| `OAUTH_ACCESS_TOKEN_TTL_SECONDS` | `3600` | Lifetime of issued access tokens (seconds). |
| `OAUTH_REFRESH_TOKEN_TTL_SECONDS` | `2592000` | Lifetime of issued refresh tokens (seconds; default 30 days). |
| `OAUTH_AUTHORIZATION_CODE_TTL_SECONDS` | `300` | Lifetime of authorization codes (seconds; default 5 minutes). |
| `OAUTH_REGISTER_RATE_LIMIT` | `"10/day"` | SlowAPI rate-limit string for `POST /oauth/register` per client IP. |

### Frontend proxy requirements

The OAuth authorization server and discovery endpoints are served by the FastAPI backend but must be reachable from the frontend origin (the same domain users interact with). There are two contexts where this matters:

**Development (Vite dev server):** `frontend/vite.config.ts` proxies `/api/*`, `/.well-known/*`, `/oauth/register`, `/oauth/token`, and `/oauth/revoke` to `http://localhost:8000`. **`/oauth/authorize` is intentionally NOT proxied** — it's an HTML consent page served by the SPA (`ConsentPage` React component). Removing any of the proxied routes breaks AI-client discovery and the OAuth token flow.

**Production (reverse-proxy routing):** Your frontend origin (Firebase Hosting / CDN / LB) must apply path-based routing:
- `/oauth/authorize` → frontend (HTML consent page served by the SPA)
- `/oauth/register`, `/oauth/token`, `/oauth/revoke` → backend (JSON OAuth endpoints)
- `/.well-known/oauth-authorization-server` → backend (RFC 8414 discovery)
- `/api/*` → backend (authenticated app API)

If you can't do path-based routing on the frontend origin, the alternative is to expose the backend under a separate host (`api.<domain>`) and update the discovery metadata to advertise those endpoints directly — but you must still serve `/oauth/authorize` on the origin users log into, otherwise the consent page won't have access to the browser's session cookie.

### Frontend build-time variables

The frontend build bakes the MCP endpoint URL into the bundle. If it's unset, the Connected AI modal and share-token "Copy MCP config" buttons will copy the dev default (`http://localhost:8081/mcp`) — useless for cloud AI clients. Set this at build time (e.g. in your Dockerfile, Cloud Build, or Firebase deploy step):

| Variable | Example | Purpose |
|----------|---------|---------|
| `VITE_MCP_URL` | `https://mcp.yourdomain.com/mcp` | MCP server public endpoint that AI clients paste into their connector config. |
| `VITE_API_URL` | (usually unset — defaults to `/api`) | Backend API origin if not same-origin with the frontend. |
| `VITE_GOOGLE_CLIENT_ID` | `...apps.googleusercontent.com` | Google OAuth client ID for user sign-in. |

For the open-orbis deploy workflow, `VITE_MCP_URL` is wired from the `MCP_URL` GitHub repository secret (see `.github/workflows/deploy.yml` → `build-frontend` job). To change the URL, update the secret — no code change needed. If the secret is unset the build falls back to the dev default and every AI connector copied from the UI will be broken (#418).

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

### Frontend build-time variables (`VITE_*`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_URL` | `/api` | Backend base URL (full Cloud Run URL in production if not proxied) |
| `VITE_SILENT_REAUTH_ENABLED` | `true` | `false` disables the FedCM + One Tap silent re-auth path. Emergency switch; default on. |
