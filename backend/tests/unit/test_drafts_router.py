from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_current_user, get_db
from app.main import app

client = TestClient(app)


@pytest.fixture
def mock_user():
    user = {"user_id": "test-user-123", "email": "test@example.com"}
    app.dependency_overrides[get_current_user] = lambda: user
    yield user
    del app.dependency_overrides[get_current_user]


@pytest.fixture
def mock_neo4j():
    mock_driver = MagicMock()
    mock_session = AsyncMock()
    mock_driver.session.return_value = mock_session
    mock_session.__aenter__.return_value = mock_session
    app.dependency_overrides[get_db] = lambda: mock_driver
    yield mock_driver, mock_session
    del app.dependency_overrides[get_db]


@pytest.mark.asyncio
async def test_create_draft(mock_user, mock_neo4j):
    _, session = mock_neo4j

    mock_record = MagicMock()
    mock_record.__getitem__.return_value = {
        "uid": "draft-123",
        "text": "Hello world",
        "from_voice": False,
        "created_at": "2023-01-01T00:00:00",
        "updated_at": "2023-01-01T00:00:00",
    }
    mock_result = MagicMock()
    mock_result.single = AsyncMock(return_value=mock_record)
    session.run.return_value = mock_result

    response = client.post("/drafts", json={"text": "Hello world"})
    assert response.status_code == 200
    data = response.json()
    assert data["uid"] == "draft-123"
    assert data["text"] == "Hello world"
    assert session.run.called


@pytest.mark.asyncio
async def test_list_drafts(mock_user, mock_neo4j):
    _, session = mock_neo4j

    mock_record = MagicMock()
    mock_record.__getitem__.return_value = {
        "uid": "draft-123",
        "text": "Hello world",
        "from_voice": False,
        "created_at": "2023-01-01T00:00:00",
        "updated_at": "2023-01-01T00:00:00",
    }
    mock_result = MagicMock()
    mock_result.all = AsyncMock(return_value=[mock_record])
    session.run.return_value = mock_result

    response = client.get("/drafts")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["uid"] == "draft-123"


@pytest.mark.asyncio
async def test_update_draft(mock_user, mock_neo4j):
    _, session = mock_neo4j

    mock_record = MagicMock()
    mock_record.__getitem__.return_value = {
        "uid": "draft-123",
        "text": "Updated text",
        "from_voice": False,
        "created_at": "2023-01-01T00:00:00",
        "updated_at": "2023-01-01T00:00:01",
    }
    mock_result = MagicMock()
    mock_result.single = AsyncMock(return_value=mock_record)
    session.run.return_value = mock_result

    response = client.put("/drafts/draft-123", json={"text": "Updated text"})
    assert response.status_code == 200
    data = response.json()
    assert data["text"] == "Updated text"


@pytest.mark.asyncio
async def test_delete_draft(mock_user, mock_neo4j):
    _, session = mock_neo4j

    mock_result = MagicMock()
    session.run.return_value = mock_result

    response = client.delete("/drafts/draft-123")
    assert response.status_code == 200
    assert response.json() == {"status": "deleted"}
