"""Unit tests for POST /auth/google-id-token."""

from __future__ import annotations

import datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

_FUTURE = datetime.datetime(2027, 4, 22, tzinfo=datetime.timezone.utc)


@pytest.fixture
def client():
    return TestClient(app)


HAPPY_CLAIMS = {
    "sub": "google-sub-abc",
    "email": "alice@example.com",
    "email_verified": True,
    "name": "Alice Smith",
    "picture": "https://example.com/a.png",
    "iss": "https://accounts.google.com",
    "aud": "test-client-id",
}


def test_happy_path_issues_session_cookie(client):
    with (
        patch(
            "app.auth.router.verify_google_id_token",
            AsyncMock(return_value=HAPPY_CLAIMS),
        ),
        patch(
            "app.auth.router._upsert_google_person",
            AsyncMock(return_value={"user_id": "u-1", "email": "alice@example.com"}),
        ),
        patch(
            "app.auth.router.issue_refresh_token",
            AsyncMock(return_value=("raw-refresh-token", "tok-id", _FUTURE)),
        ),
    ):
        resp = client.post(
            "/auth/google-id-token",
            json={"id_token": "fake.jwt.token"},
        )
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    assert "__session" in resp.cookies


def test_rejects_unverified_email(client):
    unverified = {**HAPPY_CLAIMS, "email_verified": False}
    with patch(
        "app.auth.router.verify_google_id_token",
        AsyncMock(return_value=unverified),
    ):
        resp = client.post(
            "/auth/google-id-token",
            json={"id_token": "fake.jwt.token"},
        )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "invalid_id_token"


def test_verify_failure_surfaces_401(client):
    from fastapi import HTTPException

    with patch(
        "app.auth.router.verify_google_id_token",
        AsyncMock(side_effect=HTTPException(401, detail="invalid_id_token")),
    ):
        resp = client.post(
            "/auth/google-id-token",
            json={"id_token": "bad.token"},
        )
    assert resp.status_code == 401


def test_source_field_accepted(client):
    """source is an optional telemetry hint — request must succeed."""
    with (
        patch(
            "app.auth.router.verify_google_id_token",
            AsyncMock(return_value=HAPPY_CLAIMS),
        ),
        patch(
            "app.auth.router._upsert_google_person",
            AsyncMock(return_value={"user_id": "u-1", "email": "alice@example.com"}),
        ),
        patch(
            "app.auth.router.issue_refresh_token",
            AsyncMock(return_value=("raw", "id", _FUTURE)),
        ),
    ):
        resp = client.post(
            "/auth/google-id-token",
            json={"id_token": "fake.jwt.token", "source": "fedcm"},
        )
    assert resp.status_code == 200


def test_rate_limit_6th_request_is_throttled(client):
    """SlowAPI 5/minute keyed on client IP.

    ``set_auth_cookies`` is suppressed so every request is keyed on the
    test-client IP (no __session cookie is attached between calls).
    Without this, the first successful request sets a cookie carrying a
    real access JWT, subsequent requests are keyed per user_id instead
    of per-IP, and the effective limit doubles across the two key spaces.
    """
    with (
        patch(
            "app.auth.router.verify_google_id_token",
            AsyncMock(return_value=HAPPY_CLAIMS),
        ),
        patch(
            "app.auth.router._upsert_google_person",
            AsyncMock(return_value={"user_id": "u-1", "email": "alice@example.com"}),
        ),
        patch(
            "app.auth.router.issue_refresh_token",
            AsyncMock(return_value=("raw", "id", _FUTURE)),
        ),
        patch("app.auth.router.set_auth_cookies"),
    ):
        responses = [
            client.post(
                "/auth/google-id-token",
                json={"id_token": f"token-{i}"},
            )
            for i in range(6)
        ]
    assert [r.status_code for r in responses[:5]] == [200, 200, 200, 200, 200]
    assert responses[5].status_code == 429
