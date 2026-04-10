"""Tests for the admin insights endpoint (GET /admin/insights)."""

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


def test_insights_requires_admin(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value={"is_admin": False})
    )
    response = client.get("/admin/insights")
    assert response.status_code == 403


def test_insights_returns_all_sections(admin_client):
    with patch(
        "app.admin.router.get_insights",
        AsyncMock(
            return_value={
                "providers": [
                    {"provider": "google", "count": 30},
                    {"provider": "linkedin", "count": 15},
                ],
                "activation_time": {
                    "total": 20,
                    "avg_hours": 12.5,
                    "min_hours": 0.1,
                    "max_hours": 72.0,
                },
                "code_attribution": [
                    {"label": "newsletter", "count": 10},
                    {"label": "admin-grant", "count": 5},
                ],
                "engagement": [
                    {"bucket": "0", "count": 8},
                    {"bucket": "1-10", "count": 12},
                    {"bucket": "11-50", "count": 5},
                    {"bucket": "50+", "count": 2},
                ],
            }
        ),
    ):
        response = admin_client.get("/admin/insights")

    assert response.status_code == 200
    body = response.json()

    assert len(body["providers"]) == 2
    assert body["providers"][0]["provider"] == "google"
    assert body["providers"][0]["count"] == 30

    assert body["activation_time"]["total"] == 20
    assert body["activation_time"]["avg_hours"] == 12.5

    assert len(body["code_attribution"]) == 2
    assert body["code_attribution"][0]["label"] == "newsletter"

    assert len(body["engagement"]) == 4
    assert body["engagement"][0]["bucket"] == "0"


def test_insights_empty_data(admin_client):
    with patch(
        "app.admin.router.get_insights",
        AsyncMock(
            return_value={
                "providers": [],
                "activation_time": {
                    "total": 0,
                    "avg_hours": None,
                    "min_hours": None,
                    "max_hours": None,
                },
                "code_attribution": [],
                "engagement": [],
            }
        ),
    ):
        response = admin_client.get("/admin/insights")

    assert response.status_code == 200
    body = response.json()
    assert body["providers"] == []
    assert body["activation_time"]["total"] == 0
    assert body["activation_time"]["avg_hours"] is None
    assert body["code_attribution"] == []
    assert body["engagement"] == []
