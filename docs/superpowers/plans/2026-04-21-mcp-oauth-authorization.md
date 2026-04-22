# MCP OAuth 2.1 Authorization Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an OAuth 2.1 / MCP 2025-03 authorization server so ChatGPT, claude.ai web, Gemini, and any other OAuth-based AI client can connect to Orbis via a standard browser consent flow, alongside the existing `X-MCP-Key` paths.

**Architecture:** New `backend/app/oauth/` module serving DCR + authorize + token + revoke + discovery endpoints against four new Postgres tables. The MCP server gets a Postgres-backed `resolve_oauth_token` and a third middleware branch (`Authorization: Bearer oauth_…`) that routes into the same `_current_user_id` / `_current_share_context` ContextVars the share-token work introduced. A new React consent page + `/myorbis/connected-ai` grant manager complete the user-facing surface.

**Tech Stack:** Python 3.12 + FastAPI + asyncpg + pydantic. React 19 + TypeScript + Vite 8 + Vitest + Tailwind v4. Postgres 16 (existing).

**Spec:** `docs/superpowers/specs/2026-04-21-mcp-oauth-authorization-design.md`

---

## Task 1: Postgres schema + token + PKCE primitives + DAL

Creates all four new Postgres tables and the pure-function utilities for opaque-token generation, sha256 hashing, and PKCE S256 verification. Also the DAL that every endpoint will use.

**Files:**
- Create: `backend/app/oauth/__init__.py`
- Create: `backend/app/oauth/schema.sql`
- Create: `backend/app/oauth/tokens.py`
- Create: `backend/app/oauth/pkce.py`
- Create: `backend/app/oauth/db.py`
- Modify: `backend/app/main.py` (call `ensure_oauth_schema` on startup)
- Test: `backend/tests/unit/test_oauth_tokens.py`
- Test: `backend/tests/unit/test_oauth_pkce.py`
- Test: `backend/tests/unit/test_oauth_db.py`

- [ ] **Step 1: Create `backend/app/oauth/__init__.py`**

Single-line module marker:

```python
"""OAuth 2.1 authorization server for MCP clients."""
```

- [ ] **Step 2: Create `backend/app/oauth/schema.sql`**

```sql
-- MCP OAuth 2.1 authorization server tables.
-- All tables are additive; no existing data is touched.

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id                  UUID PRIMARY KEY,
  client_secret_hash         TEXT,
  client_name                TEXT NOT NULL,
  redirect_uris              TEXT[] NOT NULL,
  token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
  registered_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  registered_from_ip         INET,
  registered_user_agent      TEXT,
  disabled_at                TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_oauth_clients_registered_at
  ON oauth_clients(registered_at DESC);

CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  code                  TEXT PRIMARY KEY,
  client_id             UUID NOT NULL REFERENCES oauth_clients(client_id),
  user_id               TEXT NOT NULL,
  share_token_id        TEXT,
  scope                 TEXT NOT NULL DEFAULT 'orbis.read',
  redirect_uri          TEXT NOT NULL,
  code_challenge        TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL,
  expires_at            TIMESTAMPTZ NOT NULL,
  consumed_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires
  ON oauth_authorization_codes(expires_at);

CREATE TABLE IF NOT EXISTS oauth_access_tokens (
  token_hash      TEXT PRIMARY KEY,
  client_id       UUID NOT NULL REFERENCES oauth_clients(client_id),
  user_id         TEXT NOT NULL,
  share_token_id  TEXT,
  scope           TEXT NOT NULL,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  last_used_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_oauth_access_user
  ON oauth_access_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_access_expires
  ON oauth_access_tokens(expires_at);

CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  token_hash      TEXT PRIMARY KEY,
  client_id       UUID NOT NULL REFERENCES oauth_clients(client_id),
  user_id         TEXT NOT NULL,
  share_token_id  TEXT,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  rotated_to      TEXT
);

CREATE INDEX IF NOT EXISTS idx_oauth_refresh_user
  ON oauth_refresh_tokens(user_id);
```

- [ ] **Step 3: Write failing test for token + hash utilities**

Create `backend/tests/unit/test_oauth_tokens.py`:

```python
from app.oauth.tokens import generate_opaque_token, hash_token


class TestGenerateOpaqueToken:
    def test_has_expected_prefix(self):
        tok = generate_opaque_token("oauth")
        assert tok.startswith("oauth_")

    def test_is_url_safe(self):
        tok = generate_opaque_token("oauth")
        # urlsafe_b64 produces only [A-Za-z0-9_-]
        body = tok[len("oauth_"):]
        import re
        assert re.fullmatch(r"[A-Za-z0-9_-]+", body)

    def test_is_random(self):
        seen = {generate_opaque_token("oauth") for _ in range(50)}
        assert len(seen) == 50

    def test_length_is_sufficient_entropy(self):
        tok = generate_opaque_token("oauth")
        # 32 random bytes → ~43 urlsafe chars
        body = tok[len("oauth_"):]
        assert len(body) >= 40


class TestHashToken:
    def test_hash_is_sha256_hex(self):
        h = hash_token("oauth_abc")
        assert len(h) == 64
        int(h, 16)  # must be valid hex

    def test_hash_is_deterministic(self):
        assert hash_token("oauth_abc") == hash_token("oauth_abc")

    def test_different_tokens_hash_differently(self):
        assert hash_token("oauth_a") != hash_token("oauth_b")
```

- [ ] **Step 4: Run tests to confirm they fail**

```bash
cd backend && uv run pytest tests/unit/test_oauth_tokens.py -v
```
Expected: FAIL with `ModuleNotFoundError: No module named 'app.oauth.tokens'`.

- [ ] **Step 5: Implement `backend/app/oauth/tokens.py`**

```python
"""Opaque token generation + sha256 hashing for OAuth artifacts."""

from __future__ import annotations

import hashlib
import secrets


def generate_opaque_token(prefix: str) -> str:
    """Generate a prefixed, URL-safe opaque token.

    The prefix is purely informational — it lets logs and DB dumps
    distinguish token kinds at a glance (`oauth_`, `refresh_`, etc.).
    Authorization always hashes the full string, so the prefix has no
    security role.
    """
    body = secrets.token_urlsafe(32)
    return f"{prefix}_{body}"


def hash_token(raw: str) -> str:
    """Return sha256 hex digest of the raw token.

    Orbis stores only this hash. A DB dump therefore never exposes
    live bearer tokens.
    """
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
```

- [ ] **Step 6: Run tokens tests to confirm they pass**

```bash
cd backend && uv run pytest tests/unit/test_oauth_tokens.py -v
```
Expected: 7 PASS.

- [ ] **Step 7: Write failing test for PKCE**

Create `backend/tests/unit/test_oauth_pkce.py`:

```python
import base64
import hashlib

from app.oauth.pkce import verify_pkce_s256


def _compute_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


class TestVerifyPkceS256:
    def test_matching_verifier_and_challenge(self):
        verifier = "my-test-verifier-at-least-43-chars-long-abc123"
        challenge = _compute_challenge(verifier)
        assert verify_pkce_s256(verifier, challenge) is True

    def test_mismatching_verifier(self):
        challenge = _compute_challenge("original-verifier-abc")
        assert verify_pkce_s256("different-verifier", challenge) is False

    def test_empty_verifier_rejected(self):
        assert verify_pkce_s256("", "whatever") is False

    def test_empty_challenge_rejected(self):
        assert verify_pkce_s256("my-verifier", "") is False

    def test_constant_time_comparison(self):
        # Smoke: two wrong verifiers of different lengths both return False
        # and don't raise — if we used string == we'd leak length via timing.
        challenge = _compute_challenge("real-verifier-xyz")
        assert verify_pkce_s256("a", challenge) is False
        assert verify_pkce_s256("a" * 1000, challenge) is False
```

- [ ] **Step 8: Run PKCE tests, confirm FAIL, implement `backend/app/oauth/pkce.py`**

```python
"""PKCE S256 verifier."""

from __future__ import annotations

import base64
import hashlib
import hmac


def verify_pkce_s256(code_verifier: str, code_challenge: str) -> bool:
    """Return True iff base64url(sha256(code_verifier)) == code_challenge.

    Uses `hmac.compare_digest` for constant-time equality to avoid
    leaking length through timing side channels.
    """
    if not code_verifier or not code_challenge:
        return False
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    computed = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return hmac.compare_digest(computed, code_challenge)
```

- [ ] **Step 9: Run PKCE tests, confirm PASS**

```bash
cd backend && uv run pytest tests/unit/test_oauth_pkce.py -v
```
Expected: 5 PASS.

- [ ] **Step 10: Write failing test for DAL — client registration + code issuance + token lookup**

Create `backend/tests/unit/test_oauth_db.py`:

```python
"""Tests for the OAuth Postgres DAL.

Uses the existing `pg_pool` fixture (real Postgres in docker compose) —
this is an integration-style unit test in keeping with other Postgres
DAL tests in this repo (e.g. test_cv_jobs_db.py).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.oauth import db as oauth_db
from app.oauth.tokens import generate_opaque_token, hash_token


@pytest.fixture(autouse=True)
async def _reset_oauth_tables(pg_pool):
    async with pg_pool.acquire() as conn:
        await conn.execute("TRUNCATE oauth_refresh_tokens, oauth_access_tokens, oauth_authorization_codes, oauth_clients CASCADE")
    yield


async def test_register_client_roundtrip(pg_pool):
    client_id = await oauth_db.register_client(
        pg_pool,
        client_name="TestClient",
        redirect_uris=["https://example.com/cb"],
        token_endpoint_auth_method="none",
        client_secret_hash=None,
        registered_from_ip="127.0.0.1",
        registered_user_agent="pytest",
    )
    row = await oauth_db.get_client(pg_pool, client_id)
    assert row is not None
    assert row["client_name"] == "TestClient"
    assert row["redirect_uris"] == ["https://example.com/cb"]
    assert row["token_endpoint_auth_method"] == "none"
    assert row["disabled_at"] is None


async def test_disabled_client_is_excluded_from_active_lookup(pg_pool):
    cid = await oauth_db.register_client(
        pg_pool, client_name="x", redirect_uris=["https://e.com/cb"],
        token_endpoint_auth_method="none", client_secret_hash=None,
        registered_from_ip=None, registered_user_agent=None,
    )
    await oauth_db.disable_client(pg_pool, cid)
    row = await oauth_db.get_active_client(pg_pool, cid)
    assert row is None


async def test_issue_and_consume_authorization_code(pg_pool):
    cid = await oauth_db.register_client(
        pg_pool, client_name="x", redirect_uris=["https://e.com/cb"],
        token_endpoint_auth_method="none", client_secret_hash=None,
        registered_from_ip=None, registered_user_agent=None,
    )
    code = generate_opaque_token("ac")
    await oauth_db.issue_authorization_code(
        pg_pool,
        code=code,
        client_id=cid,
        user_id="user-1",
        share_token_id=None,
        scope="orbis.read",
        redirect_uri="https://e.com/cb",
        code_challenge="abc",
        code_challenge_method="S256",
        ttl_seconds=300,
    )
    row = await oauth_db.consume_authorization_code(pg_pool, code)
    assert row is not None
    assert row["user_id"] == "user-1"
    # Second consume returns None (single-use)
    row2 = await oauth_db.consume_authorization_code(pg_pool, code)
    assert row2 is None


async def test_expired_authorization_code_cannot_be_consumed(pg_pool):
    cid = await oauth_db.register_client(
        pg_pool, client_name="x", redirect_uris=["https://e.com/cb"],
        token_endpoint_auth_method="none", client_secret_hash=None,
        registered_from_ip=None, registered_user_agent=None,
    )
    code = generate_opaque_token("ac")
    await oauth_db.issue_authorization_code(
        pg_pool, code=code, client_id=cid, user_id="user-1",
        share_token_id=None, scope="orbis.read",
        redirect_uri="https://e.com/cb", code_challenge="abc",
        code_challenge_method="S256", ttl_seconds=-1,  # already expired
    )
    row = await oauth_db.consume_authorization_code(pg_pool, code)
    assert row is None


async def test_issue_and_lookup_access_token(pg_pool):
    cid = await oauth_db.register_client(
        pg_pool, client_name="x", redirect_uris=["https://e.com/cb"],
        token_endpoint_auth_method="none", client_secret_hash=None,
        registered_from_ip=None, registered_user_agent=None,
    )
    tok = generate_opaque_token("oauth")
    await oauth_db.issue_access_token(
        pg_pool,
        token_hash=hash_token(tok),
        client_id=cid,
        user_id="user-1",
        share_token_id=None,
        scope="orbis.read",
        ttl_seconds=3600,
    )
    grant = await oauth_db.resolve_access_token(pg_pool, hash_token(tok))
    assert grant is not None
    assert grant["user_id"] == "user-1"
    assert grant["share_token_id"] is None


async def test_revoked_access_token_does_not_resolve(pg_pool):
    cid = await oauth_db.register_client(
        pg_pool, client_name="x", redirect_uris=["https://e.com/cb"],
        token_endpoint_auth_method="none", client_secret_hash=None,
        registered_from_ip=None, registered_user_agent=None,
    )
    tok = generate_opaque_token("oauth")
    await oauth_db.issue_access_token(
        pg_pool, token_hash=hash_token(tok), client_id=cid,
        user_id="user-1", share_token_id=None,
        scope="orbis.read", ttl_seconds=3600,
    )
    await oauth_db.revoke_access_token(pg_pool, hash_token(tok))
    assert await oauth_db.resolve_access_token(pg_pool, hash_token(tok)) is None
```

- [ ] **Step 11: Implement `backend/app/oauth/db.py`**

```python
"""OAuth Postgres DAL.

All functions take the asyncpg pool from `app.db.postgres.get_pool` —
the same pool CV jobs use. DB calls are parameterized; no user input
is ever concatenated into SQL.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import asyncpg


async def register_client(
    pool: asyncpg.Pool,
    *,
    client_name: str,
    redirect_uris: list[str],
    token_endpoint_auth_method: str,
    client_secret_hash: str | None,
    registered_from_ip: str | None,
    registered_user_agent: str | None,
) -> uuid.UUID:
    client_id = uuid.uuid4()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO oauth_clients (
              client_id, client_secret_hash, client_name, redirect_uris,
              token_endpoint_auth_method, registered_from_ip, registered_user_agent
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            """,
            client_id, client_secret_hash, client_name, redirect_uris,
            token_endpoint_auth_method, registered_from_ip, registered_user_agent,
        )
    return client_id


async def get_client(pool: asyncpg.Pool, client_id: uuid.UUID) -> dict[str, Any] | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM oauth_clients WHERE client_id = $1", client_id
        )
    return dict(row) if row else None


async def get_active_client(
    pool: asyncpg.Pool, client_id: uuid.UUID
) -> dict[str, Any] | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM oauth_clients WHERE client_id = $1 AND disabled_at IS NULL",
            client_id,
        )
    return dict(row) if row else None


async def disable_client(pool: asyncpg.Pool, client_id: uuid.UUID) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE oauth_clients SET disabled_at = now() WHERE client_id = $1",
            client_id,
        )


async def issue_authorization_code(
    pool: asyncpg.Pool,
    *,
    code: str,
    client_id: uuid.UUID,
    user_id: str,
    share_token_id: str | None,
    scope: str,
    redirect_uri: str,
    code_challenge: str,
    code_challenge_method: str,
    ttl_seconds: int,
) -> None:
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO oauth_authorization_codes (
              code, client_id, user_id, share_token_id, scope,
              redirect_uri, code_challenge, code_challenge_method, expires_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            """,
            code, client_id, user_id, share_token_id, scope,
            redirect_uri, code_challenge, code_challenge_method, expires_at,
        )


async def consume_authorization_code(
    pool: asyncpg.Pool, code: str
) -> dict[str, Any] | None:
    """Atomically mark the code consumed and return its row, or None.

    Returns None if the code doesn't exist, is expired, or has already
    been consumed.
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE oauth_authorization_codes
               SET consumed_at = now()
             WHERE code = $1
               AND consumed_at IS NULL
               AND expires_at > now()
         RETURNING *
            """,
            code,
        )
    return dict(row) if row else None


async def issue_access_token(
    pool: asyncpg.Pool,
    *,
    token_hash: str,
    client_id: uuid.UUID,
    user_id: str,
    share_token_id: str | None,
    scope: str,
    ttl_seconds: int,
) -> None:
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO oauth_access_tokens (
              token_hash, client_id, user_id, share_token_id, scope, expires_at
            ) VALUES ($1, $2, $3, $4, $5, $6)
            """,
            token_hash, client_id, user_id, share_token_id, scope, expires_at,
        )


async def resolve_access_token(
    pool: asyncpg.Pool, token_hash: str
) -> dict[str, Any] | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT client_id, user_id, share_token_id, scope
              FROM oauth_access_tokens
             WHERE token_hash = $1
               AND revoked_at IS NULL
               AND expires_at > now()
            """,
            token_hash,
        )
    return dict(row) if row else None


async def touch_access_token(pool: asyncpg.Pool, token_hash: str) -> None:
    """Fire-and-forget last_used_at update. Swallows exceptions."""
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE oauth_access_tokens SET last_used_at = now() WHERE token_hash = $1",
                token_hash,
            )
    except Exception:
        pass  # telemetry must never block the response


async def revoke_access_token(pool: asyncpg.Pool, token_hash: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE oauth_access_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
            token_hash,
        )


async def issue_refresh_token(
    pool: asyncpg.Pool,
    *,
    token_hash: str,
    client_id: uuid.UUID,
    user_id: str,
    share_token_id: str | None,
    ttl_seconds: int,
) -> None:
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO oauth_refresh_tokens (
              token_hash, client_id, user_id, share_token_id, expires_at
            ) VALUES ($1, $2, $3, $4, $5)
            """,
            token_hash, client_id, user_id, share_token_id, expires_at,
        )


async def rotate_refresh_token(
    pool: asyncpg.Pool, *, old_hash: str, new_hash: str
) -> dict[str, Any] | None:
    """Atomically mark old refresh token revoked + rotated, return its row.

    Returns None if the token is missing, already revoked, already
    rotated, or expired. On re-use of a previously-rotated token, the
    caller (token endpoint) must trigger chain-wide revocation — see
    `revoke_refresh_chain`.
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE oauth_refresh_tokens
               SET revoked_at = now(), rotated_to = $2
             WHERE token_hash = $1
               AND revoked_at IS NULL
               AND rotated_to IS NULL
               AND expires_at > now()
         RETURNING client_id, user_id, share_token_id
            """,
            old_hash, new_hash,
        )
    return dict(row) if row else None


async def get_refresh_token(
    pool: asyncpg.Pool, token_hash: str
) -> dict[str, Any] | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM oauth_refresh_tokens WHERE token_hash = $1", token_hash,
        )
    return dict(row) if row else None


async def revoke_refresh_chain(pool: asyncpg.Pool, leaked_hash: str) -> None:
    """Revoke every refresh token descended from `leaked_hash`.

    A refresh-token chain is a linked list via `rotated_to`. If the
    leaked token was rotated, follow the chain and revoke every child.
    Also revoke the leaked token itself and all sibling access tokens
    for the same user_id + client_id.
    """
    async with pool.acquire() as conn:
        async with conn.transaction():
            to_revoke = {leaked_hash}
            cursor = leaked_hash
            while True:
                row = await conn.fetchrow(
                    "SELECT rotated_to, user_id, client_id FROM oauth_refresh_tokens WHERE token_hash = $1",
                    cursor,
                )
                if row is None:
                    break
                nxt = row["rotated_to"]
                if nxt is None:
                    user_id = row["user_id"]
                    client_id = row["client_id"]
                    break
                to_revoke.add(nxt)
                cursor = nxt
            await conn.execute(
                "UPDATE oauth_refresh_tokens SET revoked_at = now() WHERE token_hash = ANY($1::text[]) AND revoked_at IS NULL",
                list(to_revoke),
            )
            # Also revoke every live access token from the same client/user
            await conn.execute(
                """
                UPDATE oauth_access_tokens
                   SET revoked_at = now()
                 WHERE user_id = $1 AND client_id = $2 AND revoked_at IS NULL
                """,
                user_id, client_id,
            )


async def revoke_refresh_token(pool: asyncpg.Pool, token_hash: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE oauth_refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
            token_hash,
        )
```

- [ ] **Step 12: Add schema-bootstrapping call on app startup**

In `backend/app/main.py`, find the existing `init_cv_jobs_table` startup call (or equivalent) and add an analogous `ensure_oauth_schema`:

```python
# In backend/app/oauth/db.py, append:
async def ensure_oauth_schema(pool: asyncpg.Pool) -> None:
    """Apply the OAuth DDL idempotently. Called once at app startup."""
    import pathlib
    schema_path = pathlib.Path(__file__).parent / "schema.sql"
    ddl = schema_path.read_text(encoding="utf-8")
    async with pool.acquire() as conn:
        await conn.execute(ddl)
```

And in `backend/app/main.py` lifespan startup (following the existing CV jobs init pattern):

```python
from app.oauth.db import ensure_oauth_schema
# Inside the startup branch:
await ensure_oauth_schema(pg_pool)
```

- [ ] **Step 13: Run DAL tests, confirm PASS**

```bash
cd backend && uv run pytest tests/unit/test_oauth_db.py -v
```
Expected: 6 PASS. If the `pg_pool` fixture doesn't exist yet, check `backend/tests/unit/conftest.py` for how `test_cv_jobs_db.py` obtains a Postgres pool and mirror that.

- [ ] **Step 14: Ruff + format**

```bash
cd backend && uv run ruff check app/oauth tests/unit/test_oauth_*.py && uv run ruff format --check app/oauth tests/unit/test_oauth_*.py
```

- [ ] **Step 15: Commit**

```bash
git add backend/app/oauth backend/app/main.py backend/tests/unit/test_oauth_tokens.py backend/tests/unit/test_oauth_pkce.py backend/tests/unit/test_oauth_db.py
git commit -m "feat(oauth): schema + token/PKCE primitives + DAL"
```

---

## Task 2: Config + `OAUTH_ENABLED` kill switch

Adds the settings that govern all OAuth behavior.

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/.env.example`
- Test: `backend/tests/unit/test_config.py` (may not exist — create if absent)

- [ ] **Step 1: Write failing test for new settings defaults**

Append to `backend/tests/unit/test_config.py` (or create the file):

```python
from app.config import settings


class TestOauthSettings:
    def test_oauth_enabled_default_is_true_in_dev(self):
        assert settings.oauth_enabled is True

    def test_oauth_access_token_ttl_default_is_1_hour(self):
        assert settings.oauth_access_token_ttl_seconds == 3600

    def test_oauth_refresh_token_ttl_default_is_30_days(self):
        assert settings.oauth_refresh_token_ttl_seconds == 2592000

    def test_oauth_authorization_code_ttl_default_is_5_minutes(self):
        assert settings.oauth_authorization_code_ttl_seconds == 300

    def test_oauth_register_rate_limit_default(self):
        assert settings.oauth_register_rate_limit == "10/day"
```

- [ ] **Step 2: Run the test, confirm FAIL**

```bash
cd backend && uv run pytest tests/unit/test_config.py::TestOauthSettings -v
```
Expected: FAIL — `AttributeError: Settings object has no attribute 'oauth_enabled'`.

- [ ] **Step 3: Add settings to `backend/app/config.py`**

In the `Settings` class, add (alphabetize near other feature flags if the file groups them):

```python
    # OAuth 2.1 authorization server (MCP remote clients: ChatGPT, Claude web, Gemini).
    # Kill switch: set to False to return 503 from /oauth/* routes and skip the
    # Bearer branch in the MCP middleware. Useful for emergency rollback.
    oauth_enabled: bool = True

    # Token lifetimes (seconds).
    oauth_access_token_ttl_seconds: int = 3600        # 1 hour
    oauth_refresh_token_ttl_seconds: int = 2592000    # 30 days
    oauth_authorization_code_ttl_seconds: int = 300   # 5 minutes

    # Rate limit for POST /oauth/register (per IP). Format: slowapi string.
    oauth_register_rate_limit: str = "10/day"
```

- [ ] **Step 4: Run the test, confirm PASS**

```bash
cd backend && uv run pytest tests/unit/test_config.py::TestOauthSettings -v
```
Expected: 5 PASS.

- [ ] **Step 5: Add env-var examples to `backend/.env.example`**

Append to `backend/.env.example`:

```
# OAuth 2.1 authorization server for MCP remote clients (ChatGPT, Claude web, Gemini).
# Set to false to return 503 from /oauth/* and skip the MCP Bearer branch.
OAUTH_ENABLED=true

# Token lifetimes in seconds.
OAUTH_ACCESS_TOKEN_TTL_SECONDS=3600
OAUTH_REFRESH_TOKEN_TTL_SECONDS=2592000
OAUTH_AUTHORIZATION_CODE_TTL_SECONDS=300

# Rate limit on POST /oauth/register (slowapi format: "10/day", "5/hour").
OAUTH_REGISTER_RATE_LIMIT=10/day
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/config.py backend/tests/unit/test_config.py backend/.env.example
git commit -m "feat(oauth): config settings + OAUTH_ENABLED kill switch"
```

---

## Task 3: Dynamic Client Registration endpoint

`POST /oauth/register` (RFC 7591). Rate-limited. Creates a client, returns `client_id`.

**Files:**
- Create: `backend/app/oauth/models.py`
- Create: `backend/app/oauth/register_router.py`
- Modify: `backend/app/main.py` (include router)
- Test: `backend/tests/unit/test_oauth_register.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/unit/test_oauth_register.py`:

```python
"""Tests for POST /oauth/register (RFC 7591 Dynamic Client Registration)."""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
async def _reset_oauth_tables(pg_pool):
    async with pg_pool.acquire() as conn:
        await conn.execute("TRUNCATE oauth_refresh_tokens, oauth_access_tokens, oauth_authorization_codes, oauth_clients CASCADE")
    yield


class TestRegisterClient:
    async def test_happy_path_public_client(self, async_client):
        resp = await async_client.post(
            "/oauth/register",
            json={
                "client_name": "ChatGPT",
                "redirect_uris": ["https://chat.openai.com/oauth/callback"],
                "token_endpoint_auth_method": "none",
                "grant_types": ["authorization_code", "refresh_token"],
                "response_types": ["code"],
            },
        )
        assert resp.status_code == 201
        body = resp.json()
        assert "client_id" in body
        assert body["client_name"] == "ChatGPT"
        # Public client: no secret returned
        assert "client_secret" not in body

    async def test_rejects_non_https_redirect(self, async_client):
        resp = await async_client.post(
            "/oauth/register",
            json={
                "client_name": "evil",
                "redirect_uris": ["http://malicious.example.com/cb"],
                "token_endpoint_auth_method": "none",
            },
        )
        assert resp.status_code == 400
        assert "redirect_uri" in resp.json()["detail"].lower()

    async def test_accepts_localhost_http_redirect(self, async_client):
        resp = await async_client.post(
            "/oauth/register",
            json={
                "client_name": "local-dev",
                "redirect_uris": ["http://localhost:5173/cb"],
                "token_endpoint_auth_method": "none",
            },
        )
        assert resp.status_code == 201

    async def test_rejects_missing_redirect_uris(self, async_client):
        resp = await async_client.post(
            "/oauth/register",
            json={
                "client_name": "no-redirect",
                "redirect_uris": [],
                "token_endpoint_auth_method": "none",
            },
        )
        assert resp.status_code == 400

    async def test_rejects_unsupported_auth_method(self, async_client):
        resp = await async_client.post(
            "/oauth/register",
            json={
                "client_name": "x",
                "redirect_uris": ["https://e.com/cb"],
                "token_endpoint_auth_method": "private_key_jwt",
            },
        )
        assert resp.status_code == 400
        assert "auth_method" in resp.json()["detail"].lower()

    async def test_kill_switch_returns_503(self, async_client, monkeypatch):
        monkeypatch.setattr("app.config.settings.oauth_enabled", False)
        resp = await async_client.post(
            "/oauth/register",
            json={
                "client_name": "x",
                "redirect_uris": ["https://e.com/cb"],
                "token_endpoint_auth_method": "none",
            },
        )
        assert resp.status_code == 503
```

- [ ] **Step 2: Run tests, confirm FAIL**

```bash
cd backend && uv run pytest tests/unit/test_oauth_register.py -v
```
Expected: FAIL — route doesn't exist yet.

- [ ] **Step 3: Add Pydantic models**

Create `backend/app/oauth/models.py`:

```python
"""Pydantic request/response models for OAuth endpoints."""

from __future__ import annotations

from pydantic import BaseModel


class RegisterRequest(BaseModel):
    client_name: str
    redirect_uris: list[str]
    token_endpoint_auth_method: str = "none"
    grant_types: list[str] = ["authorization_code", "refresh_token"]
    response_types: list[str] = ["code"]


class RegisterResponse(BaseModel):
    client_id: str
    client_name: str
    redirect_uris: list[str]
    token_endpoint_auth_method: str
    registered_at: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int
    refresh_token: str
    scope: str


class GrantListItem(BaseModel):
    client_id: str
    client_name: str
    share_token_id: str | None
    share_token_label: str | None
    connected_at: str
    last_used_at: str | None


class GrantListResponse(BaseModel):
    grants: list[GrantListItem]
```

- [ ] **Step 4: Implement the register router**

Create `backend/app/oauth/register_router.py`:

```python
"""POST /oauth/register — RFC 7591 Dynamic Client Registration."""

from __future__ import annotations

import logging
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Request

from app.config import settings
from app.db.postgres import get_pool
from app.oauth import db as oauth_db
from app.oauth.models import RegisterRequest, RegisterResponse
from app.oauth.tokens import generate_opaque_token, hash_token
from app.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/oauth", tags=["oauth"])

_ALLOWED_AUTH_METHODS = {"none", "client_secret_post"}


def _validate_redirect_uri(uri: str) -> bool:
    """HTTPS required except for localhost (dev-friendly)."""
    parsed = urlparse(uri)
    if parsed.scheme == "https":
        return True
    if parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}:
        return True
    return False


@router.post("/register", status_code=201)
@limiter.limit(settings.oauth_register_rate_limit)
async def register_client(
    request: Request,
    body: RegisterRequest,
) -> dict:
    if not settings.oauth_enabled:
        raise HTTPException(status_code=503, detail="OAuth disabled")

    if not body.redirect_uris:
        raise HTTPException(status_code=400, detail="at least one redirect_uri required")
    for uri in body.redirect_uris:
        if not _validate_redirect_uri(uri):
            raise HTTPException(
                status_code=400,
                detail=f"redirect_uri must be HTTPS or localhost: {uri}",
            )

    if body.token_endpoint_auth_method not in _ALLOWED_AUTH_METHODS:
        raise HTTPException(
            status_code=400,
            detail=f"unsupported token_endpoint_auth_method; allowed: {sorted(_ALLOWED_AUTH_METHODS)}",
        )

    pool = await get_pool()

    secret: str | None = None
    secret_hash: str | None = None
    if body.token_endpoint_auth_method == "client_secret_post":
        secret = generate_opaque_token("cs")
        secret_hash = hash_token(secret)

    client_id = await oauth_db.register_client(
        pool,
        client_name=body.client_name,
        redirect_uris=body.redirect_uris,
        token_endpoint_auth_method=body.token_endpoint_auth_method,
        client_secret_hash=secret_hash,
        registered_from_ip=request.client.host if request.client else None,
        registered_user_agent=request.headers.get("user-agent"),
    )

    logger.info(
        "OAuth client registered: client_id=%s name=%r auth=%s",
        client_id, body.client_name, body.token_endpoint_auth_method,
    )

    out = {
        "client_id": str(client_id),
        "client_name": body.client_name,
        "redirect_uris": body.redirect_uris,
        "token_endpoint_auth_method": body.token_endpoint_auth_method,
    }
    if secret is not None:
        out["client_secret"] = secret
    return out
```

- [ ] **Step 5: Wire the router into the app**

In `backend/app/main.py` (next to other `app.include_router(...)` lines):

```python
from app.oauth.register_router import router as oauth_register_router
app.include_router(oauth_register_router)
```

- [ ] **Step 6: Run tests, confirm PASS**

```bash
cd backend && uv run pytest tests/unit/test_oauth_register.py -v
```
Expected: 6 PASS.

- [ ] **Step 7: Ruff**

```bash
cd backend && uv run ruff check app/oauth tests/unit/test_oauth_register.py && uv run ruff format --check app/oauth tests/unit/test_oauth_register.py
```

- [ ] **Step 8: Commit**

```bash
git add backend/app/oauth/models.py backend/app/oauth/register_router.py backend/app/main.py backend/tests/unit/test_oauth_register.py
git commit -m "feat(oauth): POST /oauth/register (RFC 7591 DCR) + 10/day rate limit"
```

---

## Task 4: Authorization endpoint (`GET` + `POST /oauth/authorize`)

`GET` validates client + redirect + PKCE and returns the consent context as JSON (consumed by the React page). `POST` takes the user's choice and issues a short-lived authorization code.

**Files:**
- Create: `backend/app/oauth/authorize_router.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/unit/test_oauth_authorize.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/unit/test_oauth_authorize.py`:

```python
"""Tests for /oauth/authorize."""

from __future__ import annotations

import pytest

from app.oauth import db as oauth_db


@pytest.fixture
async def registered_client(pg_pool):
    cid = await oauth_db.register_client(
        pg_pool,
        client_name="ChatGPT",
        redirect_uris=["https://chat.openai.com/oauth/callback"],
        token_endpoint_auth_method="none",
        client_secret_hash=None,
        registered_from_ip="1.2.3.4",
        registered_user_agent="test",
    )
    return cid


class TestAuthorizeGet:
    async def test_unauthenticated_returns_context_with_login_required(
        self, async_client, registered_client
    ):
        resp = await async_client.get(
            "/oauth/authorize",
            params={
                "response_type": "code",
                "client_id": str(registered_client),
                "redirect_uri": "https://chat.openai.com/oauth/callback",
                "state": "abc",
                "code_challenge": "C" * 43,
                "code_challenge_method": "S256",
                "scope": "orbis.read",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["login_required"] is True

    async def test_authenticated_returns_client_context(
        self, async_client_with_user, registered_client
    ):
        resp = await async_client_with_user.get(
            "/oauth/authorize",
            params={
                "response_type": "code",
                "client_id": str(registered_client),
                "redirect_uri": "https://chat.openai.com/oauth/callback",
                "state": "abc",
                "code_challenge": "C" * 43,
                "code_challenge_method": "S256",
                "scope": "orbis.read",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["login_required"] is False
        assert body["client_name"] == "ChatGPT"
        assert body["client_id"] == str(registered_client)
        assert body["registered_at"]
        assert body["registered_from_ip"] == "1.2.3.4"

    async def test_rejects_mismatched_redirect_uri(
        self, async_client_with_user, registered_client
    ):
        resp = await async_client_with_user.get(
            "/oauth/authorize",
            params={
                "response_type": "code",
                "client_id": str(registered_client),
                "redirect_uri": "https://attacker.example.com/cb",
                "state": "abc",
                "code_challenge": "C" * 43,
                "code_challenge_method": "S256",
            },
        )
        assert resp.status_code == 400

    async def test_rejects_non_s256_challenge_method(
        self, async_client_with_user, registered_client
    ):
        resp = await async_client_with_user.get(
            "/oauth/authorize",
            params={
                "response_type": "code",
                "client_id": str(registered_client),
                "redirect_uri": "https://chat.openai.com/oauth/callback",
                "state": "abc",
                "code_challenge": "C" * 43,
                "code_challenge_method": "plain",
            },
        )
        assert resp.status_code == 400

    async def test_disabled_client_rejected(
        self, async_client_with_user, registered_client, pg_pool
    ):
        await oauth_db.disable_client(pg_pool, registered_client)
        resp = await async_client_with_user.get(
            "/oauth/authorize",
            params={
                "response_type": "code",
                "client_id": str(registered_client),
                "redirect_uri": "https://chat.openai.com/oauth/callback",
                "state": "abc",
                "code_challenge": "C" * 43,
                "code_challenge_method": "S256",
            },
        )
        assert resp.status_code == 403


class TestAuthorizePost:
    async def test_full_mode_issues_code(
        self, async_client_with_user, registered_client, pg_pool
    ):
        resp = await async_client_with_user.post(
            "/oauth/authorize",
            json={
                "client_id": str(registered_client),
                "redirect_uri": "https://chat.openai.com/oauth/callback",
                "state": "abc",
                "code_challenge": "C" * 43,
                "code_challenge_method": "S256",
                "scope": "orbis.read",
                "access_mode": "full",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "code" in body
        assert body["state"] == "abc"
        async with pg_pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM oauth_authorization_codes WHERE code = $1", body["code"],
            )
        assert row["share_token_id"] is None

    async def test_restricted_mode_binds_share_token(
        self,
        async_client_with_user,
        registered_client,
        seed_share_token,  # a test fixture that creates a share token for the user
        pg_pool,
    ):
        resp = await async_client_with_user.post(
            "/oauth/authorize",
            json={
                "client_id": str(registered_client),
                "redirect_uri": "https://chat.openai.com/oauth/callback",
                "state": "abc",
                "code_challenge": "C" * 43,
                "code_challenge_method": "S256",
                "access_mode": "restricted",
                "share_token_id": seed_share_token["token_id"],
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        async with pg_pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM oauth_authorization_codes WHERE code = $1", body["code"],
            )
        assert row["share_token_id"] == seed_share_token["token_id"]

    async def test_unauthenticated_post_is_rejected(
        self, async_client, registered_client
    ):
        resp = await async_client.post(
            "/oauth/authorize",
            json={
                "client_id": str(registered_client),
                "redirect_uri": "https://chat.openai.com/oauth/callback",
                "state": "abc",
                "code_challenge": "C" * 43,
                "code_challenge_method": "S256",
                "access_mode": "full",
            },
        )
        assert resp.status_code == 401

    async def test_restricted_without_share_token_id_rejected(
        self, async_client_with_user, registered_client
    ):
        resp = await async_client_with_user.post(
            "/oauth/authorize",
            json={
                "client_id": str(registered_client),
                "redirect_uri": "https://chat.openai.com/oauth/callback",
                "state": "abc",
                "code_challenge": "C" * 43,
                "code_challenge_method": "S256",
                "access_mode": "restricted",
            },
        )
        assert resp.status_code == 400

    async def test_share_token_not_owned_by_user_rejected(
        self, async_client_with_user, registered_client, seed_foreign_share_token
    ):
        """Can't bind an OAuth grant to someone else's share token."""
        resp = await async_client_with_user.post(
            "/oauth/authorize",
            json={
                "client_id": str(registered_client),
                "redirect_uri": "https://chat.openai.com/oauth/callback",
                "state": "abc",
                "code_challenge": "C" * 43,
                "code_challenge_method": "S256",
                "access_mode": "restricted",
                "share_token_id": seed_foreign_share_token["token_id"],
            },
        )
        assert resp.status_code == 403
```

- [ ] **Step 2: Run tests, confirm FAIL**

```bash
cd backend && uv run pytest tests/unit/test_oauth_authorize.py -v
```
Expected: FAIL — route doesn't exist yet.

- [ ] **Step 3: Implement the authorize router**

Create `backend/app/oauth/authorize_router.py`:

```python
"""GET + POST /oauth/authorize — user consent flow."""

from __future__ import annotations

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from neo4j import AsyncDriver
from pydantic import BaseModel

from app.config import settings
from app.db.postgres import get_pool
from app.dependencies import get_db, get_current_user_optional
from app.oauth import db as oauth_db
from app.oauth.tokens import generate_opaque_token
from app.orbs.share_token import get_share_token_row

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/oauth", tags=["oauth"])


def _parse_client_id(raw: str) -> uuid.UUID:
    try:
        return uuid.UUID(raw)
    except ValueError as e:
        raise HTTPException(400, "invalid client_id") from e


@router.get("/authorize")
async def authorize_get(
    response_type: str = Query(...),
    client_id: str = Query(...),
    redirect_uri: str = Query(...),
    state: str = Query(...),
    code_challenge: str = Query(...),
    code_challenge_method: str = Query(...),
    scope: str = Query("orbis.read"),
    user: dict | None = Depends(get_current_user_optional),
) -> dict:
    if not settings.oauth_enabled:
        raise HTTPException(503, "OAuth disabled")

    if response_type != "code":
        raise HTTPException(400, "only response_type=code is supported")
    if code_challenge_method != "S256":
        raise HTTPException(400, "only code_challenge_method=S256 is supported")

    cid = _parse_client_id(client_id)
    pool = await get_pool()

    client = await oauth_db.get_active_client(pool, cid)
    if client is None:
        raise HTTPException(403, "client disabled or unknown")
    if redirect_uri not in client["redirect_uris"]:
        raise HTTPException(400, "redirect_uri does not match a registered URI")

    if user is None:
        return {
            "login_required": True,
            "next": f"/oauth/authorize?response_type={response_type}&client_id={client_id}"
                    f"&redirect_uri={redirect_uri}&state={state}"
                    f"&code_challenge={code_challenge}&code_challenge_method={code_challenge_method}"
                    f"&scope={scope}",
        }

    return {
        "login_required": False,
        "client_id": str(client["client_id"]),
        "client_name": client["client_name"],
        "registered_at": client["registered_at"].isoformat(),
        "registered_from_ip": str(client["registered_from_ip"]) if client["registered_from_ip"] else None,
        "redirect_uri": redirect_uri,
        "scope": scope,
    }


class AuthorizePostBody(BaseModel):
    client_id: str
    redirect_uri: str
    state: str
    code_challenge: str
    code_challenge_method: str
    scope: str = "orbis.read"
    access_mode: str  # "full" or "restricted"
    share_token_id: str | None = None


@router.post("/authorize")
async def authorize_post(
    body: AuthorizePostBody,
    user: dict = Depends(get_current_user_optional),
    db: AsyncDriver = Depends(get_db),
) -> dict:
    if not settings.oauth_enabled:
        raise HTTPException(503, "OAuth disabled")
    if user is None:
        raise HTTPException(401, "authentication required")
    if body.code_challenge_method != "S256":
        raise HTTPException(400, "only S256 supported")
    if body.access_mode not in ("full", "restricted"):
        raise HTTPException(400, "access_mode must be 'full' or 'restricted'")
    if body.access_mode == "restricted" and not body.share_token_id:
        raise HTTPException(400, "restricted access requires share_token_id")

    cid = _parse_client_id(body.client_id)
    pool = await get_pool()
    client = await oauth_db.get_active_client(pool, cid)
    if client is None:
        raise HTTPException(403, "client disabled or unknown")
    if body.redirect_uri not in client["redirect_uris"]:
        raise HTTPException(400, "redirect_uri does not match a registered URI")

    # Validate share-token ownership: can only bind a grant to a share
    # token the CURRENT user owns (no binding to someone else's).
    share_token_id: str | None = None
    if body.access_mode == "restricted":
        row = await get_share_token_row(db, body.share_token_id)
        if row is None:
            raise HTTPException(403, "share token not found or not owned by you")
        # Verify the token was minted by this user's Person node
        if row["user_id"] != user["user_id"]:
            raise HTTPException(403, "share token not owned by you")
        share_token_id = body.share_token_id

    code = generate_opaque_token("ac")
    await oauth_db.issue_authorization_code(
        pool,
        code=code,
        client_id=cid,
        user_id=user["user_id"],
        share_token_id=share_token_id,
        scope=body.scope,
        redirect_uri=body.redirect_uri,
        code_challenge=body.code_challenge,
        code_challenge_method=body.code_challenge_method,
        ttl_seconds=settings.oauth_authorization_code_ttl_seconds,
    )
    logger.info(
        "OAuth consent granted: user=%s client=%s mode=%s share_token=%s",
        user["user_id"], cid, body.access_mode, bool(share_token_id),
    )
    return {"code": code, "state": body.state, "redirect_uri": body.redirect_uri}
```

- [ ] **Step 4: Add `get_share_token_row` helper to `backend/app/orbs/share_token.py`**

If absent, append:

```python
async def get_share_token_row(db: AsyncDriver, token_id: str) -> dict | None:
    """Return the Person.user_id + filter data for a token, or None if absent.

    Used by the OAuth consent flow to verify the current user owns
    the share token they're trying to bind to an OAuth grant.
    """
    async with db.session() as session:
        result = await session.run(
            """
            MATCH (p:Person)-[:HAS_SHARE_TOKEN]->(st:ShareToken {token_id: $tid})
            WHERE st.revoked = false
              AND (st.expires_at IS NULL OR st.expires_at > datetime())
            RETURN p.user_id AS user_id,
                   st.keywords AS keywords,
                   coalesce(st.hidden_node_types, []) AS hidden_node_types
            """,
            tid=token_id,
        )
        row = await result.single()
    return dict(row) if row else None
```

- [ ] **Step 5: Add `get_current_user_optional` dependency**

In `backend/app/dependencies.py`, add a variant of `get_current_user` that returns `None` instead of 401 when no session is present:

```python
async def get_current_user_optional(request: Request) -> dict | None:
    """Return the current user or None; never raises 401."""
    try:
        return await get_current_user(request)
    except HTTPException:
        return None
```

- [ ] **Step 6: Wire the router into the app**

In `backend/app/main.py`:

```python
from app.oauth.authorize_router import router as oauth_authorize_router
app.include_router(oauth_authorize_router)
```

- [ ] **Step 7: Run tests, confirm PASS**

```bash
cd backend && uv run pytest tests/unit/test_oauth_authorize.py -v
```
Expected: all PASS. If `async_client_with_user` / `seed_share_token` / `seed_foreign_share_token` fixtures don't exist yet, define them in `backend/tests/unit/conftest.py` following the existing `async_client` patterns.

- [ ] **Step 8: Commit**

```bash
git add backend/app/oauth/authorize_router.py backend/app/oauth/__init__.py backend/app/orbs/share_token.py backend/app/dependencies.py backend/app/main.py backend/tests/unit/test_oauth_authorize.py
git commit -m "feat(oauth): /oauth/authorize GET + POST with share-token binding"
```

---

## Task 5: Token endpoint (code exchange + refresh rotation + reuse detection)

`POST /oauth/token` handles `grant_type=authorization_code` and `grant_type=refresh_token`. Refresh rotation plus chain-revocation on reuse.

**Files:**
- Create: `backend/app/oauth/token_router.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/unit/test_oauth_token.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/unit/test_oauth_token.py`:

```python
"""Tests for POST /oauth/token."""

from __future__ import annotations

import base64
import hashlib
import pytest

from app.oauth import db as oauth_db
from app.oauth.tokens import generate_opaque_token, hash_token


def _pkce_pair() -> tuple[str, str]:
    verifier = "a" * 43
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b"=").decode()
    return verifier, challenge


@pytest.fixture
async def code_row(pg_pool):
    """Issue a registered client + valid authorization code."""
    cid = await oauth_db.register_client(
        pg_pool, client_name="t", redirect_uris=["https://e.com/cb"],
        token_endpoint_auth_method="none", client_secret_hash=None,
        registered_from_ip=None, registered_user_agent=None,
    )
    verifier, challenge = _pkce_pair()
    code = generate_opaque_token("ac")
    await oauth_db.issue_authorization_code(
        pg_pool,
        code=code, client_id=cid, user_id="user-1",
        share_token_id=None, scope="orbis.read",
        redirect_uri="https://e.com/cb",
        code_challenge=challenge, code_challenge_method="S256",
        ttl_seconds=300,
    )
    return {"client_id": cid, "code": code, "verifier": verifier}


class TestAuthorizationCodeGrant:
    async def test_happy_path_issues_tokens(self, async_client, code_row):
        resp = await async_client.post(
            "/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": code_row["code"],
                "redirect_uri": "https://e.com/cb",
                "client_id": str(code_row["client_id"]),
                "code_verifier": code_row["verifier"],
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["token_type"] == "Bearer"
        assert body["expires_in"] == 3600
        assert body["access_token"].startswith("oauth_")
        assert body["refresh_token"].startswith("refresh_")

    async def test_code_reuse_is_rejected(self, async_client, code_row):
        # First exchange: succeeds
        await async_client.post(
            "/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": code_row["code"],
                "redirect_uri": "https://e.com/cb",
                "client_id": str(code_row["client_id"]),
                "code_verifier": code_row["verifier"],
            },
        )
        # Second exchange: rejected
        resp = await async_client.post(
            "/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": code_row["code"],
                "redirect_uri": "https://e.com/cb",
                "client_id": str(code_row["client_id"]),
                "code_verifier": code_row["verifier"],
            },
        )
        assert resp.status_code == 400

    async def test_wrong_pkce_verifier_rejected(self, async_client, code_row):
        resp = await async_client.post(
            "/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": code_row["code"],
                "redirect_uri": "https://e.com/cb",
                "client_id": str(code_row["client_id"]),
                "code_verifier": "wrong",
            },
        )
        assert resp.status_code == 400

    async def test_redirect_uri_mismatch_rejected(self, async_client, code_row):
        resp = await async_client.post(
            "/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": code_row["code"],
                "redirect_uri": "https://different.example/cb",
                "client_id": str(code_row["client_id"]),
                "code_verifier": code_row["verifier"],
            },
        )
        assert resp.status_code == 400


class TestRefreshGrant:
    async def test_happy_path_rotates(self, async_client, code_row, pg_pool):
        # Get first pair
        first = await async_client.post(
            "/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": code_row["code"],
                "redirect_uri": "https://e.com/cb",
                "client_id": str(code_row["client_id"]),
                "code_verifier": code_row["verifier"],
            },
        )
        first_body = first.json()

        # Refresh
        resp = await async_client.post(
            "/oauth/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": first_body["refresh_token"],
                "client_id": str(code_row["client_id"]),
            },
        )
        assert resp.status_code == 200
        second_body = resp.json()
        assert second_body["refresh_token"] != first_body["refresh_token"]
        assert second_body["access_token"] != first_body["access_token"]

        # Old refresh token must not work again (already rotated)
        retry = await async_client.post(
            "/oauth/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": first_body["refresh_token"],
                "client_id": str(code_row["client_id"]),
            },
        )
        assert retry.status_code == 400

    async def test_refresh_reuse_revokes_chain(self, async_client, code_row, pg_pool):
        # Get pair 1
        pair1 = (await async_client.post(
            "/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": code_row["code"],
                "redirect_uri": "https://e.com/cb",
                "client_id": str(code_row["client_id"]),
                "code_verifier": code_row["verifier"],
            },
        )).json()
        # Rotate to pair 2 (legit)
        pair2 = (await async_client.post(
            "/oauth/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": pair1["refresh_token"],
                "client_id": str(code_row["client_id"]),
            },
        )).json()
        # Attacker replays pair1's refresh — should revoke chain
        bad = await async_client.post(
            "/oauth/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": pair1["refresh_token"],
                "client_id": str(code_row["client_id"]),
            },
        )
        assert bad.status_code == 400

        # Pair 2's refresh must now also be revoked
        resp = await async_client.post(
            "/oauth/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": pair2["refresh_token"],
                "client_id": str(code_row["client_id"]),
            },
        )
        assert resp.status_code == 400

        # And any access tokens from the chain should be revoked
        row = await oauth_db.resolve_access_token(pg_pool, hash_token(pair2["access_token"]))
        assert row is None
```

- [ ] **Step 2: Run tests, confirm FAIL**

```bash
cd backend && uv run pytest tests/unit/test_oauth_token.py -v
```
Expected: FAIL — route missing.

- [ ] **Step 3: Implement the token router**

Create `backend/app/oauth/token_router.py`:

```python
"""POST /oauth/token — code exchange + refresh rotation with reuse detection."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Form, HTTPException

from app.config import settings
from app.db.postgres import get_pool
from app.oauth import db as oauth_db
from app.oauth.pkce import verify_pkce_s256
from app.oauth.tokens import generate_opaque_token, hash_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/oauth", tags=["oauth"])


def _parse_client_id(raw: str) -> uuid.UUID:
    try:
        return uuid.UUID(raw)
    except ValueError as e:
        raise HTTPException(400, "invalid client_id") from e


async def _issue_token_pair(
    pool,
    *,
    client_id: uuid.UUID,
    user_id: str,
    share_token_id: str | None,
    scope: str,
) -> dict:
    access = generate_opaque_token("oauth")
    refresh = generate_opaque_token("refresh")
    await oauth_db.issue_access_token(
        pool,
        token_hash=hash_token(access),
        client_id=client_id,
        user_id=user_id,
        share_token_id=share_token_id,
        scope=scope,
        ttl_seconds=settings.oauth_access_token_ttl_seconds,
    )
    await oauth_db.issue_refresh_token(
        pool,
        token_hash=hash_token(refresh),
        client_id=client_id,
        user_id=user_id,
        share_token_id=share_token_id,
        ttl_seconds=settings.oauth_refresh_token_ttl_seconds,
    )
    return {
        "access_token": access,
        "token_type": "Bearer",
        "expires_in": settings.oauth_access_token_ttl_seconds,
        "refresh_token": refresh,
        "scope": scope,
    }


@router.post("/token")
async def token_endpoint(
    grant_type: str = Form(...),
    # authorization_code params
    code: str | None = Form(None),
    redirect_uri: str | None = Form(None),
    client_id: str = Form(...),
    code_verifier: str | None = Form(None),
    # refresh_token params
    refresh_token: str | None = Form(None),
) -> dict:
    if not settings.oauth_enabled:
        raise HTTPException(503, "OAuth disabled")

    cid = _parse_client_id(client_id)
    pool = await get_pool()

    if grant_type == "authorization_code":
        if not code or not redirect_uri or not code_verifier:
            raise HTTPException(400, "missing authorization_code params")
        row = await oauth_db.consume_authorization_code(pool, code)
        if row is None:
            raise HTTPException(400, "invalid or expired code")
        if row["client_id"] != cid:
            raise HTTPException(400, "code issued to a different client")
        if row["redirect_uri"] != redirect_uri:
            raise HTTPException(400, "redirect_uri does not match the one used at /authorize")
        if not verify_pkce_s256(code_verifier, row["code_challenge"]):
            raise HTTPException(400, "PKCE verification failed")

        return await _issue_token_pair(
            pool,
            client_id=cid,
            user_id=row["user_id"],
            share_token_id=row["share_token_id"],
            scope=row["scope"],
        )

    if grant_type == "refresh_token":
        if not refresh_token:
            raise HTTPException(400, "missing refresh_token")
        old_hash = hash_token(refresh_token)

        # Detect reuse: if the token was already rotated or revoked, this
        # is a leaked credential — revoke the entire chain + all the
        # user's access tokens for this client.
        existing = await oauth_db.get_refresh_token(pool, old_hash)
        if existing is None:
            raise HTTPException(400, "invalid refresh_token")
        if existing["revoked_at"] is not None or existing["rotated_to"] is not None:
            logger.warning(
                "Refresh token reuse detected — revoking chain. client=%s user=%s",
                existing["client_id"], existing["user_id"],
            )
            await oauth_db.revoke_refresh_chain(pool, old_hash)
            raise HTTPException(400, "refresh_token reused — chain revoked")

        # Normal rotation
        new_refresh = generate_opaque_token("refresh")
        rotated = await oauth_db.rotate_refresh_token(
            pool, old_hash=old_hash, new_hash=hash_token(new_refresh),
        )
        if rotated is None:
            raise HTTPException(400, "refresh_token could not be rotated")

        # Issue a new access token + store the new refresh token row.
        access = generate_opaque_token("oauth")
        await oauth_db.issue_access_token(
            pool,
            token_hash=hash_token(access),
            client_id=rotated["client_id"],
            user_id=rotated["user_id"],
            share_token_id=rotated["share_token_id"],
            scope="orbis.read",
            ttl_seconds=settings.oauth_access_token_ttl_seconds,
        )
        await oauth_db.issue_refresh_token(
            pool,
            token_hash=hash_token(new_refresh),
            client_id=rotated["client_id"],
            user_id=rotated["user_id"],
            share_token_id=rotated["share_token_id"],
            ttl_seconds=settings.oauth_refresh_token_ttl_seconds,
        )
        return {
            "access_token": access,
            "token_type": "Bearer",
            "expires_in": settings.oauth_access_token_ttl_seconds,
            "refresh_token": new_refresh,
            "scope": "orbis.read",
        }

    raise HTTPException(400, "unsupported grant_type")
```

- [ ] **Step 4: Wire router**

```python
from app.oauth.token_router import router as oauth_token_router
app.include_router(oauth_token_router)
```

- [ ] **Step 5: Run tests, confirm PASS**

```bash
cd backend && uv run pytest tests/unit/test_oauth_token.py -v
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/oauth/token_router.py backend/app/main.py backend/tests/unit/test_oauth_token.py
git commit -m "feat(oauth): /oauth/token with code exchange + refresh rotation + reuse detection"
```

---

## Task 6: Revocation endpoint

`POST /oauth/revoke` per RFC 7009.

**Files:**
- Create: `backend/app/oauth/revoke_router.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/unit/test_oauth_revoke.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/unit/test_oauth_revoke.py`:

```python
"""Tests for POST /oauth/revoke (RFC 7009)."""

from __future__ import annotations

import pytest

from app.oauth import db as oauth_db
from app.oauth.tokens import generate_opaque_token, hash_token


async def test_revokes_access_token(async_client, pg_pool):
    cid = await oauth_db.register_client(
        pg_pool, client_name="x", redirect_uris=["https://e.com/cb"],
        token_endpoint_auth_method="none", client_secret_hash=None,
        registered_from_ip=None, registered_user_agent=None,
    )
    access = generate_opaque_token("oauth")
    await oauth_db.issue_access_token(
        pg_pool, token_hash=hash_token(access), client_id=cid,
        user_id="u1", share_token_id=None, scope="orbis.read", ttl_seconds=3600,
    )
    resp = await async_client.post(
        "/oauth/revoke",
        data={"token": access, "token_type_hint": "access_token"},
    )
    assert resp.status_code == 200
    assert await oauth_db.resolve_access_token(pg_pool, hash_token(access)) is None


async def test_revokes_refresh_token(async_client, pg_pool):
    cid = await oauth_db.register_client(
        pg_pool, client_name="x", redirect_uris=["https://e.com/cb"],
        token_endpoint_auth_method="none", client_secret_hash=None,
        registered_from_ip=None, registered_user_agent=None,
    )
    refresh = generate_opaque_token("refresh")
    await oauth_db.issue_refresh_token(
        pg_pool, token_hash=hash_token(refresh), client_id=cid,
        user_id="u1", share_token_id=None, ttl_seconds=2592000,
    )
    resp = await async_client.post(
        "/oauth/revoke",
        data={"token": refresh, "token_type_hint": "refresh_token"},
    )
    assert resp.status_code == 200
    row = await oauth_db.get_refresh_token(pg_pool, hash_token(refresh))
    assert row["revoked_at"] is not None


async def test_unknown_token_returns_200(async_client):
    """RFC 7009: invalid tokens get 200 — opaque to probing."""
    resp = await async_client.post(
        "/oauth/revoke",
        data={"token": "oauth_doesnotexist"},
    )
    assert resp.status_code == 200
```

- [ ] **Step 2: Run tests, confirm FAIL**

```bash
cd backend && uv run pytest tests/unit/test_oauth_revoke.py -v
```

- [ ] **Step 3: Implement revoke router**

Create `backend/app/oauth/revoke_router.py`:

```python
"""POST /oauth/revoke — RFC 7009 token revocation."""

from __future__ import annotations

from fastapi import APIRouter, Form, HTTPException

from app.config import settings
from app.db.postgres import get_pool
from app.oauth import db as oauth_db
from app.oauth.tokens import hash_token

router = APIRouter(prefix="/oauth", tags=["oauth"])


@router.post("/revoke")
async def revoke_endpoint(
    token: str = Form(...),
    token_type_hint: str | None = Form(None),
) -> dict:
    if not settings.oauth_enabled:
        raise HTTPException(503, "OAuth disabled")

    pool = await get_pool()
    token_hash = hash_token(token)

    # Always attempt both, per RFC 7009 — we don't know for sure
    # which kind the caller sent, and hints are hints.
    await oauth_db.revoke_access_token(pool, token_hash)
    await oauth_db.revoke_refresh_token(pool, token_hash)
    return {}
```

- [ ] **Step 4: Wire router + run tests + commit**

```bash
# In main.py:
from app.oauth.revoke_router import router as oauth_revoke_router
app.include_router(oauth_revoke_router)
```

```bash
cd backend && uv run pytest tests/unit/test_oauth_revoke.py -v
git add backend/app/oauth/revoke_router.py backend/app/main.py backend/tests/unit/test_oauth_revoke.py
git commit -m "feat(oauth): POST /oauth/revoke (RFC 7009)"
```

---

## Task 7: Discovery endpoints (`.well-known/...`)

`GET /.well-known/oauth-authorization-server` on the main API, plus `/.well-known/oauth-protected-resource` on the MCP server.

**Files:**
- Create: `backend/app/oauth/well_known_router.py`
- Modify: `backend/app/main.py`
- Modify: `backend/mcp_server/server.py` (add a second `Route` for the MCP-side `.well-known`)
- Test: `backend/tests/unit/test_oauth_well_known.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/unit/test_oauth_well_known.py`:

```python
async def test_oauth_authorization_server_metadata(async_client):
    resp = await async_client.get("/.well-known/oauth-authorization-server")
    assert resp.status_code == 200
    body = resp.json()
    assert body["issuer"]
    assert body["authorization_endpoint"].endswith("/oauth/authorize")
    assert body["token_endpoint"].endswith("/oauth/token")
    assert body["registration_endpoint"].endswith("/oauth/register")
    assert body["revocation_endpoint"].endswith("/oauth/revoke")
    assert "authorization_code" in body["grant_types_supported"]
    assert "refresh_token" in body["grant_types_supported"]
    assert body["code_challenge_methods_supported"] == ["S256"]
```

- [ ] **Step 2: Implement**

Create `backend/app/oauth/well_known_router.py`:

```python
from __future__ import annotations

from fastapi import APIRouter

from app.config import settings

router = APIRouter()


@router.get("/.well-known/oauth-authorization-server")
async def oauth_authorization_server_metadata() -> dict:
    base = settings.frontend_url.rstrip("/")
    return {
        "issuer": base,
        "authorization_endpoint": f"{base}/oauth/authorize",
        "token_endpoint": f"{base}/oauth/token",
        "registration_endpoint": f"{base}/oauth/register",
        "revocation_endpoint": f"{base}/oauth/revoke",
        "scopes_supported": ["orbis.read"],
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "token_endpoint_auth_methods_supported": ["none", "client_secret_post"],
        "code_challenge_methods_supported": ["S256"],
    }
```

- [ ] **Step 3: Wire router + add `.well-known/oauth-protected-resource` on MCP server**

In `backend/app/main.py`:
```python
from app.oauth.well_known_router import router as oauth_well_known_router
app.include_router(oauth_well_known_router)
```

In `backend/mcp_server/server.py`, inside `_build_starlette_app` (before the return):

```python
    from starlette.routing import Route
    from starlette.responses import JSONResponse

    async def oauth_resource_metadata(request):
        from app.config import settings
        return JSONResponse({
            "resource": f"{settings.cloud_run_url or 'http://localhost:8081'}/mcp",
            "authorization_servers": [settings.frontend_url],
        })

    app.routes.append(Route("/.well-known/oauth-protected-resource", oauth_resource_metadata))
```

- [ ] **Step 4: Run tests + commit**

```bash
cd backend && uv run pytest tests/unit/test_oauth_well_known.py -v
git add backend/app/oauth/well_known_router.py backend/app/main.py backend/mcp_server/server.py backend/tests/unit/test_oauth_well_known.py
git commit -m "feat(oauth): .well-known discovery endpoints (auth server + resource)"
```

---

## Task 8: MCP server OAuth resolver + middleware Bearer branch

Adds the third auth branch to `APIKeyMiddleware.dispatch`.

**Files:**
- Create: `backend/mcp_server/oauth_resolver.py`
- Modify: `backend/mcp_server/auth.py`
- Test: `backend/tests/unit/test_mcp_oauth_middleware.py`
- Test: `backend/tests/unit/test_oauth_resolver.py`

- [ ] **Step 1: Write failing tests for `resolve_oauth_token`**

Create `backend/tests/unit/test_oauth_resolver.py`:

```python
from __future__ import annotations

import pytest

from app.oauth import db as oauth_db
from app.oauth.tokens import generate_opaque_token, hash_token
from mcp_server.oauth_resolver import resolve_oauth_token


async def test_returns_grant_for_valid_token(pg_pool):
    cid = await oauth_db.register_client(
        pg_pool, client_name="t", redirect_uris=["https://e.com/cb"],
        token_endpoint_auth_method="none", client_secret_hash=None,
        registered_from_ip=None, registered_user_agent=None,
    )
    tok = generate_opaque_token("oauth")
    await oauth_db.issue_access_token(
        pg_pool, token_hash=hash_token(tok), client_id=cid,
        user_id="user-1", share_token_id=None,
        scope="orbis.read", ttl_seconds=3600,
    )
    grant = await resolve_oauth_token(pg_pool, tok)
    assert grant is not None
    assert grant["user_id"] == "user-1"
    assert grant["share_token_id"] is None


async def test_returns_none_for_revoked(pg_pool):
    cid = await oauth_db.register_client(
        pg_pool, client_name="t", redirect_uris=["https://e.com/cb"],
        token_endpoint_auth_method="none", client_secret_hash=None,
        registered_from_ip=None, registered_user_agent=None,
    )
    tok = generate_opaque_token("oauth")
    await oauth_db.issue_access_token(
        pg_pool, token_hash=hash_token(tok), client_id=cid,
        user_id="user-1", share_token_id=None,
        scope="orbis.read", ttl_seconds=3600,
    )
    await oauth_db.revoke_access_token(pg_pool, hash_token(tok))
    assert await resolve_oauth_token(pg_pool, tok) is None


async def test_returns_none_for_unknown(pg_pool):
    assert await resolve_oauth_token(pg_pool, "oauth_not-real") is None
```

- [ ] **Step 2: Implement `backend/mcp_server/oauth_resolver.py`**

```python
"""OAuth-token resolution for the MCP transport.

Mirrors the share-token resolver in app.orbs.share_token. Takes a raw
Bearer token, looks it up in Postgres, and either returns a grant dict
or None.
"""

from __future__ import annotations

import asyncio
import logging

from app.oauth import db as oauth_db
from app.oauth.tokens import hash_token

logger = logging.getLogger(__name__)


async def resolve_oauth_token(pool, raw_token: str) -> dict | None:
    """Return a grant dict (user_id, share_token_id, scope) or None."""
    if not raw_token:
        return None
    h = hash_token(raw_token)
    grant = await oauth_db.resolve_access_token(pool, h)
    if grant is None:
        return None
    # Fire-and-forget last_used_at update
    asyncio.create_task(oauth_db.touch_access_token(pool, h))
    return grant
```

- [ ] **Step 3: Extend `APIKeyMiddleware.dispatch`**

In `backend/mcp_server/auth.py`, add a third branch after the `orbs_` elif (and before the unrecognized `else`):

```python
        auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
        if not raw_key and auth_header and auth_header.startswith("Bearer "):
            from app.db.postgres import get_pool
            from app.orbs.share_token import validate_share_token_for_mcp
            from mcp_server.oauth_resolver import resolve_oauth_token

            bearer = auth_header[len("Bearer "):]
            pool = await get_pool()
            grant = await resolve_oauth_token(pool, bearer)
            if grant is None:
                return JSONResponse(
                    status_code=401,
                    content={"error": "invalid, expired, or revoked access token"},
                )

            if grant.get("share_token_id"):
                ctx = await validate_share_token_for_mcp(
                    driver, grant["share_token_id"],
                )
                if ctx is None:
                    return JSONResponse(
                        status_code=401,
                        content={"error": "share token for this grant is no longer valid"},
                    )
                share_token_reset = _current_share_context.set(ctx)
            else:
                user_token = _current_user_id.set(grant["user_id"])
        elif not raw_key:
            # No X-MCP-Key, no Authorization Bearer — 401 as before
            return JSONResponse(
                status_code=401,
                content={"error": "missing X-MCP-Key header"},
            )
```

Note: the existing `elif raw_key.startswith("orbk_"):` and `elif raw_key.startswith("orbs_"):` branches remain. The new Bearer branch is conceptually parallel to them. Place it AFTER those so the cheaper `X-MCP-Key` checks run first.

- [ ] **Step 4: Write failing tests for middleware**

Create `backend/tests/unit/test_mcp_oauth_middleware.py`:

```python
"""Tests for the Authorization: Bearer branch in APIKeyMiddleware."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from mcp_server import auth as mcp_auth
from mcp_server.auth import ShareContext


@pytest.fixture(autouse=True)
def reset_context():
    user_tok = mcp_auth._current_user_id.set(None)
    share_tok = mcp_auth._current_share_context.set(None)
    yield
    mcp_auth._current_user_id.reset(user_tok)
    mcp_auth._current_share_context.reset(share_tok)


async def test_bearer_full_mode_sets_user_id(monkeypatch):
    """A Bearer token with share_token_id=None sets _current_user_id."""
    from starlette.applications import Starlette
    from starlette.responses import JSONResponse
    from starlette.routing import Route
    from starlette.testclient import TestClient

    seen: dict = {}

    async def ping(request):
        seen["user_id"] = mcp_auth.get_current_user_id()
        seen["share_ctx"] = mcp_auth.get_share_context()
        return JSONResponse({"ok": True})

    async def fake_driver_factory():
        return MagicMock()

    async def fake_resolve(pool, raw):
        return {"user_id": "user-bearer", "share_token_id": None, "scope": "orbis.read"}

    import mcp_server.oauth_resolver as resolver_module
    monkeypatch.setattr(resolver_module, "resolve_oauth_token", fake_resolve)
    monkeypatch.setattr("app.db.postgres.get_pool", lambda: MagicMock())

    app = Starlette(routes=[Route("/mcp", ping)])
    app.add_middleware(mcp_auth.APIKeyMiddleware, driver_factory=fake_driver_factory)
    client = TestClient(app)

    r = client.get("/mcp", headers={"Authorization": "Bearer oauth_abc"})
    assert r.status_code == 200
    assert seen["user_id"] == "user-bearer"
    assert seen["share_ctx"] is None


async def test_bearer_restricted_mode_sets_share_context(monkeypatch):
    """A Bearer token bound to a share_token_id sets _current_share_context."""
    from starlette.applications import Starlette
    from starlette.responses import JSONResponse
    from starlette.routing import Route
    from starlette.testclient import TestClient

    seen: dict = {}

    async def ping(request):
        ctx = mcp_auth.get_share_context()
        seen["orb_id"] = ctx.orb_id if ctx else None
        seen["user_id"] = mcp_auth.get_current_user_id()
        return JSONResponse({"ok": True})

    async def fake_driver_factory():
        return MagicMock()

    async def fake_resolve(pool, raw):
        return {"user_id": "user-bearer", "share_token_id": "tok-s", "scope": "orbis.read"}

    async def fake_validate(db, token_id):
        return ShareContext(
            orb_id="orb-scoped",
            keywords=(),
            hidden_node_types=("skill",),
            token_id="tok-s",
        )

    import mcp_server.oauth_resolver as resolver_module
    import app.orbs.share_token as share_token_module
    monkeypatch.setattr(resolver_module, "resolve_oauth_token", fake_resolve)
    monkeypatch.setattr(share_token_module, "validate_share_token_for_mcp", fake_validate)
    monkeypatch.setattr("app.db.postgres.get_pool", lambda: MagicMock())

    app = Starlette(routes=[Route("/mcp", ping)])
    app.add_middleware(mcp_auth.APIKeyMiddleware, driver_factory=fake_driver_factory)
    client = TestClient(app)

    r = client.get("/mcp", headers={"Authorization": "Bearer oauth_xyz"})
    assert r.status_code == 200
    assert seen["orb_id"] == "orb-scoped"
    assert seen["user_id"] is None


async def test_invalid_bearer_returns_401(monkeypatch):
    from starlette.applications import Starlette
    from starlette.responses import PlainTextResponse
    from starlette.routing import Route
    from starlette.testclient import TestClient

    async def ping(request):
        return PlainTextResponse("pong")

    async def fake_driver_factory():
        return MagicMock()

    async def fake_resolve(pool, raw):
        return None

    import mcp_server.oauth_resolver as resolver_module
    monkeypatch.setattr(resolver_module, "resolve_oauth_token", fake_resolve)
    monkeypatch.setattr("app.db.postgres.get_pool", lambda: MagicMock())

    app = Starlette(routes=[Route("/mcp", ping)])
    app.add_middleware(mcp_auth.APIKeyMiddleware, driver_factory=fake_driver_factory)
    client = TestClient(app)

    r = client.get("/mcp", headers={"Authorization": "Bearer oauth_bad"})
    assert r.status_code == 401
```

- [ ] **Step 5: Run tests, confirm PASS**

```bash
cd backend && uv run pytest tests/unit/test_mcp_oauth_middleware.py tests/unit/test_oauth_resolver.py -v
```

- [ ] **Step 6: Commit**

```bash
git add backend/mcp_server/oauth_resolver.py backend/mcp_server/auth.py backend/tests/unit/test_oauth_resolver.py backend/tests/unit/test_mcp_oauth_middleware.py
git commit -m "feat(mcp): Authorization: Bearer oauth_ branch in APIKeyMiddleware"
```

---

## Task 9: Grants API (`GET /api/oauth/grants`, `DELETE /api/oauth/grants/:client_id`)

**Files:**
- Create: `backend/app/oauth/grants_router.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/unit/test_oauth_grants_router.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/unit/test_oauth_grants_router.py`:

```python
from __future__ import annotations

import pytest

from app.oauth import db as oauth_db
from app.oauth.tokens import generate_opaque_token, hash_token


async def test_list_grants_scoped_to_current_user(async_client_with_user, pg_pool):
    """A user sees only their own grants."""
    cid = await oauth_db.register_client(
        pg_pool, client_name="ChatGPT", redirect_uris=["https://e.com/cb"],
        token_endpoint_auth_method="none", client_secret_hash=None,
        registered_from_ip=None, registered_user_agent=None,
    )
    # Current user's token
    tok_mine = generate_opaque_token("oauth")
    await oauth_db.issue_access_token(
        pg_pool, token_hash=hash_token(tok_mine), client_id=cid,
        user_id="user-me", share_token_id=None, scope="orbis.read", ttl_seconds=3600,
    )
    # Someone else's token for the same client
    tok_theirs = generate_opaque_token("oauth")
    await oauth_db.issue_access_token(
        pg_pool, token_hash=hash_token(tok_theirs), client_id=cid,
        user_id="user-other", share_token_id=None, scope="orbis.read", ttl_seconds=3600,
    )

    resp = await async_client_with_user.get("/api/oauth/grants")
    assert resp.status_code == 200
    grants = resp.json()["grants"]
    assert len(grants) == 1
    assert grants[0]["client_name"] == "ChatGPT"


async def test_revoke_grant_removes_all_tokens(async_client_with_user, pg_pool):
    cid = await oauth_db.register_client(
        pg_pool, client_name="ChatGPT", redirect_uris=["https://e.com/cb"],
        token_endpoint_auth_method="none", client_secret_hash=None,
        registered_from_ip=None, registered_user_agent=None,
    )
    access = generate_opaque_token("oauth")
    refresh = generate_opaque_token("refresh")
    await oauth_db.issue_access_token(
        pg_pool, token_hash=hash_token(access), client_id=cid,
        user_id="user-me", share_token_id=None, scope="orbis.read", ttl_seconds=3600,
    )
    await oauth_db.issue_refresh_token(
        pg_pool, token_hash=hash_token(refresh), client_id=cid,
        user_id="user-me", share_token_id=None, ttl_seconds=2592000,
    )

    resp = await async_client_with_user.delete(f"/api/oauth/grants/{cid}")
    assert resp.status_code == 200

    assert await oauth_db.resolve_access_token(pg_pool, hash_token(access)) is None
    row = await oauth_db.get_refresh_token(pg_pool, hash_token(refresh))
    assert row["revoked_at"] is not None


async def test_revoke_other_users_grant_rejected(async_client_with_user, pg_pool):
    cid = await oauth_db.register_client(
        pg_pool, client_name="ChatGPT", redirect_uris=["https://e.com/cb"],
        token_endpoint_auth_method="none", client_secret_hash=None,
        registered_from_ip=None, registered_user_agent=None,
    )
    # Give the OTHER user a token for this client
    tok = generate_opaque_token("oauth")
    await oauth_db.issue_access_token(
        pg_pool, token_hash=hash_token(tok), client_id=cid,
        user_id="user-other", share_token_id=None, scope="orbis.read", ttl_seconds=3600,
    )
    # Current user tries to revoke that grant (they have no grant for this client)
    resp = await async_client_with_user.delete(f"/api/oauth/grants/{cid}")
    assert resp.status_code in (200, 404)  # idempotent
    # The other user's token must still work
    assert await oauth_db.resolve_access_token(pg_pool, hash_token(tok)) is not None
```

- [ ] **Step 2: Implement**

Create `backend/app/oauth/grants_router.py`:

```python
"""User-facing GET /api/oauth/grants + DELETE /api/oauth/grants/{client_id}."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.db.postgres import get_pool
from app.dependencies import get_current_user

router = APIRouter(prefix="/oauth", tags=["oauth"])


@router.get("/grants")
async def list_grants(user: dict = Depends(get_current_user)) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT ON (c.client_id, r.share_token_id)
                   c.client_id,
                   c.client_name,
                   r.share_token_id,
                   r.issued_at        AS connected_at,
                   MAX(a.last_used_at) OVER (PARTITION BY a.client_id, a.user_id) AS last_used_at
              FROM oauth_refresh_tokens r
              JOIN oauth_clients c USING (client_id)
         LEFT JOIN oauth_access_tokens a
                ON a.client_id = r.client_id AND a.user_id = r.user_id
             WHERE r.user_id = $1
               AND r.revoked_at IS NULL
               AND r.expires_at > now()
          ORDER BY c.client_id, r.share_token_id, r.issued_at ASC
            """,
            user["user_id"],
        )
    return {
        "grants": [
            {
                "client_id": str(row["client_id"]),
                "client_name": row["client_name"],
                "share_token_id": row["share_token_id"],
                "share_token_label": None,  # populated client-side via /share-tokens list
                "connected_at": row["connected_at"].isoformat(),
                "last_used_at": row["last_used_at"].isoformat() if row["last_used_at"] else None,
            }
            for row in rows
        ]
    }


@router.delete("/grants/{client_id}")
async def revoke_grant(
    client_id: str,
    user: dict = Depends(get_current_user),
) -> dict:
    try:
        cid = uuid.UUID(client_id)
    except ValueError as e:
        raise HTTPException(400, "invalid client_id") from e
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """
                UPDATE oauth_access_tokens
                   SET revoked_at = now()
                 WHERE client_id = $1 AND user_id = $2 AND revoked_at IS NULL
                """,
                cid, user["user_id"],
            )
            await conn.execute(
                """
                UPDATE oauth_refresh_tokens
                   SET revoked_at = now()
                 WHERE client_id = $1 AND user_id = $2 AND revoked_at IS NULL
                """,
                cid, user["user_id"],
            )
    return {"status": "revoked"}
```

Wire in `backend/app/main.py`:

```python
from app.oauth.grants_router import router as oauth_grants_router
app.include_router(oauth_grants_router, prefix="/api")
```

- [ ] **Step 3: Run tests + commit**

```bash
cd backend && uv run pytest tests/unit/test_oauth_grants_router.py -v
git add backend/app/oauth/grants_router.py backend/app/main.py backend/tests/unit/test_oauth_grants_router.py
git commit -m "feat(oauth): /api/oauth/grants list + revoke (user-facing)"
```

---

## Task 10: Cascade revocation

When a user revokes a share token, cascade revoke OAuth grants bound to it. When a user deletes their account, cascade all OAuth data for that user.

**Files:**
- Modify: `backend/app/orbs/share_token.py` (extend `revoke_share_token`)
- Modify: `backend/app/main.py` or account-cleanup function (extend user delete)
- Test: `backend/tests/unit/test_oauth_cascade.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/unit/test_oauth_cascade.py`:

```python
from __future__ import annotations

from app.oauth import db as oauth_db
from app.oauth.tokens import generate_opaque_token, hash_token


async def test_revoking_share_token_cascades_to_oauth(pg_pool, neo4j_driver, seed_person):
    """Revoking a share token revokes every OAuth grant bound to it."""
    from app.orbs.share_token import create_share_token, revoke_share_token

    tok_row = await create_share_token(
        neo4j_driver, user_id=seed_person["user_id"], label="test",
    )
    cid = await oauth_db.register_client(
        pg_pool, client_name="x", redirect_uris=["https://e.com/cb"],
        token_endpoint_auth_method="none", client_secret_hash=None,
        registered_from_ip=None, registered_user_agent=None,
    )
    access = generate_opaque_token("oauth")
    await oauth_db.issue_access_token(
        pg_pool, token_hash=hash_token(access), client_id=cid,
        user_id=seed_person["user_id"], share_token_id=tok_row["token_id"],
        scope="orbis.read", ttl_seconds=3600,
    )

    await revoke_share_token(
        neo4j_driver, seed_person["user_id"], tok_row["token_id"], pg_pool=pg_pool,
    )

    assert await oauth_db.resolve_access_token(pg_pool, hash_token(access)) is None


async def test_account_delete_cascades_all_oauth(pg_pool, neo4j_driver, seed_person):
    from app.main import cleanup_expired_accounts  # or whatever the delete entry point is

    cid = await oauth_db.register_client(
        pg_pool, client_name="x", redirect_uris=["https://e.com/cb"],
        token_endpoint_auth_method="none", client_secret_hash=None,
        registered_from_ip=None, registered_user_agent=None,
    )
    access = generate_opaque_token("oauth")
    refresh = generate_opaque_token("refresh")
    await oauth_db.issue_access_token(
        pg_pool, token_hash=hash_token(access), client_id=cid,
        user_id=seed_person["user_id"], share_token_id=None,
        scope="orbis.read", ttl_seconds=3600,
    )
    await oauth_db.issue_refresh_token(
        pg_pool, token_hash=hash_token(refresh), client_id=cid,
        user_id=seed_person["user_id"], share_token_id=None,
        ttl_seconds=2592000,
    )

    # Simulate the delete path
    from app.oauth.db import cascade_delete_user_oauth
    await cascade_delete_user_oauth(pg_pool, seed_person["user_id"])

    async with pg_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT 1 FROM oauth_access_tokens WHERE user_id = $1", seed_person["user_id"],
        )
    assert len(rows) == 0
```

- [ ] **Step 2: Implement**

Extend `backend/app/oauth/db.py`:

```python
async def cascade_revoke_oauth_by_share_token(pool, share_token_id: str) -> None:
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "UPDATE oauth_access_tokens SET revoked_at = now() WHERE share_token_id = $1 AND revoked_at IS NULL",
                share_token_id,
            )
            await conn.execute(
                "UPDATE oauth_refresh_tokens SET revoked_at = now() WHERE share_token_id = $1 AND revoked_at IS NULL",
                share_token_id,
            )


async def cascade_delete_user_oauth(pool, user_id: str) -> None:
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("DELETE FROM oauth_access_tokens WHERE user_id = $1", user_id)
            await conn.execute("DELETE FROM oauth_refresh_tokens WHERE user_id = $1", user_id)
            await conn.execute(
                """
                DELETE FROM oauth_authorization_codes
                 WHERE user_id = $1
                """,
                user_id,
            )
```

Extend `revoke_share_token` in `backend/app/orbs/share_token.py` to accept an optional `pg_pool` and cascade:

```python
async def revoke_share_token(
    db: AsyncDriver,
    user_id: str,
    token_id: str,
    *,
    pg_pool=None,
) -> dict | None:
    """... (existing docstring) ..."""
    # existing Cypher revoke unchanged

    if pg_pool is not None:
        from app.oauth.db import cascade_revoke_oauth_by_share_token
        await cascade_revoke_oauth_by_share_token(pg_pool, token_id)

    return ...  # existing return
```

Update the call site in `backend/app/orbs/router.py` where `revoke_share_token` is called to pass `pg_pool`:

```python
pool = await get_pool()
result = await revoke_share_token(db, user_id, token_id, pg_pool=pool)
```

Extend account deletion (find the existing user-delete path in `main.py` or `auth/router.py`) to call `cascade_delete_user_oauth(pool, user_id)`.

- [ ] **Step 3: Run tests + commit**

```bash
cd backend && uv run pytest tests/unit/test_oauth_cascade.py -v
git add backend/app/oauth/db.py backend/app/orbs/share_token.py backend/app/orbs/router.py backend/app/main.py backend/tests/unit/test_oauth_cascade.py
git commit -m "feat(oauth): cascade revoke on share-token revoke + user delete"
```

---

## Task 11: Frontend — Consent page + routing

New React page at `/oauth/authorize`.

**Files:**
- Create: `frontend/src/pages/ConsentPage.tsx`
- Create: `frontend/src/pages/ConsentPage.test.tsx`
- Create: `frontend/src/api/oauth.ts`
- Modify: `frontend/src/App.tsx` (register route)

- [ ] **Step 1: Implement `frontend/src/api/oauth.ts`**

```typescript
import { client } from './client';

export interface AuthorizeContext {
  login_required: boolean;
  next?: string;
  client_id?: string;
  client_name?: string;
  registered_at?: string;
  registered_from_ip?: string | null;
  redirect_uri?: string;
  scope?: string;
}

export async function getAuthorizeContext(
  searchParams: URLSearchParams,
): Promise<AuthorizeContext> {
  const { data } = await client.get(`/oauth/authorize?${searchParams.toString()}`);
  return data;
}

export async function submitConsent(body: {
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  scope?: string;
  access_mode: 'full' | 'restricted';
  share_token_id?: string;
}): Promise<{ code: string; state: string; redirect_uri: string }> {
  const { data } = await client.post('/oauth/authorize', body);
  return data;
}

export interface OAuthGrant {
  client_id: string;
  client_name: string;
  share_token_id: string | null;
  share_token_label: string | null;
  connected_at: string;
  last_used_at: string | null;
}

export async function listGrants(): Promise<{ grants: OAuthGrant[] }> {
  const { data } = await client.get('/api/oauth/grants');
  return data;
}

export async function revokeGrant(clientId: string): Promise<void> {
  await client.delete(`/api/oauth/grants/${clientId}`);
}
```

- [ ] **Step 2: Implement `ConsentPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAuthorizeContext, submitConsent, type AuthorizeContext } from '../api/oauth';
import { listShareTokens, type ShareToken } from '../api/orbs';

export default function ConsentPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);

  const [ctx, setCtx] = useState<AuthorizeContext | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<'full' | 'restricted'>('full');
  const [tokens, setTokens] = useState<ShareToken[]>([]);
  const [pickedTokenId, setPickedTokenId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getAuthorizeContext(params)
      .then((c) => {
        if (c.login_required) {
          navigate(`/login?next=${encodeURIComponent(c.next ?? '/myorbis')}`);
          return;
        }
        setCtx(c);
      })
      .catch((e) => setErr(e?.response?.data?.detail ?? 'Authorization failed'));
  }, []);

  useEffect(() => {
    if (mode === 'restricted' && tokens.length === 0) {
      listShareTokens().then((r) => setTokens(r.tokens.filter((t) => !t.revoked)));
    }
  }, [mode]);

  async function onAllow() {
    if (!ctx) return;
    setSubmitting(true);
    try {
      const result = await submitConsent({
        client_id: ctx.client_id!,
        redirect_uri: ctx.redirect_uri!,
        state: params.get('state') ?? '',
        code_challenge: params.get('code_challenge') ?? '',
        code_challenge_method: 'S256',
        scope: ctx.scope,
        access_mode: mode,
        share_token_id: mode === 'restricted' ? pickedTokenId : undefined,
      });
      const u = new URL(result.redirect_uri);
      u.searchParams.set('code', result.code);
      u.searchParams.set('state', result.state);
      window.location.assign(u.toString());
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? 'Consent failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (err) return <div className="p-8 text-red-400">{err}</div>;
  if (!ctx) return <div className="p-8 text-gray-400">Loading…</div>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="max-w-md w-full p-6 rounded-xl border border-gray-700 bg-gray-900 shadow-xl">
        <h1 className="text-white text-lg font-semibold mb-2">
          {ctx.client_name} wants to access your Orbis data.
        </h1>
        <p className="text-gray-400 text-sm mb-4">
          Choose how much of your data {ctx.client_name} can read.
        </p>

        <label className="flex items-start gap-2 mb-3 text-white">
          <input
            type="radio"
            checked={mode === 'full'}
            onChange={() => setMode('full')}
            className="mt-1"
          />
          <span>
            <strong>Full access.</strong>{' '}
            <span className="text-gray-400 text-sm">
              {ctx.client_name} reads your own orb, shared orbs, and any public orbs.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 mb-4 text-white">
          <input
            type="radio"
            checked={mode === 'restricted'}
            onChange={() => setMode('restricted')}
            className="mt-1"
          />
          <span className="flex-1">
            <strong>Restricted access.</strong>{' '}
            <span className="text-gray-400 text-sm">
              Use a share token to limit what {ctx.client_name} sees.
            </span>
            {mode === 'restricted' && (
              <select
                value={pickedTokenId}
                onChange={(e) => setPickedTokenId(e.target.value)}
                className="mt-2 w-full bg-gray-950 border border-gray-800 rounded px-2 py-1 text-white text-xs"
              >
                <option value="">— pick a share token —</option>
                {tokens.map((t) => (
                  <option key={t.token_id} value={t.token_id}>
                    {t.label ?? `Token ${t.token_id.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            )}
          </span>
        </label>

        <p className="text-[10px] text-gray-500 mb-4">
          Registered: {new Date(ctx.registered_at ?? '').toLocaleString()} ·
          from IP {ctx.registered_from_ip ?? '—'} · client id {ctx.client_id}
        </p>

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="h-8 px-3 rounded border border-gray-700 bg-gray-800 text-white text-xs"
          >
            Deny
          </button>
          <button
            type="button"
            onClick={onAllow}
            disabled={submitting || (mode === 'restricted' && !pickedTokenId)}
            className="h-8 px-3 rounded bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium disabled:opacity-50"
          >
            {submitting ? 'Approving…' : 'Allow'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Register the route in `frontend/src/App.tsx`**

```tsx
import ConsentPage from './pages/ConsentPage';
// … inside Routes:
<Route path="/oauth/authorize" element={<ConsentPage />} />
```

- [ ] **Step 4: Write minimal tests**

Create `frontend/src/pages/ConsentPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ConsentPage from './ConsentPage';

vi.mock('../api/oauth');
vi.mock('../api/orbs');
import { getAuthorizeContext, submitConsent } from '../api/oauth';
import { listShareTokens } from '../api/orbs';

describe('ConsentPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders client name and offers Full/Restricted modes', async () => {
    (getAuthorizeContext as any).mockResolvedValue({
      login_required: false,
      client_id: 'c-1',
      client_name: 'ChatGPT',
      registered_at: '2026-04-20T00:00:00Z',
      registered_from_ip: '1.2.3.4',
      redirect_uri: 'https://chat.openai.com/cb',
      scope: 'orbis.read',
    });

    render(
      <MemoryRouter initialEntries={['/oauth/authorize?client_id=c-1&state=s&code_challenge=abc&code_challenge_method=S256&redirect_uri=https://chat.openai.com/cb&response_type=code']}>
        <Routes>
          <Route path="/oauth/authorize" element={<ConsentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText(/ChatGPT wants to access/)).toBeInTheDocument());
    expect(screen.getByText(/Full access/)).toBeInTheDocument();
    expect(screen.getByText(/Restricted access/)).toBeInTheDocument();
  });

  it('Restricted mode loads share tokens and binds on Allow', async () => {
    (getAuthorizeContext as any).mockResolvedValue({
      login_required: false,
      client_id: 'c-1',
      client_name: 'ChatGPT',
      registered_at: '2026-04-20T00:00:00Z',
      registered_from_ip: '1.2.3.4',
      redirect_uri: 'https://chat.openai.com/cb',
      scope: 'orbis.read',
    });
    (listShareTokens as any).mockResolvedValue({
      tokens: [{ token_id: 'tok-1', label: 'Recruiter view', revoked: false, keywords: [], hidden_node_types: [], orb_id: 'orb-1', created_at: '', expires_at: null, mcp_last_used_at: null, mcp_use_count: 0 }],
    });
    (submitConsent as any).mockResolvedValue({
      code: 'ac-abc', state: 's', redirect_uri: 'https://chat.openai.com/cb',
    });

    const assign = vi.fn();
    Object.defineProperty(window, 'location', { value: { assign }, writable: true });

    render(
      <MemoryRouter initialEntries={['/oauth/authorize?client_id=c-1&state=s&code_challenge=abc&code_challenge_method=S256&redirect_uri=https://chat.openai.com/cb&response_type=code']}>
        <Routes>
          <Route path="/oauth/authorize" element={<ConsentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => screen.getByText(/Restricted access/));
    fireEvent.click(screen.getByLabelText(/Restricted access/i, { exact: false }));
    await waitFor(() => screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'tok-1' } });
    fireEvent.click(screen.getByText(/^Allow$/));

    await waitFor(() => expect(submitConsent).toHaveBeenCalled());
    const call = (submitConsent as any).mock.calls[0][0];
    expect(call.access_mode).toBe('restricted');
    expect(call.share_token_id).toBe('tok-1');
  });
});
```

- [ ] **Step 5: Run tests + build**

```bash
cd frontend && npx vitest run src/pages/ConsentPage.test.tsx
cd frontend && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ConsentPage.tsx frontend/src/pages/ConsentPage.test.tsx frontend/src/api/oauth.ts frontend/src/App.tsx
git commit -m "feat(frontend): OAuth consent page (/oauth/authorize)"
```

---

## Task 12: Frontend — Connected AI Clients page

`/myorbis/connected-ai`.

**Files:**
- Create: `frontend/src/pages/ConnectedAiClientsPage.tsx`
- Create: `frontend/src/pages/ConnectedAiClientsPage.test.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useState } from 'react';
import { listGrants, revokeGrant, type OAuthGrant } from '../api/oauth';
import { useToastStore } from '../stores/toastStore';

export default function ConnectedAiClientsPage() {
  const [grants, setGrants] = useState<OAuthGrant[] | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const { addToast } = useToastStore();

  useEffect(() => {
    listGrants().then((r) => setGrants(r.grants));
  }, []);

  async function onRevoke(clientId: string, clientName: string) {
    setRevoking(clientId);
    try {
      await revokeGrant(clientId);
      setGrants((gs) => (gs ?? []).filter((g) => g.client_id !== clientId));
      addToast(`Revoked ${clientName}`, 'success');
    } catch {
      addToast(`Failed to revoke ${clientName}`, 'error');
    } finally {
      setRevoking(null);
    }
  }

  if (grants === null) return <div className="p-8 text-gray-400">Loading…</div>;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-white text-lg font-semibold mb-2">Connected AI clients</h1>
      <p className="text-gray-400 text-sm mb-4">
        AI agents that can read your Orbis data via OAuth.
      </p>
      {grants.length === 0 ? (
        <p className="text-gray-500 text-sm">Nothing connected yet.</p>
      ) : (
        <ul className="space-y-3">
          {grants.map((g) => (
            <li
              key={`${g.client_id}:${g.share_token_id ?? ''}`}
              className="border border-gray-700 rounded-lg p-3 bg-gray-900/60"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-white font-medium">{g.client_name}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {g.share_token_id
                      ? `Restricted: ${g.share_token_label ?? g.share_token_id.slice(0, 8)}`
                      : 'Full access'}
                    {' · Connected '}
                    {new Date(g.connected_at).toLocaleDateString()}
                    {g.last_used_at
                      ? ` · Last used ${new Date(g.last_used_at).toLocaleString()}`
                      : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={revoking === g.client_id}
                  onClick={() => onRevoke(g.client_id, g.client_name)}
                  className="h-7 px-3 rounded border border-red-500/50 text-red-300 text-xs disabled:opacity-50"
                >
                  {revoking === g.client_id ? 'Revoking…' : 'Revoke'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

Register in `App.tsx`:
```tsx
import ConnectedAiClientsPage from './pages/ConnectedAiClientsPage';
<Route path="/myorbis/connected-ai" element={<ConnectedAiClientsPage />} />
```

- [ ] **Step 2: Test file**

`ConnectedAiClientsPage.test.tsx` should assert list rendering + Revoke invokes `revokeGrant`. Write analogously to Task 11 test style.

- [ ] **Step 3: Build + commit**

```bash
cd frontend && npm run build && npx vitest run src/pages/ConnectedAiClientsPage.test.tsx
git add frontend/src/pages/ConnectedAiClientsPage.tsx frontend/src/pages/ConnectedAiClientsPage.test.tsx frontend/src/App.tsx
git commit -m "feat(frontend): Connected AI clients page (/myorbis/connected-ai)"
```

---

## Task 13: Admin panel — OAuth activity + disable client

Optional but recommended for closed-beta visibility.

**Files:**
- Create: `backend/app/oauth/admin_router.py`
- Modify: `backend/app/main.py`
- Modify: `frontend/src/pages/AdminPage.tsx` (add new tab)
- Test: `backend/tests/unit/test_oauth_admin_router.py`

- [ ] **Step 1: Backend**

```python
"""Admin surface: list DCR registrations + disable client."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends

from app.db.postgres import get_pool
from app.dependencies import require_admin

router = APIRouter(prefix="/admin/oauth", tags=["admin-oauth"])


@router.get("/clients")
async def list_clients(_admin: dict = Depends(require_admin)) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT client_id, client_name, registered_at, registered_from_ip, disabled_at FROM oauth_clients ORDER BY registered_at DESC LIMIT 200"
        )
    return {"clients": [dict(r) for r in rows]}


@router.post("/clients/{client_id}/disable")
async def disable_client_endpoint(
    client_id: str, _admin: dict = Depends(require_admin)
) -> dict:
    from app.oauth import db as oauth_db
    cid = uuid.UUID(client_id)
    pool = await get_pool()
    await oauth_db.disable_client(pool, cid)
    return {"status": "disabled"}
```

Wire into `main.py`:
```python
from app.oauth.admin_router import router as oauth_admin_router
app.include_router(oauth_admin_router, prefix="/api")
```

- [ ] **Step 2: Frontend — add tab in AdminPage.tsx**

Add a new tab entry for "OAuth clients" that fetches `/api/admin/oauth/clients` and renders a simple table with a Disable button per row calling `/api/admin/oauth/clients/:id/disable`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/oauth/admin_router.py backend/app/main.py backend/tests/unit/test_oauth_admin_router.py frontend/src/pages/AdminPage.tsx
git commit -m "feat(admin): OAuth clients list + disable"
```

---

## Task 14: Documentation

**Files:**
- Modify: `docs/api.md` (OAuth endpoints section)
- Modify: `docs/database.md` (new Postgres tables)
- Modify: `docs/architecture.md` (three auth modes; reference OAuth resolver)
- Modify: `docs/deployment.md` (new env vars)

- [ ] **Step 1: `docs/api.md`**

Add a new top-level section describing the OAuth 2.1 endpoints (discovery, register, authorize, token, revoke, grants). One paragraph per endpoint summarising purpose, params, response shape. Cross-reference `docs/superpowers/specs/2026-04-21-mcp-oauth-authorization-design.md` for the full design.

- [ ] **Step 2: `docs/database.md`**

Add a `## Postgres tables` subsection listing all four oauth_* tables with their columns, matching the existing Neo4j-table style. Note that `user_id` and `share_token_id` are references into Neo4j without FK constraints.

- [ ] **Step 3: `docs/architecture.md`**

Update the MCP server auth description to name all three modes: `orbk_` user API key, `orbs_` share token, `Authorization: Bearer oauth_` OAuth access token. Add a short paragraph about how Postgres + Neo4j cooperate for OAuth (Postgres holds the grants, Neo4j holds the share-token filters that the middleware layers on top).

- [ ] **Step 4: `docs/deployment.md`**

Document the new env vars: `OAUTH_ENABLED`, `OAUTH_ACCESS_TOKEN_TTL_SECONDS`, `OAUTH_REFRESH_TOKEN_TTL_SECONDS`, `OAUTH_AUTHORIZATION_CODE_TTL_SECONDS`, `OAUTH_REGISTER_RATE_LIMIT`. Note the kill-switch pattern (set `OAUTH_ENABLED=false` for emergency rollback).

- [ ] **Step 5: Commit**

```bash
git add docs/api.md docs/database.md docs/architecture.md docs/deployment.md
git commit -m "docs(oauth): MCP OAuth 2.1 authorization server surfaces"
```

---

## Final checks before PR

- [ ] **Full backend unit tests pass**

```bash
cd backend && uv run pytest tests/unit/ -v --cov=app --cov=mcp_server --cov-fail-under=50
```

- [ ] **Backend lint + format**

```bash
cd backend && uv run ruff check . && uv run ruff format --check .
```

- [ ] **Frontend lint + build + tests**

```bash
cd frontend && npm run lint && npm run build && npx vitest run src/
```

- [ ] **End-to-end smoke test — manual**

1. Start the full local stack (Neo4j + Postgres + backend API + MCP server + frontend).
2. Sign in as a user, create an orb, mint a share token.
3. Use `curl` to simulate an MCP client:
   ```bash
   # Register
   CID=$(curl -sS -X POST http://localhost:8000/oauth/register -H 'Content-Type: application/json' -d '{"client_name":"test","redirect_uris":["http://localhost:9000/cb"],"token_endpoint_auth_method":"none"}' | jq -r .client_id)
   echo $CID
   # Authorize in a browser by visiting:
   # http://localhost:8000/oauth/authorize?response_type=code&client_id=$CID&redirect_uri=http://localhost:9000/cb&state=abc&code_challenge=<...>&code_challenge_method=S256
   # Approve, copy the `code` from the redirect URL.
   # Exchange for tokens:
   curl -X POST http://localhost:8000/oauth/token -d "grant_type=authorization_code&code=<CODE>&redirect_uri=http://localhost:9000/cb&client_id=$CID&code_verifier=<VERIFIER>"
   # Use access token on MCP:
   curl http://localhost:8081/mcp -H "Authorization: Bearer <ACCESS_TOKEN>"
   ```

- [ ] **Open the PR**

```bash
gh pr create --title "feat(oauth): MCP OAuth 2.1 authorization server" --body "$(cat <<'EOF'
## Summary

- Adds `backend/app/oauth/` with RFC 7591 DCR, RFC 6749 authorization code + refresh flows, RFC 7009 revocation, RFC 8414 discovery
- MCP server gains a third auth branch: `Authorization: Bearer oauth_…` (existing `X-MCP-Key` paths untouched)
- New React pages: `/oauth/authorize` (consent) and `/myorbis/connected-ai` (grant manager)
- Admin OAuth clients list + disable
- `OAUTH_ENABLED` kill-switch env var for emergency rollback

## Design

See `docs/superpowers/specs/2026-04-21-mcp-oauth-authorization-design.md`.

## Test plan

- [ ] `cd backend && uv run pytest tests/unit/ -v` — all green, coverage ≥ 50%
- [ ] `cd frontend && npx vitest run src/` — all green
- [ ] Manual: full dance register → authorize → exchange → MCP call → revoke (see Final checks)

## Documentation

- `docs/api.md`: new OAuth endpoints section
- `docs/database.md`: new `oauth_*` Postgres tables
- `docs/architecture.md`: three auth modes
- `docs/deployment.md`: new env vars + kill-switch
EOF
)"
```

---

## Out of scope (explicit follow-ups per spec)

- OIDC layer (ID tokens, UserInfo)
- Per-tool OAuth scopes
- JWT access tokens
- Device code flow (RFC 8628)
- Scoped-to-one-orb tokens (rejected during brainstorming in favor of A+ user-equivalent + share-token overlay)
- Pre-registered flagship clients (ChatGPT, Claude, Gemini with official icons) — planned for Phase 3 of the rollout
