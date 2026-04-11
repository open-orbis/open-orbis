"""Tests for the closed-beta invitation system (v2: always-register + activate flow).

Surfaces under test:
1. Registration (POST /auth/google) — always creates Person, no code check.
2. Activation (POST /auth/activate) — validates + consumes code, sets signup_code.
3. /auth/me — returns `activated` flag based on invite_code_required, is_admin, signup_code.
4. /admin/* — stats, beta config toggle, access codes CRUD, pending users.
"""

from unittest.mock import AsyncMock, patch

import pytest

from app.dependencies import get_current_user, get_db, require_admin
from app.main import app
from tests.unit.conftest import MockNode

GOOGLE_USERINFO = {
    "sub": "1234567890",
    "email": "newuser@example.com",
    "name": "New User",
    "picture": "https://example.com/avatar.png",
}


# ─────────────────────────────────────────────────────────────────────────
# Registration (always succeeds)
# ─────────────────────────────────────────────────────────────────────────


@pytest.fixture
def google_oauth_mock():
    with patch(
        "app.auth.router.exchange_google_code",
        AsyncMock(return_value=GOOGLE_USERINFO),
    ):
        yield


def _stub_existing_person(mock_db, exists: bool):
    record = MockNode({"user_id": "google-1234567890"}) if exists else None
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value={"p": record} if record else None)
    )


def test_registration_always_creates_person(client, mock_db, google_oauth_mock):
    """New users are always registered — no code check at signup time."""
    _stub_existing_person(mock_db, exists=False)

    with (
        patch("app.auth.router.generate_orb_id", AsyncMock(return_value="new-user")),
        patch(
            "app.auth.router.is_invite_code_required",
            AsyncMock(return_value=False),
        ),
    ):
        response = client.post("/auth/google", json={"code": "fake"})

    assert response.status_code == 200
    assert response.json()["user"]["user_id"] == "google-1234567890"


def test_existing_user_login_works(client, mock_db, google_oauth_mock):
    _stub_existing_person(mock_db, exists=True)

    response = client.post("/auth/google", json={"code": "fake"})
    assert response.status_code == 200
    assert response.json()["user"]["user_id"] == "google-1234567890"


# ─────────────────────────────────────────────────────────────────────────
# Activation (POST /auth/activate)
# ─────────────────────────────────────────────────────────────────────────


def test_activate_with_valid_unused_code(client, mock_db):
    with (
        patch(
            "app.auth.router.consume_access_code",
            AsyncMock(return_value=True),
        ) as consume_mock,
        patch(
            "app.auth.router.activate_person",
            AsyncMock(return_value=True),
        ) as activate_mock,
    ):
        response = client.post("/auth/activate", json={"code": "fresh-code"})

    assert response.status_code == 200
    assert response.json()["status"] == "activated"
    consume_mock.assert_awaited_once_with(mock_db, "fresh-code", "test-user")
    activate_mock.assert_awaited_once_with(mock_db, "test-user", "fresh-code")


def test_activate_rejects_invalid_or_used_code_with_unified_error(client, mock_db):
    """Regression test for the invite code timing side-channel.

    Both 'never existed' and 'already consumed' must return the same
    HTTP status and detail so an attacker cannot distinguish the two
    by the response body or by a second DB query lighting up.
    """
    with patch(
        "app.auth.router.consume_access_code",
        AsyncMock(return_value=False),
    ):
        invalid = client.post("/auth/activate", json={"code": "does-not-exist"})
        used = client.post("/auth/activate", json={"code": "already-used"})

    assert invalid.status_code == used.status_code == 403
    assert invalid.json() == used.json()
    assert invalid.json()["detail"] == "invalid_access_code"


def test_activate_rejects_empty_code(client, mock_db):
    with patch(
        "app.auth.router.consume_access_code",
        AsyncMock(return_value=False),
    ) as consume_mock:
        response = client.post("/auth/activate", json={"code": ""})

    assert response.status_code == 403
    assert response.json()["detail"] == "invalid_access_code"
    # Short-circuit: must not even hit the DB for an empty code.
    consume_mock.assert_not_awaited()


# ─────────────────────────────────────────────────────────────────────────
# GET /auth/me — activated flag
# ─────────────────────────────────────────────────────────────────────────


def test_me_activated_when_has_signup_code(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(
            return_value={
                "p": MockNode(
                    {"user_id": "test-user", "name": "Test", "signup_code": "abc"}
                )
            }
        )
    )

    with patch("app.auth.router.is_invite_code_required", AsyncMock(return_value=True)):
        response = client.get("/auth/me")

    assert response.status_code == 200
    assert response.json()["activated"] is True


def test_me_activated_when_admin(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(
            return_value={
                "p": MockNode(
                    {"user_id": "test-user", "name": "Test", "is_admin": True}
                )
            }
        )
    )

    with patch("app.auth.router.is_invite_code_required", AsyncMock(return_value=True)):
        response = client.get("/auth/me")

    assert response.status_code == 200
    assert response.json()["activated"] is True
    assert response.json()["is_admin"] is True


def test_me_activated_when_invite_not_required(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(
            return_value={"p": MockNode({"user_id": "test-user", "name": "Test"})}
        )
    )

    with patch(
        "app.auth.router.is_invite_code_required", AsyncMock(return_value=False)
    ):
        response = client.get("/auth/me")

    assert response.status_code == 200
    assert response.json()["activated"] is True


def test_me_not_activated_when_no_code_and_required(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(
            return_value={"p": MockNode({"user_id": "test-user", "name": "Test"})}
        )
    )

    with patch("app.auth.router.is_invite_code_required", AsyncMock(return_value=True)):
        response = client.get("/auth/me")

    assert response.status_code == 200
    assert response.json()["activated"] is False


# ─────────────────────────────────────────────────────────────────────────
# Admin endpoints
# ─────────────────────────────────────────────────────────────────────────


@pytest.fixture
def admin_client(mock_db, mock_neo4j_driver):
    from fastapi.testclient import TestClient

    app.dependency_overrides[get_db] = lambda: mock_db
    app.dependency_overrides[get_current_user] = lambda: {
        "user_id": "admin-user",
        "email": "admin@example.com",
    }
    app.dependency_overrides[require_admin] = lambda: {
        "user_id": "admin-user",
        "email": "admin@example.com",
    }
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_admin_endpoints_require_admin_flag(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value={"is_admin": False})
    )
    response = client.get("/admin/stats")
    assert response.status_code == 403


def test_admin_stats(admin_client):
    with (
        patch(
            "app.admin.router.get_beta_config",
            AsyncMock(return_value={"invite_code_required": True}),
        ),
        patch("app.admin.router.count_persons", AsyncMock(return_value=47)),
        patch("app.admin.router.count_pending_persons", AsyncMock(return_value=12)),
        patch(
            "app.admin.router.count_access_codes",
            AsyncMock(return_value={"total": 200, "used": 47, "available": 153}),
        ),
        patch("app.admin.router.count_pending_deletion", AsyncMock(return_value=3)),
        patch("app.admin.router.count_deleted_accounts", AsyncMock(return_value=5)),
    ):
        response = admin_client.get("/admin/stats")

    assert response.status_code == 200
    body = response.json()
    assert body["registered"] == 47
    assert body["pending_activation"] == 12
    assert body["invite_code_required"] is True
    assert body["invite_codes"]["available"] == 153
    assert body["pending_deletion"] == 3
    assert body["deleted_accounts"] == 5


def test_admin_toggle_invite_code(admin_client):
    with patch(
        "app.admin.router.update_beta_config",
        AsyncMock(
            return_value={
                "invite_code_required": False,
                "updated_at": "2026-04-10T12:00:00",
            }
        ),
    ) as mock:
        response = admin_client.patch(
            "/admin/beta-config", json={"invite_code_required": False}
        )

    assert response.status_code == 200
    assert response.json()["invite_code_required"] is False
    mock.assert_awaited_once()


def test_admin_patch_beta_config_rejects_empty(admin_client):
    response = admin_client.patch("/admin/beta-config", json={})
    assert response.status_code == 400


def test_admin_create_access_code(admin_client):
    with (
        patch("app.admin.router.get_access_code", AsyncMock(return_value=None)),
        patch(
            "app.admin.router.create_access_code",
            AsyncMock(
                return_value={
                    "code": "invite-abc123",
                    "label": "newsletter",
                    "active": True,
                    "used_at": None,
                    "used_by": None,
                    "created_at": "2026-04-10T12:00:00",
                    "created_by": "admin-user",
                }
            ),
        ),
    ):
        response = admin_client.post(
            "/admin/access-codes",
            json={"code": "invite-abc123", "label": "newsletter"},
        )

    assert response.status_code == 201
    assert response.json()["code"] == "invite-abc123"
    assert response.json()["used_at"] is None


def test_admin_create_batch(admin_client):
    with patch(
        "app.admin.router.create_batch_access_codes",
        AsyncMock(
            return_value=[
                {
                    "code": "launch-a1b2c3",
                    "label": "launch",
                    "active": True,
                    "used_at": None,
                    "used_by": None,
                    "created_at": "2026-04-10T12:00:00",
                    "created_by": "admin-user",
                }
            ]
        ),
    ):
        response = admin_client.post(
            "/admin/access-codes/batch",
            json={"prefix": "launch", "count": 1, "label": "launch"},
        )

    assert response.status_code == 201
    assert len(response.json()) == 1


def test_admin_pending_users(admin_client):
    with patch(
        "app.admin.router.list_pending_persons",
        AsyncMock(
            return_value=[
                {
                    "user_id": "google-999",
                    "name": "Pending User",
                    "email": "pending@example.com",
                    "provider": "google",
                    "created_at": "2026-04-10T12:00:00",
                }
            ]
        ),
    ):
        response = admin_client.get("/admin/pending-users")

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["name"] == "Pending User"


def test_cleanup_interval_hours_default():
    from app.config import Settings

    s = Settings(
        neo4j_uri="bolt://localhost:7687",
        neo4j_password="test",
        jwt_secret="test",
    )
    assert s.cleanup_interval_hours == 24


@pytest.mark.asyncio
async def test_cleanup_creates_deletion_records():
    """Verify _cleanup_expired_accounts creates DeletionRecord nodes."""
    from unittest.mock import MagicMock

    from app.main import _cleanup_expired_accounts

    mock_session = AsyncMock()
    # First call: find expired accounts — return one user
    expired_result = AsyncMock()
    expired_result.__aiter__ = lambda _self: _aiter_helper(
        [{"user_id": "expired-user-1"}]
    )
    # Subsequent calls: deletion queries + DeletionRecord creation
    other_result = AsyncMock()
    other_result.single = AsyncMock(return_value=None)

    call_count = 0
    queries_seen = []

    async def mock_run(query, **kwargs):
        nonlocal call_count
        queries_seen.append(query.strip())
        call_count += 1
        if call_count == 1:
            return expired_result
        return other_result

    mock_session.run = mock_run

    # Use MagicMock for driver so session() is a sync call returning
    # an async context manager (matching Neo4j driver behaviour).
    mock_driver = MagicMock()
    mock_session_context = MagicMock()
    mock_session_context.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_context.__aexit__ = AsyncMock(return_value=False)
    mock_driver.session.return_value = mock_session_context

    with (
        patch("app.main.delete_stored_cvs"),
        patch("app.main.delete_user_drafts"),
        patch("app.main.delete_user_snapshots"),
    ):
        await _cleanup_expired_accounts(mock_driver)

    # Check that a CREATE (d:DeletionRecord ...) query was issued
    assert any("DeletionRecord" in q for q in queries_seen), (
        f"Expected DeletionRecord creation query. Queries: {queries_seen}"
    )


async def _aiter_helper(items):
    for item in items:
        yield item
