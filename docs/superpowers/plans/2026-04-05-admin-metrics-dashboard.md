# Admin Metrics Dashboard & LLM Token Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full admin metrics dashboard with self-hosted PostHog analytics, an ASGI middleware + event bus analytics layer that wraps the app, separate admin auth via PostgreSQL, LLM token tracking, and comprehensive user behavior metrics.

**Architecture:** Self-hosted PostHog captures all analytics events. An ASGI middleware automatically tracks every request (timing, status, user) without app code changes. An in-process event bus lets LLM classifiers emit token usage events that the middleware flushes to PostHog. A frontend tracker abstraction wraps posthog-js. Admin credentials stored in PostHog's PostgreSQL (isolated `orbis_admin` schema). Admin dashboard pages at `/admin/*` query PostHog API through backend proxy endpoints.

**Tech Stack:** PostHog (self-hosted), PostgreSQL, posthog-python, posthog-js, bcrypt, asyncpg, Recharts

---

## File Structure

### New Files — Backend

| File | Responsibility |
|------|---------------|
| `backend/app/analytics/__init__.py` | Package init |
| `backend/app/analytics/event_bus.py` | In-process event bus using `contextvars` for request-scoped event collection |
| `backend/app/analytics/posthog_client.py` | PostHog SDK initialization + singleton client |
| `backend/app/analytics/middleware.py` | ASGI middleware — captures request metrics, flushes event bus to PostHog |
| `backend/app/admin/__init__.py` | Package init |
| `backend/app/admin/db.py` | PostgreSQL connection pool (asyncpg) for `orbis_admin` schema |
| `backend/app/admin/auth.py` | Admin JWT creation + `get_current_admin` FastAPI dependency |
| `backend/app/admin/schemas.py` | Pydantic request/response models for admin endpoints |
| `backend/app/admin/seed.py` | CLI script to seed admin credentials |
| `backend/app/admin/service.py` | Business logic: PostHog API queries, data aggregation |
| `backend/app/admin/router.py` | Admin API endpoints (login, overview, trends, users, llm-usage, events, funnel, realtime) |
| `backend/tests/unit/test_event_bus.py` | Tests for event bus |
| `backend/tests/unit/test_analytics_middleware.py` | Tests for ASGI middleware |
| `backend/tests/unit/test_admin_auth.py` | Tests for admin JWT + dependency |
| `backend/tests/unit/test_admin_seed.py` | Tests for admin seeding CLI |
| `backend/tests/unit/test_admin_router.py` | Tests for admin API endpoints |

### New Files — Frontend

| File | Responsibility |
|------|---------------|
| `frontend/src/analytics/tracker.ts` | PostHog JS SDK init + `trackEvent()` / `identifyUser()` / `resetUser()` wrappers |
| `frontend/src/api/adminClient.ts` | Axios instance with admin JWT interceptor (sessionStorage) |
| `frontend/src/api/admin.ts` | Admin API calls (login, fetch metrics) |
| `frontend/src/stores/adminAuthStore.ts` | Zustand store for admin auth state |
| `frontend/src/components/admin/AdminLayout.tsx` | Shared admin layout with sidebar nav |
| `frontend/src/components/admin/AdminRoute.tsx` | Route guard for admin auth |
| `frontend/src/components/admin/MetricCard.tsx` | Reusable summary card with sparkline |
| `frontend/src/components/admin/FunnelChart.tsx` | Registration funnel visualization |
| `frontend/src/components/admin/HeatmapChart.tsx` | Hour x Day-of-week heatmap |
| `frontend/src/pages/admin/AdminLoginPage.tsx` | Admin login form |
| `frontend/src/pages/admin/AdminDashboardPage.tsx` | Overview: cards, sparklines, funnel, activity feed |
| `frontend/src/pages/admin/AdminUsersPage.tsx` | User list table + user detail view |
| `frontend/src/pages/admin/AdminLLMPage.tsx` | LLM token usage charts |
| `frontend/src/pages/admin/AdminEventsPage.tsx` | Event explorer with heatmap |

### Modified Files

| File | Change |
|------|--------|
| `docker-compose.yml` | Add PostHog services (PostgreSQL, Redis, ClickHouse, Kafka, PostHog web/worker) |
| `backend/pyproject.toml` | Add `posthog`, `bcrypt`, `asyncpg` dependencies |
| `frontend/package.json` | Add `posthog-js`, `recharts` dependencies |
| `backend/app/config.py` | Add PostHog + admin DB + admin JWT settings |
| `backend/app/main.py` | Register analytics middleware, admin router, init PostHog + PG on startup |
| `backend/app/cv/ollama_classifier.py:290-308` | Add `event_bus.emit()` after Ollama response to capture token counts |
| `backend/app/cv/claude_classifier.py:47-59` | Add `event_bus.emit()` after Claude response to capture token/cost info |
| `backend/app/notes/router.py:240-257` | Add `event_bus.emit()` after Ollama response in `_call_ollama()` |
| `frontend/src/App.tsx` | Init tracker, add admin routes |

---

### Task 1: Infrastructure — PostHog in Docker Compose

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add PostHog services to docker-compose.yml**

Add PostHog and its dependencies after the existing `ollama` service:

```yaml
# Add after the ollama service block (after line 20):

  posthog-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: posthog
      POSTGRES_USER: posthog
      POSTGRES_PASSWORD: posthog_dev_password
    volumes:
      - posthog_pg_data:/var/lib/postgresql/data
    ports:
      - "5433:5432"

  posthog-redis:
    image: redis:7-alpine
    volumes:
      - posthog_redis_data:/data

  posthog-clickhouse:
    image: clickhouse/clickhouse-server:24.3-alpine
    volumes:
      - posthog_ch_data:/var/lib/clickhouse
      - posthog_ch_logs:/var/log/clickhouse-server
    ulimits:
      nofile:
        soft: 262144
        hard: 262144

  posthog-kafka:
    image: bitnami/kafka:3.7
    environment:
      KAFKA_CFG_LISTENERS: PLAINTEXT://:9092
      KAFKA_CFG_ADVERTISED_LISTENERS: PLAINTEXT://posthog-kafka:9092
      KAFKA_CFG_ZOOKEEPER_CONNECT: ""
      KAFKA_ENABLE_KRAFT: "yes"
      KAFKA_CFG_NODE_ID: "1"
      KAFKA_CFG_PROCESS_ROLES: broker,controller
      KAFKA_CFG_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_CFG_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_CFG_CONTROLLER_QUORUM_VOTERS: 1@posthog-kafka:9093
      ALLOW_PLAINTEXT_LISTENER: "yes"
    volumes:
      - posthog_kafka_data:/bitnami/kafka

  posthog:
    image: posthog/posthog:latest
    environment:
      DATABASE_URL: postgres://posthog:posthog_dev_password@posthog-db:5432/posthog
      REDIS_URL: redis://posthog-redis:6379
      CLICKHOUSE_HOST: posthog-clickhouse
      KAFKA_HOSTS: posthog-kafka:9092
      SECRET_KEY: posthog-dev-secret-key-change-in-production
      SITE_URL: http://localhost:8001
      IS_BEHIND_PROXY: "false"
    ports:
      - "8001:8000"
    depends_on:
      - posthog-db
      - posthog-redis
      - posthog-clickhouse
      - posthog-kafka

  posthog-worker:
    image: posthog/posthog:latest
    command: ./bin/docker-worker-celery --with-scheduler
    environment:
      DATABASE_URL: postgres://posthog:posthog_dev_password@posthog-db:5432/posthog
      REDIS_URL: redis://posthog-redis:6379
      CLICKHOUSE_HOST: posthog-clickhouse
      KAFKA_HOSTS: posthog-kafka:9092
      SECRET_KEY: posthog-dev-secret-key-change-in-production
    depends_on:
      - posthog-db
      - posthog-redis
      - posthog-clickhouse
      - posthog-kafka
```

Also add the new volumes to the `volumes:` section at the bottom:

```yaml
volumes:
  neo4j_data:
  ollama_data:
  posthog_pg_data:
  posthog_redis_data:
  posthog_ch_data:
  posthog_ch_logs:
  posthog_kafka_data:
```

- [ ] **Step 2: Verify docker-compose is valid**

Run: `cd /Users/alessandro/orb_project && docker compose config --quiet`
Expected: No output (valid config)

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "infra: add PostHog self-hosted stack to docker-compose"
```

---

### Task 2: Backend Dependencies & Configuration

**Files:**
- Modify: `backend/pyproject.toml:6-23`
- Modify: `backend/app/config.py:4-32`

- [ ] **Step 1: Add backend dependencies**

In `backend/pyproject.toml`, add three new dependencies to the `dependencies` list (after line 22, before the closing `]`):

```toml
    "posthog>=3.5.0",
    "bcrypt>=4.1.0",
    "asyncpg>=0.29.0",
```

- [ ] **Step 2: Install new dependencies**

Run: `cd /Users/alessandro/orb_project/backend && pip install -e ".[dev]"`
Expected: Successfully installed posthog, bcrypt, asyncpg

- [ ] **Step 3: Add PostHog and admin settings to config.py**

In `backend/app/config.py`, add new settings inside the `Settings` class, before `model_config` (before line 32):

```python
    # PostHog analytics
    posthog_api_key: str = ""
    posthog_host: str = "http://localhost:8001"
    posthog_project_id: int = 1

    # Admin auth (separate from user JWT)
    admin_jwt_secret: str = "admin-change-me"
    admin_jwt_algorithm: str = "HS256"
    admin_jwt_expire_minutes: int = 60

    # Admin database (PostHog's PostgreSQL)
    admin_db_host: str = "localhost"
    admin_db_port: int = 5433
    admin_db_name: str = "posthog"
    admin_db_user: str = "posthog"
    admin_db_password: str = "posthog_dev_password"
```

- [ ] **Step 4: Verify settings load**

Run: `cd /Users/alessandro/orb_project/backend && python -c "from app.config import settings; print(settings.posthog_host, settings.admin_jwt_secret)"`
Expected: `http://localhost:8001 admin-change-me`

- [ ] **Step 5: Commit**

```bash
git add backend/pyproject.toml backend/app/config.py
git commit -m "feat: add PostHog, bcrypt, asyncpg deps and analytics/admin config"
```

---

### Task 3: Event Bus — In-Process Pub/Sub

**Files:**
- Create: `backend/app/analytics/__init__.py`
- Create: `backend/app/analytics/event_bus.py`
- Create: `backend/tests/unit/test_event_bus.py`

- [ ] **Step 1: Write the failing tests for event_bus**

Create `backend/tests/unit/test_event_bus.py`:

```python
from app.analytics.event_bus import collect_events, emit, setup_request_context


def test_emit_without_context_does_not_raise():
    """emit() is safe to call outside middleware (no context)."""
    emit("llm_usage", {"model": "test"})  # should not raise


def test_setup_and_collect_events():
    """Events emitted between setup and collect are returned."""
    setup_request_context()
    emit("llm_usage", {"model": "llama3.2:3b", "input_tokens": 100})
    emit("llm_usage", {"model": "llama3.2:3b", "input_tokens": 200})
    events = collect_events()
    assert len(events) == 2
    assert events[0] == ("llm_usage", {"model": "llama3.2:3b", "input_tokens": 100})
    assert events[1] == ("llm_usage", {"model": "llama3.2:3b", "input_tokens": 200})


def test_collect_clears_events():
    """After collect, the event list is empty."""
    setup_request_context()
    emit("llm_usage", {"model": "test"})
    collect_events()
    events = collect_events()
    assert events == []


def test_emit_with_exception_in_data_does_not_raise():
    """emit() never raises even with weird data."""
    setup_request_context()
    emit("llm_usage", None)  # type: ignore
    events = collect_events()
    assert len(events) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/alessandro/orb_project/backend && python -m pytest tests/unit/test_event_bus.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.analytics.event_bus'`

- [ ] **Step 3: Create analytics package init**

Create `backend/app/analytics/__init__.py`:

```python
```

(Empty file — just makes it a package.)

- [ ] **Step 4: Implement event_bus.py**

Create `backend/app/analytics/event_bus.py`:

```python
"""In-process event bus using contextvars for request-scoped event collection.

The middleware calls setup_request_context() at the start of each request and
collect_events() at the end. App code calls emit() to fire events.
If no context is set (e.g., in tests or outside middleware), emit() silently
discards the event.
"""

from __future__ import annotations

import logging
from contextvars import ContextVar

logger = logging.getLogger(__name__)

_events: ContextVar[list[tuple[str, dict]] | None] = ContextVar(
    "_analytics_events", default=None
)


def setup_request_context() -> None:
    """Initialize a fresh event collector for the current request."""
    _events.set([])


def emit(event_type: str, data: dict) -> None:
    """Fire-and-forget event emission. Never raises."""
    try:
        bucket = _events.get(None)
        if bucket is not None:
            bucket.append((event_type, data))
    except Exception:
        logger.debug("event_bus.emit suppressed an error", exc_info=True)


def collect_events() -> list[tuple[str, dict]]:
    """Return all events emitted during this request and reset the collector."""
    bucket = _events.get(None)
    if bucket is None:
        return []
    events = list(bucket)
    bucket.clear()
    return events
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/alessandro/orb_project/backend && python -m pytest tests/unit/test_event_bus.py -v`
Expected: All 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/analytics/__init__.py backend/app/analytics/event_bus.py backend/tests/unit/test_event_bus.py
git commit -m "feat: add in-process event bus for analytics layer"
```

---

### Task 4: PostHog Client — SDK Initialization

**Files:**
- Create: `backend/app/analytics/posthog_client.py`

- [ ] **Step 1: Create PostHog client singleton**

Create `backend/app/analytics/posthog_client.py`:

```python
"""PostHog SDK initialization and singleton client."""

from __future__ import annotations

import logging

import posthog

from app.config import settings

logger = logging.getLogger(__name__)

_initialized = False


def init_posthog() -> None:
    """Initialize the PostHog SDK. Safe to call multiple times."""
    global _initialized
    if _initialized:
        return

    if not settings.posthog_api_key:
        logger.warning("POSTHOG_API_KEY not set — analytics disabled")
        return

    posthog.api_key = settings.posthog_api_key
    posthog.host = settings.posthog_host
    posthog.debug = False
    posthog.disabled = False
    _initialized = True
    logger.info("PostHog initialized (host=%s)", settings.posthog_host)


def capture(distinct_id: str, event: str, properties: dict | None = None) -> None:
    """Send an event to PostHog. Never raises."""
    if not _initialized:
        return
    try:
        posthog.capture(distinct_id, event, properties=properties or {})
    except Exception:
        logger.warning("PostHog capture failed for event '%s'", event, exc_info=True)


def shutdown_posthog() -> None:
    """Flush pending events and shut down."""
    global _initialized
    if not _initialized:
        return
    try:
        posthog.shutdown()
    except Exception:
        logger.warning("PostHog shutdown error", exc_info=True)
    _initialized = False
```

- [ ] **Step 2: Verify it imports cleanly**

Run: `cd /Users/alessandro/orb_project/backend && python -c "from app.analytics.posthog_client import init_posthog, capture, shutdown_posthog; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/analytics/posthog_client.py
git commit -m "feat: add PostHog client singleton for analytics"
```

---

### Task 5: ASGI Analytics Middleware

**Files:**
- Create: `backend/app/analytics/middleware.py`
- Create: `backend/tests/unit/test_analytics_middleware.py`

- [ ] **Step 1: Write the failing tests for the middleware**

Create `backend/tests/unit/test_analytics_middleware.py`:

```python
import time
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.analytics.middleware import AnalyticsMiddleware


def _make_app() -> FastAPI:
    """Create a minimal FastAPI app with the analytics middleware."""
    test_app = FastAPI()
    test_app.add_middleware(AnalyticsMiddleware)

    @test_app.get("/test")
    async def test_endpoint():
        return {"ok": True}

    @test_app.get("/health")
    async def health():
        return {"status": "ok"}

    return test_app


@patch("app.analytics.middleware.posthog_client")
def test_middleware_captures_request(mock_ph):
    """Middleware sends an http_request event to PostHog."""
    app = _make_app()
    client = TestClient(app)
    response = client.get("/test")
    assert response.status_code == 200

    mock_ph.capture.assert_called_once()
    call_args = mock_ph.capture.call_args
    assert call_args[0][1] == "http_request"
    props = call_args[1]["properties"] if "properties" in call_args[1] else call_args[0][2]
    assert props["method"] == "GET"
    assert props["path"] == "/test"
    assert props["status_code"] == 200
    assert "duration_ms" in props


@patch("app.analytics.middleware.posthog_client")
def test_middleware_skips_excluded_paths(mock_ph):
    """Middleware does not track /health or /docs."""
    app = _make_app()
    client = TestClient(app)
    client.get("/health")
    mock_ph.capture.assert_not_called()


@patch("app.analytics.middleware.posthog_client")
def test_middleware_flushes_event_bus(mock_ph):
    """Middleware flushes event bus events after request."""
    from app.analytics.event_bus import emit

    app = _make_app()

    @app.get("/llm-endpoint")
    async def llm_endpoint():
        emit("llm_usage", {"model": "llama3.2:3b", "input_tokens": 100, "output_tokens": 50})
        return {"ok": True}

    client = TestClient(app)
    client.get("/llm-endpoint")

    # Should have 2 calls: one for http_request, one for llm_usage
    assert mock_ph.capture.call_count == 2
    event_names = [call[0][1] for call in mock_ph.capture.call_args_list]
    assert "http_request" in event_names
    assert "llm_usage" in event_names
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/alessandro/orb_project/backend && python -m pytest tests/unit/test_analytics_middleware.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.analytics.middleware'`

- [ ] **Step 3: Implement the middleware**

Create `backend/app/analytics/middleware.py`:

```python
"""ASGI middleware that captures request-level metrics and flushes the event bus.

This is the analytics "second layer" — it wraps the app without modifying it.
App code never imports this module.
"""

from __future__ import annotations

import logging
import time

from jose import jwt
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.analytics import event_bus
from app.analytics import posthog_client
from app.config import settings

logger = logging.getLogger(__name__)

_EXCLUDED_PREFIXES = ("/docs", "/openapi.json", "/health", "/api/admin")


class AnalyticsMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        path = request.url.path

        # Skip excluded paths
        if any(path.startswith(prefix) for prefix in _EXCLUDED_PREFIXES):
            return await call_next(request)

        # Set up event bus for this request
        event_bus.setup_request_context()

        # Extract user_id from JWT (read-only, no auth enforcement)
        user_id = _extract_user_id(request)

        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000)

        # Capture request-level event
        distinct_id = user_id or "anonymous"
        posthog_client.capture(distinct_id, "http_request", properties={
            "method": request.method,
            "path": path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
        })

        # Flush event bus (LLM usage events, etc.)
        for event_type, data in event_bus.collect_events():
            posthog_client.capture(distinct_id, event_type, properties=data)

        return response


def _extract_user_id(request: Request) -> str | None:
    """Try to extract user_id from the Authorization header. Never raises."""
    try:
        auth = request.headers.get("authorization", "")
        if not auth.startswith("Bearer "):
            return None
        token = auth[7:]
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"verify_exp": False},
        )
        return payload.get("sub")
    except Exception:
        return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/alessandro/orb_project/backend && python -m pytest tests/unit/test_analytics_middleware.py -v`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/analytics/middleware.py backend/tests/unit/test_analytics_middleware.py
git commit -m "feat: add ASGI analytics middleware with event bus integration"
```

---

### Task 6: Wire Analytics into main.py

**Files:**
- Modify: `backend/app/main.py:1-52`

- [ ] **Step 1: Register middleware and lifecycle hooks in main.py**

In `backend/app/main.py`, make these changes:

Add imports after line 5 (`from fastapi.middleware.cors import CORSMiddleware`):

```python
from app.analytics.middleware import AnalyticsMiddleware
from app.analytics.posthog_client import init_posthog, shutdown_posthog
```

In the `lifespan` function, add PostHog init after the Neo4j verification (after line 25 `await session.run("RETURN 1")`):

```python
    init_posthog()
```

Add PostHog shutdown before `close_driver()` (before line 28 `await close_driver()`):

```python
    shutdown_posthog()
```

Add the analytics middleware after the CORS middleware block (after line 39):

```python
app.add_middleware(AnalyticsMiddleware)
```

- [ ] **Step 2: Verify the app starts**

Run: `cd /Users/alessandro/orb_project/backend && python -c "from app.main import app; print('App loaded with', len(app.routes), 'routes')"`
Expected: `App loaded with <N> routes` (no import errors)

- [ ] **Step 3: Run all existing tests to verify no regressions**

Run: `cd /Users/alessandro/orb_project/backend && python -m pytest tests/unit/ -v --tb=short`
Expected: All existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py
git commit -m "feat: wire analytics middleware and PostHog lifecycle into app"
```

---

### Task 7: LLM Token Tracking — Event Bus Emissions

**Files:**
- Modify: `backend/app/cv/ollama_classifier.py:290-308`
- Modify: `backend/app/cv/claude_classifier.py:47-59`
- Modify: `backend/app/notes/router.py:240-257`

- [ ] **Step 1: Add event_bus.emit() to Ollama classifier**

In `backend/app/cv/ollama_classifier.py`, add import at line 12 (after `import httpx`):

```python
from app.analytics.event_bus import emit as emit_event
```

Replace the `_call_ollama` function (lines 290-308) with:

```python
async def _call_ollama(user_message: str) -> str:
    """Make a chat completion request to Ollama."""
    url = f"{settings.ollama_base_url}/api/chat"

    payload = {
        "model": settings.ollama_model,
        "stream": False,
        "format": "json",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
    }

    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()

        emit_event("llm_usage", {
            "operation": "cv_classification",
            "model": settings.ollama_model,
            "provider": "ollama",
            "input_tokens": data.get("prompt_eval_count", 0),
            "output_tokens": data.get("eval_count", 0),
            "latency_ms": round(data.get("total_duration", 0) / 1_000_000),
        })

        return data.get("message", {}).get("content", "")
```

- [ ] **Step 2: Add event_bus.emit() to Claude classifier**

In `backend/app/cv/claude_classifier.py`, add import at line 8 (after `import logging`):

```python
from app.analytics.event_bus import emit as emit_event
```

Replace lines 52-54 (inside the `try` block after `envelope = json.loads(output)`) with:

```python
    try:
        envelope = json.loads(output)

        emit_event("llm_usage", {
            "operation": "cv_classification",
            "model": model or "claude-opus-4-6",
            "provider": "anthropic",
            "input_tokens": envelope.get("tokens_in", 0),
            "output_tokens": envelope.get("tokens_out", 0),
            "cost_usd": envelope.get("cost_usd", 0),
            "latency_ms": envelope.get("duration_ms", 0),
        })

        return envelope.get("result", "")
```

- [ ] **Step 3: Add event_bus.emit() to notes _call_ollama**

In `backend/app/notes/router.py`, add import at line 10 (after `from fastapi import APIRouter, Depends, HTTPException`):

```python
from app.analytics.event_bus import emit as emit_event
```

Replace the `_call_ollama` function (lines 240-257) with:

```python
async def _call_ollama(system_prompt: str, user_message: str) -> str:
    """Make a chat completion request to Ollama."""
    url = f"{settings.ollama_base_url}/api/chat"
    payload = {
        "model": settings.ollama_model,
        "stream": False,
        "format": "json",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
    }

    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()

        emit_event("llm_usage", {
            "operation": "note_enhancement",
            "model": settings.ollama_model,
            "provider": "ollama",
            "input_tokens": data.get("prompt_eval_count", 0),
            "output_tokens": data.get("eval_count", 0),
            "latency_ms": round(data.get("total_duration", 0) / 1_000_000),
        })

        return data.get("message", {}).get("content", "")
```

- [ ] **Step 4: Run all existing tests to verify no regressions**

Run: `cd /Users/alessandro/orb_project/backend && python -m pytest tests/unit/ -v --tb=short`
Expected: All tests PASS (event bus emit is fire-and-forget, doesn't affect return values)

- [ ] **Step 5: Commit**

```bash
git add backend/app/cv/ollama_classifier.py backend/app/cv/claude_classifier.py backend/app/notes/router.py
git commit -m "feat: add LLM token tracking via event bus in classifiers"
```

---

### Task 8: Admin Database — PostgreSQL Connection

**Files:**
- Create: `backend/app/admin/__init__.py`
- Create: `backend/app/admin/db.py`

- [ ] **Step 1: Create admin package init**

Create `backend/app/admin/__init__.py`:

```python
```

(Empty file.)

- [ ] **Step 2: Implement admin database connection**

Create `backend/app/admin/db.py`:

```python
"""PostgreSQL connection pool for the orbis_admin schema.

Uses asyncpg for async operations. The pool is created on app startup
and closed on shutdown via the lifespan hooks in main.py.
"""

from __future__ import annotations

import logging

import asyncpg

from app.config import settings

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None

_INIT_SQL = """
CREATE SCHEMA IF NOT EXISTS orbis_admin;

CREATE TABLE IF NOT EXISTS orbis_admin.admin_users (
    admin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_login TIMESTAMPTZ
);
"""


async def init_admin_db() -> None:
    """Create the connection pool and ensure schema exists."""
    global _pool
    if _pool is not None:
        return

    _pool = await asyncpg.create_pool(
        host=settings.admin_db_host,
        port=settings.admin_db_port,
        database=settings.admin_db_name,
        user=settings.admin_db_user,
        password=settings.admin_db_password,
        min_size=1,
        max_size=5,
    )

    async with _pool.acquire() as conn:
        await conn.execute(_INIT_SQL)

    logger.info("Admin DB pool created (orbis_admin schema ready)")


async def get_admin_pool() -> asyncpg.Pool:
    """Return the admin DB connection pool."""
    if _pool is None:
        raise RuntimeError("Admin DB pool not initialized — call init_admin_db() first")
    return _pool


async def close_admin_db() -> None:
    """Close the connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("Admin DB pool closed")
```

- [ ] **Step 3: Verify it imports cleanly**

Run: `cd /Users/alessandro/orb_project/backend && python -c "from app.admin.db import init_admin_db, get_admin_pool, close_admin_db; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/admin/__init__.py backend/app/admin/db.py
git commit -m "feat: add PostgreSQL connection pool for admin schema"
```

---

### Task 9: Admin Authentication

**Files:**
- Create: `backend/app/admin/auth.py`
- Create: `backend/tests/unit/test_admin_auth.py`

- [ ] **Step 1: Write the failing tests for admin auth**

Create `backend/tests/unit/test_admin_auth.py`:

```python
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from jose import jwt

from app.admin.auth import create_admin_jwt, verify_admin_jwt, hash_password, verify_password
from app.config import settings


def test_hash_and_verify_password():
    hashed = hash_password("test-password")
    assert hashed != "test-password"
    assert verify_password("test-password", hashed)
    assert not verify_password("wrong-password", hashed)


def test_create_admin_jwt_contains_admin_type():
    token = create_admin_jwt("test-admin-id")
    payload = jwt.decode(
        token,
        settings.admin_jwt_secret,
        algorithms=[settings.admin_jwt_algorithm],
    )
    assert payload["type"] == "admin"
    assert payload["admin_id"] == "test-admin-id"


def test_verify_admin_jwt_valid():
    token = create_admin_jwt("test-admin-id")
    admin_id = verify_admin_jwt(token)
    assert admin_id == "test-admin-id"


def test_verify_admin_jwt_rejects_user_jwt():
    """User JWTs must not be accepted as admin JWTs."""
    user_token = jwt.encode(
        {"sub": "user-1", "email": "u@test.com", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    with pytest.raises(HTTPException) as exc_info:
        verify_admin_jwt(user_token)
    assert exc_info.value.status_code == 401


def test_verify_admin_jwt_rejects_expired():
    expired_token = jwt.encode(
        {"type": "admin", "admin_id": "test", "exp": datetime.now(timezone.utc) - timedelta(hours=1)},
        settings.admin_jwt_secret,
        algorithm=settings.admin_jwt_algorithm,
    )
    with pytest.raises(HTTPException) as exc_info:
        verify_admin_jwt(expired_token)
    assert exc_info.value.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/alessandro/orb_project/backend && python -m pytest tests/unit/test_admin_auth.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.admin.auth'`

- [ ] **Step 3: Implement admin auth**

Create `backend/app/admin/auth.py`:

```python
"""Admin authentication — completely separate from user Google OAuth."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import settings

admin_security = HTTPBearer()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def create_admin_jwt(admin_id: str) -> str:
    payload = {
        "type": "admin",
        "admin_id": admin_id,
        "exp": datetime.now(timezone.utc)
        + timedelta(minutes=settings.admin_jwt_expire_minutes),
    }
    return jwt.encode(
        payload, settings.admin_jwt_secret, algorithm=settings.admin_jwt_algorithm
    )


def verify_admin_jwt(token: str) -> str:
    """Decode and validate an admin JWT. Returns admin_id or raises HTTPException."""
    try:
        payload = jwt.decode(
            token,
            settings.admin_jwt_secret,
            algorithms=[settings.admin_jwt_algorithm],
        )
        if payload.get("type") != "admin":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not an admin token",
            )
        admin_id = payload.get("admin_id")
        if not admin_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid admin token",
            )
        return admin_id
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin token",
        ) from None


async def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(admin_security),
) -> str:
    """FastAPI dependency — returns admin_id from a valid admin JWT."""
    return verify_admin_jwt(credentials.credentials)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/alessandro/orb_project/backend && python -m pytest tests/unit/test_admin_auth.py -v`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/admin/auth.py backend/tests/unit/test_admin_auth.py
git commit -m "feat: add admin JWT auth system separate from user auth"
```

---

### Task 10: Admin Seed CLI

**Files:**
- Create: `backend/app/admin/seed.py`
- Create: `backend/tests/unit/test_admin_seed.py`

- [ ] **Step 1: Write the failing tests for seed CLI**

Create `backend/tests/unit/test_admin_seed.py`:

```python
from unittest.mock import AsyncMock, patch

import pytest

from app.admin.seed import seed_admin


@pytest.mark.asyncio
async def test_seed_admin_creates_user():
    mock_pool = AsyncMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock()
    mock_conn.fetchrow.return_value = None  # user doesn't exist yet

    with patch("app.admin.seed.get_admin_pool", AsyncMock(return_value=mock_pool)):
        await seed_admin("admin", "secretpass")

    mock_conn.execute.assert_called_once()
    call_args = mock_conn.execute.call_args
    assert "INSERT INTO orbis_admin.admin_users" in call_args[0][0]
    assert call_args[0][1] == "admin"


@pytest.mark.asyncio
async def test_seed_admin_skips_existing_user():
    mock_pool = AsyncMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock()
    mock_conn.fetchrow.return_value = {"admin_id": "existing-id"}  # user exists

    with patch("app.admin.seed.get_admin_pool", AsyncMock(return_value=mock_pool)):
        await seed_admin("admin", "secretpass")

    mock_conn.execute.assert_not_called()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/alessandro/orb_project/backend && python -m pytest tests/unit/test_admin_seed.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.admin.seed'`

- [ ] **Step 3: Implement seed.py**

Create `backend/app/admin/seed.py`:

```python
"""CLI script to seed admin credentials.

Usage: python -m app.admin.seed --username admin --password <password>
"""

from __future__ import annotations

import argparse
import asyncio
import logging

from app.admin.auth import hash_password
from app.admin.db import get_admin_pool, init_admin_db

logger = logging.getLogger(__name__)


async def seed_admin(username: str, password: str) -> None:
    """Create an admin user if one with that username doesn't already exist."""
    pool = await get_admin_pool()

    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT admin_id FROM orbis_admin.admin_users WHERE username = $1",
            username,
        )
        if existing:
            logger.info("Admin user '%s' already exists — skipping", username)
            return

        hashed = hash_password(password)
        await conn.execute(
            "INSERT INTO orbis_admin.admin_users (username, password_hash) VALUES ($1, $2)",
            username,
            hashed,
        )
        logger.info("Admin user '%s' created", username)


async def _main() -> None:
    parser = argparse.ArgumentParser(description="Seed admin credentials")
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", required=True)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)
    await init_admin_db()
    await seed_admin(args.username, args.password)


if __name__ == "__main__":
    asyncio.run(_main())
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/alessandro/orb_project/backend && python -m pytest tests/unit/test_admin_seed.py -v`
Expected: All 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/admin/seed.py backend/tests/unit/test_admin_seed.py
git commit -m "feat: add admin credential seeding CLI"
```

---

### Task 11: Admin Schemas & Service Layer

**Files:**
- Create: `backend/app/admin/schemas.py`
- Create: `backend/app/admin/service.py`

- [ ] **Step 1: Create admin Pydantic schemas**

Create `backend/app/admin/schemas.py`:

```python
"""Pydantic request/response models for admin API."""

from __future__ import annotations

from pydantic import BaseModel


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MetricCard(BaseModel):
    label: str
    value: int | float
    sparkline: list[int | float] = []


class OverviewResponse(BaseModel):
    total_users: MetricCard
    active_today: MetricCard
    signups_this_week: MetricCard
    llm_tokens_today: MetricCard
    recent_events: list[dict]


class UserSummary(BaseModel):
    user_id: str
    first_seen: str
    last_seen: str
    event_count: int
    llm_tokens: int


class UserListResponse(BaseModel):
    users: list[UserSummary]
    total: int


class UserActivityResponse(BaseModel):
    events: list[dict]
    llm_usage: list[dict]


class LLMUsageResponse(BaseModel):
    by_model: list[dict]
    by_operation: list[dict]
    over_time: list[dict]
    top_users: list[dict]


class EventsResponse(BaseModel):
    events: list[dict]
    total: int


class FunnelResponse(BaseModel):
    steps: list[dict]


class TrendsResponse(BaseModel):
    series: list[dict]


class RealtimeResponse(BaseModel):
    active_users: int
    events_today: int
    llm_tokens_today: int
    recent_events: list[dict]
```

- [ ] **Step 2: Create admin service layer**

Create `backend/app/admin/service.py`:

```python
"""Business logic for admin dashboard — PostHog API queries and aggregation."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_BASE_URL = f"{settings.posthog_host}/api"
_HEADERS = {}


def _get_headers() -> dict:
    """Return auth headers for PostHog API."""
    return {"Authorization": f"Bearer {settings.posthog_api_key}"}


async def _posthog_get(path: str, params: dict | None = None) -> dict:
    """Make a GET request to the PostHog API."""
    url = f"{_BASE_URL}/projects/{settings.posthog_project_id}{path}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, headers=_get_headers(), params=params or {})
        resp.raise_for_status()
        return resp.json()


async def _posthog_post(path: str, body: dict) -> dict:
    """Make a POST request to the PostHog API."""
    url = f"{_BASE_URL}/projects/{settings.posthog_project_id}{path}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, headers=_get_headers(), json=body)
        resp.raise_for_status()
        return resp.json()


async def get_overview() -> dict:
    """Fetch overview metrics: totals + sparklines + recent events."""
    now = datetime.now(timezone.utc)
    week_ago = (now - timedelta(days=7)).isoformat()

    # Get event counts via trends
    trends_result = await _posthog_post("/query/", {
        "kind": "EventsQuery",
        "select": ["count()"],
        "after": week_ago,
    })

    # Get recent events
    recent = await _posthog_post("/query/", {
        "kind": "EventsQuery",
        "select": ["*"],
        "orderBy": ["-timestamp"],
        "limit": 20,
    })

    # Get unique users
    users_result = await _posthog_post("/query/", {
        "kind": "EventsQuery",
        "select": ["count(distinct person_id)"],
        "after": week_ago,
    })

    return {
        "total_users": {"label": "Total Users", "value": users_result.get("results", [[0]])[0][0], "sparkline": []},
        "active_today": {"label": "Active Today", "value": 0, "sparkline": []},
        "signups_this_week": {"label": "Signups This Week", "value": 0, "sparkline": []},
        "llm_tokens_today": {"label": "LLM Tokens Today", "value": 0, "sparkline": []},
        "recent_events": recent.get("results", []),
    }


async def get_users(limit: int = 50, offset: int = 0) -> dict:
    """Fetch user list with activity summaries."""
    result = await _posthog_post("/query/", {
        "kind": "EventsQuery",
        "select": ["person_id", "count()", "min(timestamp)", "max(timestamp)"],
        "groupBy": ["person_id"],
        "orderBy": ["-count()"],
        "limit": limit,
        "offset": offset,
    })

    users = []
    for row in result.get("results", []):
        users.append({
            "user_id": row[0] or "anonymous",
            "event_count": row[1],
            "first_seen": row[2],
            "last_seen": row[3],
            "llm_tokens": 0,
        })

    return {"users": users, "total": len(users)}


async def get_user_activity(user_id: str) -> dict:
    """Fetch detailed activity for a specific user."""
    events = await _posthog_post("/query/", {
        "kind": "EventsQuery",
        "select": ["*"],
        "where": [f"person_id = '{user_id}'"],
        "orderBy": ["-timestamp"],
        "limit": 100,
    })

    llm_events = await _posthog_post("/query/", {
        "kind": "EventsQuery",
        "select": ["*"],
        "where": [f"person_id = '{user_id}'", "event = 'llm_usage'"],
        "orderBy": ["-timestamp"],
        "limit": 50,
    })

    return {
        "events": events.get("results", []),
        "llm_usage": llm_events.get("results", []),
    }


async def get_llm_usage(
    user_id: str | None = None,
    model: str | None = None,
    operation: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    """Fetch LLM token usage data."""
    where = ["event = 'llm_usage'"]
    if user_id:
        where.append(f"person_id = '{user_id}'")
    if model:
        where.append(f"properties.model = '{model}'")
    if operation:
        where.append(f"properties.operation = '{operation}'")

    params: dict = {
        "kind": "EventsQuery",
        "select": [
            "properties.model",
            "properties.operation",
            "properties.provider",
            "sum(toInt64OrZero(properties.input_tokens))",
            "sum(toInt64OrZero(properties.output_tokens))",
            "count()",
        ],
        "where": where,
        "groupBy": ["properties.model", "properties.operation", "properties.provider"],
    }
    if date_from:
        params["after"] = date_from
    if date_to:
        params["before"] = date_to

    result = await _posthog_post("/query/", params)

    by_model = []
    by_operation = []
    for row in result.get("results", []):
        by_model.append({"model": row[0], "input_tokens": row[3], "output_tokens": row[4], "count": row[5]})
        by_operation.append({"operation": row[1], "input_tokens": row[3], "output_tokens": row[4], "count": row[5]})

    # Time series
    over_time = await _posthog_post("/query/", {
        "kind": "EventsQuery",
        "select": ["toDate(timestamp)", "sum(toInt64OrZero(properties.input_tokens))", "sum(toInt64OrZero(properties.output_tokens))"],
        "where": where,
        "groupBy": ["toDate(timestamp)"],
        "orderBy": ["toDate(timestamp)"],
    })

    # Top users
    top_users = await _posthog_post("/query/", {
        "kind": "EventsQuery",
        "select": ["person_id", "sum(toInt64OrZero(properties.input_tokens))", "sum(toInt64OrZero(properties.output_tokens))"],
        "where": where,
        "groupBy": ["person_id"],
        "orderBy": ["-sum(toInt64OrZero(properties.input_tokens))"],
        "limit": 20,
    })

    return {
        "by_model": by_model,
        "by_operation": by_operation,
        "over_time": [{"date": r[0], "input_tokens": r[1], "output_tokens": r[2]} for r in over_time.get("results", [])],
        "top_users": [{"user_id": r[0], "input_tokens": r[1], "output_tokens": r[2]} for r in top_users.get("results", [])],
    }


async def get_events(
    event_type: str | None = None,
    user_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    """Fetch raw events with filters."""
    where = []
    if event_type:
        where.append(f"event = '{event_type}'")
    if user_id:
        where.append(f"person_id = '{user_id}'")

    params: dict = {
        "kind": "EventsQuery",
        "select": ["*"],
        "where": where,
        "orderBy": ["-timestamp"],
        "limit": limit,
        "offset": offset,
    }
    if date_from:
        params["after"] = date_from
    if date_to:
        params["before"] = date_to

    result = await _posthog_post("/query/", params)
    return {"events": result.get("results", []), "total": len(result.get("results", []))}


async def get_funnel() -> dict:
    """Fetch registration funnel data."""
    result = await _posthog_post("/query/", {
        "kind": "FunnelsQuery",
        "series": [
            {"event": "user_signup", "kind": "EventsNode"},
            {"event": "cv_upload_completed", "kind": "EventsNode"},
            {"event": "orb_id_claimed", "kind": "EventsNode"},
            {"event": "orb_shared", "kind": "EventsNode"},
        ],
        "funnelWindowInterval": 30,
        "funnelWindowIntervalUnit": "day",
    })

    return {"steps": result.get("results", [])}


async def get_trends(
    events: list[str],
    interval: str = "day",
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    """Fetch time-series trends for given events."""
    series = [{"event": e, "kind": "EventsNode"} for e in events]

    params: dict = {
        "kind": "TrendsQuery",
        "series": series,
        "interval": interval,
    }
    if date_from:
        params["dateRange"] = {"date_from": date_from}
        if date_to:
            params["dateRange"]["date_to"] = date_to

    result = await _posthog_post("/query/", params)
    return {"series": result.get("results", [])}


async def get_realtime() -> dict:
    """Fetch today's live metrics."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

    events_today = await _posthog_post("/query/", {
        "kind": "EventsQuery",
        "select": ["count()"],
        "after": today_start,
    })

    active_users = await _posthog_post("/query/", {
        "kind": "EventsQuery",
        "select": ["count(distinct person_id)"],
        "after": today_start,
    })

    llm_tokens = await _posthog_post("/query/", {
        "kind": "EventsQuery",
        "select": ["sum(toInt64OrZero(properties.input_tokens))", "sum(toInt64OrZero(properties.output_tokens))"],
        "where": ["event = 'llm_usage'"],
        "after": today_start,
    })

    recent = await _posthog_post("/query/", {
        "kind": "EventsQuery",
        "select": ["*"],
        "orderBy": ["-timestamp"],
        "after": today_start,
        "limit": 20,
    })

    llm_row = llm_tokens.get("results", [[0, 0]])[0]

    return {
        "events_today": events_today.get("results", [[0]])[0][0],
        "active_users": active_users.get("results", [[0]])[0][0],
        "llm_tokens_today": (llm_row[0] or 0) + (llm_row[1] or 0),
        "recent_events": recent.get("results", []),
    }
```

- [ ] **Step 3: Verify imports**

Run: `cd /Users/alessandro/orb_project/backend && python -c "from app.admin.schemas import AdminLoginRequest, OverviewResponse; from app.admin.service import get_overview; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/admin/schemas.py backend/app/admin/service.py
git commit -m "feat: add admin schemas and PostHog service layer"
```

---

### Task 12: Admin Router — API Endpoints

**Files:**
- Create: `backend/app/admin/router.py`
- Create: `backend/tests/unit/test_admin_router.py`

- [ ] **Step 1: Write the failing tests for admin router**

Create `backend/tests/unit/test_admin_router.py`:

```python
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.admin.auth import create_admin_jwt, get_current_admin
from app.main import app


@pytest.fixture
def admin_client(mock_neo4j_driver):
    """Test client with admin auth override."""
    app.dependency_overrides[get_current_admin] = lambda: "test-admin-id"

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


def test_admin_login_missing_credentials(admin_client):
    response = admin_client.post("/api/admin/login", json={})
    assert response.status_code == 422


@patch("app.admin.router.service.get_overview", new_callable=AsyncMock)
def test_admin_overview(mock_overview, admin_client):
    mock_overview.return_value = {
        "total_users": {"label": "Total Users", "value": 42, "sparkline": []},
        "active_today": {"label": "Active Today", "value": 5, "sparkline": []},
        "signups_this_week": {"label": "Signups This Week", "value": 3, "sparkline": []},
        "llm_tokens_today": {"label": "LLM Tokens Today", "value": 1000, "sparkline": []},
        "recent_events": [],
    }

    response = admin_client.get("/api/admin/overview")
    assert response.status_code == 200
    data = response.json()
    assert data["total_users"]["value"] == 42


@patch("app.admin.router.service.get_llm_usage", new_callable=AsyncMock)
def test_admin_llm_usage(mock_llm, admin_client):
    mock_llm.return_value = {
        "by_model": [],
        "by_operation": [],
        "over_time": [],
        "top_users": [],
    }

    response = admin_client.get("/api/admin/llm-usage")
    assert response.status_code == 200
    data = response.json()
    assert "by_model" in data


@patch("app.admin.router.service.get_realtime", new_callable=AsyncMock)
def test_admin_realtime(mock_rt, admin_client):
    mock_rt.return_value = {
        "active_users": 3,
        "events_today": 50,
        "llm_tokens_today": 500,
        "recent_events": [],
    }

    response = admin_client.get("/api/admin/realtime")
    assert response.status_code == 200
    assert response.json()["active_users"] == 3
```

- [ ] **Step 2: Implement admin router**

Create `backend/app/admin/router.py`:

```python
"""Admin API endpoints — all require admin JWT."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.admin import service
from app.admin.auth import (
    create_admin_jwt,
    get_current_admin,
    verify_password,
)
from app.admin.db import get_admin_pool
from app.admin.schemas import (
    AdminLoginRequest,
    AdminLoginResponse,
    EventsResponse,
    FunnelResponse,
    LLMUsageResponse,
    OverviewResponse,
    RealtimeResponse,
    TrendsResponse,
    UserActivityResponse,
    UserListResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/login", response_model=AdminLoginResponse)
async def admin_login(req: AdminLoginRequest):
    """Authenticate admin and return JWT."""
    try:
        pool = await get_admin_pool()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Admin database not available") from None

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT admin_id, password_hash FROM orbis_admin.admin_users WHERE username = $1",
            req.username,
        )

    if row is None or not verify_password(req.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Update last_login
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE orbis_admin.admin_users SET last_login = now() WHERE admin_id = $1",
            row["admin_id"],
        )

    token = create_admin_jwt(str(row["admin_id"]))
    return AdminLoginResponse(access_token=token)


@router.get("/overview", response_model=OverviewResponse)
async def admin_overview(admin_id: str = Depends(get_current_admin)):
    return await service.get_overview()


@router.get("/users", response_model=UserListResponse)
async def admin_users(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin_id: str = Depends(get_current_admin),
):
    return await service.get_users(limit=limit, offset=offset)


@router.get("/users/{user_id}/activity", response_model=UserActivityResponse)
async def admin_user_activity(
    user_id: str,
    admin_id: str = Depends(get_current_admin),
):
    return await service.get_user_activity(user_id)


@router.get("/llm-usage", response_model=LLMUsageResponse)
async def admin_llm_usage(
    user_id: Optional[str] = Query(None),
    model: Optional[str] = Query(None),
    operation: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    admin_id: str = Depends(get_current_admin),
):
    return await service.get_llm_usage(
        user_id=user_id,
        model=model,
        operation=operation,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/events", response_model=EventsResponse)
async def admin_events(
    event_type: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin_id: str = Depends(get_current_admin),
):
    return await service.get_events(
        event_type=event_type,
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )


@router.get("/funnel", response_model=FunnelResponse)
async def admin_funnel(admin_id: str = Depends(get_current_admin)):
    return await service.get_funnel()


@router.get("/trends", response_model=TrendsResponse)
async def admin_trends(
    events: str = Query(..., description="Comma-separated event names"),
    interval: str = Query("day"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    admin_id: str = Depends(get_current_admin),
):
    event_list = [e.strip() for e in events.split(",")]
    return await service.get_trends(
        events=event_list,
        interval=interval,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/realtime", response_model=RealtimeResponse)
async def admin_realtime(admin_id: str = Depends(get_current_admin)):
    return await service.get_realtime()
```

- [ ] **Step 3: Register admin router in main.py**

In `backend/app/main.py`, add import (after the other router imports):

```python
from app.admin.router import router as admin_router
```

Add after the other `app.include_router()` lines (after line 47):

```python
app.include_router(admin_router)
```

Also add admin DB lifecycle hooks. Add import:

```python
from app.admin.db import init_admin_db, close_admin_db
```

In the `lifespan` function, add after `init_posthog()`:

```python
    try:
        await init_admin_db()
    except Exception:
        logger.warning("Admin DB not available — admin features disabled")
```

Add before `shutdown_posthog()`:

```python
    await close_admin_db()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/alessandro/orb_project/backend && python -m pytest tests/unit/test_admin_router.py -v`
Expected: All 4 tests PASS

- [ ] **Step 5: Run all tests to verify no regressions**

Run: `cd /Users/alessandro/orb_project/backend && python -m pytest tests/unit/ -v --tb=short`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/admin/router.py backend/tests/unit/test_admin_router.py backend/app/main.py
git commit -m "feat: add admin API router with PostHog-backed endpoints"
```

---

### Task 13: Frontend Dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install posthog-js and recharts**

Run: `cd /Users/alessandro/orb_project/frontend && npm install posthog-js recharts`
Expected: Successfully installed

- [ ] **Step 2: Verify**

Run: `cd /Users/alessandro/orb_project/frontend && npm ls posthog-js recharts`
Expected: Both listed

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "feat: add posthog-js and recharts frontend dependencies"
```

---

### Task 14: Frontend Analytics Tracker

**Files:**
- Create: `frontend/src/analytics/tracker.ts`

- [ ] **Step 1: Create the tracker abstraction**

Create `frontend/src/analytics/tracker.ts`:

```typescript
/**
 * Analytics tracker — thin abstraction over posthog-js.
 * Components import this module, never posthog-js directly.
 * All functions are fire-and-forget (never throw).
 */
import posthog from 'posthog-js';

let initialized = false;

export function initTracker(): void {
  try {
    const apiKey = import.meta.env.VITE_POSTHOG_API_KEY;
    const host = import.meta.env.VITE_POSTHOG_HOST || 'http://localhost:8001';

    if (!apiKey) {
      console.warn('VITE_POSTHOG_API_KEY not set — analytics disabled');
      return;
    }

    posthog.init(apiKey, {
      api_host: host,
      autocapture: true,
      capture_pageview: true,
      capture_pageleave: true,
      persistence: 'localStorage',
    });

    initialized = true;
  } catch {
    console.warn('PostHog init failed — analytics disabled');
  }
}

export function trackEvent(name: string, properties?: Record<string, unknown>): void {
  if (!initialized) return;
  try {
    posthog.capture(name, properties);
  } catch {
    // fire-and-forget
  }
}

export function identifyUser(userId: string): void {
  if (!initialized) return;
  try {
    posthog.identify(userId);
  } catch {
    // fire-and-forget
  }
}

export function resetUser(): void {
  if (!initialized) return;
  try {
    posthog.reset();
  } catch {
    // fire-and-forget
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/analytics/tracker.ts
git commit -m "feat: add frontend analytics tracker abstraction over posthog-js"
```

---

### Task 15: Frontend Admin API Client & Auth Store

**Files:**
- Create: `frontend/src/api/adminClient.ts`
- Create: `frontend/src/api/admin.ts`
- Create: `frontend/src/stores/adminAuthStore.ts`

- [ ] **Step 1: Create admin Axios client**

Create `frontend/src/api/adminClient.ts`:

```typescript
import axios from 'axios';

const adminClient = axios.create({
  baseURL: '/api',
});

adminClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('orbis_admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

adminClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem('orbis_admin_token');
      window.location.href = '/admin/login';
    }
    return Promise.reject(error);
  }
);

export default adminClient;
```

- [ ] **Step 2: Create admin API functions**

Create `frontend/src/api/admin.ts`:

```typescript
import adminClient from './adminClient';

export async function adminLogin(username: string, password: string): Promise<string> {
  const { data } = await adminClient.post('/api/admin/login', { username, password });
  return data.access_token;
}

export async function fetchOverview() {
  const { data } = await adminClient.get('/api/admin/overview');
  return data;
}

export async function fetchUsers(limit = 50, offset = 0) {
  const { data } = await adminClient.get('/api/admin/users', { params: { limit, offset } });
  return data;
}

export async function fetchUserActivity(userId: string) {
  const { data } = await adminClient.get(`/api/admin/users/${userId}/activity`);
  return data;
}

export async function fetchLLMUsage(params?: {
  user_id?: string;
  model?: string;
  operation?: string;
  date_from?: string;
  date_to?: string;
}) {
  const { data } = await adminClient.get('/api/admin/llm-usage', { params });
  return data;
}

export async function fetchEvents(params?: {
  event_type?: string;
  user_id?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}) {
  const { data } = await adminClient.get('/api/admin/events', { params });
  return data;
}

export async function fetchFunnel() {
  const { data } = await adminClient.get('/api/admin/funnel');
  return data;
}

export async function fetchTrends(events: string[], interval = 'day', dateFrom?: string, dateTo?: string) {
  const { data } = await adminClient.get('/api/admin/trends', {
    params: { events: events.join(','), interval, date_from: dateFrom, date_to: dateTo },
  });
  return data;
}

export async function fetchRealtime() {
  const { data } = await adminClient.get('/api/admin/realtime');
  return data;
}
```

- [ ] **Step 3: Create admin auth Zustand store**

Create `frontend/src/stores/adminAuthStore.ts`:

```typescript
import { create } from 'zustand';
import { adminLogin } from '../api/admin';

interface AdminAuthState {
  adminToken: string | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

export const useAdminAuthStore = create<AdminAuthState>((set) => ({
  adminToken: sessionStorage.getItem('orbis_admin_token'),
  loading: false,
  error: null,

  login: async (username: string, password: string) => {
    set({ loading: true, error: null });
    try {
      const token = await adminLogin(username, password);
      sessionStorage.setItem('orbis_admin_token', token);
      set({ adminToken: token, loading: false });
      return true;
    } catch {
      set({ error: 'Invalid credentials', loading: false });
      return false;
    }
  },

  logout: () => {
    sessionStorage.removeItem('orbis_admin_token');
    set({ adminToken: null });
  },
}));
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/adminClient.ts frontend/src/api/admin.ts frontend/src/stores/adminAuthStore.ts
git commit -m "feat: add admin API client, API functions, and admin auth store"
```

---

### Task 16: Admin Layout & Route Guard

**Files:**
- Create: `frontend/src/components/admin/AdminLayout.tsx`
- Create: `frontend/src/components/admin/AdminRoute.tsx`

- [ ] **Step 1: Create AdminRoute guard**

Create `frontend/src/components/admin/AdminRoute.tsx`:

```tsx
import { Navigate } from 'react-router-dom';
import { useAdminAuthStore } from '../../stores/adminAuthStore';

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const adminToken = useAdminAuthStore((s) => s.adminToken);

  if (!adminToken) {
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: Create AdminLayout with sidebar**

Create `frontend/src/components/admin/AdminLayout.tsx`:

```tsx
import { NavLink, useNavigate } from 'react-router-dom';
import { useAdminAuthStore } from '../../stores/adminAuthStore';

const NAV_ITEMS = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/llm', label: 'LLM Usage' },
  { to: '/admin/events', label: 'Events' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const logout = useAdminAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-lg font-semibold text-white">Orbis Admin</h1>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block px-3 py-2 rounded text-sm ${
                  isActive
                    ? 'bg-gray-800 text-white font-medium'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-2 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className="w-full px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded text-left"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 overflow-auto">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/admin/AdminRoute.tsx frontend/src/components/admin/AdminLayout.tsx
git commit -m "feat: add admin route guard and layout with sidebar"
```

---

### Task 17: Admin Reusable Chart Components

**Files:**
- Create: `frontend/src/components/admin/MetricCard.tsx`
- Create: `frontend/src/components/admin/FunnelChart.tsx`
- Create: `frontend/src/components/admin/HeatmapChart.tsx`

- [ ] **Step 1: Create MetricCard with sparkline**

Create `frontend/src/components/admin/MetricCard.tsx`:

```tsx
import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface MetricCardProps {
  label: string;
  value: number | string;
  sparkline?: number[];
}

export default function MetricCard({ label, value, sparkline = [] }: MetricCardProps) {
  const sparkData = sparkline.map((v, i) => ({ i, v }));

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-2xl font-semibold text-white mt-1">{value}</p>
      {sparkData.length > 1 && (
        <div className="h-8 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData}>
              <Line type="monotone" dataKey="v" stroke="#8b5cf6" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create FunnelChart**

Create `frontend/src/components/admin/FunnelChart.tsx`:

```tsx
interface FunnelStep {
  name: string;
  count: number;
}

interface FunnelChartProps {
  steps: FunnelStep[];
}

export default function FunnelChart({ steps }: FunnelChartProps) {
  if (steps.length === 0) return <p className="text-gray-500 text-sm">No funnel data</p>;

  const maxCount = Math.max(...steps.map((s) => s.count), 1);

  return (
    <div className="space-y-2">
      {steps.map((step, i) => {
        const widthPct = Math.max((step.count / maxCount) * 100, 4);
        const conversionRate = i > 0 && steps[i - 1].count > 0
          ? ((step.count / steps[i - 1].count) * 100).toFixed(1)
          : null;

        return (
          <div key={step.name}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-300">{step.name}</span>
              <span className="text-gray-400">
                {step.count}
                {conversionRate && <span className="text-gray-500 ml-2">({conversionRate}%)</span>}
              </span>
            </div>
            <div className="w-full bg-gray-800 rounded h-6">
              <div
                className="bg-purple-600 h-6 rounded"
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Create HeatmapChart**

Create `frontend/src/components/admin/HeatmapChart.tsx`:

```tsx
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface HeatmapChartProps {
  /** 7x24 matrix: data[day][hour] = count */
  data: number[][];
}

export default function HeatmapChart({ data }: HeatmapChartProps) {
  const maxVal = Math.max(...data.flat(), 1);

  return (
    <div className="overflow-x-auto">
      <div className="inline-grid gap-1" style={{ gridTemplateColumns: `auto repeat(24, 1fr)` }}>
        {/* Header row */}
        <div />
        {HOURS.map((h) => (
          <div key={h} className="text-xs text-gray-500 text-center w-6">
            {h % 6 === 0 ? `${h}` : ''}
          </div>
        ))}

        {/* Data rows */}
        {DAYS.map((day, dayIdx) => (
          <>
            <div key={`label-${day}`} className="text-xs text-gray-400 pr-2 flex items-center">
              {day}
            </div>
            {HOURS.map((hour) => {
              const val = data[dayIdx]?.[hour] ?? 0;
              const intensity = val / maxVal;
              return (
                <div
                  key={`${day}-${hour}`}
                  className="w-6 h-6 rounded-sm"
                  style={{ backgroundColor: `rgba(139, 92, 246, ${Math.max(intensity, 0.05)})` }}
                  title={`${day} ${hour}:00 — ${val} events`}
                />
              );
            })}
          </>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/MetricCard.tsx frontend/src/components/admin/FunnelChart.tsx frontend/src/components/admin/HeatmapChart.tsx
git commit -m "feat: add admin reusable chart components (MetricCard, Funnel, Heatmap)"
```

---

### Task 18: Admin Login Page

**Files:**
- Create: `frontend/src/pages/admin/AdminLoginPage.tsx`

- [ ] **Step 1: Create admin login page**

Create `frontend/src/pages/admin/AdminLoginPage.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuthStore } from '../../stores/adminAuthStore';

export default function AdminLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, loading, error } = useAdminAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await login(username, password);
    if (success) {
      navigate('/admin');
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-lg p-6">
        <h1 className="text-xl font-semibold text-white mb-6">Orbis Admin</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
              required
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded py-2 text-sm font-medium"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/admin/AdminLoginPage.tsx
git commit -m "feat: add admin login page"
```

---

### Task 19: Admin Dashboard (Overview) Page

**Files:**
- Create: `frontend/src/pages/admin/AdminDashboardPage.tsx`

- [ ] **Step 1: Create overview dashboard page**

Create `frontend/src/pages/admin/AdminDashboardPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { fetchOverview, fetchFunnel } from '../../api/admin';
import MetricCard from '../../components/admin/MetricCard';
import FunnelChart from '../../components/admin/FunnelChart';
import AdminLayout from '../../components/admin/AdminLayout';

interface OverviewData {
  total_users: { label: string; value: number; sparkline: number[] };
  active_today: { label: string; value: number; sparkline: number[] };
  signups_this_week: { label: string; value: number; sparkline: number[] };
  llm_tokens_today: { label: string; value: number; sparkline: number[] };
  recent_events: Record<string, unknown>[];
}

export default function AdminDashboardPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [funnel, setFunnel] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [ov, fn] = await Promise.all([fetchOverview(), fetchFunnel()]);
        setOverview(ov);
        setFunnel(fn.steps || []);
      } catch (err) {
        console.error('Failed to load overview', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <AdminLayout>
        <p className="text-gray-500">Loading...</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <h2 className="text-xl font-semibold text-white mb-6">Overview</h2>

      {/* Metric cards */}
      {overview && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <MetricCard label={overview.total_users.label} value={overview.total_users.value} sparkline={overview.total_users.sparkline} />
          <MetricCard label={overview.active_today.label} value={overview.active_today.value} sparkline={overview.active_today.sparkline} />
          <MetricCard label={overview.signups_this_week.label} value={overview.signups_this_week.value} sparkline={overview.signups_this_week.sparkline} />
          <MetricCard label={overview.llm_tokens_today.label} value={overview.llm_tokens_today.value} sparkline={overview.llm_tokens_today.sparkline} />
        </div>
      )}

      {/* Registration funnel */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-8">
        <h3 className="text-sm font-medium text-gray-300 mb-4">Registration Funnel</h3>
        <FunnelChart steps={funnel} />
      </div>

      {/* Recent events */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-4">Recent Events</h3>
        {overview?.recent_events.length ? (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {overview.recent_events.map((event, i) => (
              <div key={i} className="text-xs text-gray-400 font-mono bg-gray-800 rounded px-3 py-2">
                {JSON.stringify(event)}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No events yet</p>
        )}
      </div>
    </AdminLayout>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/admin/AdminDashboardPage.tsx
git commit -m "feat: add admin dashboard overview page"
```

---

### Task 20: Admin Users Page

**Files:**
- Create: `frontend/src/pages/admin/AdminUsersPage.tsx`

- [ ] **Step 1: Create users page**

Create `frontend/src/pages/admin/AdminUsersPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { fetchUsers, fetchUserActivity } from '../../api/admin';
import AdminLayout from '../../components/admin/AdminLayout';

interface UserSummary {
  user_id: string;
  first_seen: string;
  last_seen: string;
  event_count: number;
  llm_tokens: number;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [activity, setActivity] = useState<{ events: unknown[]; llm_usage: unknown[] } | null>(null);

  useEffect(() => {
    fetchUsers()
      .then((data) => setUsers(data.users))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSelectUser = async (userId: string) => {
    if (selectedUser === userId) {
      setSelectedUser(null);
      setActivity(null);
      return;
    }
    setSelectedUser(userId);
    try {
      const data = await fetchUserActivity(userId);
      setActivity(data);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <AdminLayout>
      <h2 className="text-xl font-semibold text-white mb-6">Users</h2>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="px-4 py-3 text-gray-400 font-medium">User ID</th>
                <th className="px-4 py-3 text-gray-400 font-medium">First Seen</th>
                <th className="px-4 py-3 text-gray-400 font-medium">Last Seen</th>
                <th className="px-4 py-3 text-gray-400 font-medium text-right">Events</th>
                <th className="px-4 py-3 text-gray-400 font-medium text-right">LLM Tokens</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <>
                  <tr
                    key={user.user_id}
                    onClick={() => handleSelectUser(user.user_id)}
                    className="border-b border-gray-800/50 hover:bg-gray-800/50 cursor-pointer"
                  >
                    <td className="px-4 py-3 text-white font-mono text-xs">{user.user_id}</td>
                    <td className="px-4 py-3 text-gray-400">{user.first_seen || '—'}</td>
                    <td className="px-4 py-3 text-gray-400">{user.last_seen || '—'}</td>
                    <td className="px-4 py-3 text-gray-300 text-right">{user.event_count}</td>
                    <td className="px-4 py-3 text-gray-300 text-right">{user.llm_tokens}</td>
                  </tr>
                  {selectedUser === user.user_id && activity && (
                    <tr key={`${user.user_id}-detail`}>
                      <td colSpan={5} className="px-4 py-4 bg-gray-800/30">
                        <h4 className="text-sm font-medium text-gray-300 mb-2">Recent Activity</h4>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {activity.events.slice(0, 20).map((evt, i) => (
                            <div key={i} className="text-xs text-gray-400 font-mono">
                              {JSON.stringify(evt)}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/admin/AdminUsersPage.tsx
git commit -m "feat: add admin users page with detail view"
```

---

### Task 21: Admin LLM Usage Page

**Files:**
- Create: `frontend/src/pages/admin/AdminLLMPage.tsx`

- [ ] **Step 1: Create LLM usage page**

Create `frontend/src/pages/admin/AdminLLMPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchLLMUsage } from '../../api/admin';
import AdminLayout from '../../components/admin/AdminLayout';

const COLORS = ['#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444', '#10b981'];

interface LLMData {
  by_model: { model: string; input_tokens: number; output_tokens: number; count: number }[];
  by_operation: { operation: string; input_tokens: number; output_tokens: number; count: number }[];
  over_time: { date: string; input_tokens: number; output_tokens: number }[];
  top_users: { user_id: string; input_tokens: number; output_tokens: number }[];
}

export default function AdminLLMPage() {
  const [data, setData] = useState<LLMData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLLMUsage()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <AdminLayout><p className="text-gray-500">Loading...</p></AdminLayout>;
  }

  if (!data) {
    return <AdminLayout><p className="text-gray-500">No data available</p></AdminLayout>;
  }

  const pieData = data.by_model.map((m) => ({
    name: m.model,
    value: m.input_tokens + m.output_tokens,
  }));

  return (
    <AdminLayout>
      <h2 className="text-xl font-semibold text-white mb-6">LLM Token Usage</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Tokens by model (pie) */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-4">Tokens by Model</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name }) => name}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-sm">No model data</p>
          )}
        </div>

        {/* Top users leaderboard */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-4">Top Users by Tokens</h3>
          <div className="space-y-2">
            {data.top_users.slice(0, 10).map((user, i) => (
              <div key={user.user_id} className="flex items-center justify-between text-sm">
                <span className="text-gray-400 font-mono text-xs">
                  {i + 1}. {user.user_id}
                </span>
                <span className="text-gray-300">
                  {(user.input_tokens + user.output_tokens).toLocaleString()} tokens
                </span>
              </div>
            ))}
            {data.top_users.length === 0 && (
              <p className="text-gray-500 text-sm">No user data</p>
            )}
          </div>
        </div>
      </div>

      {/* Tokens over time (stacked area) */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-4">Tokens Over Time</h3>
        {data.over_time.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data.over_time}>
              <XAxis dataKey="date" stroke="#6b7280" tick={{ fontSize: 12 }} />
              <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} />
              <Tooltip />
              <Area type="monotone" dataKey="input_tokens" stackId="1" fill="#8b5cf6" stroke="#8b5cf6" name="Input" />
              <Area type="monotone" dataKey="output_tokens" stackId="1" fill="#06b6d4" stroke="#06b6d4" name="Output" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-500 text-sm">No time series data</p>
        )}
      </div>
    </AdminLayout>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/admin/AdminLLMPage.tsx
git commit -m "feat: add admin LLM usage page with charts"
```

---

### Task 22: Admin Events Explorer Page

**Files:**
- Create: `frontend/src/pages/admin/AdminEventsPage.tsx`

- [ ] **Step 1: Create events explorer page**

Create `frontend/src/pages/admin/AdminEventsPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { fetchEvents } from '../../api/admin';
import AdminLayout from '../../components/admin/AdminLayout';
import HeatmapChart from '../../components/admin/HeatmapChart';

export default function AdminEventsPage() {
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    event_type: '',
    user_id: '',
    date_from: '',
    date_to: '',
  });
  const [heatmapData] = useState<number[][]>(
    Array.from({ length: 7 }, () => Array(24).fill(0))
  );

  const loadEvents = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filters.event_type) params.event_type = filters.event_type;
      if (filters.user_id) params.user_id = filters.user_id;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      const data = await fetchEvents(params);
      setEvents(data.events || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  return (
    <AdminLayout>
      <h2 className="text-xl font-semibold text-white mb-6">Events Explorer</h2>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <input
          type="text"
          placeholder="Event type"
          value={filters.event_type}
          onChange={(e) => setFilters({ ...filters, event_type: e.target.value })}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
        />
        <input
          type="text"
          placeholder="User ID"
          value={filters.user_id}
          onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
        />
        <input
          type="date"
          value={filters.date_from}
          onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500"
        />
        <input
          type="date"
          value={filters.date_to}
          onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500"
        />
        <button
          onClick={loadEvents}
          className="bg-purple-600 hover:bg-purple-700 text-white rounded px-4 py-1.5 text-sm"
        >
          Filter
        </button>
      </div>

      {/* Activity heatmap */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-medium text-gray-300 mb-4">Activity Heatmap</h3>
        <HeatmapChart data={heatmapData} />
      </div>

      {/* Event log */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-4">
          Events {!loading && `(${events.length})`}
        </h3>
        {loading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : events.length > 0 ? (
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {events.map((event, i) => (
              <div key={i} className="text-xs text-gray-400 font-mono bg-gray-800 rounded px-3 py-2">
                {JSON.stringify(event)}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No events found</p>
        )}
      </div>
    </AdminLayout>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/admin/AdminEventsPage.tsx
git commit -m "feat: add admin events explorer page with heatmap"
```

---

### Task 23: Wire Admin Routes into App.tsx & Init Tracker

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add admin routes and tracker init to App.tsx**

In `frontend/src/App.tsx`, add imports after line 12 (`import ToastContainer`):

```typescript
import { initTracker, identifyUser } from './analytics/tracker';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminLLMPage from './pages/admin/AdminLLMPage';
import AdminEventsPage from './pages/admin/AdminEventsPage';
import AdminRoute from './components/admin/AdminRoute';
```

Add admin routes inside `<Routes>`, before the `/:orbId` catch-all route (before line 49 `<Route path="/:orbId"`):

```tsx
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
        <Route path="/admin/users" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
        <Route path="/admin/llm" element={<AdminRoute><AdminLLMPage /></AdminRoute>} />
        <Route path="/admin/events" element={<AdminRoute><AdminEventsPage /></AdminRoute>} />
```

In the `App` function, add tracker init inside useEffect (after line 59 `if (token) fetchUser();`):

```typescript
  useEffect(() => {
    initTracker();
  }, []);

  useEffect(() => {
    if (token) {
      fetchUser();
    }
  }, [token, fetchUser]);
```

Also add user identification when user is loaded. Add after the existing useEffect block:

```typescript
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user) {
      identifyUser(user.user_id);
    }
  }, [user]);
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/alessandro/orb_project/frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire admin routes and analytics tracker into App.tsx"
```

---

### Task 24: Final Integration Verification

- [ ] **Step 1: Run all backend tests**

Run: `cd /Users/alessandro/orb_project/backend && python -m pytest tests/unit/ -v --tb=short`
Expected: All tests PASS

- [ ] **Step 2: Run frontend type check**

Run: `cd /Users/alessandro/orb_project/frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run frontend lint**

Run: `cd /Users/alessandro/orb_project/frontend && npm run lint`
Expected: No lint errors (or only pre-existing ones)

- [ ] **Step 4: Verify backend starts**

Run: `cd /Users/alessandro/orb_project/backend && timeout 5 python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 || true`
Expected: Server starts without import errors (will shut down after 5s timeout)

- [ ] **Step 5: Run backend linter**

Run: `cd /Users/alessandro/orb_project/backend && python -m ruff check app/`
Expected: No new lint errors

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve any integration issues from final verification"
```
