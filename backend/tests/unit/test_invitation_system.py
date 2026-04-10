"""Tests for the closed-beta invitation system.

Two surfaces under test:
1. The signup gate in app.auth.router._enforce_invite_and_create_person —
   exercised end-to-end via POST /auth/google with mocked OAuth + service.
2. The /admin/* endpoints — exercised via TestClient with require_admin
   overridden so they accept the conftest test user.
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
# Signup gate (auth flow)
# ─────────────────────────────────────────────────────────────────────────


@pytest.fixture
def google_oauth_mock():
    """Patch Google token exchange to return a fixed userinfo dict."""
    with patch(
        "app.auth.router.exchange_google_code",
        AsyncMock(return_value=GOOGLE_USERINFO),
    ):
        yield


def _stub_existing_person(mock_db, exists: bool):
    """Stub the GET_PERSON_BY_USER_ID lookup at the start of the gate."""
    record = MockNode({"user_id": "google-1234567890"}) if exists else None
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value={"p": record} if record else None)
    )


def test_existing_user_login_bypasses_invite_gate(client, mock_db, google_oauth_mock):
    """Returning users must keep logging in even when all codes are consumed."""
    _stub_existing_person(mock_db, exists=True)

    with (
        patch(
            "app.auth.router.get_beta_config",
            AsyncMock(side_effect=AssertionError("gate must be bypassed")),
        ),
        patch(
            "app.auth.router.validate_access_code",
            AsyncMock(side_effect=AssertionError("gate must be bypassed")),
        ),
    ):
        response = client.post("/auth/google", json={"code": "fake"})

    assert response.status_code == 200
    assert response.json()["user"]["user_id"] == "google-1234567890"


def test_signup_with_no_code_is_rejected_and_waitlisted(
    client, mock_db, google_oauth_mock
):
    _stub_existing_person(mock_db, exists=False)

    waitlist_mock = AsyncMock()
    with (
        patch(
            "app.auth.router.get_beta_config",
            AsyncMock(return_value={"registration_enabled": True}),
        ),
        patch(
            "app.auth.router.validate_access_code",
            AsyncMock(return_value="no_code"),
        ),
        patch("app.auth.router.upsert_waitlist", waitlist_mock),
    ):
        response = client.post("/auth/google", json={"code": "fake"})

    assert response.status_code == 403
    assert response.json()["detail"] == "invalid_access_code"
    waitlist_mock.assert_awaited_once()
    assert waitlist_mock.await_args.kwargs["reason"] == "no_code"


def test_signup_with_invalid_code_is_rejected_and_waitlisted(
    client, mock_db, google_oauth_mock
):
    _stub_existing_person(mock_db, exists=False)

    waitlist_mock = AsyncMock()
    with (
        patch(
            "app.auth.router.get_beta_config",
            AsyncMock(return_value={"registration_enabled": True}),
        ),
        patch(
            "app.auth.router.validate_access_code",
            AsyncMock(return_value="invalid_code"),
        ),
        patch("app.auth.router.upsert_waitlist", waitlist_mock),
    ):
        response = client.post(
            "/auth/google",
            json={"code": "fake", "access_code": "wrong-code"},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "invalid_access_code"
    waitlist_mock.assert_awaited_once()
    assert waitlist_mock.await_args.kwargs["reason"] == "invalid_code"
    assert waitlist_mock.await_args.kwargs["attempted_code"] == "wrong-code"


def test_signup_with_already_used_code_is_waitlisted(
    client, mock_db, google_oauth_mock
):
    """A code that was already consumed by another user should be rejected."""
    _stub_existing_person(mock_db, exists=False)

    waitlist_mock = AsyncMock()
    with (
        patch(
            "app.auth.router.get_beta_config",
            AsyncMock(return_value={"registration_enabled": True}),
        ),
        patch(
            "app.auth.router.validate_access_code",
            AsyncMock(return_value="code_already_used"),
        ),
        patch("app.auth.router.upsert_waitlist", waitlist_mock),
    ):
        response = client.post(
            "/auth/google",
            json={"code": "fake", "access_code": "used-code"},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "code_already_used"
    waitlist_mock.assert_awaited_once()
    assert waitlist_mock.await_args.kwargs["reason"] == "code_already_used"


def test_signup_race_condition_consume_fails_is_waitlisted(
    client, mock_db, google_oauth_mock
):
    """If validate passes but consume fails (race — someone used the code
    between validate and consume), the user is waitlisted."""
    _stub_existing_person(mock_db, exists=False)

    waitlist_mock = AsyncMock()
    with (
        patch(
            "app.auth.router.get_beta_config",
            AsyncMock(return_value={"registration_enabled": True}),
        ),
        patch(
            "app.auth.router.validate_access_code",
            AsyncMock(return_value=None),
        ),
        patch(
            "app.auth.router.consume_access_code",
            AsyncMock(return_value=False),
        ),
        patch("app.auth.router.upsert_waitlist", waitlist_mock),
    ):
        response = client.post(
            "/auth/google",
            json={"code": "fake", "access_code": "raced-code"},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "code_already_used"
    waitlist_mock.assert_awaited_once()
    assert waitlist_mock.await_args.kwargs["reason"] == "code_already_used"


def test_signup_with_valid_unused_code_creates_person(
    client, mock_db, google_oauth_mock
):
    """Happy path: valid + unused code → consume succeeds → Person created."""
    _stub_existing_person(mock_db, exists=False)

    waitlist_mock = AsyncMock()
    create_mock = AsyncMock()
    with (
        patch(
            "app.auth.router.get_beta_config",
            AsyncMock(return_value={"registration_enabled": True}),
        ),
        patch(
            "app.auth.router.validate_access_code",
            AsyncMock(return_value=None),
        ),
        patch(
            "app.auth.router.consume_access_code",
            AsyncMock(return_value=True),
        ),
        patch("app.auth.router.upsert_waitlist", waitlist_mock),
        patch("app.auth.router._create_person", create_mock),
    ):
        response = client.post(
            "/auth/google",
            json={"code": "fake", "access_code": "fresh-code"},
        )

    assert response.status_code == 200
    assert response.json()["user"]["email"] == "newuser@example.com"
    create_mock.assert_awaited_once()
    waitlist_mock.assert_not_awaited()
    # signup_code is recorded on the new Person
    assert create_mock.await_args[0][6] == "fresh-code"


def test_registration_disabled_globally_waitlists(client, mock_db, google_oauth_mock):
    _stub_existing_person(mock_db, exists=False)

    waitlist_mock = AsyncMock()
    with (
        patch(
            "app.auth.router.get_beta_config",
            AsyncMock(return_value={"registration_enabled": False}),
        ),
        patch("app.auth.router.upsert_waitlist", waitlist_mock),
    ):
        response = client.post(
            "/auth/google",
            json={"code": "fake", "access_code": "valid-code"},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "registration_closed"
    waitlist_mock.assert_awaited_once()
    assert waitlist_mock.await_args.kwargs["reason"] == "registration_closed"


def test_invite_only_disabled_skips_gate_entirely(
    client, mock_db, google_oauth_mock, monkeypatch
):
    """When invite_only_registration=False, anyone can sign up — useful for the
    public-launch flip later."""
    from app.config import settings

    monkeypatch.setattr(settings, "invite_only_registration", False)
    _stub_existing_person(mock_db, exists=False)

    create_mock = AsyncMock()
    with (
        patch("app.auth.router._create_person", create_mock),
        patch(
            "app.auth.router.get_beta_config",
            AsyncMock(side_effect=AssertionError("gate must be skipped")),
        ),
    ):
        response = client.post("/auth/google", json={"code": "fake"})

    assert response.status_code == 200
    create_mock.assert_awaited_once()


# ─────────────────────────────────────────────────────────────────────────
# Admin endpoints
# ─────────────────────────────────────────────────────────────────────────


@pytest.fixture
def admin_client(mock_db, mock_neo4j_driver):
    """TestClient with require_admin overridden to always pass."""
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
    """Without the require_admin override, /admin/stats must reject the test
    user (whose Person has no is_admin flag)."""
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value={"is_admin": False})
    )
    response = client.get("/admin/stats")
    assert response.status_code == 403


def test_admin_stats_returns_aggregated_view(admin_client):
    with (
        patch(
            "app.admin.router.get_beta_config",
            AsyncMock(return_value={"registration_enabled": True}),
        ),
        patch("app.admin.router.count_persons", AsyncMock(return_value=47)),
        patch(
            "app.admin.router.count_access_codes",
            AsyncMock(return_value={"total": 200, "used": 47, "available": 153}),
        ),
        patch(
            "app.admin.router.waitlist_stats",
            AsyncMock(return_value={"no_code": 5, "code_already_used": 3}),
        ),
    ):
        response = admin_client.get("/admin/stats")

    assert response.status_code == 200
    body = response.json()
    assert body["registered"] == 47
    assert body["registration_enabled"] is True
    assert body["invite_codes"]["total"] == 200
    assert body["invite_codes"]["used"] == 47
    assert body["invite_codes"]["available"] == 153
    assert body["waitlist_total"] == 8
    assert body["waitlist_by_reason"]["no_code"] == 5
    assert body["waitlist_by_reason"]["code_already_used"] == 3


def test_admin_patch_beta_config_updates_registration(admin_client):
    with patch(
        "app.admin.router.update_beta_config",
        AsyncMock(
            return_value={
                "max_users": 2000,
                "registration_enabled": False,
                "updated_at": "2026-04-09T12:00:00",
            }
        ),
    ) as update_mock:
        response = admin_client.patch(
            "/admin/beta-config", json={"registration_enabled": False}
        )

    assert response.status_code == 200
    assert response.json()["registration_enabled"] is False
    update_mock.assert_awaited_once()


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
                    "created_at": "2026-04-09T12:00:00",
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


def test_admin_create_batch_access_codes(admin_client):
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
                    "created_at": "2026-04-09T12:00:00",
                    "created_by": "admin-user",
                },
                {
                    "code": "launch-d4e5f6",
                    "label": "launch",
                    "active": True,
                    "used_at": None,
                    "used_by": None,
                    "created_at": "2026-04-09T12:00:00",
                    "created_by": "admin-user",
                },
            ]
        ),
    ):
        response = admin_client.post(
            "/admin/access-codes/batch",
            json={"prefix": "launch", "count": 2, "label": "launch"},
        )

    assert response.status_code == 201
    body = response.json()
    assert len(body) == 2
    assert body[0]["code"] == "launch-a1b2c3"
    assert body[1]["code"] == "launch-d4e5f6"


def test_admin_create_access_code_conflict(admin_client):
    with patch(
        "app.admin.router.get_access_code",
        AsyncMock(return_value={"code": "invite-abc123"}),
    ):
        response = admin_client.post(
            "/admin/access-codes",
            json={"code": "invite-abc123", "label": "newsletter"},
        )

    assert response.status_code == 409


def test_admin_list_access_codes(admin_client):
    with patch(
        "app.admin.router.list_access_codes",
        AsyncMock(
            return_value=[
                {
                    "code": "alpha",
                    "label": "twitter",
                    "active": True,
                    "used_at": "2026-04-09T10:00:00",
                    "used_by": "google-9999",
                    "created_at": "2026-04-09T08:00:00",
                    "created_by": "admin-user",
                }
            ]
        ),
    ):
        response = admin_client.get("/admin/access-codes")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["used_at"] == "2026-04-09T10:00:00"
    assert body[0]["used_by"] == "google-9999"


def test_admin_waitlist_endpoint(admin_client):
    with patch(
        "app.admin.router.list_waitlist",
        AsyncMock(
            return_value=[
                {
                    "email": "decrypted@example.com",
                    "name": "Some Person",
                    "provider": "google",
                    "attempted_code": None,
                    "reason": "no_code",
                    "first_attempt_at": "2026-04-09T12:00:00",
                    "last_attempt_at": "2026-04-09T12:00:00",
                    "attempts": 1,
                    "contacted": False,
                }
            ]
        ),
    ):
        response = admin_client.get("/admin/waitlist")

    assert response.status_code == 200
    assert response.json()[0]["email"] == "decrypted@example.com"


def test_admin_mark_waitlist_contacted(admin_client):
    with patch(
        "app.admin.router.mark_waitlist_contacted",
        AsyncMock(
            return_value={
                "email": "decrypted@example.com",
                "name": "Some Person",
                "provider": "google",
                "reason": "no_code",
                "first_attempt_at": "2026-04-09T12:00:00",
                "last_attempt_at": "2026-04-09T12:00:00",
                "attempts": 1,
                "contacted": True,
                "contacted_at": "2026-04-09T13:00:00",
            }
        ),
    ):
        response = admin_client.patch(
            "/admin/waitlist/decrypted@example.com",
            json={"contacted": True},
        )

    assert response.status_code == 200
    assert response.json()["contacted"] is True
