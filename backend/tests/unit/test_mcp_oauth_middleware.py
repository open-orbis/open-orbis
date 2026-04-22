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


def _build_app_with_mcp_auth(monkeypatch):
    from unittest.mock import AsyncMock

    from starlette.applications import Starlette
    from starlette.responses import JSONResponse
    from starlette.routing import Route
    from starlette.testclient import TestClient

    seen = {}

    async def echo(request):
        seen["user_id"] = mcp_auth.get_current_user_id()
        ctx = mcp_auth.get_share_context()
        seen["orb_id"] = ctx.orb_id if ctx else None
        seen["token_id"] = ctx.token_id if ctx else None
        return JSONResponse({"ok": True})

    async def fake_driver_factory():
        return MagicMock()

    # get_pool is async; patch with an AsyncMock so `await get_pool()` works.
    monkeypatch.setattr("app.db.postgres.get_pool", AsyncMock(return_value=MagicMock()))

    app = Starlette(routes=[Route("/mcp", echo)])
    app.add_middleware(mcp_auth.APIKeyMiddleware, driver_factory=fake_driver_factory)
    return TestClient(app), seen


class TestBearerAuth:
    def test_bearer_full_mode_sets_user_id(self, monkeypatch):
        async def _resolve(pool, raw):
            return {
                "user_id": "user-bearer",
                "share_token_id": None,
                "scope": "orbis.read",
            }

        import mcp_server.oauth_resolver as resolver_module

        monkeypatch.setattr(resolver_module, "resolve_oauth_token", _resolve)

        client, seen = _build_app_with_mcp_auth(monkeypatch)
        r = client.get("/mcp", headers={"Authorization": "Bearer oauth_abc"})
        assert r.status_code == 200
        assert seen["user_id"] == "user-bearer"
        assert seen["orb_id"] is None

    def test_bearer_restricted_mode_sets_share_context(self, monkeypatch):
        async def _resolve(pool, raw):
            return {
                "user_id": "user-bearer",
                "share_token_id": "tok-s",
                "scope": "orbis.read",
            }

        async def _validate(db, token_id):
            return ShareContext(
                orb_id="orb-scoped",
                keywords=(),
                hidden_node_types=("skill",),
                token_id="tok-s",
            )

        import app.orbs.share_token as share_module
        import mcp_server.oauth_resolver as resolver_module

        monkeypatch.setattr(resolver_module, "resolve_oauth_token", _resolve)
        monkeypatch.setattr(share_module, "validate_share_token_for_mcp", _validate)

        client, seen = _build_app_with_mcp_auth(monkeypatch)
        r = client.get("/mcp", headers={"Authorization": "Bearer oauth_xyz"})
        assert r.status_code == 200
        assert seen["user_id"] is None
        assert seen["orb_id"] == "orb-scoped"
        assert seen["token_id"] == "tok-s"

    def test_invalid_bearer_returns_401(self, monkeypatch):
        async def _resolve(pool, raw):
            return None

        import mcp_server.oauth_resolver as resolver_module

        monkeypatch.setattr(resolver_module, "resolve_oauth_token", _resolve)

        client, _ = _build_app_with_mcp_auth(monkeypatch)
        r = client.get("/mcp", headers={"Authorization": "Bearer oauth_bad"})
        assert r.status_code == 401

    def test_bearer_restricted_with_revoked_share_token_returns_401(self, monkeypatch):
        """If the share token backing the OAuth grant has been revoked, deny."""

        async def _resolve(pool, raw):
            return {
                "user_id": "user-bearer",
                "share_token_id": "tok-gone",
                "scope": "orbis.read",
            }

        async def _validate(db, token_id):
            return None  # share token is invalid/expired/revoked

        import app.orbs.share_token as share_module
        import mcp_server.oauth_resolver as resolver_module

        monkeypatch.setattr(resolver_module, "resolve_oauth_token", _resolve)
        monkeypatch.setattr(share_module, "validate_share_token_for_mcp", _validate)

        client, _ = _build_app_with_mcp_auth(monkeypatch)
        r = client.get("/mcp", headers={"Authorization": "Bearer oauth_xyz"})
        assert r.status_code == 401

    def test_orbk_flow_unchanged(self, monkeypatch):
        """Regression: X-MCP-Key orbk_ still sets user_id, no OAuth path triggered."""

        async def _resolve(driver, *, raw_key):
            return "user-orbk"

        monkeypatch.setattr(mcp_auth, "resolve_api_key", _resolve)

        client, seen = _build_app_with_mcp_auth(monkeypatch)
        r = client.get("/mcp", headers={"X-MCP-Key": "orbk_valid"})
        assert r.status_code == 200
        assert seen["user_id"] == "user-orbk"
        assert seen["orb_id"] is None

    def test_present_invalid_orbk_blocks_bearer_fallthrough(self, monkeypatch):
        """An invalid X-MCP-Key must not fall through to the Bearer branch.

        Regression test: the if/elif ordering in dispatch means a present
        (even if invalid) X-MCP-Key header short-circuits the Bearer
        check. A future refactor that reorders or merges branches could
        silently introduce a credential-bypass where an attacker sends
        both headers. This test locks in the current behaviour.
        """

        async def _orbk_resolve(driver, *, raw_key):
            return None  # X-MCP-Key is structurally valid prefix but resolves to None

        bearer_called = []

        async def _bearer_resolve(pool, raw):
            bearer_called.append(raw)
            return {"user_id": "sneaky", "share_token_id": None, "scope": "orbis.read"}

        monkeypatch.setattr(mcp_auth, "resolve_api_key", _orbk_resolve)
        import mcp_server.oauth_resolver as resolver_module

        monkeypatch.setattr(resolver_module, "resolve_oauth_token", _bearer_resolve)

        client, _ = _build_app_with_mcp_auth(monkeypatch)
        r = client.get(
            "/mcp",
            headers={
                "X-MCP-Key": "orbk_invalid",
                "Authorization": "Bearer oauth_valid",
            },
        )
        assert r.status_code == 401
        assert bearer_called == [], (
            "Bearer resolver must never be invoked when X-MCP-Key is present"
        )
