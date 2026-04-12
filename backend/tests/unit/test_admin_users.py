"""Tests for admin user management endpoints.

Surfaces under test:
- GET /admin/users — list all users
- GET /admin/users/{user_id} — user detail
- POST /admin/users/{user_id}/activate — activate pending user
- POST /admin/users/activate-batch — batch activate
- POST /admin/users/{user_id}/promote — grant admin
- POST /admin/users/{user_id}/demote — revoke admin
- DELETE /admin/users/{user_id} — delete user
"""

from unittest.mock import AsyncMock, patch

import pytest

from app.dependencies import get_current_user, get_db, require_admin
from app.main import app

SAMPLE_USER = {
    "user_id": "google-111",
    "name": "Alice",
    "email": "alice@example.com",
    "provider": "google",
    "is_admin": False,
    "signup_code": "invite-abc",
    "activated_at": "2026-04-01T10:00:00",
    "created_at": "2026-03-15T08:00:00",
    "orb_id": "alice",
    "picture": "",
    "headline": "Researcher",
    "location": "Rome",
    "node_count": 12,
    "gdpr_consent": True,
    "deletion_requested_at": None,
}

PENDING_USER = {
    "user_id": "google-222",
    "name": "Bob",
    "email": "bob@example.com",
    "provider": "google",
    "is_admin": False,
    "signup_code": None,
    "activated_at": None,
    "created_at": "2026-04-05T09:00:00",
}


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


# ── GET /admin/users ──


def test_list_users(admin_client):
    with patch(
        "app.admin.router.list_all_users",
        AsyncMock(return_value=([SAMPLE_USER, PENDING_USER], 2)),
    ):
        response = admin_client.get("/admin/users")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert body["offset"] == 0
    assert body["limit"] == 50
    assert len(body["items"]) == 2
    assert body["items"][0]["user_id"] == "google-111"
    assert body["items"][1]["signup_code"] is None


def test_list_users_pagination_params(admin_client):
    with patch(
        "app.admin.router.list_all_users",
        AsyncMock(return_value=([SAMPLE_USER], 42)),
    ) as mock:
        response = admin_client.get("/admin/users?offset=20&limit=10")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 42
    assert body["offset"] == 20
    assert body["limit"] == 10
    # Service layer is called with keyword args matching the query params.
    mock.assert_awaited_once()
    _, kwargs = mock.call_args
    assert kwargs == {"offset": 20, "limit": 10}


def test_list_users_caps_limit_at_200(admin_client):
    with patch(
        "app.admin.router.list_all_users",
        AsyncMock(return_value=([], 0)),
    ):
        # 999 exceeds the Query(le=200) bound, FastAPI rejects with 422
        response = admin_client.get("/admin/users?limit=999")
    assert response.status_code == 422


# ── GET /admin/users/{user_id} ──


def test_get_user_detail(admin_client):
    with patch(
        "app.admin.router.get_user_detail",
        AsyncMock(return_value=SAMPLE_USER),
    ):
        response = admin_client.get("/admin/users/google-111")

    assert response.status_code == 200
    body = response.json()
    assert body["user_id"] == "google-111"
    assert body["node_count"] == 12
    assert body["headline"] == "Researcher"


def test_get_user_detail_not_found(admin_client):
    with patch(
        "app.admin.router.get_user_detail",
        AsyncMock(return_value=None),
    ):
        response = admin_client.get("/admin/users/nonexistent")

    assert response.status_code == 404


# ── POST /admin/users/{user_id}/activate ──


def test_activate_user(admin_client):
    activated = {
        **PENDING_USER,
        "signup_code": "admin-abc12345",
        "activated_at": "2026-04-10T12:00:00",
    }
    with (
        patch("app.admin.router.create_access_code", AsyncMock(return_value={})),
        patch(
            "app.admin.router.activate_user_by_admin",
            AsyncMock(return_value=activated),
        ),
        patch("app.admin.router.consume_access_code", AsyncMock(return_value=True)),
    ):
        response = admin_client.post("/admin/users/google-222/activate")

    assert response.status_code == 200
    assert response.json()["signup_code"] is not None


def test_activate_already_activated_user(admin_client):
    with (
        patch("app.admin.router.create_access_code", AsyncMock(return_value={})),
        patch(
            "app.admin.router.activate_user_by_admin",
            AsyncMock(return_value=None),
        ),
    ):
        response = admin_client.post("/admin/users/google-111/activate")

    assert response.status_code == 400


# ── POST /admin/users/activate-batch ──


def test_activate_batch(admin_client):
    activated = {
        **PENDING_USER,
        "signup_code": "admin-xyz",
        "activated_at": "2026-04-10T12:00:00",
    }
    with (
        patch("app.admin.router.create_access_code", AsyncMock(return_value={})),
        patch(
            "app.admin.router.activate_user_by_admin",
            AsyncMock(return_value=activated),
        ),
        patch("app.admin.router.consume_access_code", AsyncMock(return_value=True)),
    ):
        response = admin_client.post(
            "/admin/users/activate-batch",
            json={"user_ids": ["google-222"]},
        )

    assert response.status_code == 200
    assert len(response.json()) == 1


def test_activate_batch_empty_list(admin_client):
    response = admin_client.post(
        "/admin/users/activate-batch",
        json={"user_ids": []},
    )
    assert response.status_code == 422


# ── POST /admin/users/{user_id}/promote ──


def test_promote_user(admin_client):
    promoted = {**SAMPLE_USER, "is_admin": True}
    with patch(
        "app.admin.router.grant_admin",
        AsyncMock(return_value=promoted),
    ):
        response = admin_client.post("/admin/users/google-111/promote")

    assert response.status_code == 200
    assert response.json()["is_admin"] is True


def test_promote_self_rejected(admin_client):
    response = admin_client.post("/admin/users/admin-user/promote")
    assert response.status_code == 400


def test_promote_nonexistent_user(admin_client):
    with patch("app.admin.router.grant_admin", AsyncMock(return_value=None)):
        response = admin_client.post("/admin/users/nonexistent/promote")
    assert response.status_code == 404


# ── POST /admin/users/{user_id}/demote ──


def test_demote_user(admin_client):
    demoted = {**SAMPLE_USER, "is_admin": False}
    with patch(
        "app.admin.router.revoke_admin",
        AsyncMock(return_value=demoted),
    ):
        response = admin_client.post("/admin/users/google-111/demote")

    assert response.status_code == 200
    assert response.json()["is_admin"] is False


def test_demote_self_rejected(admin_client):
    response = admin_client.post("/admin/users/admin-user/demote")
    assert response.status_code == 400


# ── DELETE /admin/users/{user_id} ──


def test_delete_user(admin_client):
    with (
        patch("app.admin.router.delete_user", AsyncMock(return_value=True)),
        patch("app.admin.router._cleanup_secondary_storage"),
    ):
        response = admin_client.delete("/admin/users/google-111")

    assert response.status_code == 204


def test_delete_self_rejected(admin_client):
    response = admin_client.delete("/admin/users/admin-user")
    assert response.status_code == 400


def test_delete_nonexistent_user(admin_client):
    with patch("app.admin.router.delete_user", AsyncMock(return_value=False)):
        response = admin_client.delete("/admin/users/nonexistent")
    assert response.status_code == 404
