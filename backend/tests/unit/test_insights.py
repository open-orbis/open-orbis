"""Tests for the admin insights endpoint (GET /admin/insights)."""

from unittest.mock import AsyncMock, patch

import pytest

from app.dependencies import get_current_user, get_db, require_admin
from app.main import app
from tests.unit.conftest import MockNode  # noqa: F401

_FULL_INSIGHTS = {
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
    "cumulative_growth": [
        {"date": "2026-04-01", "count": 10},
        {"date": "2026-04-02", "count": 15},
    ],
    "activation_stages": {
        "registered": 45,
        "activated": 30,
        "built_orb": 20,
        "rich_orb": 8,
    },
    "top_skills": [
        {"name": "Python", "count": 12},
        {"name": "Machine Learning", "count": 8},
    ],
    "node_type_distribution": [
        {"label": "Skill", "count": 50},
        {"label": "WorkExperience", "count": 30},
    ],
    "profile_completeness": {
        "empty": 2,
        "partial": 10,
        "good": 15,
        "complete": 3,
    },
    "graph_richness": {
        "total_users": 30,
        "avg_nodes": 25.3,
        "min_nodes": 0,
        "max_nodes": 120,
        "median_nodes": 18.0,
    },
    "recently_active_7d": 12,
    "code_efficiency": [
        {"label": "newsletter", "created": 50, "used": 10, "rate": 0.2},
    ],
}

_EMPTY_INSIGHTS = {
    "providers": [],
    "activation_time": {
        "total": 0,
        "avg_hours": None,
        "min_hours": None,
        "max_hours": None,
    },
    "code_attribution": [],
    "engagement": [],
    "cumulative_growth": [],
    "activation_stages": {
        "registered": 0,
        "activated": 0,
        "built_orb": 0,
        "rich_orb": 0,
    },
    "top_skills": [],
    "node_type_distribution": [],
    "profile_completeness": {"empty": 0, "partial": 0, "good": 0, "complete": 0},
    "graph_richness": {
        "total_users": 0,
        "avg_nodes": 0.0,
        "min_nodes": 0,
        "max_nodes": 0,
        "median_nodes": 0.0,
    },
    "recently_active_7d": 0,
    "code_efficiency": [],
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


def test_insights_requires_admin(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value={"is_admin": False})
    )
    response = client.get("/admin/insights")
    assert response.status_code == 403


def test_insights_returns_all_sections(admin_client):
    with patch(
        "app.admin.router.get_insights",
        AsyncMock(return_value=_FULL_INSIGHTS),
    ):
        response = admin_client.get("/admin/insights")

    assert response.status_code == 200
    body = response.json()

    # Original fields
    assert len(body["providers"]) == 2
    assert body["activation_time"]["avg_hours"] == 12.5
    assert len(body["code_attribution"]) == 2
    assert len(body["engagement"]) == 4

    # New fields
    assert len(body["cumulative_growth"]) == 2
    assert body["cumulative_growth"][1]["count"] == 15

    assert body["activation_stages"]["registered"] == 45
    assert body["activation_stages"]["built_orb"] == 20

    assert len(body["top_skills"]) == 2
    assert body["top_skills"][0]["name"] == "Python"

    assert len(body["node_type_distribution"]) == 2

    assert body["profile_completeness"]["good"] == 15

    assert body["graph_richness"]["avg_nodes"] == 25.3
    assert body["graph_richness"]["median_nodes"] == 18.0

    assert body["recently_active_7d"] == 12

    assert len(body["code_efficiency"]) == 1
    assert body["code_efficiency"][0]["rate"] == 0.2


def test_insights_empty_data(admin_client):
    with patch(
        "app.admin.router.get_insights",
        AsyncMock(return_value=_EMPTY_INSIGHTS),
    ):
        response = admin_client.get("/admin/insights")

    assert response.status_code == 200
    body = response.json()
    assert body["providers"] == []
    assert body["activation_time"]["avg_hours"] is None
    assert body["cumulative_growth"] == []
    assert body["activation_stages"]["registered"] == 0
    assert body["top_skills"] == []
    assert body["graph_richness"]["total_users"] == 0
    assert body["recently_active_7d"] == 0
    assert body["code_efficiency"] == []
