"""Tests for the waitlist funnel metrics endpoint (GET /admin/funnel)."""

from unittest.mock import AsyncMock, patch

import pytest

from app.dependencies import get_current_user, get_db, require_admin
from app.main import app
from tests.unit.conftest import MockNode  # noqa: F401


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


def test_funnel_requires_admin(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value={"is_admin": False})
    )
    response = client.get("/admin/funnel")
    assert response.status_code == 403


def test_funnel_returns_metrics(admin_client):
    with patch(
        "app.admin.router.get_funnel_metrics",
        AsyncMock(
            return_value={
                "signups": [
                    {"date": "2026-04-01", "count": 5},
                    {"date": "2026-04-02", "count": 3},
                ],
                "activations": [
                    {"date": "2026-04-01", "count": 2},
                ],
                "total_signups": 8,
                "total_activations": 2,
                "conversion_rate": 0.25,
            }
        ),
    ):
        response = admin_client.get("/admin/funnel")

    assert response.status_code == 200
    body = response.json()
    assert body["total_signups"] == 8
    assert body["total_activations"] == 2
    assert body["conversion_rate"] == 0.25
    assert len(body["signups"]) == 2
    assert len(body["activations"]) == 1


def test_funnel_custom_days(admin_client):
    with patch(
        "app.admin.router.get_funnel_metrics",
        AsyncMock(
            return_value={
                "signups": [],
                "activations": [],
                "total_signups": 0,
                "total_activations": 0,
                "conversion_rate": 0.0,
            }
        ),
    ) as mock:
        response = admin_client.get("/admin/funnel?days=7")

    assert response.status_code == 200
    mock.assert_awaited_once()
    assert mock.call_args[0][1] == 7


def test_funnel_rejects_invalid_days(admin_client):
    response = admin_client.get("/admin/funnel?days=0")
    assert response.status_code == 400

    response = admin_client.get("/admin/funnel?days=500")
    assert response.status_code == 400


def test_funnel_empty_data(admin_client):
    with patch(
        "app.admin.router.get_funnel_metrics",
        AsyncMock(
            return_value={
                "signups": [],
                "activations": [],
                "total_signups": 0,
                "total_activations": 0,
                "conversion_rate": 0.0,
            }
        ),
    ):
        response = admin_client.get("/admin/funnel")

    assert response.status_code == 200
    body = response.json()
    assert body["total_signups"] == 0
    assert body["conversion_rate"] == 0.0
