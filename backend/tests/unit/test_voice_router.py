"""Unit tests for voice router."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.cv.ollama_classifier import ClassificationResult
from app.dependencies import get_current_user
from app.main import app

client = TestClient(app)


@pytest.fixture
def mock_user():
    user = {"user_id": "test-user-123", "email": "test@example.com"}
    app.dependency_overrides[get_current_user] = lambda: user
    yield user
    del app.dependency_overrides[get_current_user]


@pytest.mark.asyncio
async def test_voice_transcribe_success(mock_user):
    with patch(
        "app.cv.voice_router.transcribe_audio",
        new_callable=AsyncMock,
        return_value="Transcribed text",
    ):
        files = {"file": ("audio.webm", b"fake audio content" * 10, "audio/webm")}
        response = client.post("/cv/voice-transcribe", files=files)
        assert response.status_code == 200
        assert response.json()["text"] == "Transcribed text"


@pytest.mark.asyncio
async def test_voice_transcribe_empty(mock_user):
    with patch(
        "app.cv.voice_router.transcribe_audio", new_callable=AsyncMock, return_value=""
    ):
        files = {"file": ("audio.webm", b"fake audio content" * 10, "audio/webm")}
        response = client.post("/cv/voice-transcribe", files=files)
        assert response.status_code == 200
        assert response.json()["text"] == ""


def test_voice_transcribe_no_filename(mock_user):
    # FastAPI File(...) with no filename often results in 422 if it's required
    files = {"file": (None, b"fake audio content" * 10, "audio/webm")}
    response = client.post("/cv/voice-transcribe", files=files)
    assert response.status_code == 422


def test_voice_transcribe_too_small(mock_user):
    files = {"file": ("audio.webm", b"too small", "audio/webm")}
    response = client.post("/cv/voice-transcribe", files=files)
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_voice_transcribe_failure(mock_user):
    with patch(
        "app.cv.voice_router.transcribe_audio",
        new_callable=AsyncMock,
        side_effect=Exception("Failed"),
    ):
        files = {"file": ("audio.webm", b"fake audio content" * 10, "audio/webm")}
        response = client.post("/cv/voice-transcribe", files=files)
        assert response.status_code == 500


@pytest.mark.asyncio
async def test_voice_classify_success(mock_user):
    mock_result = ClassificationResult(
        nodes=[{"node_type": "skill", "properties": {"name": "Java"}}],
    )
    with (
        patch(
            "app.cv.voice_router.classify_entries",
            new_callable=AsyncMock,
            return_value=mock_result,
        ),
        patch("app.cv.counter.increment"),
        patch("app.cv.counter.decrement"),
    ):
        response = client.post("/cv/voice-classify", json={"text": "I know Java"})
        assert response.status_code == 200
        assert len(response.json()["nodes"]) == 1


def test_voice_classify_empty_text(mock_user):
    response = client.post("/cv/voice-classify", json={"text": "  "})
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_voice_classify_failure(mock_user):
    with patch(
        "app.cv.voice_router.classify_entries",
        new_callable=AsyncMock,
        side_effect=Exception("Failed"),
    ):
        response = client.post("/cv/voice-classify", json={"text": "I know Java"})
        assert response.status_code == 500
