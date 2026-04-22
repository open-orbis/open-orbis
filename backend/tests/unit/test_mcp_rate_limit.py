"""Tests for the per-credential rate limiter on the MCP transport."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from mcp_server import auth as mcp_auth
from mcp_server.auth import ShareContext


@pytest.fixture(autouse=True)
def _reset_rate_limit_buckets():
    """Ensure each test starts with empty rate-limit state."""
    from mcp_server.rate_limit import _reset_buckets_for_tests

    _reset_buckets_for_tests()
    yield
    _reset_buckets_for_tests()


@pytest.fixture(autouse=True)
def _reset_context_vars():
    """Reset both MCP ContextVars on the TEST thread's copy.

    Note: this affects direct unit tests in this file that call
    `_credential_key_and_limit()` in the test thread. It does NOT
    reset the ContextVars the ASGI middleware sees — those run in the
    event loop's context copy. The end-to-end rate-limit tests rely on
    the middleware setting its own ContextVars per request, so this
    fixture is only relevant to the unit tests in
    `TestCredentialKeyAndLimit`.
    """
    user_tok = mcp_auth._current_user_id.set(None)
    share_tok = mcp_auth._current_share_context.set(None)
    yield
    mcp_auth._current_user_id.reset(user_tok)
    mcp_auth._current_share_context.reset(share_tok)


def _build_test_app(monkeypatch):
    """Build a minimal Starlette app with the real middleware stack.

    Returns a TestClient. Patches `validate_share_token_for_mcp`,
    `increment_mcp_use`, and `resolve_api_key` so no real DB is required.
    """
    from starlette.applications import Starlette
    from starlette.responses import PlainTextResponse
    from starlette.routing import Route
    from starlette.testclient import TestClient

    from mcp_server.rate_limit import RateLimitMiddleware

    async def ping(request):
        return PlainTextResponse("pong")

    async def fake_driver_factory():
        return MagicMock()

    async def fake_validate(driver, bare_token):
        return ShareContext(
            orb_id="orb-test",
            keywords=(),
            hidden_node_types=(),
            token_id=bare_token,
        )

    async def fake_resolve(driver, *, raw_key):
        # Same user for any orbk_ key in these tests
        return "user-test"

    async def fake_increment(driver, token_id):
        # No-op; task scheduled, nothing to do
        pass

    import app.orbs.share_token as share_token_module

    monkeypatch.setattr(
        share_token_module, "validate_share_token_for_mcp", fake_validate
    )
    monkeypatch.setattr(share_token_module, "increment_mcp_use", fake_increment)
    monkeypatch.setattr(mcp_auth, "resolve_api_key", fake_resolve)

    app = Starlette(routes=[Route("/mcp", ping)])
    # Order must match server.py's _build_starlette_app: RateLimit FIRST,
    # so APIKey runs first per request.
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(mcp_auth.APIKeyMiddleware, driver_factory=fake_driver_factory)
    return TestClient(app)


def test_share_token_hits_120_per_minute_cap(monkeypatch):
    """121st request in one minute returns 429 with Retry-After."""
    client = _build_test_app(monkeypatch)
    headers = {"X-MCP-Key": "orbs_share-tok-A"}

    for _ in range(120):
        r = client.get("/mcp", headers=headers)
        assert r.status_code == 200
    r = client.get("/mcp", headers=headers)
    assert r.status_code == 429
    assert "Retry-After" in r.headers
    assert int(r.headers["Retry-After"]) >= 1


def test_user_key_hits_300_per_minute_cap(monkeypatch):
    """301st request in one minute returns 429."""
    client = _build_test_app(monkeypatch)
    headers = {"X-MCP-Key": "orbk_user-A"}

    for _ in range(300):
        r = client.get("/mcp", headers=headers)
        assert r.status_code == 200
    r = client.get("/mcp", headers=headers)
    assert r.status_code == 429


def test_rate_limit_buckets_are_separate(monkeypatch):
    """Exhausting one credential's budget must not block another."""
    client = _build_test_app(monkeypatch)

    share_headers = {"X-MCP-Key": "orbs_share-tok-A"}
    user_headers = {"X-MCP-Key": "orbk_user-A"}

    for _ in range(120):
        r = client.get("/mcp", headers=share_headers)
        assert r.status_code == 200

    # Share bucket exhausted
    r1 = client.get("/mcp", headers=share_headers)
    assert r1.status_code == 429

    # User key bucket is independent
    r2 = client.get("/mcp", headers=user_headers)
    assert r2.status_code == 200


def test_two_share_tokens_have_independent_buckets(monkeypatch):
    """Two different share tokens must not share a bucket."""
    client = _build_test_app(monkeypatch)

    for _ in range(120):
        r = client.get("/mcp", headers={"X-MCP-Key": "orbs_share-tok-A"})
        assert r.status_code == 200

    # Share token A exhausted
    r_a = client.get("/mcp", headers={"X-MCP-Key": "orbs_share-tok-A"})
    assert r_a.status_code == 429

    # Share token B has its own budget
    r_b = client.get("/mcp", headers={"X-MCP-Key": "orbs_share-tok-B"})
    assert r_b.status_code == 200


class TestCredentialKeyAndLimit:
    """Unit tests for the pure key-and-limit resolver."""

    def test_share_context_takes_priority(self):
        from mcp_server.auth import _current_share_context
        from mcp_server.rate_limit import (
            SHARE_LIMIT_PER_MIN,
            _credential_key_and_limit,
        )

        ctx = ShareContext(
            orb_id="orb-x",
            keywords=(),
            hidden_node_types=(),
            token_id="tok-xyz",
        )
        reset = _current_share_context.set(ctx)
        try:
            key, limit = _credential_key_and_limit()
            assert key == "s:tok-xyz"
            assert limit == SHARE_LIMIT_PER_MIN
        finally:
            _current_share_context.reset(reset)

    def test_user_id_used_when_no_share_context(self):
        from mcp_server.auth import _current_user_id
        from mcp_server.rate_limit import (
            USER_LIMIT_PER_MIN,
            _credential_key_and_limit,
        )

        reset = _current_user_id.set("user-abc")
        try:
            key, limit = _credential_key_and_limit()
            assert key == "u:user-abc"
            assert limit == USER_LIMIT_PER_MIN
        finally:
            _current_user_id.reset(reset)

    def test_falls_back_to_anon_when_neither_context(self):
        """Defensive: APIKeyMiddleware always sets one, but if not, we key
        as anon with share-tier (tighter) limits."""
        from mcp_server.rate_limit import (
            SHARE_LIMIT_PER_MIN,
            _credential_key_and_limit,
        )

        key, limit = _credential_key_and_limit()
        assert key == "anon"
        assert limit == SHARE_LIMIT_PER_MIN
