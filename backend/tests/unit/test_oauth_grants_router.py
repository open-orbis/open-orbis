"""Tests for GET /api/oauth/grants + DELETE /api/oauth/grants/{client_id}."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_current_user, get_db
from app.main import app


@pytest.fixture
def user_client():
    fake_user = {"user_id": "user-me", "email": "me@example.com"}
    app.dependency_overrides[get_current_user] = lambda: fake_user
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    with TestClient(app) as tc:
        yield tc
    app.dependency_overrides.clear()


@pytest.fixture
def _pool_with_conn(monkeypatch):
    # Build a synchronous context-manager object for conn.transaction()
    tx_ctx = MagicMock()
    tx_ctx.__aenter__ = AsyncMock(return_value=None)
    tx_ctx.__aexit__ = AsyncMock(return_value=None)

    conn = AsyncMock()
    # transaction() must be a plain callable (not a coroutine) that returns
    # an async context manager — the combined `async with X, Y:` syntax calls
    # Y.__aenter__ directly without awaiting Y first.
    conn.transaction = MagicMock(return_value=tx_ctx)

    pool = MagicMock()
    pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    async def _gp():
        return pool

    monkeypatch.setattr("app.oauth.grants_router.get_pool", _gp)
    return pool, conn


# ── GET /api/oauth/grants ─────────────────────────────────────────


class TestListGrants:
    def test_returns_current_users_grants_only(self, user_client, _pool_with_conn):
        pool, conn = _pool_with_conn
        cid = uuid.uuid4()
        conn.fetch = AsyncMock(
            return_value=[
                {
                    "client_id": cid,
                    "client_name": "ChatGPT",
                    "share_token_id": None,
                    "connected_at": datetime(2026, 4, 1, tzinfo=timezone.utc),
                    "last_used_at": datetime(2026, 4, 20, tzinfo=timezone.utc),
                }
            ]
        )
        resp = user_client.get("/api/oauth/grants")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["grants"]) == 1
        g = body["grants"][0]
        assert g["client_id"] == str(cid)
        assert g["client_name"] == "ChatGPT"
        assert g["share_token_id"] is None
        assert g["share_token_label"] is None
        assert g["connected_at"].startswith("2026-04-01")
        assert g["last_used_at"].startswith("2026-04-20")

        # Defense-in-depth: verify the WHERE clause included user_id = $1
        sql = conn.fetch.await_args.args[0]
        assert "r.user_id = $1" in sql
        assert conn.fetch.await_args.args[1] == "user-me"

    def test_empty_grants_returns_empty_list(self, user_client, _pool_with_conn):
        pool, conn = _pool_with_conn
        conn.fetch = AsyncMock(return_value=[])
        resp = user_client.get("/api/oauth/grants")
        assert resp.status_code == 200
        assert resp.json() == {"grants": []}

    def test_last_used_at_null_renders_as_null(self, user_client, _pool_with_conn):
        pool, conn = _pool_with_conn
        conn.fetch = AsyncMock(
            return_value=[
                {
                    "client_id": uuid.uuid4(),
                    "client_name": "x",
                    "share_token_id": None,
                    "connected_at": datetime(2026, 4, 1, tzinfo=timezone.utc),
                    "last_used_at": None,
                }
            ]
        )
        resp = user_client.get("/api/oauth/grants")
        assert resp.json()["grants"][0]["last_used_at"] is None


# ── DELETE /api/oauth/grants/{client_id} ──────────────────────────


class TestRevokeGrant:
    def test_happy_path_issues_two_updates(self, user_client, _pool_with_conn):
        pool, conn = _pool_with_conn
        conn.execute = AsyncMock()
        cid = uuid.uuid4()
        resp = user_client.delete(f"/api/oauth/grants/{cid}")
        assert resp.status_code == 200
        assert resp.json() == {"status": "revoked"}
        assert conn.execute.await_count == 2
        # Both queries filter by user_id
        first = conn.execute.await_args_list[0]
        second = conn.execute.await_args_list[1]
        assert "UPDATE oauth_access_tokens" in first.args[0]
        assert "UPDATE oauth_refresh_tokens" in second.args[0]
        for call in (first, second):
            assert "user_id = $2" in call.args[0]
            assert call.args[1] == cid
            assert call.args[2] == "user-me"

    def test_non_uuid_returns_400(self, user_client, _pool_with_conn):
        resp = user_client.delete("/api/oauth/grants/not-a-uuid")
        assert resp.status_code == 400

    def test_idempotent_when_no_rows(self, user_client, _pool_with_conn):
        pool, conn = _pool_with_conn
        conn.execute = AsyncMock()  # simulate 0-row update
        cid = uuid.uuid4()
        resp = user_client.delete(f"/api/oauth/grants/{cid}")
        assert resp.status_code == 200  # still 200

    def test_transaction_wraps_both_updates(self, user_client, _pool_with_conn):
        pool, conn = _pool_with_conn
        conn.execute = AsyncMock()
        cid = uuid.uuid4()
        resp = user_client.delete(f"/api/oauth/grants/{cid}")
        assert resp.status_code == 200
        # transaction() must have been called and its context entered + exited
        conn.transaction.assert_called_once()
        conn.transaction.return_value.__aenter__.assert_awaited_once()
        conn.transaction.return_value.__aexit__.assert_awaited_once()
