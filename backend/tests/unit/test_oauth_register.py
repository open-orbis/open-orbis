"""Tests for POST /oauth/register (RFC 7591 Dynamic Client Registration)."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_db
from app.main import app


@pytest.fixture
def client():
    """Sync TestClient with minimal deps overridden. OAuth register doesn't
    require auth, but FastAPI's dependency overrides for get_db/etc. still
    need neutralization if other middleware complains."""
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    with TestClient(app) as tc:
        yield tc
    app.dependency_overrides.clear()


@pytest.fixture
def _mock_pool(monkeypatch):
    """Patch app.db.postgres.get_pool to return a mocked pool."""
    fake_pool = AsyncMock()

    async def _gp():
        return fake_pool

    monkeypatch.setattr("app.oauth.register_router.get_pool", _gp)
    return fake_pool


@pytest.fixture
def _mock_register_client(monkeypatch):
    """Patch app.oauth.db.register_client to return a deterministic UUID."""
    fake_cid = uuid.uuid4()

    async def _rc(*args, **kwargs):
        return fake_cid

    monkeypatch.setattr("app.oauth.register_router.oauth_db.register_client", _rc)
    return fake_cid


class TestRegisterClient:
    def test_happy_path_public_client(self, client, _mock_pool, _mock_register_client):
        resp = client.post(
            "/oauth/register",
            json={
                "client_name": "ChatGPT",
                "redirect_uris": ["https://chat.openai.com/oauth/callback"],
                "token_endpoint_auth_method": "none",
                "grant_types": ["authorization_code", "refresh_token"],
                "response_types": ["code"],
            },
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["client_id"] == str(_mock_register_client)
        assert body["client_name"] == "ChatGPT"
        assert "client_secret" not in body

    def test_happy_path_confidential_client_returns_secret(
        self, client, _mock_pool, _mock_register_client
    ):
        resp = client.post(
            "/oauth/register",
            json={
                "client_name": "ServerApp",
                "redirect_uris": ["https://srv.example.com/cb"],
                "token_endpoint_auth_method": "client_secret_post",
            },
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["client_secret"].startswith("cs_")
        assert body["token_endpoint_auth_method"] == "client_secret_post"

    def test_rejects_non_https_redirect(self, client, _mock_pool):
        resp = client.post(
            "/oauth/register",
            json={
                "client_name": "evil",
                "redirect_uris": ["http://malicious.example.com/cb"],
                "token_endpoint_auth_method": "none",
            },
        )
        assert resp.status_code == 400
        assert "redirect_uri" in resp.json()["detail"].lower()

    def test_accepts_localhost_http_redirect(
        self, client, _mock_pool, _mock_register_client
    ):
        resp = client.post(
            "/oauth/register",
            json={
                "client_name": "local-dev",
                "redirect_uris": ["http://localhost:5173/cb"],
                "token_endpoint_auth_method": "none",
            },
        )
        assert resp.status_code == 201

    def test_accepts_127_0_0_1_http_redirect(
        self, client, _mock_pool, _mock_register_client
    ):
        resp = client.post(
            "/oauth/register",
            json={
                "client_name": "local-dev",
                "redirect_uris": ["http://127.0.0.1:5173/cb"],
                "token_endpoint_auth_method": "none",
            },
        )
        assert resp.status_code == 201

    def test_rejects_missing_redirect_uris(self, client, _mock_pool):
        resp = client.post(
            "/oauth/register",
            json={
                "client_name": "no-redirect",
                "redirect_uris": [],
                "token_endpoint_auth_method": "none",
            },
        )
        assert resp.status_code == 400

    def test_rejects_unsupported_auth_method(self, client, _mock_pool):
        resp = client.post(
            "/oauth/register",
            json={
                "client_name": "x",
                "redirect_uris": ["https://e.com/cb"],
                "token_endpoint_auth_method": "private_key_jwt",
            },
        )
        assert resp.status_code == 400
        assert "auth_method" in resp.json()["detail"].lower()

    def test_kill_switch_returns_503(self, client, monkeypatch):
        monkeypatch.setattr("app.oauth.register_router.settings.oauth_enabled", False)
        resp = client.post(
            "/oauth/register",
            json={
                "client_name": "x",
                "redirect_uris": ["https://e.com/cb"],
                "token_endpoint_auth_method": "none",
            },
        )
        assert resp.status_code == 503
