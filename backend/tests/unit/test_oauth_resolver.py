"""Tests for mcp_server.oauth_resolver.resolve_oauth_token."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from mcp_server.oauth_resolver import resolve_oauth_token


@pytest.fixture
def _mock_pool():
    pool = MagicMock()
    conn = AsyncMock()
    pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)
    return pool, conn


class TestResolveOauthToken:
    async def test_returns_grant_for_valid_token(self, _mock_pool, monkeypatch):
        pool, conn = _mock_pool
        mock_grant = {"user_id": "u1", "share_token_id": None, "scope": "orbis.read"}

        async def _resolve(pool_, h):
            return mock_grant

        monkeypatch.setattr(
            "mcp_server.oauth_resolver.oauth_db.resolve_access_token", _resolve
        )

        # Touch must be awaitable but doesn't need to block
        async def _touch(pool_, h):
            pass

        monkeypatch.setattr(
            "mcp_server.oauth_resolver.oauth_db.touch_access_token", _touch
        )

        grant = await resolve_oauth_token(pool, "oauth_abc")
        assert grant == mock_grant

    async def test_returns_none_for_expired_or_revoked(self, _mock_pool, monkeypatch):
        pool, _ = _mock_pool

        async def _resolve(pool_, h):
            return None

        monkeypatch.setattr(
            "mcp_server.oauth_resolver.oauth_db.resolve_access_token", _resolve
        )
        assert await resolve_oauth_token(pool, "oauth_gone") is None

    async def test_returns_none_for_empty_token(self, _mock_pool):
        pool, _ = _mock_pool
        assert await resolve_oauth_token(pool, "") is None

    async def test_touches_last_used_on_success(self, _mock_pool, monkeypatch):
        pool, _ = _mock_pool
        touched = []

        async def _resolve(pool_, h):
            return {"user_id": "u1", "share_token_id": None, "scope": "orbis.read"}

        async def _touch(pool_, h):
            touched.append(h)

        monkeypatch.setattr(
            "mcp_server.oauth_resolver.oauth_db.resolve_access_token", _resolve
        )
        monkeypatch.setattr(
            "mcp_server.oauth_resolver.oauth_db.touch_access_token", _touch
        )
        await resolve_oauth_token(pool, "oauth_xyz")
        # Touch is fire-and-forget via asyncio.create_task; let the loop drain
        import asyncio

        await asyncio.sleep(0)
        assert len(touched) == 1
