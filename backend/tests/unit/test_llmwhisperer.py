from unittest.mock import AsyncMock, patch

import pytest
import respx
from httpx import Response

from app.config import settings
from app.cv.llmwhisperer import extract_text


@respx.mock
async def test_extract_text_success():
    base = settings.llmwhisperer_api_url.rstrip("/")

    # Mock Step 1: Submit
    respx.post(f"{base}/whisper").mock(
        return_value=Response(202, json={"whisper_hash": "test-hash"})
    )

    # Mock Step 2: Status
    respx.get(f"{base}/whisper-status").mock(
        return_value=Response(200, json={"status": "processed"})
    )

    # Mock Step 3: Retrieve
    respx.get(f"{base}/whisper-retrieve").mock(
        return_value=Response(200, json={"result_text": "Extracted content"})
    )

    text = await extract_text(b"pdf data")
    assert text == "Extracted content"


@respx.mock
async def test_extract_text_polling():
    base = settings.llmwhisperer_api_url.rstrip("/")

    respx.post(f"{base}/whisper").mock(
        return_value=Response(202, json={"whisper_hash": "test-hash"})
    )

    # First call processing, second call processed
    respx.get(f"{base}/whisper-status").side_effect = [
        Response(200, json={"status": "processing"}),
        Response(200, json={"status": "processed"}),
    ]

    respx.get(f"{base}/whisper-retrieve").mock(
        return_value=Response(200, json={"result_text": "content"})
    )

    # Patch asyncio.sleep to speed up tests
    with pytest.MonkeyPatch().context() as mp:
        import asyncio

        mp.setattr(asyncio, "sleep", AsyncMock())
        text = await extract_text(b"pdf data")
        assert text == "content"


@respx.mock
async def test_extract_text_submit_failure():
    base = settings.llmwhisperer_api_url.rstrip("/")
    respx.post(f"{base}/whisper").mock(return_value=Response(400, text="Bad request"))

    import httpx

    with pytest.raises(httpx.HTTPStatusError):
        await extract_text(b"pdf data")


@respx.mock
async def test_extract_text_status_error():
    base = settings.llmwhisperer_api_url.rstrip("/")
    respx.post(f"{base}/whisper").mock(
        return_value=Response(202, json={"whisper_hash": "h"})
    )
    respx.get(f"{base}/whisper-status").mock(
        return_value=Response(200, json={"status": "error", "message": "Failed"})
    )

    with pytest.raises(RuntimeError, match="processing error"):
        await extract_text(b"pdf data")


@respx.mock
async def test_extract_text_timeout():
    base = settings.llmwhisperer_api_url.rstrip("/")
    respx.post(f"{base}/whisper").mock(
        return_value=Response(202, json={"whisper_hash": "h"})
    )
    # Always returning 'processing'
    respx.get(f"{base}/whisper-status").mock(
        return_value=Response(200, json={"status": "processing"})
    )

    with (
        patch("app.cv.llmwhisperer.WHISPER_TIMEOUT", 1),
        patch("asyncio.sleep", AsyncMock()),
        pytest.raises(TimeoutError),
    ):
        await extract_text(b"pdf data")
