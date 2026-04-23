"""Tests for the MCP server's per-request authentication.

Covers the middleware (X-MCP-Key resolution + ContextVar propagation)
and the tool-side access check that decides whether the authenticated
user can read the given orb_id. The access check combines two paths:

1. Owner bypass — API key's user owns the orb, unfiltered access
2. Share-token grant — stranger presents a token the owner minted;
   filters from the token are propagated back to the caller.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from mcp_server import auth as mcp_auth
from mcp_server import tools as mcp_tools


class _FakeResult:
    def __init__(self, record):
        self._record = record

    async def single(self):
        return self._record


class _FakeSession:
    """Minimal Neo4j session stub. Only the owner-lookup query is answered
    from ``owner_record``; every other query returns None so the tool
    hits its graceful-failure path."""

    def __init__(self, owner_record):
        self._owner_record = owner_record
        self.run = AsyncMock(side_effect=self._run)

    async def _run(self, query, **_kwargs):
        if "RETURN p.user_id AS owner" in query:
            return _FakeResult(self._owner_record)
        return _FakeResult(None)


class _FakeDriver:
    def __init__(self, owner_record=None):
        self._owner_record = owner_record

    def session(self):
        ctx = MagicMock()
        ctx.__aenter__ = AsyncMock(return_value=_FakeSession(self._owner_record))
        ctx.__aexit__ = AsyncMock(return_value=None)
        return ctx


@pytest.fixture
def reset_context():
    """Clear both MCP ContextVars before and after each test."""
    user_tok = mcp_auth._current_user_id.set(None)
    share_tok = mcp_auth._current_share_context.set(None)
    yield
    mcp_auth._current_user_id.reset(user_tok)
    mcp_auth._current_share_context.reset(share_tok)


# ── _check_access ───────────────────────────────────────────────────────


async def test_check_access_owner_bypasses_token(reset_context):
    """Owner reading own orb gets an empty filter config, no share token
    required even for a private orb."""
    driver = _FakeDriver(owner_record={"owner": "u1"})
    mcp_auth._current_user_id.set("u1")
    access = await mcp_tools._check_access(driver, "my-orb", token="")
    assert "error" not in access
    assert access["keywords"] == []
    assert access["hidden_node_types"] == []


async def test_check_access_stranger_without_token_is_rejected(reset_context):
    driver = _FakeDriver(owner_record={"owner": "other"})
    mcp_auth._current_user_id.set("u1")
    access = await mcp_tools._check_access(driver, "their-orb", token="")
    assert access == {"error": "Orb 'their-orb' not accessible"}


async def test_check_access_stranger_with_valid_token_gets_filters(
    monkeypatch, reset_context
):
    """A stranger with a matching share token gets the filters from that
    token back in the access config."""
    driver = _FakeDriver(owner_record={"owner": "other"})
    mcp_auth._current_user_id.set("u1")

    async def fake_validate(db, token):
        assert token == "valid-token"
        return {
            "orb_id": "their-orb",
            "keywords": ["secret"],
            "hidden_node_types": ["Skill"],
        }

    monkeypatch.setattr(mcp_tools, "validate_share_token", fake_validate)

    access = await mcp_tools._check_access(driver, "their-orb", token="valid-token")
    assert access == {"keywords": ["secret"], "hidden_node_types": ["Skill"]}


async def test_check_access_token_for_wrong_orb_is_rejected(monkeypatch, reset_context):
    driver = _FakeDriver(owner_record={"owner": "other"})
    mcp_auth._current_user_id.set("u1")

    async def fake_validate(db, token):
        return {
            "orb_id": "some-other-orb",
            "keywords": [],
            "hidden_node_types": [],
        }

    monkeypatch.setattr(mcp_tools, "validate_share_token", fake_validate)

    access = await mcp_tools._check_access(driver, "their-orb", token="mismatched")
    assert access == {"error": "Orb 'their-orb' not accessible"}


async def test_check_access_invalid_token_is_rejected(monkeypatch, reset_context):
    driver = _FakeDriver(owner_record={"owner": "other"})
    mcp_auth._current_user_id.set("u1")

    async def fake_validate(db, token):
        return None

    monkeypatch.setattr(mcp_tools, "validate_share_token", fake_validate)

    access = await mcp_tools._check_access(driver, "their-orb", token="bogus")
    assert access == {"error": "Orb 'their-orb' not accessible"}


async def test_check_access_unknown_orb_is_opaque(reset_context):
    driver = _FakeDriver(owner_record=None)
    mcp_auth._current_user_id.set("u1")
    access = await mcp_tools._check_access(driver, "ghost", token="")
    # Same generic error as "permission denied" — no enumeration oracle.
    assert access == {"error": "Orb 'ghost' not accessible"}


async def test_check_access_requires_authentication(reset_context):
    """Missing ContextVar (should be unreachable because the middleware
    rejects first) still returns an error, never a success."""
    driver = _FakeDriver(owner_record={"owner": "u1"})
    access = await mcp_tools._check_access(driver, "any-orb", token="")
    assert access == {"error": "authentication required"}


# ── APIKeyMiddleware ────────────────────────────────────────────────────


async def test_middleware_rejects_missing_header(monkeypatch, reset_context):
    from starlette.applications import Starlette
    from starlette.responses import PlainTextResponse
    from starlette.routing import Route
    from starlette.testclient import TestClient

    async def ping(request):
        return PlainTextResponse("pong")

    async def fake_driver_factory():
        return _FakeDriver()

    app = Starlette(routes=[Route("/mcp", ping)])
    app.add_middleware(mcp_auth.APIKeyMiddleware, driver_factory=fake_driver_factory)
    client = TestClient(app)

    r = client.get("/mcp")
    assert r.status_code == 401
    assert r.json()["error"] == "authentication required"
    # MCP clients (ChatGPT, Claude, Cursor) discover OAuth via WWW-Authenticate
    # per RFC 6750 + MCP spec 2025-03; without it they report
    # "does not implement OAuth" and refuse to start the flow.
    www_auth = r.headers.get("www-authenticate", "")
    assert www_auth.startswith("Bearer")
    assert 'resource_metadata="' in www_auth
    assert "/.well-known/oauth-protected-resource" in www_auth


async def test_middleware_rejects_invalid_key(monkeypatch, reset_context):
    from starlette.applications import Starlette
    from starlette.responses import PlainTextResponse
    from starlette.routing import Route
    from starlette.testclient import TestClient

    async def ping(request):
        return PlainTextResponse("pong")

    async def fake_driver_factory():
        return _FakeDriver()

    async def fake_resolve(driver, *, raw_key):
        return None

    monkeypatch.setattr(mcp_auth, "resolve_api_key", fake_resolve)

    app = Starlette(routes=[Route("/mcp", ping)])
    app.add_middleware(mcp_auth.APIKeyMiddleware, driver_factory=fake_driver_factory)
    client = TestClient(app)

    r = client.get("/mcp", headers={"X-MCP-Key": "orbk_bogus"})
    assert r.status_code == 401
    assert "invalid" in r.json()["error"]


async def test_middleware_sets_context_on_valid_key(monkeypatch, reset_context):
    from starlette.applications import Starlette
    from starlette.responses import JSONResponse
    from starlette.routing import Route
    from starlette.testclient import TestClient

    seen_user: dict = {}

    async def ping(request):
        seen_user["value"] = mcp_auth.get_current_user_id()
        return JSONResponse({"ok": True})

    async def fake_driver_factory():
        return _FakeDriver()

    async def fake_resolve(driver, *, raw_key):
        return "resolved-user"

    monkeypatch.setattr(mcp_auth, "resolve_api_key", fake_resolve)

    app = Starlette(routes=[Route("/mcp", ping)])
    app.add_middleware(mcp_auth.APIKeyMiddleware, driver_factory=fake_driver_factory)
    client = TestClient(app)

    r = client.get("/mcp", headers={"X-MCP-Key": "orbk_whatever"})
    assert r.status_code == 200
    assert seen_user["value"] == "resolved-user"


async def test_middleware_accepts_orbs_prefix_sets_share_context(
    monkeypatch, reset_context
):
    """orbs_<token> header sets _current_share_context, not _current_user_id."""
    from starlette.applications import Starlette
    from starlette.responses import JSONResponse
    from starlette.routing import Route
    from starlette.testclient import TestClient

    from mcp_server.auth import ShareContext

    seen: dict = {}

    async def ping(request):
        ctx = mcp_auth.get_share_context()
        seen["user_id"] = mcp_auth.get_current_user_id()
        seen["orb_id"] = ctx.orb_id if ctx else None
        seen["keywords"] = list(ctx.keywords) if ctx else None
        seen["token_id"] = ctx.token_id if ctx else None
        return JSONResponse({"ok": True})

    async def fake_driver_factory():
        return _FakeDriver()

    async def fake_validate(driver, bare_token):
        assert bare_token == "share-abc"  # prefix must have been stripped
        return ShareContext(
            orb_id="orb-123",
            keywords=("secret",),
            hidden_node_types=("skill",),
            token_id="share-abc",
        )

    import app.orbs.share_token as share_token_module

    # Patch the module attribute (not mcp_auth.validate_share_token_for_mcp)
    # because the middleware does a LOCAL import on every call. If that
    # import is ever hoisted to module level in auth.py, this target must
    # change to mcp_auth to keep the monkeypatch effective.
    monkeypatch.setattr(
        share_token_module, "validate_share_token_for_mcp", fake_validate
    )

    app = Starlette(routes=[Route("/mcp", ping)])
    app.add_middleware(mcp_auth.APIKeyMiddleware, driver_factory=fake_driver_factory)
    client = TestClient(app)

    r = client.get("/mcp", headers={"X-MCP-Key": "orbs_share-abc"})
    assert r.status_code == 200
    assert seen["user_id"] is None
    assert seen["orb_id"] == "orb-123"
    assert seen["keywords"] == ["secret"]
    assert seen["token_id"] == "share-abc"


async def test_middleware_rejects_orbs_with_unknown_token(monkeypatch, reset_context):
    from starlette.applications import Starlette
    from starlette.responses import PlainTextResponse
    from starlette.routing import Route
    from starlette.testclient import TestClient

    async def ping(request):
        return PlainTextResponse("pong")

    async def fake_driver_factory():
        return _FakeDriver()

    async def fake_validate(driver, bare_token):
        return None

    import app.orbs.share_token as share_token_module

    # Patch the module attribute (not mcp_auth.validate_share_token_for_mcp)
    # because the middleware does a LOCAL import on every call. If that
    # import is ever hoisted to module level in auth.py, this target must
    # change to mcp_auth to keep the monkeypatch effective.
    monkeypatch.setattr(
        share_token_module, "validate_share_token_for_mcp", fake_validate
    )

    app = Starlette(routes=[Route("/mcp", ping)])
    app.add_middleware(mcp_auth.APIKeyMiddleware, driver_factory=fake_driver_factory)
    client = TestClient(app)

    r = client.get("/mcp", headers={"X-MCP-Key": "orbs_not-a-real-token"})
    assert r.status_code == 401
    assert "invalid" in r.json()["error"].lower()


async def test_middleware_rejects_unrecognized_prefix(reset_context):
    from starlette.applications import Starlette
    from starlette.responses import PlainTextResponse
    from starlette.routing import Route
    from starlette.testclient import TestClient

    async def ping(request):
        return PlainTextResponse("pong")

    async def fake_driver_factory():
        return _FakeDriver()

    app = Starlette(routes=[Route("/mcp", ping)])
    app.add_middleware(mcp_auth.APIKeyMiddleware, driver_factory=fake_driver_factory)
    client = TestClient(app)

    r = client.get("/mcp", headers={"X-MCP-Key": "foo_whatever"})
    assert r.status_code == 401
    assert (
        "unrecognized" in r.json()["error"].lower()
        or "prefix" in r.json()["error"].lower()
    )


async def test_middleware_orbk_flow_unchanged_after_branching(
    monkeypatch, reset_context
):
    """Regression-lock: orbk_ still sets user_id and doesn't touch share context."""
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
        return _FakeDriver()

    async def fake_resolve(driver, *, raw_key):
        return "user-from-orbk"

    monkeypatch.setattr(mcp_auth, "resolve_api_key", fake_resolve)

    app = Starlette(routes=[Route("/mcp", ping)])
    app.add_middleware(mcp_auth.APIKeyMiddleware, driver_factory=fake_driver_factory)
    client = TestClient(app)

    r = client.get("/mcp", headers={"X-MCP-Key": "orbk_valid-key"})
    assert r.status_code == 200
    assert seen["user_id"] == "user-from-orbk"
    assert seen["share_ctx"] is None
