import pytest
import respx
from httpx import Response

from app.config import settings
from app.cv.whisper import transcribe_audio


@respx.mock
async def test_transcribe_audio_success():
    base = settings.whisper_api_url.rstrip("/")
    respx.post(f"{base}/asr").mock(
        return_value=Response(200, json={"text": "Hello world"})
    )

    text = await transcribe_audio(b"audio data", "test.wav")
    assert text == "Hello world"


@respx.mock
async def test_transcribe_audio_different_extensions():
    base = settings.whisper_api_url.rstrip("/")
    respx.post(f"{base}/asr").mock(return_value=Response(200, json={"text": "content"}))

    # Test mp3
    text = await transcribe_audio(b"data", "test.mp3")
    assert text == "content"

    # Test unknown ext (defaults to webm)
    text = await transcribe_audio(b"data", "test.unknown")
    assert text == "content"


@respx.mock
async def test_transcribe_audio_failure():
    base = settings.whisper_api_url.rstrip("/")
    respx.post(f"{base}/asr").mock(return_value=Response(500))

    import httpx

    with pytest.raises(httpx.HTTPStatusError):
        await transcribe_audio(b"data")
