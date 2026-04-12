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
