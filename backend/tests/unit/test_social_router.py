from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_current_user
from app.main import app
from app.social.dependencies import get_social_db


@pytest.fixture
def mock_social_db():
    mock = MagicMock()
    session_mock = AsyncMock()
    mock.session.return_value.__aenter__ = AsyncMock(return_value=session_mock)
    mock.session.return_value.__aexit__ = AsyncMock()

    result_mock = AsyncMock()
    session_mock.run.return_value = result_mock

    return mock


@pytest.fixture
def social_client(mock_social_db, mock_neo4j_driver):
    app.dependency_overrides[get_social_db] = lambda: mock_social_db
    app.dependency_overrides[get_current_user] = lambda: {
        "user_id": "test-user",
        "email": "test@example.com",
    }

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


# ── POST /connections/dev ──


def test_create_connection_success(social_client, mock_social_db):
    session_mock = mock_social_db.session.return_value.__aenter__.return_value

    merge_result = AsyncMock()
    merge_result.single = AsyncMock(return_value={"u": {"user_id": "encrypted"}})

    create_result = AsyncMock()
    create_result.single = AsyncMock(
        return_value={
            "r": {"created_at": "2026-04-07T10:00:00"},
            "a": {"user_id": "encrypted-a"},
            "b": {"user_id": "encrypted-b"},
        }
    )

    session_mock.run = AsyncMock(side_effect=[merge_result, merge_result, create_result])

    payload = {"target_user_id": "other-user", "direction": "outgoing"}
    response = social_client.post("/connections/dev", json=payload)
    assert response.status_code == 201


def test_create_connection_duplicate(social_client, mock_social_db):
    session_mock = mock_social_db.session.return_value.__aenter__.return_value

    merge_result = AsyncMock()
    merge_result.single = AsyncMock(return_value={"u": {"user_id": "encrypted"}})

    create_result = AsyncMock()
    create_result.single = AsyncMock(return_value=None)

    session_mock.run = AsyncMock(side_effect=[merge_result, merge_result, create_result])

    payload = {"target_user_id": "other-user", "direction": "outgoing"}
    response = social_client.post("/connections/dev", json=payload)
    assert response.status_code == 409


def test_create_connection_self(social_client, mock_social_db):
    payload = {"target_user_id": "test-user", "direction": "outgoing"}
    response = social_client.post("/connections/dev", json=payload)
    assert response.status_code == 400


# ── GET /connections/me ──


def test_get_connections(social_client, mock_social_db):
    session_mock = mock_social_db.session.return_value.__aenter__.return_value

    connections_result = AsyncMock()
    connections_result.single = AsyncMock(
        return_value={
            "connections": [
                {"user_id": "encrypted-other", "direction": "outgoing", "created_at": "2026-04-07T10:00:00"},
            ]
        }
    )

    session_mock.run = AsyncMock(return_value=connections_result)

    with patch("app.social.router.decrypt_value", side_effect=lambda x: x.replace("encrypted-", "")):
        response = social_client.get("/connections/me")

    assert response.status_code == 200
    data = response.json()
    assert len(data["connections"]) == 1
    assert data["connections"][0]["direction"] == "outgoing"


def test_get_connections_empty(social_client, mock_social_db):
    session_mock = mock_social_db.session.return_value.__aenter__.return_value

    connections_result = AsyncMock()
    connections_result.single = AsyncMock(
        return_value={"connections": []}
    )

    session_mock.run = AsyncMock(return_value=connections_result)

    response = social_client.get("/connections/me")
    assert response.status_code == 200
    assert response.json()["connections"] == []


# ── DELETE /connections/{target_user_id} ──


def test_delete_connection_success(social_client, mock_social_db):
    session_mock = mock_social_db.session.return_value.__aenter__.return_value

    delete_result = AsyncMock()
    delete_result.single = AsyncMock(return_value={"deleted_count": 1})

    session_mock.run = AsyncMock(return_value=delete_result)

    response = social_client.delete("/connections/other-user")
    assert response.status_code == 204


def test_delete_connection_not_found(social_client, mock_social_db):
    session_mock = mock_social_db.session.return_value.__aenter__.return_value

    delete_result = AsyncMock()
    delete_result.single = AsyncMock(return_value={"deleted_count": 0})

    session_mock.run = AsyncMock(return_value=delete_result)

    response = social_client.delete("/connections/nonexistent")
    assert response.status_code == 404
