from io import BytesIO
from unittest.mock import MagicMock, patch


@patch("app.cv.voice_router.transcribe_audio")
def test_voice_transcribe_success(mock_transcribe, client):
    mock_transcribe.return_value = "Transcribed text"

    audio_content = b"a" * 200
    file = BytesIO(audio_content)

    response = client.post(
        "/cv/voice-transcribe", files={"file": ("test.webm", file, "audio/webm")}
    )

    assert response.status_code == 200
    assert response.json()["text"] == "Transcribed text"


def test_voice_transcribe_too_small(client):
    file = BytesIO(b"short")
    response = client.post(
        "/cv/voice-transcribe", files={"file": ("test.webm", file, "audio/webm")}
    )
    assert response.status_code == 400
    assert "too small" in response.json()["detail"]


@patch("app.cv.voice_router.classify_entries")
@patch("app.cv.voice_router.counter")
def test_voice_classify_success(mock_counter, mock_classify, client):
    mock_classify.return_value = MagicMock(
        nodes=[{"node_type": "skill", "properties": {"name": "Python"}}],
        unmatched=[],
        skipped=[],
        relationships=[],
        truncated=False,
    )

    response = client.post("/cv/voice-classify", json={"text": "I know Python"})
    assert response.status_code == 200
    assert len(response.json()["nodes"]) == 1
    mock_counter.increment.assert_called_once()
    mock_counter.decrement.assert_called_once()


def test_voice_classify_empty(client):
    response = client.post("/cv/voice-classify", json={"text": "  "})
    assert response.status_code == 400


@patch("app.cv.voice_router.classify_entries")
@patch("app.cv.voice_router.counter")
def test_voice_classify_error(mock_counter, mock_classify, client):
    mock_classify.side_effect = Exception("Classification failed")
    response = client.post("/cv/voice-classify", json={"text": "error text"})
    assert response.status_code == 500
    assert "Classification failed" in response.json()["detail"]
    mock_counter.decrement.assert_called_once()
