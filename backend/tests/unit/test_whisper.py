"""Unit tests for Whisper transcription client."""

from __future__ import annotations

import httpx
import pytest
import respx

from app.cv.whisper import transcribe_audio


@pytest.mark.asyncio
@respx.mock
async def test_transcribe_audio_success():
    """Test successful transcription."""
    base_url = "http://localhost:9000"
    respx.post(f"{base_url}/asr").mock(
        return_value=httpx.Response(200, json={"text": " Hello world! "})
    )

    result = await transcribe_audio(b"audio data", "test.mp3")
    assert result == "Hello world!"

    # Verify file is sent correctly in multiparts
    request = respx.calls.last.request
    assert "multipart/form-data" in request.headers["content-type"]
    assert "test.mp3" in request.content.decode("utf-8", errors="ignore")
    assert "audio/mpeg" in request.content.decode("utf-8", errors="ignore")


@pytest.mark.asyncio
@respx.mock
async def test_transcribe_audio_different_formats():
    """Test various audio formats for content-type detection."""
    base_url = "http://localhost:9000"
    respx.post(f"{base_url}/asr").mock(
        return_value=httpx.Response(200, json={"text": "Done"})
    )

    await transcribe_audio(b"d", "test.wav")
    assert "audio/wav" in respx.calls.last.request.content.decode(
        "utf-8", errors="ignore"
    )

    await transcribe_audio(b"d", "test.ogg")
    assert "audio/ogg" in respx.calls.last.request.content.decode(
        "utf-8", errors="ignore"
    )


@pytest.mark.asyncio
@respx.mock
async def test_transcribe_audio_error():
    """Test transcription failure."""
    base_url = "http://localhost:9000"
    respx.post(f"{base_url}/asr").mock(
        return_value=httpx.Response(500, text="Internal Server Error")
    )

    with pytest.raises(httpx.HTTPStatusError):
        await transcribe_audio(b"audio data")
