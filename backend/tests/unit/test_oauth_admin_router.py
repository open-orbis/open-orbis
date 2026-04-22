"""Tests for /admin/oauth admin endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_db, require_admin
from app.main import app


@pytest.fixture
def admin_client():
    fake_admin = {"user_id": "admin-1", "email": "admin@example.com", "is_admin": True}
    app.dependency_overrides[require_admin] = lambda: fake_admin
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    with TestClient(app) as tc:
        yield tc
    app.dependency_overrides.clear()


@pytest.fixture
def _pool_with_conn(monkeypatch):
    conn = AsyncMock()
    pool = MagicMock()
    pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    async def _gp():
        return pool

    monkeypatch.setattr("app.oauth.admin_router.get_pool", _gp)
    return pool, conn


class TestListClients:
    def test_returns_recent_clients(self, admin_client, _pool_with_conn):
        _, conn = _pool_with_conn
        cid = uuid.uuid4()
        conn.fetch = AsyncMock(
            return_value=[
                {
                    "client_id": cid,
                    "client_name": "ChatGPT",
                    "token_endpoint_auth_method": "none",
                    "registered_at": datetime(2026, 4, 20, tzinfo=timezone.utc),
                    "registered_from_ip": "1.2.3.4",
                    "registered_user_agent": "ChatGPT/1.0",
                    "disabled_at": None,
                }
            ]
        )
        resp = admin_client.get("/api/admin/oauth/clients")
        assert resp.status_code == 200
        clients = resp.json()["clients"]
        assert len(clients) == 1
        c = clients[0]
        assert c["client_id"] == str(cid)
        assert c["client_name"] == "ChatGPT"
        assert c["disabled"] is False
        assert c["registered_from_ip"] == "1.2.3.4"

    def test_disabled_flag_set(self, admin_client, _pool_with_conn):
        _, conn = _pool_with_conn
        conn.fetch = AsyncMock(
            return_value=[
                {
                    "client_id": uuid.uuid4(),
                    "client_name": "BadBot",
                    "token_endpoint_auth_method": "none",
                    "registered_at": datetime(2026, 4, 20, tzinfo=timezone.utc),
                    "registered_from_ip": None,
                    "registered_user_agent": None,
                    "disabled_at": datetime(2026, 4, 21, tzinfo=timezone.utc),
                }
            ]
        )
        resp = admin_client.get("/api/admin/oauth/clients")
        assert resp.json()["clients"][0]["disabled"] is True

    def test_requires_admin(self):
        """Regression: non-admin gets rejected via require_admin."""
        # With no override, the actual require_admin runs and rejects unauth
        with TestClient(app) as tc:
            resp = tc.get("/api/admin/oauth/clients")
        assert resp.status_code in (401, 403)


class TestDisableClient:
    def test_happy_path(self, admin_client, _pool_with_conn, monkeypatch):
        disable_called = []

        async def _disable(pool, cid):
            disable_called.append(cid)

        monkeypatch.setattr("app.oauth.admin_router.oauth_db.disable_client", _disable)
        cid = uuid.uuid4()
        resp = admin_client.post(f"/api/admin/oauth/clients/{cid}/disable")
        assert resp.status_code == 200
        assert resp.json() == {"status": "disabled"}
        assert disable_called == [cid]

    def test_non_uuid_returns_400(self, admin_client, _pool_with_conn):
        resp = admin_client.post("/api/admin/oauth/clients/not-a-uuid/disable")
        assert resp.status_code == 400
