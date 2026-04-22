"""Tests for POST /oauth/revoke (RFC 7009)."""

from __future__ import annotations

import hashlib
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_db
from app.main import app


@pytest.fixture
def client():
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    with TestClient(app) as tc:
        yield tc
    app.dependency_overrides.clear()


@pytest.fixture
def _mock_pool(monkeypatch):
    fake_pool = AsyncMock()

    async def _gp():
        return fake_pool

    monkeypatch.setattr("app.oauth.revoke_router.get_pool", _gp)
    return fake_pool


def _sha256(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


class TestRevokeEndpoint:
    def test_revoke_calls_both_access_and_refresh(
        self, client, _mock_pool, monkeypatch
    ):
        """Both revoke_access_token and revoke_refresh_token are called with the hash."""
        access_calls = []
        refresh_calls = []

        async def _revoke_access(pool, token_hash):
            access_calls.append(token_hash)

        async def _revoke_refresh(pool, token_hash):
            refresh_calls.append(token_hash)

        monkeypatch.setattr(
            "app.oauth.revoke_router.oauth_db.revoke_access_token", _revoke_access
        )
        monkeypatch.setattr(
            "app.oauth.revoke_router.oauth_db.revoke_refresh_token", _revoke_refresh
        )

        raw_token = "oauth_sometoken"
        resp = client.post("/oauth/revoke", data={"token": raw_token})

        assert resp.status_code == 200
        assert resp.json() == {}
        expected_hash = _sha256(raw_token)
        assert access_calls == [expected_hash]
        assert refresh_calls == [expected_hash]

    def test_unknown_token_still_returns_200(self, client, _mock_pool, monkeypatch):
        """RFC 7009: revocation is opaque — unknown tokens must not error."""

        async def _noop(pool, token_hash):
            pass  # no-op: token not found, nothing to revoke

        monkeypatch.setattr(
            "app.oauth.revoke_router.oauth_db.revoke_access_token", _noop
        )
        monkeypatch.setattr(
            "app.oauth.revoke_router.oauth_db.revoke_refresh_token", _noop
        )

        resp = client.post("/oauth/revoke", data={"token": "oauth_doesnotexist"})
        assert resp.status_code == 200
        assert resp.json() == {}

    def test_token_type_hint_accepted_but_not_required(
        self, client, _mock_pool, monkeypatch
    ):
        """token_type_hint is optional per RFC 7009; endpoint must accept it."""

        async def _noop(pool, token_hash):
            pass

        monkeypatch.setattr(
            "app.oauth.revoke_router.oauth_db.revoke_access_token", _noop
        )
        monkeypatch.setattr(
            "app.oauth.revoke_router.oauth_db.revoke_refresh_token", _noop
        )

        resp = client.post(
            "/oauth/revoke",
            data={"token": "refresh_abc", "token_type_hint": "refresh_token"},
        )
        assert resp.status_code == 200

    def test_kill_switch_returns_503(self, client, monkeypatch):
        monkeypatch.setattr("app.oauth.revoke_router.settings.oauth_enabled", False)
        resp = client.post("/oauth/revoke", data={"token": "oauth_abc"})
        assert resp.status_code == 503

    def test_missing_token_field_returns_422(self, client, _mock_pool):
        """FastAPI auto-validates required Form fields."""
        resp = client.post("/oauth/revoke", data={})
        assert resp.status_code == 422
