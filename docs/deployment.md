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

## Production — OVH VPS + Cloudflare

Production runs on a single OVH VPS (backend, MCP server, Neo4j, Postgres behind
Caddy) with Cloudflare in front (DNS zone, Workers frontend, edge proxy/WAF).
Design and cutover record: see the 2026-07-05 cutover spec (local,
`docs/superpowers/specs/`).

### Architecture

| Host | Serves | Cloudflare proxy |
|---|---|---|
| `open-orbis.com` | Cloudflare Worker `open-orbis`: static frontend assets + same-origin proxy of `/api/**`, `/oauth/token\|register\|revoke`, `/.well-known/oauth-authorization-server` → `api.open-orbis.com` (`frontend/worker/index.js`) | orange (Worker custom domain) |
| `api.open-orbis.com` | Caddy → `backend:8000` (FastAPI) | orange — TLS via Cloudflare Origin CA cert on the VPS |
| `mcp.open-orbis.com` | Caddy → `mcp:8081` (MCP server) | orange — same Origin CA cert |

The only remaining GCP dependency (deliberate) is **Vertex AI** (CV extraction
LLM, service-account key mounted at `/opt/orbis/vertex-key.json`). CV jobs are
processed by an in-process worker (`app/cv/worker.py`, started from the app
lifespan) that polls Postgres — no external queue. Everything else on GCP
(Cloud Run, Cloud SQL, GCS, Firebase Hosting, Cloud Tasks) is decommissioned.

### Deploying the backend/MCP stack (OVH)

The VPS (`orbis@51.75.121.189`) has a repo checkout at `/opt/orbis/orb_project`;
secrets live outside the repo in `/opt/orbis/.env`.

```bash
ssh orbis@51.75.121.189
cd /opt/orbis/orb_project
git pull
docker compose --env-file /opt/orbis/.env \
  -f infra/ovh/docker-compose.prod.yml up -d --build
```

Verify: `curl https://api.open-orbis.com/health` and
`curl -s -o /dev/null -w "%{http_code}" https://mcp.open-orbis.com/mcp` (401 is
the healthy unauthenticated answer).

### Deploying the frontend (Cloudflare Workers)

```bash
cd frontend
npm ci && npm run build     # VITE_* vars must be set in the environment
npx wrangler deploy         # uploads worker + dist/ static assets
```

The Worker config is `frontend/wrangler.jsonc` (Workers Static Assets, SPA
fallback). The custom domain `open-orbis.com` is attached to the Worker in the
Cloudflare dashboard (Workers → open-orbis → Domains & Routes).

### TLS certificates on the VPS

`api`/`mcp` use a Cloudflare **Origin CA** certificate (15-year validity,
`*.open-orbis.com` + apex) stored at `/opt/orbis/certs/origin.pem` +
`origin-key.pem` and mounted read-only into the caddy container. Cloudflare SSL
mode must be **Full (strict)**. These certs are trusted only by Cloudflare — do
not flip `api`/`mcp` to DNS-only while this Caddyfile is active. `tasks` uses
automatic Let's Encrypt (ports 80/443 open in UFW).

### CI/CD status

The GitHub Actions release workflow (`.github/workflows/deploy.yml`) still
targets the old GCP stack (Cloud Build → Cloud Run, Firebase Hosting) and is
**stale after the cutover** — do not publish releases expecting it to deploy
production until it is rewritten for OVH (ssh + compose) and Cloudflare
(`wrangler deploy`). Until then, deploy manually with the commands above.
The legacy GCP scripts live in `infra/gcp/` for reference.

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

**Production (reverse-proxy routing):** the Cloudflare Worker (`frontend/worker/index.js`) applies the path-based routing on the frontend origin:
- `/oauth/authorize` → frontend (HTML consent page served by the SPA)
- `/oauth/register`, `/oauth/token`, `/oauth/revoke` → backend (JSON OAuth endpoints)
- `/.well-known/oauth-authorization-server` → backend (RFC 8414 discovery)
- `/api/*` → backend (authenticated app API)

If you can't do path-based routing on the frontend origin, the alternative is to expose the backend under a separate host (`api.<domain>`) and update the discovery metadata to advertise those endpoints directly — but you must still serve `/oauth/authorize` on the origin users log into, otherwise the consent page won't have access to the browser's session cookie.

### Frontend build-time variables

The frontend build bakes the MCP endpoint URL into the bundle. If it's unset, the Connected AI modal and share-token "Copy MCP config" buttons will copy the dev default (`http://localhost:8081/mcp`) — useless for cloud AI clients. Set this at build time (before `npm run build` / `wrangler deploy`):

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

### SEO / crawlability

Static SEO metadata lives in `frontend/index.html` (title, meta description, canonical, Open Graph, Twitter cards, JSON-LD Schema.org) and is the same for every route — the app is a client-rendered SPA, so this is what crawlers and social-link unfurlers see before JS executes. `frontend/public/robots.txt` and `frontend/public/sitemap.xml` are copied verbatim into `frontend/dist/` at build and served at the site root (Workers Static Assets serves existing files before invoking the worker / SPA fallback). When adding a new **public** route, add it to `sitemap.xml`; when adding an authenticated route, add a `Disallow` line to `robots.txt`.

> Per-route / per-orb metadata (e.g. Open Graph for shared `/:orbId` orbs) is **not** handled here — shared-orb links currently fall back to the homepage tags until dynamic rendering lands.

### Frontend build-time variables (`VITE_*`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_URL` | `/api` | Backend base URL (usually unset in production — the Worker proxies `/api` same-origin) |
| `VITE_SILENT_REAUTH_ENABLED` | `true` | `false` disables the FedCM + One Tap silent re-auth path. Emergency switch; default on. |
