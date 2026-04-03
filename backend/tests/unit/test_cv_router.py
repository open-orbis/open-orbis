"""Unit tests for CV router."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.cv.ollama_classifier import ClassificationResult
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
    # Ensure every call to session() returns our mock_session
    mock_driver.session.return_value = mock_session
    # For 'async with db.session() as session'
    mock_session.__aenter__.return_value = mock_session
    app.dependency_overrides[get_db] = lambda: mock_driver
    yield mock_driver, mock_session
    del app.dependency_overrides[get_db]


def test_get_processing_count():
    with patch("app.cv.counter.get_count", return_value=5):
        response = client.get("/cv/processing-count")
        assert response.status_code == 200
        assert response.json() == {"count": 5}


@pytest.mark.asyncio
async def test_upload_cv_success(mock_user):
    mock_result = ClassificationResult(
        nodes=[{"node_type": "skill", "properties": {"name": "Python"}}],
        cv_owner_name="Alice",
    )

    with (
        patch(
            "app.cv.router.whisperer_extract",
            new_callable=AsyncMock,
            return_value="Extracted Text",
        ),
        patch(
            "app.cv.router.classify_entries",
            new_callable=AsyncMock,
            return_value=mock_result,
        ),
        patch("app.cv.counter.increment"),
        patch("app.cv.counter.decrement"),
    ):
        files = {"file": ("test.pdf", b"fake pdf content", "application/pdf")}
        response = client.post("/cv/upload", files=files)

        assert response.status_code == 200
        data = response.json()
        assert data["cv_owner_name"] == "Alice"


def test_upload_cv_invalid_file(mock_user):
    files = {"file": ("test.txt", b"not a pdf", "text/plain")}
    response = client.post("/cv/upload", files=files)
    assert response.status_code == 400


def test_upload_cv_too_large(mock_user):
    files = {"file": ("test.pdf", b"x" * (11 * 1024 * 1024), "application/pdf")}
    response = client.post("/cv/upload", files=files)
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_upload_cv_empty_extraction(mock_user):
    with patch(
        "app.cv.router.whisperer_extract", new_callable=AsyncMock, return_value="  "
    ):
        files = {"file": ("test.pdf", b"pdf", "application/pdf")}
        response = client.post("/cv/upload", files=files)
        assert response.status_code == 400


@pytest.mark.asyncio
async def test_upload_cv_no_nodes(mock_user):
    mock_result = ClassificationResult(nodes=[], unmatched=[])
    with (
        patch(
            "app.cv.router.whisperer_extract",
            new_callable=AsyncMock,
            return_value="Some text",
        ),
        patch(
            "app.cv.router.classify_entries",
            new_callable=AsyncMock,
            return_value=mock_result,
        ),
    ):
        files = {"file": ("test.pdf", b"pdf", "application/pdf")}
        response = client.post("/cv/upload", files=files)
        assert response.status_code == 400


@pytest.mark.asyncio
async def test_upload_cv_timeout(mock_user):
    with patch(
        "app.cv.router.whisperer_extract",
        new_callable=AsyncMock,
        side_effect=TimeoutError("Timeout"),
    ):
        files = {"file": ("test.pdf", b"pdf", "application/pdf")}
        response = client.post("/cv/upload", files=files)
        assert response.status_code == 504


@pytest.mark.asyncio
async def test_confirm_cv_with_merge_and_rels(mock_user, mock_neo4j):
    driver, session = mock_neo4j

    mock_record = MagicMock()
    mock_record.__getitem__.return_value = {"uid": "skill-uid"}
    mock_result = MagicMock()
    mock_result.single = AsyncMock(return_value=mock_record)

    # Session already has .run as AsyncMock by default (because it's an AsyncMock)
    session.run.return_value = mock_result

    confirm_data = {
        "nodes": [
            {
                "node_type": "work_experience",
                "properties": {"company": "Google", "title": "SWE"},
            },
            {"node_type": "skill", "properties": {"name": "Python"}},
        ],
        "relationships": [{"from_index": 0, "to_index": 1, "type": "USED_SKILL"}],
    }

    response = client.post("/cv/confirm", json=confirm_data)
    assert response.status_code == 200
    assert response.json()["created"] == 2
    assert session.run.called


@pytest.mark.asyncio
async def test_upload_cv_generic_exception(mock_user):
    with patch(
        "app.cv.router.whisperer_extract",
        new_callable=AsyncMock,
        side_effect=Exception("Boom"),
    ):
        files = {"file": ("test.pdf", b"pdf", "application/pdf")}
        response = client.post("/cv/upload", files=files)
        assert response.status_code == 500
