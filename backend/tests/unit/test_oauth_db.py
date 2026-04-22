"""Tests for the OAuth Postgres DAL. Uses mocked asyncpg Pool."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

from app.oauth import db as oauth_db


def _make_pool_with_conn():
    """Return (pool, conn) where conn is the mocked connection."""
    conn = AsyncMock()
    pool = MagicMock()
    pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)
    return pool, conn


class TestRegisterClient:
    async def test_inserts_row_and_returns_uuid(self):
        pool, conn = _make_pool_with_conn()
        conn.execute = AsyncMock()
        cid = await oauth_db.register_client(
            pool,
            client_name="TestClient",
            redirect_uris=["https://example.com/cb"],
            token_endpoint_auth_method="none",
            client_secret_hash=None,
            registered_from_ip="127.0.0.1",
            registered_user_agent="pytest",
        )
        assert isinstance(cid, uuid.UUID)
        conn.execute.assert_awaited_once()
        args = conn.execute.await_args.args
        assert "INSERT INTO oauth_clients" in args[0]
        assert args[1] == cid
        assert args[3] == "TestClient"


class TestGetActiveClient:
    async def test_returns_row_when_not_disabled(self):
        pool, conn = _make_pool_with_conn()
        cid = uuid.uuid4()
        mock_row = {
            "client_id": cid,
            "client_name": "t",
            "redirect_uris": ["https://e.com/cb"],
            "token_endpoint_auth_method": "none",
            "disabled_at": None,
            "registered_at": datetime.now(timezone.utc),
            "registered_from_ip": None,
        }
        conn.fetchrow = AsyncMock(return_value=mock_row)
        result = await oauth_db.get_active_client(pool, cid)
        assert result == mock_row
        sql = conn.fetchrow.await_args.args[0]
        assert "disabled_at IS NULL" in sql

    async def test_returns_none_when_disabled(self):
        pool, conn = _make_pool_with_conn()
        conn.fetchrow = AsyncMock(return_value=None)
        result = await oauth_db.get_active_client(pool, uuid.uuid4())
        assert result is None


class TestIssueAndConsumeAuthorizationCode:
    async def test_issue_executes_insert(self):
        pool, conn = _make_pool_with_conn()
        conn.execute = AsyncMock()
        await oauth_db.issue_authorization_code(
            pool,
            code="ac_abc",
            client_id=uuid.uuid4(),
            user_id="u1",
            share_token_id=None,
            scope="orbis.read",
            redirect_uri="https://e.com/cb",
            code_challenge="chal",
            code_challenge_method="S256",
            ttl_seconds=300,
        )
        conn.execute.assert_awaited_once()
        sql = conn.execute.await_args.args[0]
        assert "INSERT INTO oauth_authorization_codes" in sql

    async def test_consume_returns_row(self):
        pool, conn = _make_pool_with_conn()
        mock_row = {
            "code": "ac_abc",
            "user_id": "u1",
            "share_token_id": None,
            "redirect_uri": "https://e.com/cb",
            "code_challenge": "chal",
            "scope": "orbis.read",
            "client_id": None,
        }
        conn.fetchrow = AsyncMock(return_value=mock_row)
        result = await oauth_db.consume_authorization_code(pool, "ac_abc")
        assert result == mock_row
        sql = conn.fetchrow.await_args.args[0]
        assert "UPDATE oauth_authorization_codes" in sql
        assert "consumed_at IS NULL" in sql
        assert "expires_at > now()" in sql

    async def test_consume_returns_none_when_not_found(self):
        pool, conn = _make_pool_with_conn()
        conn.fetchrow = AsyncMock(return_value=None)
        assert await oauth_db.consume_authorization_code(pool, "missing") is None


class TestAccessTokenLifecycle:
    async def test_resolve_returns_grant(self):
        pool, conn = _make_pool_with_conn()
        mock_row = {
            "client_id": None,
            "user_id": "u1",
            "share_token_id": None,
            "scope": "orbis.read",
        }
        conn.fetchrow = AsyncMock(return_value=mock_row)
        result = await oauth_db.resolve_access_token(pool, "h")
        assert result == mock_row
        sql = conn.fetchrow.await_args.args[0]
        assert "revoked_at IS NULL" in sql
        assert "expires_at > now()" in sql

    async def test_resolve_returns_none_when_expired(self):
        pool, conn = _make_pool_with_conn()
        conn.fetchrow = AsyncMock(return_value=None)
        assert await oauth_db.resolve_access_token(pool, "h") is None

    async def test_revoke_executes_update(self):
        pool, conn = _make_pool_with_conn()
        conn.execute = AsyncMock()
        await oauth_db.revoke_access_token(pool, "h")
        conn.execute.assert_awaited_once()
        sql = conn.execute.await_args.args[0]
        assert "UPDATE oauth_access_tokens" in sql
        assert "revoked_at = now()" in sql

    async def test_touch_swallows_exceptions(self):
        pool, conn = _make_pool_with_conn()
        conn.execute = AsyncMock(side_effect=RuntimeError("db down"))
        # Must not raise
        await oauth_db.touch_access_token(pool, "h")


class TestRefreshTokenRotation:
    async def test_rotate_marks_revoked_and_rotated_to(self):
        pool, conn = _make_pool_with_conn()
        mock_row = {"client_id": uuid.uuid4(), "user_id": "u1", "share_token_id": None}
        conn.fetchrow = AsyncMock(return_value=mock_row)
        result = await oauth_db.rotate_refresh_token(
            pool, old_hash="old_h", new_hash="new_h"
        )
        assert result == mock_row
        sql = conn.fetchrow.await_args.args[0]
        assert "UPDATE oauth_refresh_tokens" in sql
        assert "revoked_at = now()" in sql
        assert "rotated_to = $2" in sql
        assert "revoked_at IS NULL" in sql
        assert "rotated_to IS NULL" in sql
        assert "expires_at > now()" in sql

    async def test_rotate_returns_none_when_token_already_rotated(self):
        pool, conn = _make_pool_with_conn()
        conn.fetchrow = AsyncMock(return_value=None)
        assert (
            await oauth_db.rotate_refresh_token(
                pool, old_hash="old_h", new_hash="new_h"
            )
            is None
        )


class TestRevokeRefreshChain:
    async def test_walks_chain_and_revokes_all(self):
        pool, conn = _make_pool_with_conn()
        user_id = "u1"
        cid = uuid.uuid4()
        conn.fetchrow = AsyncMock(
            side_effect=[
                {"rotated_to": "mid_h", "user_id": user_id, "client_id": cid},
                {"rotated_to": None, "user_id": user_id, "client_id": cid},
            ]
        )
        conn.execute = AsyncMock()
        # conn.transaction() must return a sync context manager (not a coroutine)
        txn_ctx = MagicMock()
        txn_ctx.__aenter__ = AsyncMock(return_value=None)
        txn_ctx.__aexit__ = AsyncMock(return_value=None)
        conn.transaction = MagicMock(return_value=txn_ctx)

        await oauth_db.revoke_refresh_chain(pool, "root_h")

        # Should have executed: 1 chain revoke + 1 access-token cascade revoke
        assert conn.execute.await_count == 2
        first_sql = conn.execute.await_args_list[0].args[0]
        second_sql = conn.execute.await_args_list[1].args[0]
        assert "UPDATE oauth_refresh_tokens" in first_sql
        assert "UPDATE oauth_access_tokens" in second_sql
