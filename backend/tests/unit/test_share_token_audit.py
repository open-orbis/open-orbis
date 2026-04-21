"""Tests for the MCP share-token audit counter (mcp_use_count)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock


class TestIncrementMcpUse:
    """increment_mcp_use is fire-and-forget: runs Cypher, swallows errors."""

    async def test_runs_cypher_with_token_id(self):
        """Invokes the INCREMENT_SHARE_TOKEN_MCP_USE query with the right param."""
        from app.graph.queries import INCREMENT_SHARE_TOKEN_MCP_USE
        from app.orbs.share_token import increment_mcp_use

        mock_session = AsyncMock()
        mock_driver = MagicMock()
        # session() returns an async context manager; __aenter__ → the session.
        mock_driver.session.return_value.__aenter__ = AsyncMock(
            return_value=mock_session
        )
        mock_driver.session.return_value.__aexit__ = AsyncMock(return_value=None)

        await increment_mcp_use(mock_driver, "tok-abc")

        mock_session.run.assert_awaited_once_with(
            INCREMENT_SHARE_TOKEN_MCP_USE, token_id="tok-abc"
        )

    async def test_swallows_exceptions(self):
        """A Neo4j failure must not raise — this is fire-and-forget telemetry."""
        from app.orbs.share_token import increment_mcp_use

        mock_driver = MagicMock()
        mock_driver.session.side_effect = RuntimeError("neo4j down")

        # Must not raise
        await increment_mcp_use(mock_driver, "tok-abc")

    async def test_logs_warning_on_failure(self, caplog):
        """Failed writes produce a WARNING-level log with the token_id."""
        from app.orbs.share_token import increment_mcp_use

        mock_driver = MagicMock()
        mock_driver.session.side_effect = RuntimeError("neo4j down")

        with caplog.at_level("WARNING", logger="app.orbs.share_token"):
            await increment_mcp_use(mock_driver, "tok-xyz")

        assert any(
            "mcp_use_count" in r.message and "tok-xyz" in r.message
            for r in caplog.records
        )


class TestMiddlewareDispatchesAuditWrite:
    """The share-mode branch of APIKeyMiddleware should fire an audit task."""

    async def test_orbs_auth_triggers_increment(self, monkeypatch):
        """A successful `orbs_` request dispatches increment_mcp_use as a task."""
        import asyncio

        from starlette.applications import Starlette
        from starlette.responses import PlainTextResponse
        from starlette.routing import Route
        from starlette.testclient import TestClient

        from mcp_server import auth as mcp_auth
        from mcp_server.auth import ShareContext

        # Clear both ContextVars up front (mirrors reset_context behavior).
        user_tok = mcp_auth._current_user_id.set(None)
        share_tok = mcp_auth._current_share_context.set(None)

        invoked_with: dict = {}

        async def fake_validate(driver, bare_token):
            return ShareContext(
                orb_id="orb-x",
                keywords=(),
                hidden_node_types=(),
                token_id="tok-123",
            )

        async def fake_increment(driver, token_id):
            # Capture the call so we can assert after the request
            invoked_with["token_id"] = token_id

        async def fake_driver_factory():
            return MagicMock()

        import app.orbs.share_token as share_token_module

        # Patch the module attribute (not mcp_auth.validate_share_token_for_mcp)
        # because the middleware does a LOCAL import on every call.
        monkeypatch.setattr(
            share_token_module, "validate_share_token_for_mcp", fake_validate
        )
        monkeypatch.setattr(share_token_module, "increment_mcp_use", fake_increment)

        async def ping(request):
            return PlainTextResponse("pong")

        app = Starlette(routes=[Route("/mcp", ping)])
        app.add_middleware(
            mcp_auth.APIKeyMiddleware, driver_factory=fake_driver_factory
        )
        client = TestClient(app)

        try:
            r = client.get("/mcp", headers={"X-MCP-Key": "orbs_anything"})
            assert r.status_code == 200
            # The audit task is scheduled on the event loop. TestClient runs
            # requests synchronously via a background loop, so briefly yield
            # to let the task finish.
            await asyncio.sleep(0.05)
            assert invoked_with.get("token_id") == "tok-123"
        finally:
            mcp_auth._current_user_id.reset(user_tok)
            mcp_auth._current_share_context.reset(share_tok)

    async def test_orbk_auth_does_not_trigger_increment(self, monkeypatch):
        """Regression: user-key flow must NOT fire the share-token counter."""
        from starlette.applications import Starlette
        from starlette.responses import PlainTextResponse
        from starlette.routing import Route
        from starlette.testclient import TestClient

        from mcp_server import auth as mcp_auth

        user_tok = mcp_auth._current_user_id.set(None)
        share_tok = mcp_auth._current_share_context.set(None)

        called = {"count": 0}

        async def fake_resolve(driver, *, raw_key):
            return "user-1"

        async def fake_increment(driver, token_id):
            called["count"] += 1

        async def fake_driver_factory():
            return MagicMock()

        monkeypatch.setattr(mcp_auth, "resolve_api_key", fake_resolve)

        import app.orbs.share_token as share_token_module

        monkeypatch.setattr(share_token_module, "increment_mcp_use", fake_increment)

        async def ping(request):
            return PlainTextResponse("pong")

        app = Starlette(routes=[Route("/mcp", ping)])
        app.add_middleware(
            mcp_auth.APIKeyMiddleware, driver_factory=fake_driver_factory
        )
        client = TestClient(app)

        try:
            r = client.get("/mcp", headers={"X-MCP-Key": "orbk_valid"})
            assert r.status_code == 200
            assert called["count"] == 0
        finally:
            mcp_auth._current_user_id.reset(user_tok)
            mcp_auth._current_share_context.reset(share_tok)
