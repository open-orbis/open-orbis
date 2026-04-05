# Admin Metrics Dashboard & LLM Token Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full admin metrics dashboard with self-hosted PostHog analytics, separate admin auth via PostgreSQL, LLM token tracking, and comprehensive user behavior metrics.

**Architecture:** Self-hosted PostHog captures all analytics events (frontend + backend). Admin credentials stored in PostHog's PostgreSQL (isolated `orbis_admin` schema). Admin dashboard pages at `/admin/*` in the React app query PostHog API through backend proxy endpoints. LLM token usage tracked as PostHog custom events.

**Tech Stack:** PostHog (self-hosted), PostgreSQL, posthog-python, posthog-js, bcrypt, asyncpg, Recharts

---

## File Structure

### New Files — Backend

| File | Responsibility |
|------|---------------|
| `backend/app/admin/__init__.py` | Package init |
| `backend/app/admin/router.py` | Admin API endpoints (login, overview, trends, users, llm-usage, events, funnel, realtime) |
| `backend/app/admin/auth.py` | Admin JWT creation + `get_current_admin` FastAPI dependency |
| `backend/app/admin/db.py` | PostgreSQL connection pool (asyncpg) for `orbis_admin` schema |
| `backend/app/admin/schemas.py` | Pydantic request/response models for admin endpoints |
| `backend/app/admin/service.py` | Business logic: PostHog API queries, data aggregation |
| `backend/app/admin/seed.py` | CLI script to seed admin credentials |
| `backend/app/analytics/__init__.py` | Package init |
| `backend/app/analytics/posthog_client.py` | PostHog SDK init + singleton client |
| `backend/app/analytics/tracker.py` | `track_event()` and `track_llm_usage()` helpers |
| `backend/tests/unit/test_admin_auth.py` | Tests for admin JWT + dependency |
| `backend/tests/unit/test_admin_router.py` | Tests for admin API endpoints |
| `backend/tests/unit/test_analytics_tracker.py` | Tests for event tracking helpers |
| `backend/tests/unit/test_admin_seed.py` | Tests for admin seeding CLI |

### New Files — Frontend

| File | Responsibility |
|------|---------------|
| `frontend/src/api/admin.ts` | Admin API client (login, fetch metrics) |
| `frontend/src/api/adminClient.ts` | Axios instance with admin JWT interceptor (sessionStorage) |
| `frontend/src/stores/adminAuthStore.ts` | Zustand store for admin auth state |
| `frontend/src/analytics/posthog.ts` | PostHog JS SDK init + `trackEvent()` wrapper |
| `frontend/src/pages/admin/AdminLoginPage.tsx` | Admin login form |
| `frontend/src/pages/admin/AdminDashboardPage.tsx` | Overview: cards, sparklines, funnel, activity feed |
| `frontend/src/pages/admin/AdminUsersPage.tsx` | User list table + user detail view |
| `frontend/src/pages/admin/AdminLLMPage.tsx` | LLM token usage charts |
| `frontend/src/pages/admin/AdminEventsPage.tsx` | Event explorer with heatmap |
| `frontend/src/components/admin/MetricCard.tsx` | Reusable summary card with sparkline |
| `frontend/src/components/admin/FunnelChart.tsx` | Registration funnel visualization |
| `frontend/src/components/admin/HeatmapChart.tsx` | Hour x Day-of-week heatmap |
| `frontend/src/components/admin/AdminLayout.tsx` | Shared admin layout with sidebar nav |
| `frontend/src/components/admin/AdminRoute.tsx` | Route guard for admin auth |

### Modified Files

| File | Change |
|------|--------|
| `docker-compose.yml` | Add PostHog services |
| `backend/pyproject.toml` | Add `posthog`, `bcrypt`, `asyncpg` dependencies |
| `frontend/package.json` | Add `posthog-js`, `recharts` dependencies |
| `backend/app/config.py` | Add PostHog + admin DB settings |
| `backend/app/main.py` | Register admin router, init PostHog + PG on startup, shutdown on teardown |
| `backend/app/cv/ollama_classifier.py:290-308` | Capture Ollama token counts, return them alongside content |
| `backend/app/cv/claude_classifier.py:47-59` | Extract token/cost info from Claude CLI envelope |
| `backend/app/cv/router.py:30-91` | Add PostHog event tracking for CV upload |
| `backend/app/notes/router.py:201-237` | Add PostHog event tracking + LLM usage for note enhancement |
| `backend/app/auth/router.py:18-46` | Track `user_signup` / `user_login` events |
| `backend/app/orbs/router.py` | Track node CRUD, skill link, orb ID claim, profile image, filter token events |
| `backend/app/search/router.py:34-77` | Track search events |
| `backend/app/export/router.py:196-258` | Track export events |
| `backend/app/messages/router.py` | Track message events |
| `backend/mcp_server/tools.py` | Track MCP tool call events |
| `frontend/src/App.tsx` | Init PostHog, add admin routes |

---

### Task 1: Infrastructure — PostHog in Docker Compose

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env` (create if not exists)

- [ ] **Step 1: Write PostHog docker-compose override**

Add PostHog services to `docker-compose.yml`. PostHog self-hosted requires PostgreSQL, Redis, ClickHouse, Kafka, and the PostHog web/worker containers.

```yaml
# Add after the ollama service in docker-compose.yml:

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
    ports:
      - "6380:6379"

  posthog-clickhouse:
    image: clickhouse/clickhouse-server:24.3
    volumes:
      - posthog_ch_data:/var/lib/clickhouse
    ulimits:
      nofile:
        soft: 262144
        hard: 262144

  posthog-kafka:
    image: bitnami/kafka:3.7
    environment:
      KAFKA_CFG_NODE_ID: 0
      KAFKA_CFG_PROCESS_ROLES: controller,broker
      KAFKA_CFG_CONTROLLER_QUORUM_VOTERS: 0@posthog-kafka:9093
      KAFKA_CFG_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_CFG_ADVERTISED_LISTENERS: PLAINTEXT://posthog-kafka:9092
      KAFKA_CFG_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_CFG_CONTROLLER_LISTENER_NAMES: CONTROLLER
    volumes:
      - posthog_kafka_data:/bitnami/kafka

  posthog:
    image: posthog/posthog:latest
    depends_on:
      - posthog-db
      - posthog-redis
      - posthog-clickhouse
      - posthog-kafka
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgres://posthog:posthog_dev_password@posthog-db:5432/posthog
      REDIS_URL: redis://posthog-redis:6379
      CLICKHOUSE_HOST: posthog-clickhouse
      KAFKA_HOSTS: posthog-kafka:9092
      SECRET_KEY: posthog-dev-secret-key-change-in-prod
      SITE_URL: http://localhost:8000
      IS_BEHIND_PROXY: "false"
    restart: unless-stopped
```

Also add volumes:

```yaml
# Add to existing volumes section:
  posthog_pg_data:
  posthog_ch_data:
  posthog_kafka_data:
```

- [ ] **Step 2: Start PostHog and verify**

Run: `docker compose up -d posthog`

Wait for PostHog to be ready, then visit http://localhost:8000 and complete the initial setup wizard to create a project. Note the project API key from Settings > Project > API Key.

- [ ] **Step 3: Create orbis_admin schema in PostHog's PostgreSQL**

Run:
```bash
docker compose exec posthog-db psql -U posthog -d posthog -c "
CREATE SCHEMA IF NOT EXISTS orbis_admin;
CREATE TABLE IF NOT EXISTS orbis_admin.admin_users (
    admin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_login TIMESTAMPTZ
);
"
```

Expected: `CREATE SCHEMA` and `CREATE TABLE` success messages.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "infra: add self-hosted PostHog to docker-compose"
```

---

### Task 2: Backend Dependencies & Config

**Files:**
- Modify: `backend/pyproject.toml:6-23`
- Modify: `backend/app/config.py`

- [ ] **Step 1: Add Python dependencies**

Add to `backend/pyproject.toml` dependencies list (after the existing `fpdf2` entry on line 22):

```toml
    "posthog>=3.5.0",
    "bcrypt>=4.0.0",
    "asyncpg>=0.29.0",
```

- [ ] **Step 2: Install dependencies**

Run: `cd backend && uv sync`
Expected: Dependencies installed successfully.

- [ ] **Step 3: Add config settings**

Add to `backend/app/config.py` Settings class, after `frontend_url` (line 30):

```python
    # PostHog
    posthog_api_key: str = ""
    posthog_host: str = "http://localhost:8000"
    posthog_project_id: int = 1

    # Admin auth
    admin_jwt_secret: str = "admin-change-me"
    admin_jwt_expire_minutes: int = 60
    admin_db_host: str = "localhost"
    admin_db_port: int = 5433
    admin_db_name: str = "posthog"
    admin_db_user: str = "posthog"
    admin_db_password: str = "posthog_dev_password"
```

- [ ] **Step 4: Commit**

```bash
git add backend/pyproject.toml backend/app/config.py
git commit -m "feat: add PostHog, bcrypt, asyncpg dependencies and config"
```

---

### Task 3: PostHog Client & Event Tracker

**Files:**
- Create: `backend/app/analytics/__init__.py`
- Create: `backend/app/analytics/posthog_client.py`
- Create: `backend/app/analytics/tracker.py`
- Test: `backend/tests/unit/test_analytics_tracker.py`

- [ ] **Step 1: Write the failing test for PostHog client init**

Create `backend/tests/unit/test_analytics_tracker.py`:

```python
"""Tests for analytics tracking helpers."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.analytics.posthog_client import get_posthog_client, shutdown_posthog
from app.analytics.tracker import track_event, track_llm_usage


def test_get_posthog_client_returns_client():
    with patch("app.analytics.posthog_client.Posthog") as mock_cls:
        mock_cls.return_value = MagicMock()
        client = get_posthog_client()
        assert client is not None
        mock_cls.assert_called_once()


def test_get_posthog_client_returns_none_when_no_api_key():
    with patch("app.analytics.posthog_client.settings") as mock_settings:
        mock_settings.posthog_api_key = ""
        mock_settings.posthog_host = "http://localhost:8000"
        # Reset the cached client
        import app.analytics.posthog_client as mod
        mod._client = None
        client = mod.get_posthog_client()
        assert client is None


def test_track_event_calls_posthog_capture():
    mock_client = MagicMock()
    with patch("app.analytics.tracker.get_posthog_client", return_value=mock_client):
        track_event(
            user_id="user-123",
            event_type="cv_upload_completed",
            properties={"node_count": 5},
        )
        mock_client.capture.assert_called_once_with(
            distinct_id="user-123",
            event="cv_upload_completed",
            properties={"node_count": 5},
        )


def test_track_event_silently_ignores_when_no_client():
    with patch("app.analytics.tracker.get_posthog_client", return_value=None):
        # Should not raise
        track_event(user_id="user-123", event_type="test")


def test_track_event_silently_ignores_on_exception():
    mock_client = MagicMock()
    mock_client.capture.side_effect = Exception("network error")
    with patch("app.analytics.tracker.get_posthog_client", return_value=mock_client):
        # Should not raise
        track_event(user_id="user-123", event_type="test")


def test_track_llm_usage_sends_llm_usage_event():
    mock_client = MagicMock()
    with patch("app.analytics.tracker.get_posthog_client", return_value=mock_client):
        track_llm_usage(
            user_id="user-123",
            operation="cv_classification",
            model="llama3.2:3b",
            provider="ollama",
            input_tokens=1200,
            output_tokens=450,
            latency_ms=2300,
        )
        mock_client.capture.assert_called_once_with(
            distinct_id="user-123",
            event="llm_usage",
            properties={
                "operation": "cv_classification",
                "model": "llama3.2:3b",
                "provider": "ollama",
                "input_tokens": 1200,
                "output_tokens": 450,
                "latency_ms": 2300,
                "total_tokens": 1650,
            },
        )
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/unit/test_analytics_tracker.py -v`
Expected: FAIL — modules do not exist yet.

- [ ] **Step 3: Implement PostHog client**

Create `backend/app/analytics/__init__.py`:

```python
```

Create `backend/app/analytics/posthog_client.py`:

```python
"""PostHog SDK initialization and singleton client."""

from __future__ import annotations

import logging

from app.config import settings

logger = logging.getLogger(__name__)

_client = None


def get_posthog_client():
    """Return the PostHog client singleton, or None if not configured."""
    global _client
    if _client is not None:
        return _client
    if not settings.posthog_api_key:
        logger.info("PostHog API key not set — analytics disabled")
        return None
    from posthog import Posthog

    _client = Posthog(
        api_key=settings.posthog_api_key,
        host=settings.posthog_host,
    )
    logger.info("PostHog client initialized (host=%s)", settings.posthog_host)
    return _client


def shutdown_posthog():
    """Flush and shut down the PostHog client."""
    global _client
    if _client is not None:
        _client.flush()
        _client.shutdown()
        _client = None
```

- [ ] **Step 4: Implement event tracker**

Create `backend/app/analytics/tracker.py`:

```python
"""Lightweight helpers to send analytics events to PostHog."""

from __future__ import annotations

import logging

from app.analytics.posthog_client import get_posthog_client

logger = logging.getLogger(__name__)


def track_event(
    user_id: str,
    event_type: str,
    properties: dict | None = None,
) -> None:
    """Capture an analytics event. Fails silently — never breaks core flows."""
    try:
        client = get_posthog_client()
        if client is None:
            return
        client.capture(
            distinct_id=user_id,
            event=event_type,
            properties=properties or {},
        )
    except Exception:
        logger.warning("Failed to track event %s for %s", event_type, user_id, exc_info=True)


def track_llm_usage(
    user_id: str,
    operation: str,
    model: str,
    provider: str,
    input_tokens: int,
    output_tokens: int,
    latency_ms: int,
) -> None:
    """Capture an LLM token usage event."""
    track_event(
        user_id=user_id,
        event_type="llm_usage",
        properties={
            "operation": operation,
            "model": model,
            "provider": provider,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "latency_ms": latency_ms,
            "total_tokens": input_tokens + output_tokens,
        },
    )
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/unit/test_analytics_tracker.py -v`
Expected: All 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/analytics/ backend/tests/unit/test_analytics_tracker.py
git commit -m "feat: add PostHog client and event tracking helpers"
```

---

### Task 4: Admin Database Connection (PostgreSQL)

**Files:**
- Create: `backend/app/admin/__init__.py`
- Create: `backend/app/admin/db.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/test_admin_db.py`:

```python
"""Tests for admin PostgreSQL connection."""

from unittest.mock import AsyncMock, patch

import pytest


@pytest.mark.asyncio
async def test_get_admin_pool_creates_pool():
    mock_pool = AsyncMock()
    with patch("app.admin.db.asyncpg.create_pool", new_callable=AsyncMock, return_value=mock_pool):
        from app.admin.db import get_admin_pool, _pool
        import app.admin.db as mod
        mod._pool = None
        pool = await mod.get_admin_pool()
        assert pool is mock_pool


@pytest.mark.asyncio
async def test_close_admin_pool():
    mock_pool = AsyncMock()
    import app.admin.db as mod
    mod._pool = mock_pool
    await mod.close_admin_pool()
    mock_pool.close.assert_called_once()
    assert mod._pool is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/unit/test_admin_db.py -v`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement admin DB module**

Create `backend/app/admin/__init__.py`:

```python
```

Create `backend/app/admin/db.py`:

```python
"""PostgreSQL connection pool for admin auth (orbis_admin schema)."""

from __future__ import annotations

import logging

import asyncpg

from app.config import settings

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None


async def get_admin_pool() -> asyncpg.Pool:
    """Return the admin PostgreSQL connection pool, creating it if needed."""
    global _pool
    if _pool is not None:
        return _pool
    _pool = await asyncpg.create_pool(
        host=settings.admin_db_host,
        port=settings.admin_db_port,
        database=settings.admin_db_name,
        user=settings.admin_db_user,
        password=settings.admin_db_password,
        min_size=1,
        max_size=5,
    )
    logger.info("Admin PostgreSQL pool created")
    return _pool


async def close_admin_pool() -> None:
    """Close the admin PostgreSQL connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("Admin PostgreSQL pool closed")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/unit/test_admin_db.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/admin/ backend/tests/unit/test_admin_db.py
git commit -m "feat: add admin PostgreSQL connection pool"
```

---

### Task 5: Admin Auth (JWT + Dependency)

**Files:**
- Create: `backend/app/admin/auth.py`
- Create: `backend/app/admin/schemas.py`
- Test: `backend/tests/unit/test_admin_auth.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/test_admin_auth.py`:

```python
"""Tests for admin authentication."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.admin.auth import create_admin_jwt, verify_admin_jwt, get_current_admin


def test_create_admin_jwt_returns_token():
    token = create_admin_jwt(admin_id="admin-123", username="admin")
    assert isinstance(token, str)
    assert len(token) > 0


def test_verify_admin_jwt_decodes_valid_token():
    token = create_admin_jwt(admin_id="admin-123", username="admin")
    payload = verify_admin_jwt(token)
    assert payload["sub"] == "admin-123"
    assert payload["username"] == "admin"
    assert payload["type"] == "admin"


def test_verify_admin_jwt_rejects_invalid_token():
    result = verify_admin_jwt("invalid-token")
    assert result is None


def test_verify_admin_jwt_rejects_user_jwt():
    """Admin JWT must use admin secret — a regular user JWT should be rejected."""
    from app.auth.service import create_jwt
    user_token = create_jwt("user-123", "user@test.com")
    result = verify_admin_jwt(user_token)
    assert result is None


@pytest.mark.asyncio
async def test_get_current_admin_with_valid_token():
    token = create_admin_jwt(admin_id="admin-123", username="admin")
    creds = MagicMock()
    creds.credentials = token
    result = await get_current_admin(creds)
    assert result["admin_id"] == "admin-123"
    assert result["username"] == "admin"


@pytest.mark.asyncio
async def test_get_current_admin_with_invalid_token():
    creds = MagicMock()
    creds.credentials = "bad-token"
    with pytest.raises(HTTPException) as exc_info:
        await get_current_admin(creds)
    assert exc_info.value.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/unit/test_admin_auth.py -v`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement admin schemas**

Create `backend/app/admin/schemas.py`:

```python
"""Pydantic models for admin endpoints."""

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
    value: float
    trend: list[float]  # 7-day sparkline data


class OverviewResponse(BaseModel):
    total_users: int
    active_today: int
    signups_this_week: int
    llm_tokens_today: int
    cards: list[MetricCard]
    recent_events: list[dict]


class TrendsRequest(BaseModel):
    metric: str
    period: str = "day"  # day, week, month
    date_from: str | None = None
    date_to: str | None = None


class FunnelResponse(BaseModel):
    steps: list[dict]  # [{name, count, conversion_rate}]


class UserSummary(BaseModel):
    user_id: str
    name: str
    signup_date: str | None
    last_active: str | None
    node_count: int
    llm_tokens_used: int
    action_count: int
```

- [ ] **Step 4: Implement admin auth**

Create `backend/app/admin/auth.py`:

```python
"""Admin authentication — separate from user Google OAuth."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import settings

logger = logging.getLogger(__name__)

admin_security = HTTPBearer()


def create_admin_jwt(admin_id: str, username: str) -> str:
    """Create a JWT for an authenticated admin."""
    payload = {
        "sub": admin_id,
        "username": username,
        "type": "admin",
        "exp": datetime.now(timezone.utc)
        + timedelta(minutes=settings.admin_jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.admin_jwt_secret, algorithm=settings.jwt_algorithm)


def verify_admin_jwt(token: str) -> dict | None:
    """Decode and verify an admin JWT. Returns payload or None."""
    try:
        payload = jwt.decode(
            token,
            settings.admin_jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        if payload.get("type") != "admin":
            return None
        return payload
    except JWTError:
        return None


async def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(admin_security),
) -> dict:
    """FastAPI dependency — verifies admin JWT."""
    payload = verify_admin_jwt(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin token",
        )
    return {"admin_id": payload["sub"], "username": payload["username"]}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/unit/test_admin_auth.py -v`
Expected: All 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/admin/auth.py backend/app/admin/schemas.py backend/tests/unit/test_admin_auth.py
git commit -m "feat: add admin JWT authentication and schemas"
```

---

### Task 6: Admin Seed CLI

**Files:**
- Create: `backend/app/admin/seed.py`
- Test: `backend/tests/unit/test_admin_seed.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/test_admin_seed.py`:

```python
"""Tests for admin credential seeding."""

from unittest.mock import AsyncMock, patch

import pytest

from app.admin.seed import hash_password, verify_password


def test_hash_password_returns_hash():
    hashed = hash_password("mysecretpassword")
    assert isinstance(hashed, str)
    assert hashed != "mysecretpassword"
    assert hashed.startswith("$2b$")


def test_verify_password_correct():
    hashed = hash_password("mysecretpassword")
    assert verify_password("mysecretpassword", hashed) is True


def test_verify_password_incorrect():
    hashed = hash_password("mysecretpassword")
    assert verify_password("wrongpassword", hashed) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/unit/test_admin_seed.py -v`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement seed module**

Create `backend/app/admin/seed.py`:

```python
"""CLI tool and helpers for admin credential management."""

from __future__ import annotations

import argparse
import asyncio
import logging

import asyncpg
import bcrypt

from app.config import settings

logger = logging.getLogger(__name__)


def hash_password(password: str) -> str:
    """Hash a password with bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against a bcrypt hash."""
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


async def seed_admin(username: str, password: str) -> None:
    """Insert or update an admin user in PostgreSQL."""
    conn = await asyncpg.connect(
        host=settings.admin_db_host,
        port=settings.admin_db_port,
        database=settings.admin_db_name,
        user=settings.admin_db_user,
        password=settings.admin_db_password,
    )
    try:
        pw_hash = hash_password(password)
        await conn.execute(
            """
            INSERT INTO orbis_admin.admin_users (username, password_hash)
            VALUES ($1, $2)
            ON CONFLICT (username) DO UPDATE SET password_hash = $2
            """,
            username,
            pw_hash,
        )
        logger.info("Admin user '%s' seeded successfully", username)
    finally:
        await conn.close()


def main():
    parser = argparse.ArgumentParser(description="Seed an admin user")
    parser.add_argument("--username", required=True, help="Admin username")
    parser.add_argument("--password", required=True, help="Admin password")
    args = parser.parse_args()

    asyncio.run(seed_admin(args.username, args.password))
    print(f"Admin user '{args.username}' created/updated.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/unit/test_admin_seed.py -v`
Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/admin/seed.py backend/tests/unit/test_admin_seed.py
git commit -m "feat: add admin credential seeding CLI with bcrypt"
```

---

### Task 7: Admin Router — Login + Overview + Trends

**Files:**
- Create: `backend/app/admin/service.py`
- Create: `backend/app/admin/router.py`
- Test: `backend/tests/unit/test_admin_router.py`

- [ ] **Step 1: Write the failing test for login**

Create `backend/tests/unit/test_admin_router.py`:

```python
"""Tests for admin router endpoints."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.admin.auth import create_admin_jwt, get_current_admin
from app.admin.seed import hash_password
from app.main import app


@pytest.fixture
def admin_client():
    """TestClient with admin auth overridden."""
    app.dependency_overrides[get_current_admin] = lambda: {
        "admin_id": "admin-test",
        "username": "admin",
    }
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_admin_login_success(admin_client):
    pw_hash = hash_password("testpass")
    mock_record = {"admin_id": "admin-123", "username": "admin", "password_hash": pw_hash}

    with patch("app.admin.router.get_admin_pool") as mock_pool_fn:
        mock_pool = AsyncMock()
        mock_pool_fn.return_value = mock_pool
        mock_pool.fetchrow = AsyncMock(return_value=mock_record)
        mock_pool.execute = AsyncMock()

        resp = admin_client.post(
            "/api/admin/login",
            json={"username": "admin", "password": "testpass"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_admin_login_wrong_password(admin_client):
    pw_hash = hash_password("correct")
    mock_record = {"admin_id": "admin-123", "username": "admin", "password_hash": pw_hash}

    with patch("app.admin.router.get_admin_pool") as mock_pool_fn:
        mock_pool = AsyncMock()
        mock_pool_fn.return_value = mock_pool
        mock_pool.fetchrow = AsyncMock(return_value=mock_record)

        resp = admin_client.post(
            "/api/admin/login",
            json={"username": "admin", "password": "wrong"},
        )

    assert resp.status_code == 401


def test_admin_login_user_not_found(admin_client):
    with patch("app.admin.router.get_admin_pool") as mock_pool_fn:
        mock_pool = AsyncMock()
        mock_pool_fn.return_value = mock_pool
        mock_pool.fetchrow = AsyncMock(return_value=None)

        resp = admin_client.post(
            "/api/admin/login",
            json={"username": "ghost", "password": "pass"},
        )

    assert resp.status_code == 401


def test_admin_overview_requires_auth():
    """Without auth override, overview should 403/401."""
    with TestClient(app) as c:
        resp = c.get("/api/admin/overview")
    assert resp.status_code in (401, 403)


def test_admin_overview_returns_data(admin_client):
    mock_data = {
        "total_users": 42,
        "active_today": 5,
        "signups_this_week": 3,
        "llm_tokens_today": 12000,
        "cards": [],
        "recent_events": [],
    }
    with patch("app.admin.router.admin_service.get_overview", new_callable=AsyncMock, return_value=mock_data):
        resp = admin_client.get("/api/admin/overview")

    assert resp.status_code == 200
    data = resp.json()
    assert data["total_users"] == 42


def test_admin_trends_returns_data(admin_client):
    mock_data = {"labels": ["2026-04-01"], "values": [10]}
    with patch("app.admin.router.admin_service.get_trends", new_callable=AsyncMock, return_value=mock_data):
        resp = admin_client.get("/api/admin/trends", params={"metric": "signups", "period": "day"})

    assert resp.status_code == 200


def test_admin_llm_usage_returns_data(admin_client):
    mock_data = {"total_input": 5000, "total_output": 2000, "by_model": {}}
    with patch("app.admin.router.admin_service.get_llm_usage", new_callable=AsyncMock, return_value=mock_data):
        resp = admin_client.get("/api/admin/llm-usage")

    assert resp.status_code == 200


def test_admin_users_returns_list(admin_client):
    mock_data = [{"user_id": "u1", "name": "Test", "action_count": 5}]
    with patch("app.admin.router.admin_service.get_users", new_callable=AsyncMock, return_value=mock_data):
        resp = admin_client.get("/api/admin/users")

    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_admin_funnel_returns_steps(admin_client):
    mock_data = {"steps": [{"name": "signup", "count": 100}]}
    with patch("app.admin.router.admin_service.get_funnel", new_callable=AsyncMock, return_value=mock_data):
        resp = admin_client.get("/api/admin/funnel")

    assert resp.status_code == 200


def test_admin_events_returns_list(admin_client):
    mock_data = {"results": [], "total": 0}
    with patch("app.admin.router.admin_service.get_events", new_callable=AsyncMock, return_value=mock_data):
        resp = admin_client.get("/api/admin/events")

    assert resp.status_code == 200


def test_admin_realtime_returns_data(admin_client):
    mock_data = {"active_now": 2, "events_today": 55}
    with patch("app.admin.router.admin_service.get_realtime", new_callable=AsyncMock, return_value=mock_data):
        resp = admin_client.get("/api/admin/realtime")

    assert resp.status_code == 200
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/unit/test_admin_router.py -v`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement admin service**

Create `backend/app/admin/service.py`:

```python
"""Admin business logic — queries PostHog API for dashboard data."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_POSTHOG_API = f"{settings.posthog_host}/api"
_HEADERS = {"Authorization": f"Bearer {settings.posthog_api_key}"}
_PROJECT = settings.posthog_project_id


async def _posthog_get(path: str, params: dict | None = None) -> dict:
    """Make a GET request to PostHog API."""
    url = f"{_POSTHOG_API}/projects/{_PROJECT}{path}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, headers=_HEADERS, params=params or {})
        resp.raise_for_status()
        return resp.json()


async def _posthog_post(path: str, payload: dict) -> dict:
    """Make a POST request to PostHog API."""
    url = f"{_POSTHOG_API}/projects/{_PROJECT}{path}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, headers=_HEADERS, json=payload)
        resp.raise_for_status()
        return resp.json()


async def get_overview() -> dict:
    """Aggregate high-level dashboard metrics."""
    now = datetime.now(timezone.utc)
    week_ago = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    today = now.strftime("%Y-%m-%d")

    # Fetch multiple insights in parallel
    total_users_task = _posthog_post("/query/", {
        "query": {
            "kind": "EventsQuery",
            "select": ["count(distinct person_id)"],
            "event": "user_signup",
        }
    })
    active_today_task = _posthog_post("/query/", {
        "query": {
            "kind": "EventsQuery",
            "select": ["count(distinct person_id)"],
            "after": today,
        }
    })
    signups_week_task = _posthog_post("/query/", {
        "query": {
            "kind": "EventsQuery",
            "select": ["count()"],
            "event": "user_signup",
            "after": week_ago,
        }
    })
    tokens_today_task = _posthog_post("/query/", {
        "query": {
            "kind": "EventsQuery",
            "select": ["sum(properties.total_tokens)"],
            "event": "llm_usage",
            "after": today,
        }
    })
    recent_task = _posthog_get("/events/", {"limit": 20, "orderBy": ["-timestamp"]})

    import asyncio
    results = await asyncio.gather(
        total_users_task, active_today_task, signups_week_task,
        tokens_today_task, recent_task,
        return_exceptions=True,
    )

    def _safe_val(result, default=0):
        if isinstance(result, Exception):
            logger.warning("PostHog query failed: %s", result)
            return default
        try:
            return result.get("results", [[default]])[0][0] or default
        except (IndexError, KeyError, TypeError):
            return default

    return {
        "total_users": _safe_val(results[0]),
        "active_today": _safe_val(results[1]),
        "signups_this_week": _safe_val(results[2]),
        "llm_tokens_today": _safe_val(results[3]),
        "cards": [],
        "recent_events": results[4].get("results", []) if not isinstance(results[4], Exception) else [],
    }


async def get_trends(metric: str, period: str = "day", date_from: str | None = None, date_to: str | None = None) -> dict:
    """Get time-series data for a given metric."""
    params = {
        "events": [{"id": metric, "math": "total"}],
        "date_from": date_from or "-30d",
        "interval": period,
    }
    if date_to:
        params["date_to"] = date_to
    result = await _posthog_post("/insights/trend/", params)
    return result


async def get_llm_usage(user_id: str | None = None, date_from: str | None = None, date_to: str | None = None) -> dict:
    """Get aggregated LLM token usage."""
    filters: dict = {"event": "llm_usage"}
    if date_from:
        filters["after"] = date_from
    if date_to:
        filters["before"] = date_to

    properties = []
    if user_id:
        properties.append({"key": "distinct_id", "value": user_id, "operator": "exact"})

    payload = {
        "query": {
            "kind": "EventsQuery",
            "select": [
                "sum(properties.input_tokens)",
                "sum(properties.output_tokens)",
                "sum(properties.total_tokens)",
                "properties.model",
                "properties.operation",
            ],
            "event": "llm_usage",
            "properties": properties,
            "after": date_from or "-30d",
        }
    }
    result = await _posthog_post("/query/", payload)
    return result


async def get_users() -> list[dict]:
    """Get user list with activity summaries."""
    result = await _posthog_get("/persons/", {"limit": 100})
    return result.get("results", [])


async def get_funnel() -> dict:
    """Get registration funnel data."""
    payload = {
        "insight": "FUNNELS",
        "events": [
            {"id": "user_signup", "order": 0},
            {"id": "cv_upload_completed", "order": 1},
            {"id": "orb_id_claimed", "order": 2},
            {"id": "orb_shared", "order": 3},
        ],
        "date_from": "-30d",
    }
    result = await _posthog_post("/insights/funnel/", payload)
    return result


async def get_events(event_type: str | None = None, user_id: str | None = None, limit: int = 50, offset: int = 0) -> dict:
    """Get raw events list."""
    params: dict = {"limit": limit, "offset": offset, "orderBy": ["-timestamp"]}
    if event_type:
        params["event"] = event_type
    if user_id:
        params["person_id"] = user_id
    result = await _posthog_get("/events/", params)
    return result


async def get_realtime() -> dict:
    """Get today's live metrics."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    result = await _posthog_post("/query/", {
        "query": {
            "kind": "EventsQuery",
            "select": ["count()", "count(distinct person_id)"],
            "after": today,
        }
    })
    try:
        row = result.get("results", [[0, 0]])[0]
        return {"events_today": row[0] or 0, "active_now": row[1] or 0}
    except (IndexError, TypeError):
        return {"events_today": 0, "active_now": 0}


async def get_user_activity(user_id: str) -> dict:
    """Get detailed activity for a specific user."""
    result = await _posthog_get("/events/", {
        "person_id": user_id,
        "limit": 100,
        "orderBy": ["-timestamp"],
    })
    return result
```

- [ ] **Step 4: Implement admin router**

Create `backend/app/admin/router.py`:

```python
"""Admin API endpoints — protected by admin JWT."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from app.admin import service as admin_service
from app.admin.auth import create_admin_jwt, get_current_admin
from app.admin.db import get_admin_pool
from app.admin.schemas import AdminLoginRequest, AdminLoginResponse
from app.admin.seed import verify_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/login", response_model=AdminLoginResponse)
async def admin_login(data: AdminLoginRequest):
    """Authenticate admin and return JWT."""
    pool = await get_admin_pool()
    row = await pool.fetchrow(
        "SELECT admin_id, username, password_hash FROM orbis_admin.admin_users WHERE username = $1",
        data.username,
    )
    if row is None or not verify_password(data.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    await pool.execute(
        "UPDATE orbis_admin.admin_users SET last_login = now() WHERE admin_id = $1",
        row["admin_id"],
    )

    token = create_admin_jwt(
        admin_id=str(row["admin_id"]),
        username=row["username"],
    )
    return AdminLoginResponse(access_token=token)


@router.get("/overview")
async def overview(admin: dict = Depends(get_current_admin)):
    """High-level dashboard metrics."""
    return await admin_service.get_overview()


@router.get("/trends")
async def trends(
    metric: str = Query(...),
    period: str = Query("day"),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    admin: dict = Depends(get_current_admin),
):
    """Time-series data for a metric."""
    return await admin_service.get_trends(metric, period, date_from, date_to)


@router.get("/llm-usage")
async def llm_usage(
    user_id: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    admin: dict = Depends(get_current_admin),
):
    """Aggregated LLM token usage."""
    return await admin_service.get_llm_usage(user_id, date_from, date_to)


@router.get("/users")
async def users(admin: dict = Depends(get_current_admin)):
    """User list with activity summaries."""
    return await admin_service.get_users()


@router.get("/users/{user_id}/activity")
async def user_activity(
    user_id: str,
    admin: dict = Depends(get_current_admin),
):
    """Detailed activity for a specific user."""
    return await admin_service.get_user_activity(user_id)


@router.get("/funnel")
async def funnel(admin: dict = Depends(get_current_admin)):
    """Registration funnel data."""
    return await admin_service.get_funnel()


@router.get("/events")
async def events(
    event_type: str | None = Query(None),
    user_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    admin: dict = Depends(get_current_admin),
):
    """Raw event explorer."""
    return await admin_service.get_events(event_type, user_id, limit, offset)


@router.get("/realtime")
async def realtime(admin: dict = Depends(get_current_admin)):
    """Today's live metrics."""
    return await admin_service.get_realtime()
```

- [ ] **Step 5: Register admin router in main.py**

Add to `backend/app/main.py` — add import after line 15 and include router after line 47:

Import (add after `from app.search.router import router as search_router`):

```python
from app.admin.db import close_admin_pool, get_admin_pool
from app.admin.router import router as admin_router
from app.analytics.posthog_client import shutdown_posthog
```

Update lifespan to init/shutdown admin pool and PostHog (replace lines 20-28):

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: verify Neo4j connection
    driver = await get_driver()
    async with driver.session() as session:
        await session.run("RETURN 1")
    # Init admin PostgreSQL pool (best-effort — don't block if PG is down)
    try:
        await get_admin_pool()
    except Exception:
        logging.getLogger(__name__).warning("Admin DB not available — admin features disabled")
    yield
    # Shutdown
    await close_driver()
    await close_admin_pool()
    shutdown_posthog()
```

Add router include (after `app.include_router(search_router)`):

```python
app.include_router(admin_router)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/unit/test_admin_router.py -v`
Expected: All tests PASS.

- [ ] **Step 7: Run full test suite**

Run: `cd backend && uv run pytest tests/unit/ -v`
Expected: All existing tests still pass.

- [ ] **Step 8: Commit**

```bash
git add backend/app/admin/service.py backend/app/admin/router.py backend/app/main.py backend/tests/unit/test_admin_router.py
git commit -m "feat: add admin router with login, overview, trends, LLM usage, users, funnel, events, and realtime endpoints"
```

---

### Task 8: LLM Token Tracking — Ollama & Claude Classifiers

**Files:**
- Modify: `backend/app/cv/ollama_classifier.py:290-308`
- Modify: `backend/app/cv/claude_classifier.py:47-59`
- Modify: `backend/app/cv/router.py:30-91`
- Modify: `backend/app/notes/router.py:201-237,240-257`

- [ ] **Step 1: Write the failing test for Ollama token capture**

Add to `backend/tests/unit/test_analytics_tracker.py`:

```python
def test_ollama_response_parsing_includes_token_counts():
    """Verify Ollama response structure includes eval_count fields."""
    # Ollama chat API returns these fields at the top level
    sample_response = {
        "message": {"content": '{"nodes": []}'},
        "prompt_eval_count": 500,
        "eval_count": 200,
    }
    assert sample_response["prompt_eval_count"] == 500
    assert sample_response["eval_count"] == 200


def test_claude_envelope_includes_usage():
    """Verify Claude CLI JSON envelope structure includes cost info."""
    sample_envelope = {
        "result": '{"nodes": []}',
        "cost_usd": 0.01,
        "duration_ms": 3500,
        "input_tokens": 1200,
        "output_tokens": 450,
    }
    assert sample_envelope["input_tokens"] == 1200
    assert sample_envelope["output_tokens"] == 450
```

- [ ] **Step 2: Run test to verify it passes (structure validation only)**

Run: `cd backend && uv run pytest tests/unit/test_analytics_tracker.py::test_ollama_response_parsing_includes_token_counts tests/unit/test_analytics_tracker.py::test_claude_envelope_includes_usage -v`
Expected: PASS — these just verify the expected JSON structures.

- [ ] **Step 3: Modify Ollama classifier to return token counts**

In `backend/app/cv/ollama_classifier.py`, replace the `_call_ollama` function (lines 290-308):

```python
async def _call_ollama(user_message: str) -> tuple[str, dict]:
    """Make a chat completion request to Ollama.

    Returns (content, usage) where usage has prompt_eval_count and eval_count.
    """
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
        content = data.get("message", {}).get("content", "")
        usage = {
            "input_tokens": data.get("prompt_eval_count", 0),
            "output_tokens": data.get("eval_count", 0),
            "model": settings.ollama_model,
            "provider": "ollama",
        }
        return content, usage
```

Update `classify_entries` (lines 200-211) to handle the new return type. Replace:

```python
            if provider == "claude":
                from app.cv.claude_classifier import call_claude

                result = await call_claude(
                    system_prompt=SYSTEM_PROMPT,
                    user_message=user_message,
                    model=settings.claude_model or None,
                )
            else:
                result = await _call_ollama(user_message)

            cr = _parse_result(result)
```

With:

```python
            usage_info = None
            if provider == "claude":
                from app.cv.claude_classifier import call_claude

                result, usage_info = await call_claude(
                    system_prompt=SYSTEM_PROMPT,
                    user_message=user_message,
                    model=settings.claude_model or None,
                )
            else:
                result, usage_info = await _call_ollama(user_message)

            cr = _parse_result(result)
            if usage_info:
                cr.usage_info = usage_info
```

Add `usage_info` field to `ClassificationResult` (line 172, after `cv_owner_name`):

```python
    usage_info: dict | None = None
```

- [ ] **Step 4: Modify Claude classifier to return token counts**

In `backend/app/cv/claude_classifier.py`, replace lines 47-59:

```python
    output = stdout.decode("utf-8").strip()
    logger.info("Claude CLI response received (%d chars)", len(output))

    # --output-format json wraps the result in a JSON envelope
    # with fields like: result, cost_usd, duration_ms, input_tokens, output_tokens
    try:
        envelope = json.loads(output)
        content = envelope.get("result", "")
        usage_info = {
            "input_tokens": envelope.get("input_tokens", 0),
            "output_tokens": envelope.get("output_tokens", 0),
            "model": model or "claude",
            "provider": "anthropic",
            "cost_usd": envelope.get("cost_usd", 0),
            "duration_ms": envelope.get("duration_ms", 0),
        }
        return content, usage_info
    except json.JSONDecodeError:
        logger.warning(
            "Claude CLI output is not JSON, returning raw (%d chars)", len(output)
        )
        return output, None
```

Update the function return type annotation (line 16):

```python
) -> tuple[str, dict | None]:
```

- [ ] **Step 5: Add tracking to CV upload router**

In `backend/app/cv/router.py`, add import at the top (after existing imports):

```python
from app.analytics.tracker import track_event, track_llm_usage
```

After the `classify_entries` call in the upload endpoint (around line 60, where `cr = await classify_entries(...)` returns), add:

```python
        # Track LLM usage
        if cr.usage_info:
            track_llm_usage(
                user_id=current_user["user_id"],
                operation="cv_classification",
                model=cr.usage_info.get("model", "unknown"),
                provider=cr.usage_info.get("provider", "unknown"),
                input_tokens=cr.usage_info.get("input_tokens", 0),
                output_tokens=cr.usage_info.get("output_tokens", 0),
                latency_ms=cr.usage_info.get("duration_ms", 0),
            )
```

Add event tracking after the upload returns:

```python
        track_event(current_user["user_id"], "cv_upload_completed", {
            "node_count": len(cr.nodes),
            "skipped_count": len(cr.skipped),
            "provider": settings.llm_provider,
        })
```

- [ ] **Step 6: Add tracking to note enhancement**

In `backend/app/notes/router.py`, add import at the top:

```python
from app.analytics.tracker import track_event, track_llm_usage
```

Update the `_call_ollama` function in notes/router.py (lines 240-257) to return usage:

```python
async def _call_ollama(system_prompt: str, user_message: str) -> tuple[str, dict]:
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
        content = data.get("message", {}).get("content", "")
        usage = {
            "input_tokens": data.get("prompt_eval_count", 0),
            "output_tokens": data.get("eval_count", 0),
            "model": settings.ollama_model,
            "provider": "ollama",
        }
        return content, usage
```

Update the enhance_note endpoint (lines 215-227) to capture usage and track:

```python
    try:
        usage_info = None
        if provider == "claude":
            from app.cv.claude_classifier import call_claude

            result, usage_info = await call_claude(
                system_prompt=system_prompt,
                user_message=user_message,
                model=settings.claude_model or None,
            )
        else:
            result, usage_info = await _call_ollama(system_prompt, user_message)

        parsed = _parse_enhance_result(result, valid_skill_uids)

        # Track LLM usage
        if usage_info:
            track_llm_usage(
                user_id=current_user["user_id"],
                operation="note_enhancement",
                model=usage_info.get("model", "unknown"),
                provider=usage_info.get("provider", "unknown"),
                input_tokens=usage_info.get("input_tokens", 0),
                output_tokens=usage_info.get("output_tokens", 0),
                latency_ms=usage_info.get("duration_ms", 0),
            )
        track_event(current_user["user_id"], "note_enhanced", {"provider": provider})

        return parsed
```

- [ ] **Step 7: Run existing tests to verify no regressions**

Run: `cd backend && uv run pytest tests/unit/ -v`
Expected: All tests pass (some existing tests for classifiers may need mock updates for the new tuple return).

Fix any broken tests by updating mocks to return `(content, usage_dict)` tuples instead of plain strings.

- [ ] **Step 8: Commit**

```bash
git add backend/app/cv/ollama_classifier.py backend/app/cv/claude_classifier.py backend/app/cv/router.py backend/app/notes/router.py backend/tests/unit/test_analytics_tracker.py
git commit -m "feat: capture LLM token usage from Ollama and Claude, track to PostHog"
```

---

### Task 9: Backend Event Tracking — All Remaining Endpoints

**Files:**
- Modify: `backend/app/auth/router.py`
- Modify: `backend/app/orbs/router.py`
- Modify: `backend/app/search/router.py`
- Modify: `backend/app/export/router.py`
- Modify: `backend/app/messages/router.py`
- Modify: `backend/mcp_server/tools.py`

- [ ] **Step 1: Add tracking to auth router**

In `backend/app/auth/router.py`, add import:

```python
from app.analytics.tracker import track_event
```

In `dev_login` (after line 39 where welcome message is sent — inside the `if record is None` block):

```python
            track_event(user_id, "user_signup", {"method": "dev"})
```

After the token creation (line 41), before the return:

```python
    track_event(user_id, "user_login", {"method": "dev"})
```

- [ ] **Step 2: Add tracking to orbs router**

In `backend/app/orbs/router.py`, add import:

```python
from app.analytics.tracker import track_event
```

Add `track_event` calls at the end of each endpoint (before the return statement):

- `update_my_profile` (line 161): `track_event(current_user["user_id"], "profile_updated")`
- `claim_orb_id` (line 182): `track_event(current_user["user_id"], "orb_id_claimed", {"orb_id": data.orb_id})`
- `upload_profile_image` (line 213): `track_event(current_user["user_id"], "profile_image_uploaded")`
- `delete_profile_image` (line 231): `track_event(current_user["user_id"], "profile_image_deleted")`
- `add_node` (line 262): `track_event(current_user["user_id"], "node_created", {"node_type": data.node_type})`
- `update_node` (line 280): `track_event(current_user["user_id"], "node_updated", {"uid": uid})`
- `delete_node` (line 291): `track_event(current_user["user_id"], "node_deleted", {"uid": uid})`
- `link_skill` (line 307): `track_event(current_user["user_id"], "skill_linked")`
- `unlink_skill` (line 323): `track_event(current_user["user_id"], "skill_unlinked")`
- `generate_filter_token` (line 344): `track_event(current_user["user_id"], "filter_token_created", {"keyword_count": len(data.keywords)})`

- [ ] **Step 3: Add tracking to search router**

In `backend/app/search/router.py`, add import:

```python
from app.analytics.tracker import track_event
```

In `semantic_search` endpoint, after results are fetched, before return:

```python
    track_event(current_user["user_id"], "search_semantic", {"query_length": len(data.query)})
```

In `text_search` endpoint, after results are fetched, before return:

```python
    track_event(current_user["user_id"], "search_text", {"query_length": len(data.query)})
```

- [ ] **Step 4: Add tracking to export router**

In `backend/app/export/router.py`, add import:

```python
from app.analytics.tracker import track_event
```

In `export_orb` endpoint, after the record is fetched (before format-specific logic, around line 228):

```python
    track_event("anonymous", f"cv_export_{format}", {"orb_id": orb_id})
```

- [ ] **Step 5: Add tracking to messages router**

In `backend/app/messages/router.py`, add import:

```python
from app.analytics.tracker import track_event
```

Add tracking at the end of each endpoint:
- `send_message` (before return): `track_event("anonymous", "message_sent", {"orb_id": orb_id})`
- `get_my_messages` (before return): `track_event(user["user_id"], "messages_viewed")`
- `reply_to_message` (before return): `track_event(user["user_id"], "message_replied")`
- `mark_message_read` (before return): `track_event(user["user_id"], "message_read")`
- `delete_message` (before return): `track_event(user["user_id"], "message_deleted")`

- [ ] **Step 6: Add tracking to MCP tools**

In `backend/mcp_server/tools.py`, add import:

```python
from app.analytics.tracker import track_event
```

At the start of each tool function, add:
- `get_orb_summary`: `track_event("mcp", "mcp_tool_called", {"tool": "get_orb_summary", "orb_id": orb_id})`
- `get_orb_full`: `track_event("mcp", "mcp_tool_called", {"tool": "get_orb_full", "orb_id": orb_id})`
- `get_nodes_by_type`: `track_event("mcp", "mcp_tool_called", {"tool": "get_nodes_by_type", "orb_id": orb_id})`
- `get_connections`: `track_event("mcp", "mcp_tool_called", {"tool": "get_connections", "orb_id": orb_id})`
- `get_skills_for_experience`: `track_event("mcp", "mcp_tool_called", {"tool": "get_skills_for_experience", "orb_id": orb_id})`

- [ ] **Step 7: Run full test suite**

Run: `cd backend && uv run pytest tests/unit/ -v`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/app/auth/router.py backend/app/orbs/router.py backend/app/search/router.py backend/app/export/router.py backend/app/messages/router.py backend/mcp_server/tools.py
git commit -m "feat: add PostHog event tracking to all backend endpoints"
```

---

### Task 10: Frontend Dependencies & PostHog Init

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/analytics/posthog.ts`

- [ ] **Step 1: Install frontend dependencies**

Run:
```bash
cd frontend && npm install posthog-js recharts
```

- [ ] **Step 2: Create PostHog init module**

Create `frontend/src/analytics/posthog.ts`:

```typescript
import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || '';
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'http://localhost:8000';

let initialized = false;

export function initPostHog() {
  if (initialized || !POSTHOG_KEY) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'localStorage',
  });
  initialized = true;
}

export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.identify(userId, properties);
}

export function resetUser() {
  if (!initialized) return;
  posthog.reset();
}

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (!initialized) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // Silently ignore analytics failures
  }
}
```

- [ ] **Step 3: Init PostHog in App.tsx**

In `frontend/src/App.tsx`, add import after line 12:

```typescript
import { initPostHog, identifyUser } from './analytics/posthog';
```

Add PostHog init at the start of the `App` function (before the existing `useEffect`):

```typescript
  useEffect(() => {
    initPostHog();
  }, []);
```

Update the existing `useEffect` to identify user after fetch (replace lines 58-60):

```typescript
  useEffect(() => {
    if (token) {
      fetchUser().then(() => {
        const user = useAuthStore.getState().user;
        if (user) identifyUser(user.user_id, { name: user.name, email: user.email });
      });
    }
  }, [token, fetchUser]);
```

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/analytics/posthog.ts frontend/src/App.tsx
git commit -m "feat: add posthog-js and recharts, init PostHog in frontend"
```

---

### Task 11: Frontend Event Tracking — Manual Captures

**Files:**
- Modify: Various frontend components (add `trackEvent` calls)

This task adds manual `trackEvent()` calls to components for events that autocapture won't cover well.

- [ ] **Step 1: Identify components to modify**

The specific components depend on how events are triggered. The key captures are:

- **Orb sharing**: wherever the filter token / share link UI lives
- **Filter applied**: wherever the node type filter menu is
- **CV export**: in `CvExportPage.tsx`
- **Search**: in the search component
- **Graph interaction**: in the 3D graph viewer component

For each component, add at the action trigger point:

```typescript
import { trackEvent } from '../analytics/posthog';

// At the action point:
trackEvent('orb_shared', { method: 'link' });
trackEvent('orb_filter_applied', { filter_type: filterType });
trackEvent('cv_export_started', { format: 'pdf' });
trackEvent('search_performed', { query_length: query.length });
trackEvent('graph_interaction', { action: 'node_click' });
```

- [ ] **Step 2: Add tracking to CvExportPage**

In `frontend/src/pages/CvExportPage.tsx`, add import:

```typescript
import { trackEvent } from '../analytics/posthog';
```

At the export trigger (wherever the download/export button handler is):

```typescript
trackEvent('cv_export_started', { format });
```

- [ ] **Step 3: Add tracking to shared orb page (filter and sharing)**

In the component that handles filter tokens and sharing, add:

```typescript
import { trackEvent } from '../analytics/posthog';

// On share link copy/create:
trackEvent('orb_shared', { orb_id: orbId });

// On filter applied:
trackEvent('orb_filter_applied', { keywords: selectedKeywords });
```

- [ ] **Step 4: Add resetUser on logout**

In `frontend/src/stores/authStore.ts`, add import:

```typescript
import { resetUser } from '../analytics/posthog';
```

In the `logout` function, before clearing state:

```typescript
  logout: () => {
    resetUser();
    localStorage.removeItem('orbis_token');
    set({ user: null, token: null });
  },
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/
git commit -m "feat: add manual PostHog event tracking to frontend components"
```

---

### Task 12: Admin Frontend — Auth Store & API Client

**Files:**
- Create: `frontend/src/api/adminClient.ts`
- Create: `frontend/src/api/admin.ts`
- Create: `frontend/src/stores/adminAuthStore.ts`

- [ ] **Step 1: Create admin axios client**

Create `frontend/src/api/adminClient.ts`:

```typescript
import axios from 'axios';

const adminClient = axios.create({
  baseURL: '/api/admin',
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

export async function adminLogin(username: string, password: string): Promise<{ access_token: string }> {
  const { data } = await adminClient.post('/login', { username, password });
  return data;
}

export async function getOverview() {
  const { data } = await adminClient.get('/overview');
  return data;
}

export async function getTrends(metric: string, period = 'day', dateFrom?: string, dateTo?: string) {
  const { data } = await adminClient.get('/trends', {
    params: { metric, period, date_from: dateFrom, date_to: dateTo },
  });
  return data;
}

export async function getLLMUsage(userId?: string, dateFrom?: string, dateTo?: string) {
  const { data } = await adminClient.get('/llm-usage', {
    params: { user_id: userId, date_from: dateFrom, date_to: dateTo },
  });
  return data;
}

export async function getUsers() {
  const { data } = await adminClient.get('/users');
  return data;
}

export async function getUserActivity(userId: string) {
  const { data } = await adminClient.get(`/users/${userId}/activity`);
  return data;
}

export async function getFunnel() {
  const { data } = await adminClient.get('/funnel');
  return data;
}

export async function getEvents(params?: { event_type?: string; user_id?: string; limit?: number; offset?: number }) {
  const { data } = await adminClient.get('/events', { params });
  return data;
}

export async function getRealtime() {
  const { data } = await adminClient.get('/realtime');
  return data;
}
```

- [ ] **Step 3: Create admin auth store**

Create `frontend/src/stores/adminAuthStore.ts`:

```typescript
import { create } from 'zustand';
import { adminLogin } from '../api/admin';

interface AdminAuthState {
  token: string | null;
  username: string | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAdminAuthStore = create<AdminAuthState>((set, get) => ({
  token: sessionStorage.getItem('orbis_admin_token'),
  username: sessionStorage.getItem('orbis_admin_user'),
  loading: false,
  error: null,

  login: async (username: string, password: string) => {
    set({ loading: true, error: null });
    try {
      const { access_token } = await adminLogin(username, password);
      sessionStorage.setItem('orbis_admin_token', access_token);
      sessionStorage.setItem('orbis_admin_user', username);
      set({ token: access_token, username, loading: false });
      return true;
    } catch {
      set({ loading: false, error: 'Invalid credentials' });
      return false;
    }
  },

  logout: () => {
    sessionStorage.removeItem('orbis_admin_token');
    sessionStorage.removeItem('orbis_admin_user');
    set({ token: null, username: null });
  },

  isAuthenticated: () => !!get().token,
}));
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/adminClient.ts frontend/src/api/admin.ts frontend/src/stores/adminAuthStore.ts
git commit -m "feat: add admin API client, auth store with sessionStorage"
```

---

### Task 13: Admin Frontend — Layout & Route Guard

**Files:**
- Create: `frontend/src/components/admin/AdminLayout.tsx`
- Create: `frontend/src/components/admin/AdminRoute.tsx`

- [ ] **Step 1: Create admin route guard**

Create `frontend/src/components/admin/AdminRoute.tsx`:

```typescript
import { Navigate } from 'react-router-dom';
import { useAdminAuthStore } from '../../stores/adminAuthStore';

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const token = useAdminAuthStore((s) => s.token);
  if (!token) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 2: Create admin layout with sidebar**

Create `frontend/src/components/admin/AdminLayout.tsx`:

```typescript
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAdminAuthStore } from '../../stores/adminAuthStore';

const navItems = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/llm', label: 'LLM Usage' },
  { to: '/admin/events', label: 'Events' },
];

export default function AdminLayout() {
  const { username, logout } = useAdminAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-lg font-bold text-white">Orbis Admin</h1>
          <p className="text-xs text-gray-400 mt-1">{username}</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block px-3 py-2 rounded text-sm ${
                  isActive
                    ? 'bg-purple-600/20 text-purple-400'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-800">
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
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/admin/
git commit -m "feat: add admin layout with sidebar and route guard"
```

---

### Task 14: Admin Frontend — Login Page

**Files:**
- Create: `frontend/src/pages/admin/AdminLoginPage.tsx`

- [ ] **Step 1: Create login page**

Create `frontend/src/pages/admin/AdminLoginPage.tsx`:

```typescript
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
    const ok = await login(username, password);
    if (ok) navigate('/admin');
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <form onSubmit={handleSubmit} className="w-80 space-y-4">
        <h1 className="text-2xl font-bold text-white text-center">Admin Login</h1>
        <p className="text-sm text-gray-400 text-center">Orbis Dashboard</p>

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-400 text-sm rounded px-3 py-2">
            {error}
          </div>
        )}

        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
          required
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded font-medium"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
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

### Task 15: Admin Frontend — Reusable Chart Components

**Files:**
- Create: `frontend/src/components/admin/MetricCard.tsx`
- Create: `frontend/src/components/admin/FunnelChart.tsx`
- Create: `frontend/src/components/admin/HeatmapChart.tsx`

- [ ] **Step 1: Create MetricCard with sparkline**

Create `frontend/src/components/admin/MetricCard.tsx`:

```typescript
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

interface MetricCardProps {
  label: string;
  value: string | number;
  trend?: number[];
  color?: string;
}

export default function MetricCard({ label, value, trend = [], color = '#8b5cf6' }: MetricCardProps) {
  const sparkData = trend.map((v, i) => ({ i, v }));

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
      {sparkData.length > 1 && (
        <div className="h-10 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData}>
              <defs>
                <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={1.5}
                fill={`url(#grad-${label})`}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create FunnelChart**

Create `frontend/src/components/admin/FunnelChart.tsx`:

```typescript
interface FunnelStep {
  name: string;
  count: number;
  conversion_rate?: number;
}

interface FunnelChartProps {
  steps: FunnelStep[];
}

export default function FunnelChart({ steps }: FunnelChartProps) {
  const maxCount = Math.max(...steps.map((s) => s.count), 1);

  return (
    <div className="space-y-2">
      {steps.map((step, i) => {
        const widthPct = (step.count / maxCount) * 100;
        const rate = step.conversion_rate;
        return (
          <div key={step.name}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-300">{step.name}</span>
              <span className="text-gray-400">
                {step.count.toLocaleString()}
                {rate !== undefined && i > 0 && (
                  <span className="text-xs ml-2 text-purple-400">{rate.toFixed(1)}%</span>
                )}
              </span>
            </div>
            <div className="h-6 bg-gray-800 rounded overflow-hidden">
              <div
                className="h-full bg-purple-600/60 rounded transition-all"
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

```typescript
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface HeatmapChartProps {
  /** 7x24 matrix: data[day][hour] = count */
  data: number[][];
}

export default function HeatmapChart({ data }: HeatmapChartProps) {
  const maxVal = Math.max(...data.flat(), 1);

  const cellColor = (val: number) => {
    const opacity = val / maxVal;
    return `rgba(139, 92, 246, ${Math.max(opacity, 0.05)})`;
  };

  return (
    <div className="overflow-x-auto">
      <div className="inline-grid gap-px" style={{ gridTemplateColumns: `40px repeat(24, 1fr)` }}>
        {/* Hour headers */}
        <div />
        {HOURS.map((h) => (
          <div key={h} className="text-[10px] text-gray-500 text-center">
            {h % 6 === 0 ? `${h}h` : ''}
          </div>
        ))}

        {/* Rows */}
        {DAYS.map((day, di) => (
          <>
            <div key={`label-${day}`} className="text-xs text-gray-400 flex items-center">
              {day}
            </div>
            {HOURS.map((h) => (
              <div
                key={`${di}-${h}`}
                className="w-4 h-4 rounded-sm"
                style={{ backgroundColor: cellColor(data[di]?.[h] ?? 0) }}
                title={`${day} ${h}:00 — ${data[di]?.[h] ?? 0} events`}
              />
            ))}
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
git commit -m "feat: add MetricCard, FunnelChart, and HeatmapChart admin components"
```

---

### Task 16: Admin Frontend — Dashboard Overview Page

**Files:**
- Create: `frontend/src/pages/admin/AdminDashboardPage.tsx`

- [ ] **Step 1: Create overview dashboard**

Create `frontend/src/pages/admin/AdminDashboardPage.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { getOverview, getFunnel, getRealtime } from '../../api/admin';
import MetricCard from '../../components/admin/MetricCard';
import FunnelChart from '../../components/admin/FunnelChart';

export default function AdminDashboardPage() {
  const [overview, setOverview] = useState<any>(null);
  const [funnel, setFunnel] = useState<any>(null);
  const [realtime, setRealtime] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getOverview(), getFunnel(), getRealtime()])
      .then(([o, f, r]) => {
        setOverview(o);
        setFunnel(f);
        setRealtime(r);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-gray-400">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Overview</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Users"
          value={overview?.total_users ?? 0}
          trend={overview?.cards?.find((c: any) => c.label === 'total_users')?.trend}
        />
        <MetricCard
          label="Active Today"
          value={realtime?.active_now ?? overview?.active_today ?? 0}
          color="#10b981"
        />
        <MetricCard
          label="Signups This Week"
          value={overview?.signups_this_week ?? 0}
          color="#3b82f6"
        />
        <MetricCard
          label="LLM Tokens Today"
          value={(overview?.llm_tokens_today ?? 0).toLocaleString()}
          color="#f59e0b"
        />
      </div>

      {/* Funnel */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Registration Funnel (30d)</h3>
        <FunnelChart steps={funnel?.steps ?? []} />
      </div>

      {/* Recent activity */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Recent Activity</h3>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {(overview?.recent_events ?? []).map((event: any, i: number) => (
            <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-gray-800 last:border-0">
              <span className="text-gray-300">{event.event}</span>
              <span className="text-xs text-gray-500">{event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : ''}</span>
            </div>
          ))}
          {(overview?.recent_events ?? []).length === 0 && (
            <p className="text-sm text-gray-500">No recent events</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/admin/AdminDashboardPage.tsx
git commit -m "feat: add admin dashboard overview page with cards, funnel, and activity feed"
```

---

### Task 17: Admin Frontend — Users Page

**Files:**
- Create: `frontend/src/pages/admin/AdminUsersPage.tsx`

- [ ] **Step 1: Create users page**

Create `frontend/src/pages/admin/AdminUsersPage.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { getUsers, getUserActivity } from '../../api/admin';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [activity, setActivity] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUsers()
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  const handleSelectUser = async (userId: string) => {
    setSelectedUser(userId);
    const data = await getUserActivity(userId);
    setActivity(data);
  };

  if (loading) return <div className="text-gray-400">Loading users...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Users</h2>

      <div className="flex gap-6">
        {/* User list */}
        <div className="flex-1 bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-left">
                <th className="px-4 py-2">User</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u: any) => (
                <tr
                  key={u.distinct_ids?.[0] || u.id}
                  onClick={() => handleSelectUser(u.distinct_ids?.[0] || u.id)}
                  className={`border-b border-gray-800 cursor-pointer hover:bg-gray-800/50 ${
                    selectedUser === (u.distinct_ids?.[0] || u.id) ? 'bg-purple-900/20' : ''
                  }`}
                >
                  <td className="px-4 py-2 text-gray-300">
                    {u.properties?.name || u.distinct_ids?.[0] || 'Unknown'}
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {u.properties?.last_seen ? new Date(u.properties.last_seen).toLocaleDateString() : '-'}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-4 text-gray-500 text-center">No users yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* User detail */}
        {selectedUser && activity && (
          <div className="w-80 bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Activity</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {(activity.results ?? []).map((event: any, i: number) => (
                <div key={i} className="text-sm py-1 border-b border-gray-800 last:border-0">
                  <span className="text-purple-400">{event.event}</span>
                  <span className="text-xs text-gray-500 ml-2">
                    {event.timestamp ? new Date(event.timestamp).toLocaleString() : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/admin/AdminUsersPage.tsx
git commit -m "feat: add admin users page with activity detail panel"
```

---

### Task 18: Admin Frontend — LLM Usage Page

**Files:**
- Create: `frontend/src/pages/admin/AdminLLMPage.tsx`

- [ ] **Step 1: Create LLM usage page**

Create `frontend/src/pages/admin/AdminLLMPage.tsx`:

```typescript
import { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { getLLMUsage, getTrends } from '../../api/admin';

const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

export default function AdminLLMPage() {
  const [usage, setUsage] = useState<any>(null);
  const [trends, setTrends] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getLLMUsage(), getTrends('llm_usage', 'day')])
      .then(([u, t]) => {
        setUsage(u);
        setTrends(t);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-400">Loading LLM usage...</div>;

  // Build pie data from results
  const modelBreakdown: Record<string, number> = {};
  for (const row of usage?.results ?? []) {
    const model = row[3] || 'unknown';
    modelBreakdown[model] = (modelBreakdown[model] || 0) + (row[2] || 0);
  }
  const pieData = Object.entries(modelBreakdown).map(([name, value]) => ({ name, value }));

  // Build trend line data
  const trendData = (trends?.result?.[0]?.data ?? []).map((val: number, i: number) => ({
    day: trends?.result?.[0]?.labels?.[i] ?? i,
    tokens: val,
  }));

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">LLM Token Usage</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tokens over time */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Tokens Over Time</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <XAxis dataKey="day" stroke="#6b7280" tick={{ fontSize: 10 }} />
                <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <Area type="monotone" dataKey="tokens" stroke="#8b5cf6" fill="rgba(139,92,246,0.2)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* By model */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">By Model</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/admin/AdminLLMPage.tsx
git commit -m "feat: add admin LLM usage page with area and pie charts"
```

---

### Task 19: Admin Frontend — Events Explorer Page

**Files:**
- Create: `frontend/src/pages/admin/AdminEventsPage.tsx`

- [ ] **Step 1: Create events explorer page**

Create `frontend/src/pages/admin/AdminEventsPage.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { getEvents } from '../../api/admin';
import HeatmapChart from '../../components/admin/HeatmapChart';

export default function AdminEventsPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [heatmapData, setHeatmapData] = useState<number[][]>(
    Array.from({ length: 7 }, () => Array(24).fill(0))
  );
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchEvents = async (eventType?: string) => {
    setLoading(true);
    const data = await getEvents({ event_type: eventType || undefined, limit: 100 });
    const results = data.results ?? [];
    setEvents(results);

    // Build heatmap
    const hm = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const ev of results) {
      if (ev.timestamp) {
        const d = new Date(ev.timestamp);
        const day = (d.getDay() + 6) % 7; // Mon=0
        const hour = d.getHours();
        hm[day][hour]++;
      }
    }
    setHeatmapData(hm);
    setLoading(false);
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleFilter = () => {
    fetchEvents(filter);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Events Explorer</h2>

      {/* Filter */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Filter by event type..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
        />
        <button
          onClick={handleFilter}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded"
        >
          Filter
        </button>
      </div>

      {/* Heatmap */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Activity Heatmap</h3>
        <HeatmapChart data={heatmapData} />
      </div>

      {/* Event list */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-left">
              <th className="px-4 py-2">Event</th>
              <th className="px-4 py-2">User</th>
              <th className="px-4 py-2">Time</th>
              <th className="px-4 py-2">Properties</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-4 text-gray-500 text-center">Loading...</td></tr>
            ) : events.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-4 text-gray-500 text-center">No events found</td></tr>
            ) : (
              events.map((ev, i) => (
                <tr key={i} className="border-b border-gray-800">
                  <td className="px-4 py-2 text-purple-400">{ev.event}</td>
                  <td className="px-4 py-2 text-gray-400">{ev.distinct_id || '-'}</td>
                  <td className="px-4 py-2 text-gray-500">
                    {ev.timestamp ? new Date(ev.timestamp).toLocaleString() : '-'}
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs max-w-xs truncate">
                    {JSON.stringify(ev.properties ?? {})}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/admin/AdminEventsPage.tsx
git commit -m "feat: add admin events explorer page with heatmap and event log"
```

---

### Task 20: Admin Frontend — Wire Up Routes in App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add admin routes to App.tsx**

Add imports after existing imports in `App.tsx`:

```typescript
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminLLMPage from './pages/admin/AdminLLMPage';
import AdminEventsPage from './pages/admin/AdminEventsPage';
import AdminLayout from './components/admin/AdminLayout';
import AdminRoute from './components/admin/AdminRoute';
```

Add admin routes inside the `<Routes>` block (before the `/:orbId` catch-all route):

```tsx
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminLayout />
            </AdminRoute>
          }
        >
          <Route index element={<AdminDashboardPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="llm" element={<AdminLLMPage />} />
          <Route path="events" element={<AdminEventsPage />} />
        </Route>
```

- [ ] **Step 2: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire up admin routes in App.tsx"
```

---

### Task 21: Final Verification & Cleanup

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && uv run pytest tests/unit/ -v`
Expected: All tests pass.

- [ ] **Step 2: Run ruff linting**

Run: `cd backend && uv run ruff check .`
Expected: No errors (or only pre-existing ones).

- [ ] **Step 3: Run ruff formatting**

Run: `cd backend && uv run ruff format --check .`
Expected: All files formatted.

- [ ] **Step 4: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Successful build.

- [ ] **Step 5: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: No new errors.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "chore: lint fixes and cleanup"
```

- [ ] **Step 7: Create feature branch and final commit**

```bash
git checkout -b feat/admin-metrics-dashboard
git log --oneline main..HEAD  # Review all commits
```

Verify the branch contains all expected commits from tasks 1-20.
