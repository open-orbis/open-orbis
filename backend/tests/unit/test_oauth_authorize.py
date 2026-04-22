"""Tests for /oauth/authorize GET + POST."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_current_user_optional, get_db
from app.main import app


@pytest.fixture
def user_client():
    """Sync TestClient with authenticated user overridden."""
    fake_user = {"user_id": "user-me", "email": "me@example.com"}
    app.dependency_overrides[get_current_user_optional] = lambda: fake_user
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    with TestClient(app) as tc:
        yield tc
    app.dependency_overrides.clear()


@pytest.fixture
def anon_client():
    app.dependency_overrides[get_current_user_optional] = lambda: None
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    with TestClient(app) as tc:
        yield tc
    app.dependency_overrides.clear()


@pytest.fixture
def _mock_pool(monkeypatch):
    fake_pool = AsyncMock()

    async def _gp():
        return fake_pool

    monkeypatch.setattr("app.oauth.authorize_router.get_pool", _gp)
    return fake_pool


@pytest.fixture
def _registered_client_row():
    return {
        "client_id": uuid.uuid4(),
        "client_name": "ChatGPT",
        "redirect_uris": ["https://chat.openai.com/oauth/callback"],
        "registered_at": datetime(2026, 4, 20, tzinfo=timezone.utc),
        "registered_from_ip": "1.2.3.4",
    }


@pytest.fixture
def _mock_active_client(monkeypatch, _registered_client_row):
    async def _gac(pool, cid):
        if cid == _registered_client_row["client_id"]:
            return _registered_client_row
        return None

    monkeypatch.setattr("app.oauth.authorize_router.oauth_db.get_active_client", _gac)
    return _registered_client_row


# ── GET /oauth/authorize ────────────────────────────────────────


class TestAuthorizeGet:
    def test_authenticated_returns_client_context(
        self, user_client, _mock_pool, _mock_active_client
    ):
        cid = _mock_active_client["client_id"]
        resp = user_client.get(
            "/oauth/authorize",
            params={
                "response_type": "code",
                "client_id": str(cid),
                "redirect_uri": "https://chat.openai.com/oauth/callback",
                "state": "abc",
                "code_challenge": "C" * 43,
                "code_challenge_method": "S256",
                "scope": "orbis.read",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["login_required"] is False
        assert body["client_id"] == str(cid)
        assert body["client_name"] == "ChatGPT"
        assert body["registered_from_ip"] == "1.2.3.4"

    def test_unauthenticated_returns_login_required(
        self, anon_client, _mock_pool, _mock_active_client
    ):
        cid = _mock_active_client["client_id"]
        resp = anon_client.get(
            "/oauth/authorize",
            params={
                "response_type": "code",
                "client_id": str(cid),
                "redirect_uri": "https://chat.openai.com/oauth/callback",
                "state": "abc",
                "code_challenge": "C" * 43,
                "code_challenge_method": "S256",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["login_required"] is True
        assert "/oauth/authorize?" in body["next"]

    def test_rejects_mismatched_redirect_uri(
        self, user_client, _mock_pool, _mock_active_client
    ):
        cid = _mock_active_client["client_id"]
        resp = user_client.get(
            "/oauth/authorize",
            params={
                "response_type": "code",
                "client_id": str(cid),
                "redirect_uri": "https://attacker.example.com/cb",
                "state": "abc",
                "code_challenge": "C" * 43,
                "code_challenge_method": "S256",
            },
        )
        assert resp.status_code == 400

    def test_rejects_non_s256_method(
        self, user_client, _mock_pool, _mock_active_client
    ):
        cid = _mock_active_client["client_id"]
        resp = user_client.get(
            "/oauth/authorize",
            params={
                "response_type": "code",
                "client_id": str(cid),
                "redirect_uri": "https://chat.openai.com/oauth/callback",
                "state": "abc",
                "code_challenge": "C" * 43,
                "code_challenge_method": "plain",
            },
        )
        assert resp.status_code == 400

    def test_disabled_or_unknown_client_returns_403(
        self, user_client, _mock_pool, monkeypatch
    ):
        async def _gac(pool, cid):
            return None

        monkeypatch.setattr(
            "app.oauth.authorize_router.oauth_db.get_active_client", _gac
        )
        resp = user_client.get(
            "/oauth/authorize",
            params={
                "response_type": "code",
                "client_id": str(uuid.uuid4()),
                "redirect_uri": "https://e.com/cb",
                "state": "abc",
                "code_challenge": "C" * 43,
                "code_challenge_method": "S256",
            },
        )
        assert resp.status_code == 403

    def test_kill_switch_returns_503(self, user_client, monkeypatch):
        monkeypatch.setattr("app.oauth.authorize_router.settings.oauth_enabled", False)
        resp = user_client.get(
            "/oauth/authorize",
            params={
                "response_type": "code",
                "client_id": str(uuid.uuid4()),
                "redirect_uri": "https://e.com/cb",
                "state": "abc",
                "code_challenge": "C" * 43,
                "code_challenge_method": "S256",
            },
        )
        assert resp.status_code == 503


# ── POST /oauth/authorize ───────────────────────────────────────


class TestAuthorizePost:
    def test_full_mode_issues_code(
        self, user_client, _mock_pool, _mock_active_client, monkeypatch
    ):
        issued = {}

        async def _issue(pool, **kwargs):
            issued.update(kwargs)

        monkeypatch.setattr(
            "app.oauth.authorize_router.oauth_db.issue_authorization_code", _issue
        )
        cid = _mock_active_client["client_id"]
        resp = user_client.post(
            "/oauth/authorize",
            json={
                "client_id": str(cid),
                "redirect_uri": "https://chat.openai.com/oauth/callback",
                "state": "abc",
                "code_challenge": "C" * 43,
                "code_challenge_method": "S256",
                "access_mode": "full",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"].startswith("ac_")
        assert body["state"] == "abc"
        assert issued["share_token_id"] is None

    def test_restricted_mode_binds_share_token(
        self, user_client, _mock_pool, _mock_active_client, monkeypatch
    ):
        async def _share_row(db, tid):
            return {"user_id": "user-me", "keywords": [], "hidden_node_types": []}

        monkeypatch.setattr(
            "app.oauth.authorize_router.get_share_token_row", _share_row
        )
        issued = {}

        async def _issue(pool, **kwargs):
            issued.update(kwargs)

        monkeypatch.setattr(
            "app.oauth.authorize_router.oauth_db.issue_authorization_code", _issue
        )

        cid = _mock_active_client["client_id"]
        resp = user_client.post(
            "/oauth/authorize",
            json={
                "client_id": str(cid),
                "redirect_uri": "https://chat.openai.com/oauth/callback",
                "state": "abc",
                "code_challenge": "C" * 43,
                "code_challenge_method": "S256",
                "access_mode": "restricted",
                "share_token_id": "tok-mine",
            },
        )
        assert resp.status_code == 200
        assert issued["share_token_id"] == "tok-mine"

    def test_unauthenticated_post_is_rejected(
        self, anon_client, _mock_pool, _mock_active_client
    ):
        cid = _mock_active_client["client_id"]
        resp = anon_client.post(
            "/oauth/authorize",
            json={
                "client_id": str(cid),
                "redirect_uri": "https://chat.openai.com/oauth/callback",
                "state": "abc",
                "code_challenge": "C" * 43,
                "code_challenge_method": "S256",
                "access_mode": "full",
            },
        )
        assert resp.status_code == 401

    def test_restricted_without_share_token_id_rejected(
        self, user_client, _mock_pool, _mock_active_client
    ):
        cid = _mock_active_client["client_id"]
        resp = user_client.post(
            "/oauth/authorize",
            json={
                "client_id": str(cid),
                "redirect_uri": "https://chat.openai.com/oauth/callback",
                "state": "abc",
                "code_challenge": "C" * 43,
                "code_challenge_method": "S256",
                "access_mode": "restricted",
            },
        )
        assert resp.status_code == 400

    def test_share_token_not_owned_by_user_rejected(
        self, user_client, _mock_pool, _mock_active_client, monkeypatch
    ):
        async def _share_row(db, tid):
            return {
                "user_id": "user-someone-else",
                "keywords": [],
                "hidden_node_types": [],
            }

        monkeypatch.setattr(
            "app.oauth.authorize_router.get_share_token_row", _share_row
        )
        cid = _mock_active_client["client_id"]
        resp = user_client.post(
            "/oauth/authorize",
            json={
                "client_id": str(cid),
                "redirect_uri": "https://chat.openai.com/oauth/callback",
                "state": "abc",
                "code_challenge": "C" * 43,
                "code_challenge_method": "S256",
                "access_mode": "restricted",
                "share_token_id": "tok-theirs",
            },
        )
        assert resp.status_code == 403

    def test_share_token_not_found_rejected(
        self, user_client, _mock_pool, _mock_active_client, monkeypatch
    ):
        async def _share_row(db, tid):
            return None

        monkeypatch.setattr(
            "app.oauth.authorize_router.get_share_token_row", _share_row
        )
        cid = _mock_active_client["client_id"]
        resp = user_client.post(
            "/oauth/authorize",
            json={
                "client_id": str(cid),
                "redirect_uri": "https://chat.openai.com/oauth/callback",
                "state": "abc",
                "code_challenge": "C" * 43,
                "code_challenge_method": "S256",
                "access_mode": "restricted",
                "share_token_id": "tok-missing",
            },
        )
        assert resp.status_code == 403

    def test_post_kill_switch_returns_503(self, user_client, monkeypatch):
        monkeypatch.setattr("app.oauth.authorize_router.settings.oauth_enabled", False)
        resp = user_client.post(
            "/oauth/authorize",
            json={
                "client_id": str(uuid.uuid4()),
                "redirect_uri": "https://e.com/cb",
                "state": "abc",
                "code_challenge": "C" * 43,
                "code_challenge_method": "S256",
                "access_mode": "full",
            },
        )
        assert resp.status_code == 503
