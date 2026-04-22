"""Tests for POST /oauth/token."""

from __future__ import annotations

import base64
import hashlib
import uuid
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

    monkeypatch.setattr("app.oauth.token_router.get_pool", _gp)
    return fake_pool


def _make_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def _noop(*_a, **_kw):
    pass


async def _anoop(*_a, **_kw):
    pass


class TestAuthorizationCodeGrant:
    def test_happy_path(self, client, _mock_pool, monkeypatch):
        cid = uuid.uuid4()
        verifier = "a" * 43
        challenge = _make_challenge(verifier)

        async def _consume(_pool, _code):
            return {
                "client_id": cid,
                "user_id": "u1",
                "share_token_id": None,
                "scope": "orbis.read",
                "redirect_uri": "https://e.com/cb",
                "code_challenge": challenge,
                "code_challenge_method": "S256",
            }

        monkeypatch.setattr(
            "app.oauth.token_router.oauth_db.consume_authorization_code", _consume
        )
        monkeypatch.setattr(
            "app.oauth.token_router.oauth_db.issue_access_token", _anoop
        )
        monkeypatch.setattr(
            "app.oauth.token_router.oauth_db.issue_refresh_token", _anoop
        )

        resp = client.post(
            "/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": "ac_abc",
                "redirect_uri": "https://e.com/cb",
                "client_id": str(cid),
                "code_verifier": verifier,
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["token_type"] == "Bearer"
        assert body["access_token"].startswith("oauth_")
        assert body["refresh_token"].startswith("refresh_")
        assert body["expires_in"] == 3600
        assert body["scope"] == "orbis.read"

    def test_invalid_expired_code_returns_400(self, client, _mock_pool, monkeypatch):
        cid = uuid.uuid4()

        async def _consume(_pool, _code):
            return None

        monkeypatch.setattr(
            "app.oauth.token_router.oauth_db.consume_authorization_code", _consume
        )

        resp = client.post(
            "/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": "ac_expired",
                "redirect_uri": "https://e.com/cb",
                "client_id": str(cid),
                "code_verifier": "a" * 43,
            },
        )
        assert resp.status_code == 400
        assert "invalid or expired" in resp.json()["detail"]

    def test_code_double_exchange_rejected(self, client, _mock_pool, monkeypatch):
        """Second exchange of the same code returns None from consume → 400."""
        cid = uuid.uuid4()
        call_count = 0

        async def _consume(_pool, _code):
            nonlocal call_count
            call_count += 1
            return None  # already consumed

        monkeypatch.setattr(
            "app.oauth.token_router.oauth_db.consume_authorization_code", _consume
        )

        resp = client.post(
            "/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": "ac_used",
                "redirect_uri": "https://e.com/cb",
                "client_id": str(cid),
                "code_verifier": "a" * 43,
            },
        )
        assert resp.status_code == 400
        assert call_count == 1

    def test_code_issued_to_different_client_returns_400(
        self, client, _mock_pool, monkeypatch
    ):
        cid = uuid.uuid4()
        other_cid = uuid.uuid4()
        verifier = "b" * 43
        challenge = _make_challenge(verifier)

        async def _consume(_pool, _code):
            return {
                "client_id": other_cid,  # different from cid sent in request
                "user_id": "u1",
                "share_token_id": None,
                "scope": "orbis.read",
                "redirect_uri": "https://e.com/cb",
                "code_challenge": challenge,
                "code_challenge_method": "S256",
            }

        monkeypatch.setattr(
            "app.oauth.token_router.oauth_db.consume_authorization_code", _consume
        )

        resp = client.post(
            "/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": "ac_abc",
                "redirect_uri": "https://e.com/cb",
                "client_id": str(cid),
                "code_verifier": verifier,
            },
        )
        assert resp.status_code == 400
        assert resp.json()["detail"] == "invalid or expired code"

    def test_redirect_uri_mismatch_returns_400(self, client, _mock_pool, monkeypatch):
        cid = uuid.uuid4()
        verifier = "c" * 43
        challenge = _make_challenge(verifier)

        async def _consume(_pool, _code):
            return {
                "client_id": cid,
                "user_id": "u1",
                "share_token_id": None,
                "scope": "orbis.read",
                "redirect_uri": "https://original.com/cb",  # stored uri
                "code_challenge": challenge,
                "code_challenge_method": "S256",
            }

        monkeypatch.setattr(
            "app.oauth.token_router.oauth_db.consume_authorization_code", _consume
        )

        resp = client.post(
            "/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": "ac_abc",
                "redirect_uri": "https://attacker.com/cb",  # different uri
                "client_id": str(cid),
                "code_verifier": verifier,
            },
        )
        assert resp.status_code == 400
        assert resp.json()["detail"] == "invalid or expired code"

    def test_wrong_pkce_verifier_returns_400(self, client, _mock_pool, monkeypatch):
        cid = uuid.uuid4()
        real_verifier = "d" * 43
        challenge = _make_challenge(real_verifier)
        wrong_verifier = "e" * 43  # produces a different challenge

        async def _consume(_pool, _code):
            return {
                "client_id": cid,
                "user_id": "u1",
                "share_token_id": None,
                "scope": "orbis.read",
                "redirect_uri": "https://e.com/cb",
                "code_challenge": challenge,
                "code_challenge_method": "S256",
            }

        monkeypatch.setattr(
            "app.oauth.token_router.oauth_db.consume_authorization_code", _consume
        )

        resp = client.post(
            "/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": "ac_abc",
                "redirect_uri": "https://e.com/cb",
                "client_id": str(cid),
                "code_verifier": wrong_verifier,
            },
        )
        assert resp.status_code == 400
        assert resp.json()["detail"] == "invalid or expired code"

    def test_missing_code_returns_400(self, client, _mock_pool):
        resp = client.post(
            "/oauth/token",
            data={
                "grant_type": "authorization_code",
                # code omitted
                "redirect_uri": "https://e.com/cb",
                "client_id": str(uuid.uuid4()),
                "code_verifier": "a" * 43,
            },
        )
        assert resp.status_code == 400

    def test_missing_code_verifier_returns_400(self, client, _mock_pool):
        resp = client.post(
            "/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": "ac_abc",
                "redirect_uri": "https://e.com/cb",
                "client_id": str(uuid.uuid4()),
                # code_verifier omitted
            },
        )
        assert resp.status_code == 400

    def test_missing_redirect_uri_returns_400(self, client, _mock_pool):
        resp = client.post(
            "/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": "ac_abc",
                # redirect_uri omitted
                "client_id": str(uuid.uuid4()),
                "code_verifier": "a" * 43,
            },
        )
        assert resp.status_code == 400


class TestRefreshTokenGrant:
    def test_happy_path(self, client, _mock_pool, monkeypatch):
        cid = uuid.uuid4()

        async def _get_refresh(_pool, _hash):
            return {
                "token_hash": "oldhash",
                "client_id": cid,
                "user_id": "u1",
                "share_token_id": None,
                "revoked_at": None,
                "rotated_to": None,
            }

        captured_old_hash = []

        async def _rotate(_pool, *, old_hash, new_hash):
            captured_old_hash.append(old_hash)
            return {
                "client_id": cid,
                "user_id": "u1",
                "share_token_id": None,
            }

        monkeypatch.setattr(
            "app.oauth.token_router.oauth_db.get_refresh_token", _get_refresh
        )
        monkeypatch.setattr(
            "app.oauth.token_router.oauth_db.rotate_refresh_token", _rotate
        )
        monkeypatch.setattr(
            "app.oauth.token_router.oauth_db.issue_access_token", _anoop
        )
        monkeypatch.setattr(
            "app.oauth.token_router.oauth_db.issue_refresh_token", _anoop
        )

        old_token = "refresh_sometoken"
        resp = client.post(
            "/oauth/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": old_token,
                "client_id": str(cid),
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["token_type"] == "Bearer"
        assert body["access_token"].startswith("oauth_")
        assert body["refresh_token"].startswith("refresh_")
        assert body["scope"] == "orbis.read"
        # Verify the old hash (sha256 of the raw token) was passed to rotate
        import hashlib

        expected_old_hash = hashlib.sha256(old_token.encode()).hexdigest()
        assert captured_old_hash[0] == expected_old_hash

    def test_unknown_refresh_token_returns_400(self, client, _mock_pool, monkeypatch):
        async def _get_refresh(_pool, _hash):
            return None

        monkeypatch.setattr(
            "app.oauth.token_router.oauth_db.get_refresh_token", _get_refresh
        )

        resp = client.post(
            "/oauth/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": "refresh_unknown",
                "client_id": str(uuid.uuid4()),
            },
        )
        assert resp.status_code == 400
        assert "invalid refresh_token" in resp.json()["detail"]

    def test_revoked_refresh_triggers_chain_revocation(
        self, client, _mock_pool, monkeypatch
    ):
        cid = uuid.uuid4()

        async def _get_refresh(_pool, _hash):
            return {
                "token_hash": "revokedhash",
                "client_id": cid,
                "user_id": "u1",
                "share_token_id": None,
                "revoked_at": "2024-01-01T00:00:00",
                "rotated_to": None,
            }

        revoke_chain_called = []

        async def _revoke_chain(_pool, leaked_hash):
            revoke_chain_called.append(leaked_hash)

        monkeypatch.setattr(
            "app.oauth.token_router.oauth_db.get_refresh_token", _get_refresh
        )
        monkeypatch.setattr(
            "app.oauth.token_router.oauth_db.revoke_refresh_chain", _revoke_chain
        )

        resp = client.post(
            "/oauth/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": "refresh_revoked",
                "client_id": str(cid),
            },
        )
        assert resp.status_code == 400
        assert "reused" in resp.json()["detail"]
        assert len(revoke_chain_called) == 1

    def test_already_rotated_refresh_triggers_chain_revocation(
        self, client, _mock_pool, monkeypatch
    ):
        """Token with rotated_to set is a reuse — chain must be revoked."""
        cid = uuid.uuid4()

        async def _get_refresh(_pool, _hash):
            return {
                "token_hash": "rotatedhash",
                "client_id": cid,
                "user_id": "u1",
                "share_token_id": None,
                "revoked_at": None,
                "rotated_to": "newhash",  # already rotated
            }

        revoke_chain_called = []

        async def _revoke_chain(_pool, leaked_hash):
            revoke_chain_called.append(leaked_hash)

        monkeypatch.setattr(
            "app.oauth.token_router.oauth_db.get_refresh_token", _get_refresh
        )
        monkeypatch.setattr(
            "app.oauth.token_router.oauth_db.revoke_refresh_chain", _revoke_chain
        )

        resp = client.post(
            "/oauth/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": "refresh_rotated",
                "client_id": str(cid),
            },
        )
        assert resp.status_code == 400
        assert "reused" in resp.json()["detail"]
        assert len(revoke_chain_called) == 1

    def test_rotate_race_returns_400(self, client, _mock_pool, monkeypatch):
        """rotate_refresh_token returns None (race: revoked between get + rotate)."""
        cid = uuid.uuid4()

        async def _get_refresh(_pool, _hash):
            return {
                "token_hash": "racehash",
                "client_id": cid,
                "user_id": "u1",
                "share_token_id": None,
                "revoked_at": None,
                "rotated_to": None,
            }

        async def _rotate(_pool, *, old_hash, new_hash):
            return None  # race condition — already consumed

        monkeypatch.setattr(
            "app.oauth.token_router.oauth_db.get_refresh_token", _get_refresh
        )
        monkeypatch.setattr(
            "app.oauth.token_router.oauth_db.rotate_refresh_token", _rotate
        )

        resp = client.post(
            "/oauth/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": "refresh_race",
                "client_id": str(cid),
            },
        )
        assert resp.status_code == 400
        assert "could not be rotated" in resp.json()["detail"]

    def test_missing_refresh_token_param_returns_400(self, client, _mock_pool):
        resp = client.post(
            "/oauth/token",
            data={
                "grant_type": "refresh_token",
                # refresh_token omitted
                "client_id": str(uuid.uuid4()),
            },
        )
        assert resp.status_code == 400
        assert "missing refresh_token" in resp.json()["detail"]

    def test_refresh_token_bound_to_wrong_client_rejected(
        self, client, _mock_pool, monkeypatch
    ):
        """RFC 6749 §6: refresh tokens are bound to their issuing client."""
        token_cid = uuid.uuid4()
        other_cid = uuid.uuid4()

        async def _get(pool, h):
            return {
                "client_id": token_cid,
                "user_id": "u1",
                "share_token_id": None,
                "revoked_at": None,
                "rotated_to": None,
            }

        revoke_called = []

        async def _revoke_chain(pool, h):
            revoke_called.append(h)

        monkeypatch.setattr("app.oauth.token_router.oauth_db.get_refresh_token", _get)
        monkeypatch.setattr(
            "app.oauth.token_router.oauth_db.revoke_refresh_chain", _revoke_chain
        )

        resp = client.post(
            "/oauth/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": "refresh_abc",
                "client_id": str(other_cid),
            },
        )
        assert resp.status_code == 400
        # Message must be indistinguishable from "unknown refresh_token"
        assert resp.json()["detail"] == "invalid refresh_token"
        # Critically: must NOT trigger chain revocation (that would let an
        # attacker deny-of-service a legitimate token by probing it from a
        # different client).
        assert revoke_called == []


class TestCrossCutting:
    def test_unsupported_grant_type_returns_400(self, client, _mock_pool):
        resp = client.post(
            "/oauth/token",
            data={
                "grant_type": "implicit",
                "client_id": str(uuid.uuid4()),
            },
        )
        assert resp.status_code == 400
        assert "unsupported grant_type" in resp.json()["detail"]

    def test_kill_switch_returns_503(self, client, monkeypatch):
        monkeypatch.setattr("app.oauth.token_router.settings.oauth_enabled", False)
        resp = client.post(
            "/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": "ac_abc",
                "redirect_uri": "https://e.com/cb",
                "client_id": str(uuid.uuid4()),
                "code_verifier": "a" * 43,
            },
        )
        assert resp.status_code == 503

    def test_invalid_client_id_uuid_returns_400(self, client, _mock_pool):
        resp = client.post(
            "/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": "ac_abc",
                "redirect_uri": "https://e.com/cb",
                "client_id": "not-a-uuid",
                "code_verifier": "a" * 43,
            },
        )
        assert resp.status_code == 400
        assert "invalid client_id" in resp.json()["detail"]
