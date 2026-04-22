"""Tests for OAuth discovery endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


class TestOauthAuthorizationServerMetadata:
    def test_returns_valid_rfc8414_metadata(self):
        with TestClient(app) as client:
            resp = client.get("/.well-known/oauth-authorization-server")
        assert resp.status_code == 200
        body = resp.json()
        assert "issuer" in body
        assert body["authorization_endpoint"].endswith("/oauth/authorize")
        assert body["token_endpoint"].endswith("/oauth/token")
        assert body["registration_endpoint"].endswith("/oauth/register")
        assert body["revocation_endpoint"].endswith("/oauth/revoke")
        assert body["scopes_supported"] == ["orbis.read"]
        assert body["response_types_supported"] == ["code"]
        assert "authorization_code" in body["grant_types_supported"]
        assert "refresh_token" in body["grant_types_supported"]
        assert body["code_challenge_methods_supported"] == ["S256"]

    def test_endpoints_share_same_issuer_base(self):
        with TestClient(app) as client:
            resp = client.get("/.well-known/oauth-authorization-server")
        body = resp.json()
        issuer = body["issuer"]
        for key in (
            "authorization_endpoint",
            "token_endpoint",
            "registration_endpoint",
            "revocation_endpoint",
        ):
            assert body[key].startswith(issuer), f"{key} does not share issuer base"

    def test_accessible_at_both_mount_points(self):
        """Dual mount: both / and /api/ work."""
        with TestClient(app) as client:
            r1 = client.get("/.well-known/oauth-authorization-server")
            r2 = client.get("/api/.well-known/oauth-authorization-server")
        assert r1.status_code == 200
        assert r2.status_code == 200
