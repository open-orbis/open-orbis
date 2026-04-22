"""Tests for OAuth cascade revocation (share-token revoke, user delete)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

from app.oauth import db as oauth_db


def _mock_pool_with_conn():
    conn = AsyncMock()
    pool = MagicMock()
    pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)
    # conn.transaction() must return a sync callable that is itself an async
    # context manager — NOT a coroutine.  Use MagicMock(return_value=txn_ctx)
    # so that conn.transaction() (sync call) returns the context-manager object.
    txn_ctx = MagicMock()
    txn_ctx.__aenter__ = AsyncMock(return_value=None)
    txn_ctx.__aexit__ = AsyncMock(return_value=None)
    conn.transaction = MagicMock(return_value=txn_ctx)
    return pool, conn


class TestCascadeRevokeByShareToken:
    async def test_executes_two_updates_with_token_id(self):
        pool, conn = _mock_pool_with_conn()
        conn.execute = AsyncMock()
        await oauth_db.cascade_revoke_oauth_by_share_token(pool, "tok-abc")
        assert conn.execute.await_count == 2
        first = conn.execute.await_args_list[0]
        second = conn.execute.await_args_list[1]
        assert "UPDATE oauth_access_tokens" in first.args[0]
        assert "UPDATE oauth_refresh_tokens" in second.args[0]
        assert "share_token_id = $1" in first.args[0]
        assert first.args[1] == "tok-abc"
        assert second.args[1] == "tok-abc"

    async def test_wraps_in_transaction(self):
        pool, conn = _mock_pool_with_conn()
        conn.execute = AsyncMock()
        await oauth_db.cascade_revoke_oauth_by_share_token(pool, "tok-abc")
        conn.transaction.assert_called_once()


class TestCascadeDeleteUserOauth:
    async def test_executes_three_deletes_with_user_id(self):
        pool, conn = _mock_pool_with_conn()
        conn.execute = AsyncMock()
        await oauth_db.cascade_delete_user_oauth(pool, "user-gone")
        assert conn.execute.await_count == 3
        expected_tables = [
            "oauth_access_tokens",
            "oauth_refresh_tokens",
            "oauth_authorization_codes",
        ]
        for call, table in zip(
            conn.execute.await_args_list, expected_tables, strict=True
        ):
            assert f"DELETE FROM {table}" in call.args[0]
            assert call.args[1] == "user-gone"

    async def test_wraps_in_transaction(self):
        pool, conn = _mock_pool_with_conn()
        conn.execute = AsyncMock()
        await oauth_db.cascade_delete_user_oauth(pool, "user-gone")
        conn.transaction.assert_called_once()


class TestRevokeShareTokenCascade:
    """revoke_share_token should cascade when pg_pool is provided."""

    async def test_cascade_called_on_successful_revoke(self, monkeypatch):
        from app.orbs.share_token import revoke_share_token

        # Mock the Neo4j driver to return a successful revoke
        session = AsyncMock()
        record = MagicMock()
        record.__getitem__.side_effect = lambda k: (
            {"token_id": "tok-123"} if k == "st" else None
        )
        result = AsyncMock()
        result.single = AsyncMock(return_value=record)
        session.run = AsyncMock(return_value=result)
        db = MagicMock()
        db.session.return_value.__aenter__ = AsyncMock(return_value=session)
        db.session.return_value.__aexit__ = AsyncMock(return_value=None)

        # Patch _sanitize so it returns a plain dict
        monkeypatch.setattr(
            "app.orbs.share_token._sanitize",
            lambda d: dict(d) if hasattr(d, "items") else {"token_id": "tok-123"},
        )

        cascade_called = []

        async def _cascade(pool, tid):
            cascade_called.append(tid)

        monkeypatch.setattr(
            "app.oauth.db.cascade_revoke_oauth_by_share_token", _cascade
        )

        pool = MagicMock()
        await revoke_share_token(db, "user-1", "tok-123", pg_pool=pool)
        assert cascade_called == ["tok-123"]

    async def test_no_cascade_when_pg_pool_missing(self, monkeypatch):
        """Backward compat: callers not passing pg_pool still work."""
        from app.orbs.share_token import revoke_share_token

        session = AsyncMock()
        record = MagicMock()
        record.__getitem__.return_value = {"token_id": "tok-xyz"}
        result = AsyncMock()
        result.single = AsyncMock(return_value=record)
        session.run = AsyncMock(return_value=result)
        db = MagicMock()
        db.session.return_value.__aenter__ = AsyncMock(return_value=session)
        db.session.return_value.__aexit__ = AsyncMock(return_value=None)

        monkeypatch.setattr(
            "app.orbs.share_token._sanitize",
            lambda _d: {"token_id": "tok-xyz"},
        )

        cascade_called = []

        async def _cascade(pool, tid):
            cascade_called.append(tid)

        monkeypatch.setattr(
            "app.oauth.db.cascade_revoke_oauth_by_share_token", _cascade
        )

        # No pg_pool keyword
        await revoke_share_token(db, "user-1", "tok-xyz")
        assert cascade_called == []

    async def test_no_cascade_when_token_not_found(self, monkeypatch):
        """Revoke returned None (token doesn't belong to user) → no cascade."""
        from app.orbs.share_token import revoke_share_token

        session = AsyncMock()
        result = AsyncMock()
        result.single = AsyncMock(return_value=None)
        session.run = AsyncMock(return_value=result)
        db = MagicMock()
        db.session.return_value.__aenter__ = AsyncMock(return_value=session)
        db.session.return_value.__aexit__ = AsyncMock(return_value=None)

        cascade_called = []

        async def _cascade(pool, tid):
            cascade_called.append(tid)

        monkeypatch.setattr(
            "app.oauth.db.cascade_revoke_oauth_by_share_token", _cascade
        )

        pool = MagicMock()
        result_val = await revoke_share_token(db, "user-1", "missing", pg_pool=pool)
        assert result_val is None
        assert cascade_called == []
