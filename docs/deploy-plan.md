# Deployment Plan

Production deployment architecture for Orbis, designed for horizontal scalability and minimal operational overhead.

## Architecture Overview

```
                    ┌─────────────────────────┐
                    │   Firebase Hosting       │
                    │   (Frontend SPA + CDN)   │
                    │   SPA fallback built-in  │
                    └──────────┬──────────────┘
                               │ /api/*
                               ▼
                    ┌─────────────────────────┐
                    │   Cloud Run (GCP)        │
                    │   (Backend API)          │
                    │   autoscale 0 → N        │
                    └───┬──────┬──────┬───────┘
                        │      │      │
                        │      │  ┌───▼──────────┐
                        │      │  │ GCS Bucket   │
                        │      │  │ (CV files)   │
                        │      │  └──────────────┘
                        │      │
               ┌────────▼──────▼───────────┐
               │  VPC (private network)     │
               │                            │
               │  ┌──────────────┐          │
               │  │ Neo4j        │ (graph)  │
               │  │ (GCE VM)     │          │
               │  └──────────────┘          │
               │                            │
               │  ┌──────────────┐          │
               │  │ Cloud SQL    │ (tables) │
               │  │ (PostgreSQL) │          │
               │  └──────────────┘          │
               │                            │
               └────────────────────────────┘
                        │
                   Anthropic API
                   (Claude LLM)

   ┌─────────────────────────┐     ┌─────────────────────────┐
   │  Cloud Run (MCP Server) │     │  Cloud Scheduler         │
   │  (separate service)     │     │  (cleanup, backups)      │
   └─────────────────────────┘     └─────────────────────────┘
```

**Provider: Google Cloud Platform (GCP)** — see [provider comparison](#cloud-provider-comparison-gcp-vs-aws) below for rationale.

## Cloud Provider Comparison: GCP vs AWS

**Decision: GCP** — chosen for operational simplicity and cost efficiency at early stage.

### Service-by-service comparison

| Component | GCP | AWS |
|---|---|---|
| **Backend container** | **Cloud Run** — scale-to-zero, pay-per-request, single-command deploy | **ECS Fargate** — more config (ALB, target groups, VPC, security groups), no native scale-to-zero. App Runner is simpler but less mature |
| **CV file storage** | **Cloud Storage (GCS)** — ~$0.02/GB, SSE default | **S3** — ~$0.023/GB, SSE default, functionally equivalent |
| **Graph database** | **Neo4j on Compute Engine** — persistent SSD, custom machine types | **Neo4j on EC2** — EBS SSD, more instance types available |
| **Relational database** | **Cloud SQL (PostgreSQL)** — managed, automatic backups, HA optional | **RDS (PostgreSQL)** — managed, equivalent features, slightly higher cost |
| **Frontend CDN** | **Firebase Hosting** — free tier, SPA fallback built-in, auto-deploy | **CloudFront + S3** — well-documented, more mature, needs URL map for SPA |
| **Secrets** | **Secret Manager** — native Cloud Run integration, free under 10k accesses | **Secrets Manager** — ECS integration, $0.40/secret/month |
| **CI/CD** | **Cloud Build** — integrated with GCR and Cloud Run | **CodePipeline/CodeBuild** — more setup, more flexible |
| **Monitoring** | **Cloud Logging + Cloud Monitoring** — included, good UI | **CloudWatch** — included, less intuitive UI |
| **Service auth** | **Workload Identity** — container accesses GCS without static keys | **IAM Roles for Tasks** — equivalent but more config |
| **Rate limiting cache** | In-memory (per-instance) initially. **Memorystore (Redis)** when scaling requires distributed counters | **ElastiCache (Redis)** — equivalent |

### Deployment complexity

**Cloud Run** (one command):
```bash
gcloud run deploy orbis-api \
  --image gcr.io/my-project/orbis-api \
  --region europe-west1 \
  --allow-unauthenticated
# Done: HTTPS, autoscaling, load balancing included.
```

**ECS Fargate** (requires configuring):
1. VPC + subnets
2. ECS Cluster
3. Task Definition
4. ECS Service
5. Application Load Balancer + Target Group
6. Security Groups
7. IAM Roles (task execution role + task role)

### Cost comparison (early stage, low traffic)

| Component | GCP | AWS |
|---|---|---|
| Backend (low traffic) | Cloud Run: **~$0-5/month** (scale-to-zero) | Fargate: **~$30-40/month** (min 1 task always running) |
| Object storage (30GB) | GCS: ~$0.60 | S3: ~$0.70 |
| Neo4j VM (4 vCPU, 16GB) | e2-standard-4: ~$70 | t3.xlarge: ~$75 |
| PostgreSQL (managed) | Cloud SQL db-f1-micro: ~$8 | RDS db.t4g.micro: ~$12 |
| Frontend hosting | Firebase Hosting: Free | CloudFront + S3: ~$1-2 |
| Secrets (8 secrets) | Free | ~$3.20/month |
| VPC Connector | ~$7/month | Included in VPC |
| Scheduler (cleanup, backups) | ~$0.10 | ~$0.10 |
| Artifact Registry | ~$1-2 | ECR: ~$1-2 |
| **Total** | **~$88-94/month** | **~$123-135/month** |

### Why GCP wins for this project

1. **Simplicity** — Cloud Run is drastically simpler than ECS Fargate for a small team
2. **Cost at low traffic** — scale-to-zero saves ~$30-40/month when traffic is sparse
3. **Less boilerplate** — Workload Identity, Secret Manager, Cloud Build integrate with Cloud Run without extra config
4. **Firebase Hosting** — free, zero-config SPA fallback (GCS + Cloud CDN requires a load balancer URL map for SPA routing)
5. **Neo4j AuraDB** is available on both — migration path is identical
6. **AWS makes sense if** you already have infrastructure there or need AWS-specific services (DynamoDB, SQS, Lambda)

---

## Component Decisions

### 1. Frontend — Firebase Hosting

The React SPA builds to static files (`frontend/dist/`). No server-side rendering needed.

**Why Firebase Hosting over GCS + Cloud CDN:**
- Built-in SPA fallback (`index.html` served for all unmatched routes) — no load balancer URL map needed
- Free tier generous (10 GB hosting, 360 MB/day transfer)
- Automatic SSL, global CDN
- Deploy via `firebase deploy` or GitHub Actions

**Configuration (`firebase.json`):**
```json
{
  "hosting": {
    "public": "frontend/dist",
    "ignore": ["firebase.json", "**/.*"],
    "rewrites": [
      {
        "source": "/api/**",
        "run": {
          "serviceId": "orbis-api",
          "region": "europe-west1"
        }
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "/assets/**",
        "headers": [
          { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
        ]
      },
      {
        "source": "/index.html",
        "headers": [
          { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }
        ]
      }
    ]
  }
}
```

**Key points:**
- Firebase rewrites `/api/**` directly to Cloud Run — no separate reverse proxy needed
- Hashed assets get long TTL (`immutable`), `index.html` always revalidates
- Enable gzip/brotli compression (automatic in Firebase Hosting)
- The Vite dev proxy (`/api → localhost:8000`) is dev-only; production uses Firebase rewrite

### 2. Backend — Cloud Run

The FastAPI backend is **stateless** (JWT auth, no server-side sessions), making it ideal for container autoscaling.

**Cloud Run** is the recommended choice for simplicity:
- Scale-to-zero when idle (cost efficient for early stage)
- Autoscale to N instances based on request concurrency
- No infrastructure to manage
- Built-in HTTPS, load balancing, health checks

**Container requirements:**
- Base image: `python:3.12-slim`
- Package manager: `uv` for fast installs
- Entrypoint: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Memory: 512MB minimum (PDF parsing + LLM payloads can spike)
- CPU: 1 vCPU minimum
- Concurrency: 80 requests per instance (default)
- Startup probe: `GET /health/ready` (see [Health Endpoints](#health-endpoints))
- Min instances: 0 (scale-to-zero)
- Max instances: 10 (cap for early stage, adjust later)
- Request timeout: 300s (matches `llm_timeout_seconds`)
- CPU always allocated: No (only during request processing — saves cost)

**Dockerfile (`backend/Dockerfile`):**

```dockerfile
FROM python:3.12-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
COPY app/ app/
COPY mcp_server/ mcp_server/
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 3. Neo4j — Phased approach

Neo4j is the **graph database** for the knowledge graph (orbs, nodes, relationships, embeddings). It is NOT used for tabular data — that goes to PostgreSQL (see [section 5](#5-sqlite--cloud-sql-postgresql)).

Neo4j Community Edition does not support clustering or read replicas. The scaling strategy is phased:

| Phase | When | Solution | Cost |
|---|---|---|---|
| **Phase 1** | 0 → thousands of users | Single Neo4j Community on a dedicated VM (4 vCPU, 16GB RAM, SSD) with automated backups | ~$50-80/month |
| **Phase 2** | When vertical scaling is needed | Neo4j AuraDB Professional (managed, resize on demand) | ~$65-200/month |
| **Phase 3** | When HA/read replicas are needed | Neo4j AuraDB Enterprise or evaluate Memgraph | $1000+/month |

**Phase 1 setup details:**
- GCE VM (e2-standard-4) with attached SSD persistent disk (50 GB)
- Neo4j 5 Community via Docker or system package
- Expose **only** Bolt port (7687) on the **VPC internal network** — no public IP, no browser UI in production
- Cloud Run connects via **Serverless VPC Access connector** (see [Networking](#networking))
- Apply `infra/neo4j/init.cypher` on first run for constraints, indexes, and vector indexes
- Daily automated backups via `neo4j-admin database dump` → upload to GCS (triggered by Cloud Scheduler)

**Migration path is simple:** Phase 1 → Phase 2 is a `neo4j-admin database dump` / AuraDB import + connection string change (`bolt://` → `neo4j+s://`). The Cypher schema and application code remain identical.

**Neo4j driver configuration:**
The current `neo4j_client.py` uses default pool settings. For Cloud Run, configure explicitly:

```python
_driver = AsyncGraphDatabase.driver(
    settings.neo4j_uri,
    auth=(settings.neo4j_user, settings.neo4j_password),
    max_connection_pool_size=50,
    connection_acquisition_timeout=10,
)
```

### 4. CV File Storage — GCS (migrate from local filesystem)

**Current state:** CV PDFs are encrypted with Fernet and stored on local disk at `backend/data/cv_files/`. Metadata is tracked in a local SQLite database (`backend/data/cv_uploads.db`). This does not work with multiple backend instances or stateless containers.

**Target state:** CV PDFs stored in GCS. Metadata moved to Cloud SQL PostgreSQL (see [section 5](#5-sqlite--cloud-sql-postgresql)).

See [CV Storage Migration](#cv-storage-migration-local-filesystem--gcs) below for the full implementation plan.

### 5. SQLite → Cloud SQL (PostgreSQL)

**Design principle:** The 4 SQLite databases store **tabular CRUD data** (drafts, ideas, snapshots, CV metadata). This data is relational by nature — it has no graph structure and doesn't benefit from Neo4j. It stays in SQL, migrating from local SQLite to managed Cloud SQL (PostgreSQL).

**Why PostgreSQL, not Neo4j:**
- These are flat tables with simple queries (INSERT, SELECT, UPDATE, DELETE by primary key or user_id)
- PostgreSQL is the natural replacement for SQLite — same SQL semantics, minimal code changes
- Keeps the graph database focused on what it's good at (relationships, traversals, embeddings)
- Cloud SQL is managed, auto-backed-up, and supports connection pooling natively

**Current SQLite databases:**

| Database | File | Tables | Data |
|---|---|---|---|
| `cv_uploads.db` | `cv_storage/db.py` | `cv_documents` | Document metadata (filename, size, page_count, timestamps) |
| `cv_uploads.db` | `snapshots/db.py` | `orb_snapshots` | Orb snapshot metadata + full graph JSON |
| `drafts.db` | `drafts/db.py` | `drafts` | Draft note text per user |
| `ideas.db` | `ideas/db.py` | `ideas` | User-submitted ideas |

See [SQLite → PostgreSQL Migration](#sqlite--postgresql-migration) below for the full implementation plan.

### 6. Ollama — Remove from production

Ollama is a local LLM fallback for development. In production, use the Claude API exclusively:
- Set `LLM_PROVIDER=claude` in production environment
- Remove `ollama` from `LLM_FALLBACK_CHAIN` in production (use `claude-opus,claude-sonnet,rule-based`)
- No GPU instance needed, no Ollama container to manage
- Reduces infrastructure cost and complexity

### 7. MCP Server — Separate Cloud Run service

The MCP server (`backend/mcp_server/server.py`) runs as a separate Uvicorn process with its own Neo4j driver. It **cannot** run in the same Cloud Run container as the main API without a process manager.

**Decision: deploy as a separate Cloud Run service.**

Rationale:
- Clean separation of concerns
- Independent scaling (MCP traffic is minimal)
- Scale-to-zero when not in use (near-zero cost)
- No process manager complexity (supervisord, s6-overlay)
- Each service gets its own health checks and logging

**MCP Dockerfile (`backend/Dockerfile.mcp`):**

```dockerfile
FROM python:3.12-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
COPY app/ app/
COPY mcp_server/ mcp_server/
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
CMD ["python", "-m", "mcp_server.server"]
```

**Configuration:**
- Same VPC connector as backend API (accesses Neo4j + Cloud SQL)
- Same Secret Manager secrets (reuses `app.config.settings`)
- Authentication: `X-MCP-Key` header (already implemented)
- No public access — invoked only by authorized agents

### 8. Rate Limiting — Per-instance (Redis upgrade path)

The current SlowAPI limiter uses in-memory storage. With N Cloud Run instances, each instance has its own counter — a user can make `3 × N` requests/minute instead of 3 on rate-limited endpoints.

**Initial approach: keep in-memory.** With scale-to-zero and low early traffic, most of the time there's 1 active instance, so per-instance limits are effectively global. This is an acceptable trade-off to avoid the cost and complexity of Redis on day 1.

**Known limitation:** When multiple instances are active under load, rate limits become per-instance. This means a determined user could bypass limits by hitting different instances.

**Future upgrade — Redis (Memorystore):**
When traffic grows enough that multiple instances are regularly active, add Memorystore Redis (~$7/month) as the SlowAPI storage backend:

```python
limiter = Limiter(
    key_func=_user_or_ip,
    storage_uri=settings.redis_url,  # e.g. "redis://10.0.0.3:6379"
)
```

This is a one-line change in `rate_limit.py` + adding `REDIS_URL` to config. No other code changes needed.

### 9. Health Endpoints

The current `/health` endpoint returns `{"status": "ok"}` without verifying any dependencies. Cloud Run needs proper probes.

**New endpoints:**

```python
@app.get("/health/live")
async def liveness():
    """Liveness probe — process is alive and responsive."""
    return {"status": "ok"}

@app.get("/health/ready")
async def readiness():
    """Readiness probe — dependencies are reachable."""
    driver = await get_driver()
    async with driver.session() as session:
        await session.run("RETURN 1")
    # Optionally check PostgreSQL connectivity too
    return {"status": "ok", "neo4j": "connected"}
```

**Cloud Run configuration:**
- Startup probe: `GET /health/ready` (initial delay 5s, period 10s, failure threshold 3)
- Liveness probe: `GET /health/live` (period 30s)
- The old `/health` endpoint can remain as an alias for `/health/live`

### 10. Background Tasks — Cloud Scheduler

**Problem:** `main.py` starts a recurring `asyncio.Task` every 24 hours for account cleanup. This is incompatible with Cloud Run:
- Instances are killed after idle timeout
- With scale-to-zero, no instance is alive to run recurring tasks
- Cleanup runs on every cold start, slowing the first request

**Solution:** Replace in-process tasks with Cloud Scheduler → Cloud Run HTTP triggers.

**Tasks to schedule:**

| Task | Schedule | Endpoint | Description |
|---|---|---|---|
| Account cleanup | Daily 03:00 UTC | `POST /admin/cleanup` | Delete accounts past 30-day grace period |
| Neo4j backup | Daily 04:00 UTC | Script on GCE VM via cron | `neo4j-admin database dump` → GCS |

**Changes to `main.py`:**
- Remove `_periodic_cleanup()` task creation from lifespan
- Remove cleanup execution from startup (no longer blocks cold start)
- Add `POST /admin/cleanup` endpoint (protected by `require_admin` or a shared secret header)

**Cloud Scheduler setup:**
```bash
gcloud scheduler jobs create http orbis-cleanup \
  --schedule="0 3 * * *" \
  --uri="https://orbis-api-xxxxx.run.app/admin/cleanup" \
  --http-method=POST \
  --oidc-service-account-email=scheduler@project.iam.gserviceaccount.com
```

### 11. Logging — Structured JSON

Cloud Run automatically captures stdout/stderr into Cloud Logging. But unstructured text logs are hard to filter and alert on.

**Changes to `main.py`:**

```python
import json
import logging

class CloudRunFormatter(logging.Formatter):
    """Emit JSON lines that Cloud Logging parses natively."""
    def format(self, record):
        return json.dumps({
            "severity": record.levelname,
            "message": record.getMessage(),
            "module": record.module,
            "timestamp": self.formatTime(record),
        })

handler = logging.StreamHandler()
handler.setFormatter(CloudRunFormatter())
logging.basicConfig(level=logging.INFO, handlers=[handler])
```

**Benefits:**
- Cloud Logging parses JSON automatically — severity, module, timestamp become filterable fields
- Enables Cloud Monitoring alerts on `severity=ERROR` or specific modules
- Request tracing via `X-Cloud-Trace-Context` header (Cloud Run sets this automatically)

---

## Networking

### VPC Setup

Cloud Run instances need to reach Neo4j (GCE VM) and Cloud SQL (PostgreSQL) on the private network. Both services have **no public IP**.

**Serverless VPC Access connector:**
```bash
gcloud compute networks vpc-access connectors create orbis-connector \
  --region=europe-west1 \
  --subnet=orbis-subnet \
  --min-instances=2 \
  --max-instances=3 \
  --machine-type=f1-micro
```

**Cloud Run configuration:**
```bash
gcloud run services update orbis-api \
  --vpc-connector=orbis-connector \
  --vpc-egress=private-ranges-only
```

**Firewall rules:**
```bash
# Allow VPC connector → Neo4j Bolt
gcloud compute firewall-rules create allow-bolt \
  --network=default \
  --allow=tcp:7687 \
  --source-ranges=10.8.0.0/28 \
  --target-tags=neo4j
```

Cloud SQL connectivity uses the **Cloud SQL Auth Proxy** sidecar (built into Cloud Run) or **private IP** — no firewall rule needed, just the `--add-cloudsql-instances` flag on the Cloud Run service.

**Cost:** ~$7/month for the f1-micro VPC connector instances.

---

## SQLite → PostgreSQL Migration

### Cloud SQL Setup

```bash
gcloud sql instances create orbis-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=europe-west1 \
  --storage-size=10GB \
  --storage-auto-increase \
  --backup-start-time=04:00 \
  --availability-type=zonal \
  --no-assign-ip  # Private IP only
```

**Configuration:**
- Instance: `db-f1-micro` (0.6 GB RAM, shared vCPU) — sufficient for early stage
- Automatic daily backups (included in Cloud SQL)
- Private IP only — no public access
- Cloud Run connects via Cloud SQL Auth Proxy (built-in, no extra config)
- Cost: ~$8/month

**Scaling path:** `db-f1-micro` → `db-g1-small` ($26/month) → `db-custom-2-4096` ($50/month) as traffic grows.

### PostgreSQL Schema

```sql
-- CV document metadata
CREATE TABLE cv_documents (
    document_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    page_count INTEGER NOT NULL,
    entities_count INTEGER,
    edges_count INTEGER,
    gcs_key TEXT
);
CREATE INDEX idx_cv_documents_user ON cv_documents(user_id);
CREATE INDEX idx_cv_documents_uploaded ON cv_documents(user_id, uploaded_at DESC);

-- Orb snapshots
CREATE TABLE orb_snapshots (
    snapshot_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trigger TEXT NOT NULL,
    label TEXT,
    node_count INTEGER NOT NULL,
    edge_count INTEGER NOT NULL,
    data JSONB NOT NULL,
    PRIMARY KEY (user_id, snapshot_id)
);
CREATE INDEX idx_snapshots_user ON orb_snapshots(user_id, created_at DESC);

-- Draft notes
CREATE TABLE drafts (
    uid TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_drafts_user ON drafts(user_id);

-- User ideas
CREATE TABLE ideas (
    idea_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ideas_user ON ideas(user_id);
```

**Notes:**
- Schema is nearly identical to current SQLite — same columns, same indexes
- `data` column in `orb_snapshots` uses `JSONB` instead of `TEXT` (enables future JSON queries if needed)
- Timestamps use `TIMESTAMPTZ` instead of `TEXT` (proper type, same ISO format)

### Code Changes

#### 1. Add `asyncpg` dependency

```bash
cd backend && uv add asyncpg
```

#### 2. Create PostgreSQL connection module — `backend/app/db/postgres.py`

```python
"""Async PostgreSQL connection pool for tabular data."""

from __future__ import annotations

import asyncpg

from app.config import settings

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            settings.database_url,
            min_size=2,
            max_size=10,
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
```

#### 3. Rewrite each `db.py` module

Each SQLite module (`drafts/db.py`, `ideas/db.py`, `snapshots/db.py`, `cv_storage/db.py`) gets rewritten to use `asyncpg` via the shared pool. The function signatures stay the same but become `async`.

**Example — `drafts/db.py` (before → after):**

Before (SQLite, sync):
```python
def list_drafts(user_id: str) -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT uid, text, created_at, updated_at FROM drafts "
        "WHERE user_id = ? ORDER BY updated_at DESC",
        (user_id,),
    ).fetchall()
    return [dict(r) for r in rows]
```

After (asyncpg, async):
```python
async def list_drafts(user_id: str) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT uid, text, created_at, updated_at FROM drafts "
        "WHERE user_id = $1 ORDER BY updated_at DESC",
        user_id,
    )
    return [dict(r) for r in rows]
```

**Key differences from SQLite:**
- All functions become `async`
- Parameter placeholders change from `?` to `$1`, `$2`, etc. (PostgreSQL style)
- Connection is a pool, not a global singleton
- No `_maybe_migrate()` — schema is managed by init script
- No `check_same_thread=False` — asyncpg is designed for async
- No `PRAGMA journal_mode=WAL` — PostgreSQL handles this natively

#### 4. Update routers

All routers that call db functions must `await` them. Since FastAPI endpoints are already `async def`, this is a minimal change — just add `await` before each db call.

#### 5. Update `main.py` lifespan

```python
from app.db.postgres import close_pool, get_pool

@asynccontextmanager
async def lifespan(app: FastAPI):
    driver = await get_driver()       # Neo4j
    pool = await get_pool()           # PostgreSQL
    async with driver.session() as session:
        await session.run("RETURN 1")
    yield
    await close_pool()
    await close_driver()
```

#### 6. Update `config.py`

```python
# Cloud SQL PostgreSQL
database_url: str = "postgresql://orbis:password@localhost:5432/orbis"
```

Add production validator: if `ENV != "development"` and `database_url` contains `localhost`, refuse to start.

**Cloud Run connection string format (via Auth Proxy):**
```
postgresql://orbis:PASSWORD@/orbis?host=/cloudsql/PROJECT:REGION:INSTANCE
```

#### 7. Update account cleanup

The cleanup in `main.py` calls `delete_stored_cvs`, `delete_user_drafts`, `delete_user_snapshots`. These are now async — update the cleanup function accordingly.

### Files affected (SQLite → PostgreSQL)

| File | Action |
|---|---|
| `backend/app/db/__init__.py` | **Create** — package |
| `backend/app/db/postgres.py` | **Create** — asyncpg pool management |
| `backend/app/drafts/db.py` | **Rewrite** — asyncpg queries |
| `backend/app/ideas/db.py` | **Rewrite** — asyncpg queries |
| `backend/app/snapshots/db.py` | **Rewrite** — asyncpg queries |
| `backend/app/cv_storage/db.py` | **Rewrite** — asyncpg queries |
| `backend/app/drafts/router.py` | **Minor** — add `await` to db calls |
| `backend/app/ideas/router.py` | **Minor** — add `await` to db calls |
| `backend/app/snapshots/router.py` | **Minor** — add `await` to db calls |
| `backend/app/cv/router.py` | **Minor** — add `await` to db calls |
| `backend/app/main.py` | **Update** — PostgreSQL pool in lifespan, async cleanup |
| `backend/app/config.py` | **Add** — `database_url` setting + validator |
| `backend/pyproject.toml` | **Add** — `asyncpg` dependency |
| `infra/postgres/init.sql` | **Create** — PostgreSQL schema |
| `backend/tests/unit/` | **Update** — mock asyncpg instead of sqlite3 |

### Data migration script

One-time script to migrate from SQLite → Cloud SQL:

```bash
# 1. Export from SQLite
sqlite3 backend/data/drafts.db ".dump drafts" > /tmp/drafts.sql
sqlite3 backend/data/cv_uploads.db ".dump cv_documents" > /tmp/cv_documents.sql
sqlite3 backend/data/cv_uploads.db ".dump orb_snapshots" > /tmp/snapshots.sql
sqlite3 backend/data/ideas.db ".dump ideas" > /tmp/ideas.sql

# 2. Convert SQLite SQL to PostgreSQL (fix ? → $N, TEXT dates → TIMESTAMPTZ, etc.)
# 3. Import into Cloud SQL via psql or pg_restore
# 4. Verify row counts match
```

Alternatively, use a Python script that reads from SQLite and writes to PostgreSQL via asyncpg for cleaner type conversion.

---

## CV Storage Migration: Local Filesystem → GCS

### What changes

| Layer | Current | Target |
|---|---|---|
| **File storage** | Local disk (`backend/data/cv_files/*.pdf.enc`) | GCS bucket (`gs://orbis-cv-files/{user_id}/{document_id}.pdf`) |
| **Encryption** | Application-level Fernet before writing to disk | GCS SSE (server-side encryption) — remove application-level `encrypt_bytes`/`decrypt_bytes` for files |
| **Metadata** | SQLite (`backend/data/cv_uploads.db`) | Cloud SQL PostgreSQL `cv_documents` table |
| **Eviction logic** | SQLite queries in `cv_storage/db.py` | PostgreSQL queries against `cv_documents` table |

### Why remove Fernet for GCS files

Currently the code double-encrypts: Fernet at the application layer, then the filesystem stores the ciphertext. With GCS:
- **Google-managed encryption** (AES-256) encrypts at rest automatically — free, zero config
- **CMEK** (Customer-Managed Encryption Keys via Cloud KMS) gives you key rotation and audit trails if needed
- Removing the application-level Fernet for files simplifies the code and avoids managing encryption keys for file storage separately from PII field encryption
- PII fields on Neo4j nodes (email, phone, address) **keep** their Fernet encryption — that is a different concern

### GCS bucket setup

```
Bucket: orbis-cv-files (or orbis-{env}-cv-files)
Region: europe-west1 (same as Cloud Run)
Encryption: Google-managed (default) or CMEK
Versioning: disabled (eviction deletes old files)
Lifecycle: optional — auto-delete objects older than 365 days
Public access: blocked entirely (uniform bucket-level access)
CORS: not needed (backend proxies all access)
IAM: Cloud Run service account gets roles/storage.objectAdmin
```

### New environment variables

```env
# GCS configuration
CV_STORAGE_BUCKET=orbis-cv-files
```

No static credentials needed — Cloud Run uses **Workload Identity** to access GCS. The service account is bound at deploy time.

### Code changes required

#### 1. Add `google-cloud-storage` dependency

```bash
cd backend && uv add google-cloud-storage
```

#### 2. Create new GCS storage backend — `backend/app/cv_storage/gcs.py`

Replace the filesystem operations with GCS calls:

```python
from google.cloud import storage

_client = None

def _get_client():
    global _client
    if _client is None:
        _client = storage.Client()
    return _client

def upload_file(bucket_name: str, user_id: str, document_id: str, pdf_bytes: bytes) -> str:
    """Upload PDF to GCS. Returns the GCS object key."""
    client = _get_client()
    bucket = client.bucket(bucket_name)
    key = f"{user_id}/{document_id}.pdf"
    blob = bucket.blob(key)
    blob.upload_from_string(pdf_bytes, content_type="application/pdf")
    return key

def download_file(bucket_name: str, user_id: str, document_id: str) -> bytes | None:
    """Download PDF from GCS. Returns None if not found."""
    client = _get_client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(f"{user_id}/{document_id}.pdf")
    if not blob.exists():
        return None
    return blob.download_as_bytes()

def delete_file(bucket_name: str, user_id: str, document_id: str) -> bool:
    """Delete a file from GCS."""
    client = _get_client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(f"{user_id}/{document_id}.pdf")
    if not blob.exists():
        return False
    blob.delete()
    return True

def delete_prefix(bucket_name: str, prefix: str) -> int:
    """Delete all objects with a given prefix. Returns count deleted."""
    client = _get_client()
    bucket = client.bucket(bucket_name)
    blobs = list(bucket.list_blobs(prefix=prefix))
    for blob in blobs:
        blob.delete()
    return len(blobs)
```

#### 3. Update `backend/app/cv_storage/storage.py`

This file becomes a thin facade. Replace filesystem + Fernet calls with GCS calls, and use the async PostgreSQL `cv_storage/db.py` for metadata. The public API (`save_document`, `load_document`, `delete_document`, `evict_oldest_if_at_limit`) stays the same — callers in `cv/router.py` don't need to change beyond adding `await`.

#### 4. Remove deprecated shims

Both `storage.py` and `db.py` contain backward-compatibility shims (`save_cv`, `load_cv`, `delete_cv`, `get_metadata`, `upsert_metadata`). These should be removed during the migration. Update any remaining callers to use the multi-document API.

#### 5. Update `backend/app/config.py`

Add GCS settings to the `Settings` class:

```python
cv_storage_bucket: str = ""
```

Add a production validator: if `ENV != "development"` and `CV_STORAGE_BUCKET` is empty, refuse to start.

#### 6. Update Fernet key rotation docs

The current `docs/deployment.md` mentions re-encrypting CV files on disk during key rotation. After migration, this section should be updated — GCS files are no longer Fernet-encrypted, so only Neo4j PII fields need rotation.

### Files affected (CV storage)

| File | Action |
|---|---|
| `backend/app/cv_storage/gcs.py` | **Create** — GCS upload/download/delete |
| `backend/app/cv_storage/storage.py` | **Rewrite** — delegate to `gcs.py` + PostgreSQL metadata |
| `backend/app/cv_storage/db.py` | **Rewrite** — asyncpg queries (part of SQLite→PG migration) |
| `backend/app/cv/router.py` | **Minor** — add `await` to storage calls |
| `backend/app/config.py` | **Add** GCS settings + validator |
| `backend/pyproject.toml` | **Add** `google-cloud-storage` dependency |
| `docs/deployment.md` | **Update** key rotation section |
| `backend/tests/unit/` | **Update** storage tests to mock GCS |

### CV data migration

For existing users with files on disk, a one-time migration script:

1. Read all rows from SQLite `cv_documents` table
2. For each row, read the `.pdf.enc` file, decrypt with Fernet, upload to GCS
3. Insert the corresponding row into Cloud SQL `cv_documents` with `gcs_key`
4. Verify counts match, then delete local files and SQLite DB

---

## Environment Variables (Production)

| Variable | Required | Purpose |
|---|---|---|
| `ENV` | Yes | Must be `production` or `staging` |
| `JWT_SECRET` | Yes | JWT signing key (generate with `openssl rand -base64 32`) |
| `ENCRYPTION_KEY` | Yes | Fernet key for Neo4j PII fields (`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`) |
| `NEO4J_URI` | Yes | Bolt connection string (e.g. `bolt://10.0.0.2:7687`) |
| `NEO4J_USER` | Yes | Neo4j username |
| `NEO4J_PASSWORD` | Yes | Neo4j password (not the dev default) |
| `DATABASE_URL` | Yes | Cloud SQL PostgreSQL connection string |
| `FRONTEND_URL` | Yes | CORS origin (e.g. `https://app.openorbis.com`) |
| `COOKIE_DOMAIN` | Yes | Parent domain for cookies (e.g. `.openorbis.com`) |
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `LLM_PROVIDER` | Yes | Set to `claude` in production |
| `LLM_FALLBACK_CHAIN` | Yes | `claude-opus,claude-sonnet,rule-based` (no ollama) |
| `CV_STORAGE_BUCKET` | Yes | GCS bucket name for CV files |
| `REDIS_URL` | No | Memorystore Redis URL for distributed rate limiting (future upgrade) |
| `RESEND_API_KEY` | Optional | Transactional email |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth |
| `LINKEDIN_CLIENT_ID` | Optional | LinkedIn OAuth |
| `LINKEDIN_CLIENT_SECRET` | Optional | LinkedIn OAuth |
| `LINKEDIN_REDIRECT_URI` | Optional | LinkedIn OAuth callback URL (must match production URL) |

All secrets stored in **GCP Secret Manager** and mounted as env vars in Cloud Run. No `.env` files in production.

---

## CI/CD Pipeline

### Build and deploy (GitHub Actions)

Extend the existing GitHub Actions with deploy workflows:

```yaml
# .github/workflows/deploy.yml
name: Deploy to Cloud Run

on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write  # Workload Identity Federation
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: projects/PROJECT_NUM/locations/global/workloadIdentityPools/github/providers/github
          service_account: deployer@PROJECT.iam.gserviceaccount.com
      - uses: google-github-actions/setup-gcloud@v2
      - run: |
          gcloud builds submit backend/ \
            --tag gcr.io/PROJECT/orbis-api:${{ github.sha }}
          gcloud run deploy orbis-api \
            --image gcr.io/PROJECT/orbis-api:${{ github.sha }} \
            --region europe-west1 \
            --vpc-connector orbis-connector \
            --add-cloudsql-instances PROJECT:europe-west1:orbis-db \
            --set-secrets="JWT_SECRET=jwt-secret:latest,..."

  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: cd frontend && npm ci && npm run build
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          channelId: live

  smoke-test:
    needs: [deploy-backend, deploy-frontend]
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -f https://orbis-api-xxxxx.run.app/health/ready
          curl -f https://app.openorbis.com/
```

### Deploy flow

1. **On push to `main`:** CI runs lint + tests (existing workflow)
2. **On CI pass:** build Docker image → push to Artifact Registry
3. **Deploy backend:** update Cloud Run service with new image (with Cloud SQL proxy)
4. **Deploy frontend:** build Vite → deploy to Firebase Hosting
5. **Post-deploy:** smoke tests (health check + frontend loads)

---

## Staging Environment

A staging environment is required for testing before production. It mirrors production but with:

- Separate GCP project or separate resource names (suffix `-staging`)
- Separate Neo4j VM (smaller: e2-medium, 4GB RAM)
- Separate Cloud SQL instance (`orbis-db-staging`, db-f1-micro)
- Separate GCS bucket (`orbis-cv-files-staging`)
- Separate Firebase Hosting site (`orbis-staging`)
- Separate Cloud Run services (`orbis-api-staging`, `orbis-mcp-staging`)
- Own set of secrets in Secret Manager
- OAuth redirect URLs pointing to staging domain

**Deploy trigger:** push to `staging` branch (or manual trigger from GitHub Actions).

**Purpose:**
- Test data migrations before production
- Validate OAuth flows with production-like URLs
- Test rate limiting across multiple instances
- Verify VPC connectivity to Neo4j and Cloud SQL
- Performance baseline before going live

---

## Cost Estimate (Early Stage, GCP)

| Component | Service | Monthly cost |
|---|---|---|
| Backend | Cloud Run (scale-to-zero, 0→10 instances) | $0 — $5 |
| Graph database | Neo4j on GCE e2-standard-4 (16GB, 50GB SSD) | ~$70 |
| Relational database | Cloud SQL PostgreSQL db-f1-micro | ~$8 |
| CV storage | GCS bucket (30GB) | ~$0.60 |
| Frontend | Firebase Hosting (free tier) | Free |
| Secrets | Secret Manager (< 10k accesses) | Free |
| Networking | Serverless VPC Access connector (f1-micro x2) | ~$7 |
| Scheduler | Cloud Scheduler (2 jobs) | ~$0.10 |
| Container registry | Artifact Registry | ~$1-2 |
| Egress | Networking / data transfer | ~$1-5 |
| LLM | Anthropic API | Usage-based |
| MCP Server | Cloud Run (separate, scale-to-zero) | ~$0-1 |
| **Total infrastructure** | | **~$88 — $99/month** |

**Staging adds:** ~$30-40/month (smaller VM, smaller Cloud SQL, same services at minimal usage).

**Future add-on:** Memorystore Redis for distributed rate limiting (~+$7/month) when scaling requires it.

---

## Implementation Order

The migration should be done in phases to reduce risk. Each phase is independently deployable and testable.

### Phase 0: Infrastructure setup
- [ ] Create GCP project and enable APIs
- [ ] Set up VPC, subnets, firewall rules
- [ ] Create Serverless VPC Access connector
- [ ] Set up GCE VM for Neo4j with persistent SSD
- [ ] Install Neo4j 5 Community, apply `init.cypher`
- [ ] Create Cloud SQL PostgreSQL instance, apply `init.sql` schema
- [ ] Set up GCS bucket for CV files
- [ ] Configure Secret Manager with all production secrets
- [ ] Set up Firebase Hosting project
- [ ] Set up Workload Identity Federation for GitHub Actions

### Phase 1: Backend production-readiness (no deploy yet)
- [ ] Create `backend/Dockerfile`
- [ ] Add health endpoints (`/health/live`, `/health/ready`)
- [ ] Add structured JSON logging
- [ ] Add `DATABASE_URL`, `CV_STORAGE_BUCKET` to `config.py` with production validators
- [ ] Remove cleanup task from startup/lifespan; add `POST /admin/cleanup` endpoint
- [ ] Configure Neo4j driver pool size
- [ ] Update `LLM_FALLBACK_CHAIN` handling (remove ollama for production)

### Phase 2: SQLite → Cloud SQL PostgreSQL migration
- [ ] Add `asyncpg` dependency
- [ ] Create `backend/app/db/postgres.py` (connection pool)
- [ ] Create `infra/postgres/init.sql` (schema)
- [ ] Rewrite `drafts/db.py` to asyncpg (simplest, good first target)
- [ ] Rewrite `ideas/db.py` to asyncpg
- [ ] Rewrite `snapshots/db.py` to asyncpg
- [ ] Rewrite `cv_storage/db.py` to asyncpg
- [ ] Update all routers (add `await` to db calls)
- [ ] Update `main.py` lifespan (add PostgreSQL pool init/close)
- [ ] Remove all backward-compatibility shims
- [ ] Update unit tests (mock asyncpg instead of sqlite3)

### Phase 3: CV file storage → GCS
- [ ] Add `google-cloud-storage` dependency
- [ ] Create `backend/app/cv_storage/gcs.py`
- [ ] Rewrite `backend/app/cv_storage/storage.py` (GCS + async metadata)
- [ ] Remove application-level Fernet for CV files
- [ ] Update `docs/deployment.md` key rotation section
- [ ] Update CV storage unit tests (mock GCS)

### Phase 4: Deploy staging
- [ ] Deploy backend to Cloud Run (staging)
- [ ] Deploy frontend to Firebase Hosting (staging)
- [ ] Deploy MCP server to Cloud Run (staging)
- [ ] Configure Cloud Scheduler jobs (staging)
- [ ] Run data migration script (SQLite → Cloud SQL, local files → GCS)
- [ ] Test OAuth flows end-to-end
- [ ] Test rate limiting across multiple instances
- [ ] Test cold start time
- [ ] Verify Neo4j backup/restore cycle

### Phase 5: Deploy production
- [ ] Run data migration script against production (Cloud SQL + GCS)
- [ ] Deploy backend to Cloud Run (production)
- [ ] Deploy frontend to Firebase Hosting (production)
- [ ] Deploy MCP server to Cloud Run (production)
- [ ] Configure Cloud Scheduler jobs (production)
- [ ] Update DNS / domain configuration
- [ ] Verify smoke tests pass
- [ ] Monitor logs and error rates for 48 hours
- [ ] Delete local SQLite databases and CV files after confirming migration success
