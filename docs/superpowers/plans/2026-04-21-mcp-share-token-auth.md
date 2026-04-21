# MCP Share-Token Transport Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an orb owner share their orb with an AI agent via a copy-paste MCP config snippet. Share tokens become the transport-layer credential for the MCP server, scoped to one orb, with per-token rate limits and audit counters.

**Architecture:** `X-MCP-Key` header discriminates by prefix — `orbk_…` resolves to a user_id (unchanged), `orbs_…` resolves to a `ShareContext(orb_id, keywords, hidden_node_types, token_id)` stored in a ContextVar. Tools read the context and auto-apply filters. Middleware increments `mcp_use_count` on `ShareToken` and enforces per-credential rate limits.

**Tech Stack:** Python 3.12, FastMCP, Starlette, Neo4j async driver, slowapi. Frontend: React 19, TypeScript, Vite 8, Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-04-21-mcp-share-token-auth-design.md`

---

## Task 1: Audit fields on ShareToken

**Files:**
- Modify: `backend/app/orbs/models.py:54-63`
- Test: `backend/tests/unit/test_orbs_router.py` (may already have share-token test; extend)

**Note:** no Cypher change is needed here. `LIST_SHARE_TOKENS` at `backend/app/graph/queries.py:719` already uses `RETURN st` (the whole node), and `list_share_tokens` at `backend/app/orbs/share_token.py:102` serializes with `dict(record["st"])`. New properties flow through automatically, and missing `mcp_use_count` / `mcp_last_used_at` on pre-existing tokens fall back to the Pydantic model defaults (`0` and `None`).

- [ ] **Step 1: Write the failing test for the API response**

Append to `backend/tests/unit/test_orbs_router.py` (or whichever test covers `GET /orbs/me/share-tokens`):

```python
async def test_list_share_tokens_includes_mcp_audit_fields(async_client, seed_share_token):
    """GET /orbs/me/share-tokens returns mcp_last_used_at and mcp_use_count."""
    resp = await async_client.get("/orbs/me/share-tokens")
    assert resp.status_code == 200
    tokens = resp.json()["tokens"]
    assert tokens, "fixture should create at least one share token"
    tok = tokens[0]
    assert "mcp_last_used_at" in tok
    assert "mcp_use_count" in tok
    assert tok["mcp_use_count"] == 0  # fresh token, never used via MCP
    assert tok["mcp_last_used_at"] is None
```

If `seed_share_token` fixture doesn't exist, add one that calls `create_share_token(db, user_id, label="test")`.

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd backend && uv run pytest tests/unit/test_orbs_router.py::test_list_share_tokens_includes_mcp_audit_fields -v
```
Expected: FAIL with `KeyError: 'mcp_last_used_at'` or similar.

- [ ] **Step 3: Add fields to `ShareTokenResponse`**

Edit `backend/app/orbs/models.py:54-63`:

```python
class ShareTokenResponse(BaseModel):
    token_id: str
    orb_id: str
    keywords: list[str]
    hidden_node_types: list[str]
    label: str | None
    created_at: datetime
    expires_at: datetime | None
    revoked: bool
    mcp_last_used_at: datetime | None = None
    mcp_use_count: int = 0
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
cd backend && uv run pytest tests/unit/test_orbs_router.py::test_list_share_tokens_includes_mcp_audit_fields -v
```
Expected: PASS.

- [ ] **Step 5: Run the full share-token test suite**

```bash
cd backend && uv run pytest tests/unit/ -k "share" -v
```
Expected: all green. No pre-existing tests regress.

- [ ] **Step 6: Commit**

```bash
git add backend/app/orbs/models.py backend/tests/unit/test_orbs_router.py
git commit -m "feat(orbs): surface mcp_use_count + mcp_last_used_at on ShareToken"
```

---

## Task 2: `validate_share_token_for_mcp` helper

**Files:**
- Modify: `backend/mcp_server/auth.py` (define `ShareContext` dataclass — keep auth-related types co-located)
- Modify: `backend/app/orbs/share_token.py` (add helper that returns `ShareContext`)
- Test: `backend/tests/unit/test_share_token.py` (new file if missing) or `backend/tests/unit/test_mcp_server_auth.py`

- [ ] **Step 1: Define `ShareContext` in `mcp_server/auth.py`**

Prepend to `backend/mcp_server/auth.py` (after `_HEADER = "x-mcp-key"`):

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class ShareContext:
    """What a share-token-authenticated request is scoped to.

    All filter data is carried on the context so tools never have to
    re-query the ShareToken row."""
    orb_id: str
    keywords: list[str]
    hidden_node_types: list[str]
    token_id: str
```

- [ ] **Step 2: Write the failing test for `validate_share_token_for_mcp`**

Append to `backend/tests/unit/test_share_token.py` (create file if missing; mirror the existing share-token test style):

```python
import pytest
from datetime import datetime, timedelta, timezone
from app.orbs.share_token import (
    create_share_token,
    validate_share_token_for_mcp,
    revoke_share_token,
)


async def test_validate_for_mcp_returns_share_context(neo4j_driver, seed_person):
    tok = await create_share_token(
        neo4j_driver,
        user_id=seed_person["user_id"],
        keywords=["secret"],
        hidden_node_types=["skill"],
        label="cursor",
        expires_in_days=30,
    )
    ctx = await validate_share_token_for_mcp(neo4j_driver, tok["token_id"])
    assert ctx is not None
    assert ctx.orb_id == seed_person["orb_id"]
    assert ctx.keywords == ["secret"]
    assert ctx.hidden_node_types == ["skill"]
    assert ctx.token_id == tok["token_id"]


async def test_validate_for_mcp_rejects_unknown_token(neo4j_driver):
    assert await validate_share_token_for_mcp(neo4j_driver, "not-a-real-token") is None


async def test_validate_for_mcp_rejects_revoked_token(neo4j_driver, seed_person):
    tok = await create_share_token(
        neo4j_driver, user_id=seed_person["user_id"], label="r"
    )
    await revoke_share_token(neo4j_driver, seed_person["user_id"], tok["token_id"])
    assert await validate_share_token_for_mcp(neo4j_driver, tok["token_id"]) is None


async def test_validate_for_mcp_rejects_expired_token(neo4j_driver, seed_person, monkeypatch):
    # Create token with 1-day TTL, then warp clock
    tok = await create_share_token(
        neo4j_driver, user_id=seed_person["user_id"], label="e", expires_in_days=1
    )
    # Force-set expires_at into the past via raw cypher
    async with neo4j_driver.session() as s:
        past = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
        await s.run(
            "MATCH (st:ShareToken {token_id: $tid}) SET st.expires_at = datetime($past)",
            tid=tok["token_id"], past=past,
        )
    assert await validate_share_token_for_mcp(neo4j_driver, tok["token_id"]) is None
```

- [ ] **Step 3: Run the tests and confirm they fail**

```bash
cd backend && uv run pytest tests/unit/test_share_token.py -v
```
Expected: FAIL with `ImportError: cannot import name 'validate_share_token_for_mcp'`.

- [ ] **Step 4: Implement `validate_share_token_for_mcp`**

Append to `backend/app/orbs/share_token.py`:

```python
async def validate_share_token_for_mcp(
    db: AsyncDriver, bare_token: str
) -> "ShareContext | None":
    """Resolve a bare share-token string to a ShareContext.

    Returns None if the token is missing, revoked, or expired. Used by
    the MCP server's APIKeyMiddleware when it sees the `orbs_` prefix.
    """
    # Local import avoids a cycle: mcp_server.auth imports app.orbs,
    # app.orbs should not import mcp_server at module load time.
    from mcp_server.auth import ShareContext

    row = await validate_share_token(db, bare_token)
    if row is None:
        return None
    return ShareContext(
        orb_id=row["orb_id"],
        keywords=list(row.get("keywords") or []),
        hidden_node_types=list(row.get("hidden_node_types") or []),
        token_id=bare_token,
    )
```

Confirmed: `VALIDATE_SHARE_TOKEN` at `backend/app/graph/queries.py:711-717` already projects `orb_id`, `keywords`, and `hidden_node_types`. No Cypher change needed here.

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
cd backend && uv run pytest tests/unit/test_share_token.py -v
```
Expected: all 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/mcp_server/auth.py backend/app/orbs/share_token.py backend/tests/unit/test_share_token.py
git commit -m "feat(share-token): add ShareContext + validate_share_token_for_mcp helper"
```

---

## Task 3: Middleware branches on credential prefix

**Files:**
- Modify: `backend/mcp_server/auth.py:44-76` (middleware dispatch)
- Test: `backend/tests/unit/test_mcp_server_auth.py` (extend existing)

- [ ] **Step 1: Add the share-context ContextVar + accessor**

In `backend/mcp_server/auth.py`, just below the existing `_current_user_id` block:

```python
_current_share_context: ContextVar["ShareContext | None"] = ContextVar(
    "mcp_current_share_context", default=None
)


def get_share_context() -> "ShareContext | None":
    return _current_share_context.get()
```

- [ ] **Step 2: Write failing tests for the new middleware branches**

Append to `backend/tests/unit/test_mcp_server_auth.py`:

```python
async def test_middleware_accepts_orbs_prefix_sets_share_context(
    mcp_test_client, seed_share_token
):
    """orbs_<token> header sets _current_share_context, not _current_user_id."""
    # Protected endpoint that echoes whichever ContextVar was set
    from mcp_server.auth import get_current_user_id, get_share_context

    resp = await mcp_test_client.post(
        "/debug/whoami",
        headers={"X-MCP-Key": f"orbs_{seed_share_token['token_id']}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["share_orb_id"] == seed_share_token["orb_id"]
    assert body["user_id"] is None


async def test_middleware_rejects_orbs_with_unknown_token(mcp_test_client):
    resp = await mcp_test_client.post(
        "/debug/whoami",
        headers={"X-MCP-Key": "orbs_not-a-real-token"},
    )
    assert resp.status_code == 401
    assert "invalid" in resp.json()["error"].lower()


async def test_middleware_rejects_unrecognized_prefix(mcp_test_client):
    resp = await mcp_test_client.post(
        "/debug/whoami",
        headers={"X-MCP-Key": "foo_whatever"},
    )
    assert resp.status_code == 401


async def test_middleware_accepts_orbk_prefix_unchanged(
    mcp_test_client, seed_mcp_api_key
):
    """Regression-lock: user-key flow is untouched."""
    resp = await mcp_test_client.post(
        "/debug/whoami",
        headers={"X-MCP-Key": seed_mcp_api_key["raw"]},  # starts with orbk_
    )
    assert resp.status_code == 200
    assert resp.json()["user_id"] == seed_mcp_api_key["user_id"]
    assert resp.json()["share_orb_id"] is None
```

The `/debug/whoami` route is a test-only Starlette endpoint registered in the test client fixture — add it to the MCP test app if not present:

```python
# In tests/unit/conftest.py (or wherever mcp_test_client lives)
from starlette.routing import Route

async def _whoami(request):
    from starlette.responses import JSONResponse
    from mcp_server.auth import get_current_user_id, get_share_context
    ctx = get_share_context()
    return JSONResponse({
        "user_id": get_current_user_id(),
        "share_orb_id": ctx.orb_id if ctx else None,
    })

# When building the test app, add Route("/debug/whoami", _whoami, methods=["POST"])
```

- [ ] **Step 3: Run and confirm they fail**

```bash
cd backend && uv run pytest tests/unit/test_mcp_server_auth.py -v
```
Expected: new tests FAIL (middleware still only handles orbk_).

- [ ] **Step 4: Rewrite `APIKeyMiddleware.dispatch`**

Replace `backend/mcp_server/auth.py:56-76` with:

```python
    async def dispatch(self, request: Request, call_next):
        raw_key = request.headers.get(_HEADER) or request.headers.get(_HEADER.upper())
        if not raw_key:
            return JSONResponse(
                status_code=401,
                content={"error": "missing X-MCP-Key header"},
            )

        driver: AsyncDriver = await self._driver_factory()

        user_token = None
        share_token = None

        if raw_key.startswith("orbk_"):
            user_id = await resolve_api_key(driver, raw_key=raw_key)
            if user_id is None:
                return JSONResponse(
                    status_code=401,
                    content={"error": "invalid or revoked API key"},
                )
            user_token = _current_user_id.set(user_id)

        elif raw_key.startswith("orbs_"):
            # Local import keeps the auth module free of app.orbs deps
            # at import time (resolved at first request).
            from app.orbs.share_token import validate_share_token_for_mcp

            bare = raw_key[len("orbs_"):]
            ctx = await validate_share_token_for_mcp(driver, bare)
            if ctx is None:
                return JSONResponse(
                    status_code=401,
                    content={"error": "invalid, expired, or revoked share token"},
                )
            share_token = _current_share_context.set(ctx)

        else:
            return JSONResponse(
                status_code=401,
                content={"error": "unrecognized credential prefix"},
            )

        try:
            return await call_next(request)
        finally:
            if user_token is not None:
                _current_user_id.reset(user_token)
            if share_token is not None:
                _current_share_context.reset(share_token)
```

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
cd backend && uv run pytest tests/unit/test_mcp_server_auth.py -v
```
Expected: PASS on all four new tests plus any pre-existing regression tests.

- [ ] **Step 6: Commit**

```bash
git add backend/mcp_server/auth.py backend/tests/unit/test_mcp_server_auth.py backend/tests/unit/conftest.py
git commit -m "feat(mcp): accept orbs_ share-token prefix at transport layer"
```

---

## Task 4: Audit counter update (fire-and-forget)

**Files:**
- Modify: `backend/app/graph/queries.py` (add `INCREMENT_SHARE_TOKEN_MCP_USE`)
- Modify: `backend/app/orbs/share_token.py` (add `increment_mcp_use`)
- Modify: `backend/mcp_server/auth.py` (dispatch counter update after successful share auth)
- Test: `backend/tests/unit/test_share_token_audit.py` (new file)

- [ ] **Step 1: Write failing test for `increment_mcp_use`**

Create `backend/tests/unit/test_share_token_audit.py`:

```python
import asyncio
import pytest
from app.orbs.share_token import create_share_token, increment_mcp_use


async def test_increment_mcp_use_bumps_count_and_timestamp(neo4j_driver, seed_person):
    tok = await create_share_token(
        neo4j_driver, user_id=seed_person["user_id"], label="t"
    )

    await increment_mcp_use(neo4j_driver, tok["token_id"])
    await increment_mcp_use(neo4j_driver, tok["token_id"])

    async with neo4j_driver.session() as s:
        result = await s.run(
            "MATCH (st:ShareToken {token_id: $tid}) "
            "RETURN st.mcp_use_count AS c, st.mcp_last_used_at AS t",
            tid=tok["token_id"],
        )
        row = await result.single()
    assert row["c"] == 2
    assert row["t"] is not None


async def test_increment_mcp_use_silently_noops_on_unknown_token(neo4j_driver):
    # Must not raise — missing token means share-mode auth already
    # failed upstream; this is pure best-effort telemetry.
    await increment_mcp_use(neo4j_driver, "does-not-exist")


async def test_middleware_audit_write_does_not_block_response(
    mcp_test_client, seed_share_token, monkeypatch
):
    """If the Cypher write raises, the MCP response must still succeed."""
    import app.orbs.share_token as mod

    async def _boom(*args, **kwargs):
        raise RuntimeError("neo4j down")

    monkeypatch.setattr(mod, "increment_mcp_use", _boom)

    resp = await mcp_test_client.post(
        "/debug/whoami",
        headers={"X-MCP-Key": f"orbs_{seed_share_token['token_id']}"},
    )
    assert resp.status_code == 200
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd backend && uv run pytest tests/unit/test_share_token_audit.py -v
```
Expected: FAIL with `ImportError: cannot import name 'increment_mcp_use'`.

- [ ] **Step 3: Add Cypher + helper**

In `backend/app/graph/queries.py`:

```python
INCREMENT_SHARE_TOKEN_MCP_USE = """
MATCH (st:ShareToken {token_id: $token_id})
SET st.mcp_last_used_at = datetime(),
    st.mcp_use_count = coalesce(st.mcp_use_count, 0) + 1
"""
```

Append to `backend/app/orbs/share_token.py`:

```python
async def increment_mcp_use(db: AsyncDriver, token_id: str) -> None:
    """Best-effort counter increment for MCP share-token usage.

    Callers dispatch this via `asyncio.create_task` — the response must
    NOT wait on it. Failures are logged, not raised.
    """
    try:
        async with db.session() as session:
            await session.run(INCREMENT_SHARE_TOKEN_MCP_USE, token_id=token_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Failed to increment mcp_use_count for token %s: %s", token_id, exc
        )
```

Make sure `from app.graph.queries import INCREMENT_SHARE_TOKEN_MCP_USE` is added to the import block.

- [ ] **Step 4: Wire the counter into middleware**

In `backend/mcp_server/auth.py`, inside the `elif raw_key.startswith("orbs_"):` branch — right after setting the ContextVar — add:

```python
            # Fire-and-forget audit increment. Failures must not block.
            import asyncio
            from app.orbs.share_token import increment_mcp_use
            asyncio.create_task(increment_mcp_use(driver, ctx.token_id))
```

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
cd backend && uv run pytest tests/unit/test_share_token_audit.py -v
```
Expected: all 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/graph/queries.py backend/app/orbs/share_token.py backend/mcp_server/auth.py backend/tests/unit/test_share_token_audit.py
git commit -m "feat(mcp): increment ShareToken mcp_use_count on successful auth"
```

---

## Task 5: `_resolve_scope` helper + wire all 5 tools

**Files:**
- Modify: `backend/mcp_server/server.py` (add helper, update 5 tool bodies)
- Test: `backend/tests/unit/test_mcp_share_context.py` (new)

- [ ] **Step 1: Write failing tests**

Create `backend/tests/unit/test_mcp_share_context.py`:

```python
import pytest
from mcp_server.auth import ShareContext, _current_share_context
from mcp_server.server import _resolve_scope


def test_resolve_scope_passes_through_when_no_share_context():
    assert _resolve_scope("orb-123", "tok-xyz") == ("orb-123", "tok-xyz")


def test_resolve_scope_uses_share_context_when_set():
    ctx = ShareContext(
        orb_id="orb-from-share",
        keywords=["secret"],
        hidden_node_types=["skill"],
        token_id="tok-scoped",
    )
    reset = _current_share_context.set(ctx)
    try:
        # LLM passes "" for orb_id/token — we fill from context
        assert _resolve_scope("", "") == ("orb-from-share", "tok-scoped")
        # LLM passes matching orb_id — same outcome
        assert _resolve_scope("orb-from-share", "anything") == (
            "orb-from-share",
            "tok-scoped",
        )
    finally:
        _current_share_context.reset(reset)


def test_resolve_scope_logs_warning_on_orb_id_mismatch(caplog):
    ctx = ShareContext(
        orb_id="orb-A",
        keywords=[],
        hidden_node_types=[],
        token_id="tok-A",
    )
    reset = _current_share_context.set(ctx)
    try:
        with caplog.at_level("WARNING"):
            orb, tok = _resolve_scope("orb-B", "")
        assert orb == "orb-A"  # share context wins
        assert tok == "tok-A"
        assert any("mismatched orb_id" in r.message for r in caplog.records)
    finally:
        _current_share_context.reset(reset)


async def test_get_summary_under_share_context_applies_hidden_types(
    neo4j_driver, seed_orb_with_skill, seed_share_token_hiding_skills
):
    """End-to-end: call orbis_get_summary with the share token set, verify
    the skill count is 0 despite seed_orb_with_skill having skills."""
    from mcp_server.server import orbis_get_summary

    reset = _current_share_context.set(
        ShareContext(
            orb_id=seed_orb_with_skill["orb_id"],
            keywords=[],
            hidden_node_types=["skill"],
            token_id=seed_share_token_hiding_skills["token_id"],
        )
    )
    try:
        summary = await orbis_get_summary("", "")  # LLM passes nothing
        assert summary["skill_count"] == 0
    finally:
        _current_share_context.reset(reset)
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd backend && uv run pytest tests/unit/test_mcp_share_context.py -v
```
Expected: FAIL — `_resolve_scope` not defined.

- [ ] **Step 3: Add `_resolve_scope` to `server.py`**

Edit `backend/mcp_server/server.py`, inserting after the `_get_driver` function (~line 38):

```python
import logging

logger = logging.getLogger(__name__)


def _resolve_scope(orb_id_arg: str, token_arg: str) -> tuple[str, str]:
    """Return the effective (orb_id, token) for this tool invocation.

    - User-key mode: both args pass through unchanged (today's behavior).
    - Share-token mode: the share context is authoritative. `orb_id_arg`
      is ignored; we pass the share token's id as the internal `token`
      so the filter code in `tools.py` (which expects a token string to
      `validate_share_token`) auto-applies the keyword and
      hidden_node_types filters. No second filter implementation.
    """
    from mcp_server.auth import get_share_context

    ctx = get_share_context()
    if ctx is not None:
        if orb_id_arg and orb_id_arg != ctx.orb_id:
            logger.warning(
                "Share-scoped MCP call with mismatched orb_id: "
                "requested=%s scoped=%s token=%s",
                orb_id_arg,
                ctx.orb_id,
                ctx.token_id,
            )
        return ctx.orb_id, ctx.token_id
    return orb_id_arg, token_arg
```

- [ ] **Step 4: Update all 5 tool handlers**

Each tool in `backend/mcp_server/server.py:52-88` gains one line at the top of its body:

```python
@mcp.tool()
async def orbis_get_summary(orb_id: str, token: str = "") -> dict:
    orb_id, token = _resolve_scope(orb_id, token)
    driver = await _get_driver()
    return await get_orb_summary(driver, orb_id, token)


@mcp.tool()
async def orbis_get_full_orb(orb_id: str, token: str = "") -> dict:
    orb_id, token = _resolve_scope(orb_id, token)
    driver = await _get_driver()
    return await get_orb_full(driver, orb_id, token)


@mcp.tool()
async def orbis_get_nodes_by_type(
    orb_id: str, node_type: str, token: str = ""
) -> list[dict]:
    orb_id, token = _resolve_scope(orb_id, token)
    driver = await _get_driver()
    return await get_nodes_by_type(driver, orb_id, node_type, token)


@mcp.tool()
async def orbis_get_connections(orb_id: str, node_uid: str, token: str = "") -> dict:
    orb_id, token = _resolve_scope(orb_id, token)
    driver = await _get_driver()
    return await get_connections(driver, orb_id, node_uid, token)


@mcp.tool()
async def orbis_get_skills_for_experience(
    orb_id: str, experience_uid: str, token: str = ""
) -> list[dict]:
    orb_id, token = _resolve_scope(orb_id, token)
    driver = await _get_driver()
    return await get_skills_for_experience(driver, orb_id, experience_uid, token)
```

(Exactly one new line per tool — the `_resolve_scope` call.)

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
cd backend && uv run pytest tests/unit/test_mcp_share_context.py -v
```
Expected: all PASS.

- [ ] **Step 6: Run the MCP tests as a whole**

```bash
cd backend && uv run pytest tests/unit/ -k "mcp" -v
```
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add backend/mcp_server/server.py backend/tests/unit/test_mcp_share_context.py
git commit -m "feat(mcp): route tool calls through ShareContext when present"
```

---

## Task 6: Per-credential rate limiter

**Files:**
- Create: `backend/mcp_server/rate_limit.py`
- Modify: `backend/mcp_server/server.py:41-49` (wire the limiter into the middleware stack)
- Test: `backend/tests/unit/test_mcp_rate_limit.py` (new)

- [ ] **Step 1: Write failing tests**

Create `backend/tests/unit/test_mcp_rate_limit.py`:

```python
import pytest


@pytest.fixture(autouse=True)
def _reset_rate_limit_buckets():
    """Ensure each test starts with empty rate-limit state."""
    from mcp_server.rate_limit import _reset_buckets_for_tests
    _reset_buckets_for_tests()
    yield
    _reset_buckets_for_tests()


async def test_share_token_hits_120_per_minute_cap(
    mcp_test_client, seed_share_token
):
    """121st request in one minute returns 429 with Retry-After."""
    headers = {"X-MCP-Key": f"orbs_{seed_share_token['token_id']}"}
    for _ in range(120):
        r = await mcp_test_client.post("/debug/whoami", headers=headers)
        assert r.status_code == 200
    r = await mcp_test_client.post("/debug/whoami", headers=headers)
    assert r.status_code == 429
    assert "Retry-After" in r.headers


async def test_user_key_hits_300_per_minute_cap(
    mcp_test_client, seed_mcp_api_key
):
    headers = {"X-MCP-Key": seed_mcp_api_key["raw"]}
    for _ in range(300):
        r = await mcp_test_client.post("/debug/whoami", headers=headers)
        assert r.status_code == 200
    r = await mcp_test_client.post("/debug/whoami", headers=headers)
    assert r.status_code == 429


async def test_rate_limit_buckets_are_separate(
    mcp_test_client, seed_share_token, seed_mcp_api_key
):
    """Exhausting one credential's budget must not block another."""
    share_headers = {"X-MCP-Key": f"orbs_{seed_share_token['token_id']}"}
    user_headers = {"X-MCP-Key": seed_mcp_api_key["raw"]}

    for _ in range(120):
        await mcp_test_client.post("/debug/whoami", headers=share_headers)
    # Share bucket exhausted
    r1 = await mcp_test_client.post("/debug/whoami", headers=share_headers)
    assert r1.status_code == 429
    # But user key is independent
    r2 = await mcp_test_client.post("/debug/whoami", headers=user_headers)
    assert r2.status_code == 200
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd backend && uv run pytest tests/unit/test_mcp_rate_limit.py -v
```
Expected: FAIL — no rate limit wired yet; all 121 / 301 requests return 200.

- [ ] **Step 3: Create `backend/mcp_server/rate_limit.py`**

Using a per-process in-memory sliding-window limiter rather than
slowapi. slowapi's decorator-based API is designed for FastAPI route
handlers, not dynamic Starlette middleware keyed on ContextVar state —
a plain sliding-window counter is simpler and gives us exact control
over the key / limit mapping.

```python
"""Per-credential rate limits for the MCP transport.

We key each request on the credential resolved by `APIKeyMiddleware`
(user_id OR share_token_id) so every credential gets its own bucket.
Exhausting one share token's budget does not affect another user
or share.

Implementation: in-memory sliding window per process. Cloud Run may
run multiple instances; the effective ceiling is
`N_instances * limit_per_minute`. That is acceptable for v1 — Redis-
backed rate limiting is documented as a follow-up in the spec if abuse
becomes a real pattern.
"""

from __future__ import annotations

from collections import defaultdict, deque
from threading import Lock
from time import monotonic

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from mcp_server.auth import get_current_user_id, get_share_context

# Limits per credential type. Keep in sync with spec §"Rate limiting".
USER_LIMIT_PER_MIN = 300
SHARE_LIMIT_PER_MIN = 120
WINDOW_SECONDS = 60

# Each credential's bucket is a deque of monotonic timestamps. We drop
# entries older than WINDOW_SECONDS at the top of each check.
_buckets: dict[str, deque[float]] = defaultdict(deque)
_lock = Lock()


def _credential_key_and_limit() -> tuple[str, int]:
    ctx = get_share_context()
    if ctx is not None:
        return f"s:{ctx.token_id}", SHARE_LIMIT_PER_MIN
    user_id = get_current_user_id()
    if user_id is not None:
        return f"u:{user_id}", USER_LIMIT_PER_MIN
    # Should not happen if APIKeyMiddleware ran first, but be defensive.
    return "anon", SHARE_LIMIT_PER_MIN


def _check(key: str, limit: int) -> tuple[bool, int]:
    """Return (allowed, retry_after_seconds)."""
    now = monotonic()
    cutoff = now - WINDOW_SECONDS
    with _lock:
        bucket = _buckets[key]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            # Seconds until the oldest entry ages out
            retry_after = max(1, int(bucket[0] + WINDOW_SECONDS - now) + 1)
            return False, retry_after
        bucket.append(now)
        return True, 0


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Enforce per-credential rate limits.

    Must be installed AFTER `APIKeyMiddleware` so the ContextVars are
    populated before `_credential_key_and_limit` runs.
    """

    async def dispatch(self, request: Request, call_next):
        key, limit = _credential_key_and_limit()
        allowed, retry_after = _check(key, limit)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={"error": f"rate limit exceeded ({limit}/min)"},
                headers={"Retry-After": str(retry_after)},
            )
        return await call_next(request)


def _reset_buckets_for_tests() -> None:
    """Test hook — clear all buckets between tests."""
    with _lock:
        _buckets.clear()
```

- [ ] **Step 4: Wire the middleware into the MCP Starlette app**

Modify `backend/mcp_server/server.py:41-49`:

```python
def _build_starlette_app():
    """Return the FastMCP Starlette app wrapped with auth + rate limit."""
    from mcp_server.rate_limit import RateLimitMiddleware

    app = mcp.streamable_http_app()
    # Order matters: APIKeyMiddleware sets ContextVars that
    # RateLimitMiddleware reads. Starlette runs middleware in reverse
    # registration order, so register RateLimit FIRST and APIKey LAST
    # so APIKey runs first per request.
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(APIKeyMiddleware, driver_factory=_get_driver)
    return app
```

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
cd backend && uv run pytest tests/unit/test_mcp_rate_limit.py -v
```
Expected: all 3 PASS.

**If the tests are slow** (looping 300 requests through a real Starlette client can take a few seconds), consider lowering `_USER_LIMIT` and `_SHARE_LIMIT` to smaller values behind `os.environ.get("MCP_TEST_MODE")` — but only if the test run exceeds 10s. Otherwise leave as-is.

- [ ] **Step 6: Commit**

```bash
git add backend/mcp_server/rate_limit.py backend/mcp_server/server.py backend/tests/unit/test_mcp_rate_limit.py
git commit -m "feat(mcp): per-credential rate limits (300/min user, 120/min share)"
```

---

## Task 7: Frontend — types + env var

**Files:**
- Modify: `frontend/src/api/orbs.ts:62-71`
- Modify: `frontend/.env.example`
- Modify: `frontend/src/vite-env.d.ts` (add typed env var if the file already declares others)

- [ ] **Step 1: Extend the `ShareToken` TS type**

Edit `frontend/src/api/orbs.ts:62-71`:

```typescript
export interface ShareToken {
  token_id: string;
  orb_id: string;
  keywords: string[];
  hidden_node_types: string[];
  label: string | null;
  created_at: string;
  expires_at: string | null;
  revoked: boolean;
  mcp_last_used_at: string | null;
  mcp_use_count: number;
}
```

- [ ] **Step 2: Add `VITE_MCP_URL` to `frontend/.env.example`**

Append:

```
# MCP server streamable-http endpoint. In dev, the MCP server runs on
# :8081 next to the API (:8000). In prod this points at Cloud Run.
VITE_MCP_URL=http://localhost:8081/mcp
```

- [ ] **Step 3: Type the env var**

If `frontend/src/vite-env.d.ts` already has an `ImportMetaEnv` interface, add:

```typescript
interface ImportMetaEnv {
  // ... existing fields
  readonly VITE_MCP_URL: string;
}
```

If the file doesn't exist, create it with the default Vite template and that field.

- [ ] **Step 4: Verify typecheck passes**

```bash
cd frontend && npm run build
```
Expected: build succeeds. (No tests yet — those land in Task 8.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/orbs.ts frontend/.env.example frontend/src/vite-env.d.ts
git commit -m "feat(frontend): add mcp_* fields + VITE_MCP_URL env var"
```

---

## Task 8: Frontend — `CopyMcpConfigButton` component

**Files:**
- Create: `frontend/src/components/graph/CopyMcpConfigButton.tsx`
- Create: `frontend/src/components/graph/CopyMcpConfigButton.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `frontend/src/components/graph/CopyMcpConfigButton.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CopyMcpConfigButton } from './CopyMcpConfigButton';

describe('CopyMcpConfigButton', () => {
  const mockWriteText = vi.fn();

  beforeEach(() => {
    mockWriteText.mockClear();
    Object.assign(navigator, {
      clipboard: { writeText: mockWriteText.mockResolvedValue(undefined) },
    });
    vi.stubEnv('VITE_MCP_URL', 'https://mcp.example.com/mcp');
  });

  it('renders the button', () => {
    render(<CopyMcpConfigButton tokenId="abc123" label="Recruiter view" />);
    expect(screen.getByRole('button', { name: /copy mcp config/i })).toBeInTheDocument();
  });

  it('opens popover with JSON snippet when clicked', () => {
    render(<CopyMcpConfigButton tokenId="abc123" label="Recruiter view" />);
    fireEvent.click(screen.getByRole('button', { name: /copy mcp config/i }));
    const pre = screen.getByTestId('mcp-config-snippet');
    expect(pre.textContent).toContain('"url": "https://mcp.example.com/mcp"');
    expect(pre.textContent).toContain('"X-MCP-Key": "orbs_abc123"');
    expect(pre.textContent).toContain('"orbis-recruiter-view"');
  });

  it('falls back to orbis-<first-8> when label is empty', () => {
    render(<CopyMcpConfigButton tokenId="abcdefghij" label={null} />);
    fireEvent.click(screen.getByRole('button', { name: /copy mcp config/i }));
    const pre = screen.getByTestId('mcp-config-snippet');
    expect(pre.textContent).toContain('"orbis-abcdefgh"');
  });

  it('normalizes label: lowercase, symbols to dash, collapsed', () => {
    render(<CopyMcpConfigButton tokenId="abc" label="Recruiter’s View!! 2026" />);
    fireEvent.click(screen.getByRole('button', { name: /copy mcp config/i }));
    const pre = screen.getByTestId('mcp-config-snippet');
    expect(pre.textContent).toContain('"orbis-recruiter-s-view-2026"');
  });

  it('copies snippet to clipboard on Copy click', async () => {
    render(<CopyMcpConfigButton tokenId="abc123" label="t" />);
    fireEvent.click(screen.getByRole('button', { name: /copy mcp config/i }));
    fireEvent.click(screen.getByRole('button', { name: /^copy snippet$/i }));
    expect(mockWriteText).toHaveBeenCalledOnce();
    const copied = mockWriteText.mock.calls[0][0];
    expect(copied).toContain('"X-MCP-Key": "orbs_abc123"');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd frontend && npx vitest run src/components/graph/CopyMcpConfigButton.test.tsx
```
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/graph/CopyMcpConfigButton.tsx`:

```tsx
import { useState } from 'react';

interface Props {
  tokenId: string;
  label: string | null;
  onCopied?: () => void;
}

function normalizeLabel(label: string | null, tokenId: string): string {
  if (label) {
    const slug = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (slug) return `orbis-${slug}`;
  }
  return `orbis-${tokenId.slice(0, 8)}`;
}

function buildSnippet(tokenId: string, label: string | null): string {
  const mcpUrl = import.meta.env.VITE_MCP_URL ?? 'http://localhost:8081/mcp';
  const name = normalizeLabel(label, tokenId);
  const cfg = {
    mcpServers: {
      [name]: {
        url: mcpUrl,
        headers: { 'X-MCP-Key': `orbs_${tokenId}` },
      },
    },
  };
  return JSON.stringify(cfg, null, 2);
}

export function CopyMcpConfigButton({ tokenId, label, onCopied }: Props) {
  const [open, setOpen] = useState(false);
  const snippet = buildSnippet(tokenId, label);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Copy MCP config"
        className="h-7 px-2 rounded border border-gray-700 bg-gray-800 hover:bg-gray-700 text-white text-[10px] font-medium transition-colors shrink-0"
      >
        Copy MCP config
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute right-0 mt-2 w-96 z-30 rounded-xl border border-gray-700 bg-gray-900 p-3 shadow-xl"
        >
          <p className="text-xs text-gray-400 mb-2">
            Paste this into your MCP client config (Cursor, Cline, Windsurf — any
            streamable-http client):
          </p>
          <pre
            data-testid="mcp-config-snippet"
            className="bg-gray-950 border border-gray-800 rounded p-2 text-[10px] text-gray-200 font-mono overflow-x-auto whitespace-pre"
          >
            {snippet}
          </pre>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(snippet);
                onCopied?.();
              }}
              className="h-7 px-3 rounded bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-medium"
            >
              Copy snippet
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-7 px-3 rounded border border-gray-700 bg-gray-800 hover:bg-gray-700 text-white text-[10px]"
            >
              Close
            </button>
          </div>
          <p className="text-[10px] text-gray-500 mt-2">
            This token grants AI agents access to your orb. Revoke below if misused.
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
cd frontend && npx vitest run src/components/graph/CopyMcpConfigButton.test.tsx
```
Expected: all 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/graph/CopyMcpConfigButton.tsx frontend/src/components/graph/CopyMcpConfigButton.test.tsx
git commit -m "feat(frontend): add CopyMcpConfigButton component"
```

---

## Task 9: Frontend — integrate into `SharePanel`

**Files:**
- Modify: `frontend/src/components/graph/SharePanel.tsx:686-717` (replace legacy `Copy MCP` button + add audit metadata display)

- [ ] **Step 1: Replace the legacy "Copy MCP" button**

In `frontend/src/components/graph/SharePanel.tsx:710-716`, delete the current button that copies `orb://${orbId}+${token.token_id}`:

```tsx
// DELETE:
<button
  type="button"
  onClick={() => { navigator.clipboard.writeText(`orb://${orbId}+${token.token_id}`); addToast('MCP URI copied', 'success'); }}
  className="h-7 px-2 rounded border border-gray-700 bg-gray-800 hover:bg-gray-700 text-white text-[10px] font-medium transition-colors shrink-0"
>
  Copy MCP
</button>
```

Add the import at the top of the file (alongside other component imports):

```tsx
import { CopyMcpConfigButton } from './CopyMcpConfigButton';
```

Replace the deleted button with:

```tsx
<CopyMcpConfigButton
  tokenId={token.token_id}
  label={token.label}
  onCopied={() => addToast('MCP config copied', 'success')}
/>
```

- [ ] **Step 2: Add the audit metadata line**

Locate the token-row header around `frontend/src/components/graph/SharePanel.tsx:627-635`. Directly under the `{token.label || 'Unnamed token'}` `<p>`, add:

```tsx
{token.mcp_use_count > 0 && (
  <p className="text-[10px] text-gray-500 mt-0.5">
    Last MCP use:{' '}
    {token.mcp_last_used_at
      ? new Date(token.mcp_last_used_at).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : '—'}{' '}
    · {token.mcp_use_count} {token.mcp_use_count === 1 ? 'query' : 'queries'}
  </p>
)}
```

- [ ] **Step 3: Run a full frontend build + lint**

```bash
cd frontend && npm run lint && npm run build
```
Expected: both succeed.

- [ ] **Step 4: Manually smoke-test in the dev server (optional but recommended)**

```bash
cd frontend && npm run dev
```
Navigate to `/myorbis`, open the Share panel, expand a share token, verify:
- "Copy MCP config" button opens a popover with a JSON snippet.
- Clicking "Copy snippet" writes to the clipboard (check the toast + paste into a scratch editor).
- If the token has `mcp_use_count > 0` (will be 0 for fresh tokens until MCP usage), the metadata line renders.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/graph/SharePanel.tsx
git commit -m "feat(frontend): wire CopyMcpConfigButton into share-token list + show audit metadata"
```

---

## Task 10: Documentation

**Files:**
- Modify: `docs/api.md` (MCP section)
- Modify: `docs/database.md` (ShareToken table)
- Modify: `docs/architecture.md` (MCP server section)

- [ ] **Step 1: Update `docs/api.md`**

Find the MCP section (search for `MCP` or `X-MCP-Key`) and add a subsection:

```markdown
### MCP share-token auth

The MCP server also accepts share tokens as transport credentials. When a
caller presents a header in the form:

```
X-MCP-Key: orbs_<share-token-id>
```

the request is scoped to the orb the share token was minted for, with the
token's `keywords` and `hidden_node_types` filters auto-applied to every
tool response. The tool-level `orb_id` / `token` arguments are ignored
in this mode — the share context is authoritative.

Rate limits: 120 requests/minute per share token (vs. 300/minute per
user key). See §"Rate limiting".

The owner sees usage in `GET /api/orbs/me/share-tokens` via the new
`mcp_last_used_at` (nullable datetime) and `mcp_use_count` (integer)
fields.
```

- [ ] **Step 2: Update `docs/database.md`**

Find the `ShareToken` table (search for `ShareToken`). Add two rows:

```markdown
| `mcp_last_used_at` | datetime | Nullable. Updated on every successful share-token MCP request. |
| `mcp_use_count` | integer | Default 0. Incremented atomically on each MCP request. |
```

- [ ] **Step 3: Update `docs/architecture.md`**

Find the "MCP server" section (search for `mcp_server` or `streamable-http`).
Append a bullet point to the auth description:

```markdown
- Transport auth accepts two credential types on `X-MCP-Key`:
  - `orbk_…` → resolves to a `user_id` (owner's personal key, full access
    to their orb)
  - `orbs_…` → resolves to a `ShareContext(orb_id, filters, token_id)`,
    scoping the request to one orb with filters applied (§`mcp-share-token-auth`)
```

- [ ] **Step 4: Commit**

```bash
git add docs/api.md docs/database.md docs/architecture.md
git commit -m "docs: MCP share-token auth surfaces in api/database/architecture"
```

---

## Final checks before PR

- [ ] **All backend unit tests pass**

```bash
cd backend && uv run pytest tests/unit/ -v --cov=app --cov=mcp_server --cov-fail-under=50
```

- [ ] **Backend lint + format**

```bash
cd backend && uv run ruff check . && uv run ruff format --check .
```

- [ ] **Frontend lint + build + tests**

```bash
cd frontend && npm run lint && npm run build && npx vitest run
```

- [ ] **Open the PR**

```bash
gh pr create --title "feat(mcp): share-token transport auth + copy-paste config UI" \
  --body "$(cat <<'EOF'
## Summary

- `X-MCP-Key` now discriminates by prefix: `orbk_…` → user key (unchanged), `orbs_…` → share token.
- Share-token MCP requests are scoped to one orb; tool-level `orb_id`/`token` args are ignored; filter configuration is applied automatically.
- Per-credential rate limits: 300/min (user key) vs 120/min (share token).
- `ShareToken` gains `mcp_last_used_at` + `mcp_use_count`; surfaced in the share-token list API and in the Share Panel UI.
- New `CopyMcpConfigButton` replaces the legacy placeholder `orb://…` button with a real, copy-pasteable MCP client config snippet.

## Design

See `docs/superpowers/specs/2026-04-21-mcp-share-token-auth-design.md` for the full design rationale.

## Test plan

- [ ] `cd backend && uv run pytest tests/unit/ -v` — all green, coverage ≥ 50%.
- [ ] `cd frontend && npx vitest run` — all green.
- [ ] `cd frontend && npm run build` — production build succeeds.
- [ ] Manual: mint a share token, paste MCP config into Cursor, issue a tool call, confirm filter is applied and `mcp_use_count` bumps in the UI.
- [ ] Manual: revoke the token, confirm subsequent MCP calls return 401.
- [ ] Manual: spam past 120/min, confirm 429 with `Retry-After`.

## Documentation

Updated `docs/api.md`, `docs/database.md`, `docs/architecture.md`.
EOF
)"
```

---

## Out of scope (explicit follow-ups)

See spec §"Out of Scope":
- Vanity MCP domain (`mcp.open-orbis.com`)
- Per-tool-call audit trail (only aggregate counter for now)
- Redis-backed rate limiter
- `mcp_enabled` opt-out flag on ShareToken
- Claude Desktop native streamable-http support (`mcp-proxy` workaround documented)
- Anomaly alerting
