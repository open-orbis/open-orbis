from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.admin.auth import create_admin_jwt, get_current_admin
from app.main import app


@pytest.fixture
def admin_client(mock_neo4j_driver):
    """Test client with admin auth override."""
    app.dependency_overrides[get_current_admin] = lambda: "test-admin-id"

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


def test_admin_login_missing_credentials(admin_client):
    response = admin_client.post("/api/admin/login", json={})
    assert response.status_code == 422


@patch("app.admin.router.service.get_overview", new_callable=AsyncMock)
def test_admin_overview(mock_overview, admin_client):
    mock_overview.return_value = {
        "total_users": {"label": "Total Users", "value": 42, "sparkline": []},
        "active_today": {"label": "Active Today", "value": 5, "sparkline": []},
        "signups_this_week": {"label": "Signups This Week", "value": 3, "sparkline": []},
        "llm_tokens_today": {"label": "LLM Tokens Today", "value": 1000, "sparkline": []},
        "recent_events": [],
    }

    response = admin_client.get("/api/admin/overview")
    assert response.status_code == 200
    data = response.json()
    assert data["total_users"]["value"] == 42


@patch("app.admin.router.service.get_llm_usage", new_callable=AsyncMock)
def test_admin_llm_usage(mock_llm, admin_client):
    mock_llm.return_value = {
        "by_model": [],
        "by_operation": [],
        "over_time": [],
        "top_users": [],
    }

    response = admin_client.get("/api/admin/llm-usage")
    assert response.status_code == 200
    data = response.json()
    assert "by_model" in data


@patch("app.admin.router.service.get_realtime", new_callable=AsyncMock)
def test_admin_realtime(mock_rt, admin_client):
    mock_rt.return_value = {
        "active_users": 3,
        "events_today": 50,
        "llm_tokens_today": 500,
        "recent_events": [],
    }

    response = admin_client.get("/api/admin/realtime")
    assert response.status_code == 200
    assert response.json()["active_users"] == 3
