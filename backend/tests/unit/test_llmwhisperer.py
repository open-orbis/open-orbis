"""Unit tests for LLM Whisperer client."""

from __future__ import annotations

import httpx
import pytest
import respx
from unittest.mock import patch
from app.cv.llmwhisperer import extract_text

@pytest.mark.asyncio
@respx.mock
async def test_extract_text_success():
    """Test successful extraction workflow."""
    base_url = "https://llmwhisperer-api.eu-west.unstract.com/api/v2"
    
    # Mock submission
    respx.post(f"{base_url}/whisper").mock(return_value=httpx.Response(
        202, json={"whisper_hash": "test-hash"}
    ))
    
    # Mock status (one processing, then success)
    respx.get(f"{base_url}/whisper-status", params={"whisper_hash": "test-hash"}).mock(
        side_effect=[
            httpx.Response(200, json={"status": "processing"}),
            httpx.Response(200, json={"status": "processed"}),
        ]
    )
    
    # Mock retrieval
    respx.get(f"{base_url}/whisper-retrieve", params={"whisper_hash": "test-hash"}).mock(
        return_value=httpx.Response(200, json={"result_text": "Extracted content"})
    )
    
    # Patch asyncio.sleep to avoid waiting during tests
    with patch("asyncio.sleep", return_value=None):
        result = await extract_text(b"fake pdf content")
        assert result == "Extracted content"

@pytest.mark.asyncio
@respx.mock
async def test_extract_text_submit_error():
    """Test submission failure."""
    base_url = "https://llmwhisperer-api.eu-west.unstract.com/api/v2"
    respx.post(f"{base_url}/whisper").mock(return_value=httpx.Response(400, text="Bad Request"))
    
    with pytest.raises(httpx.HTTPStatusError):
        await extract_text(b"fake pdf")

@pytest.mark.asyncio
@respx.mock
async def test_extract_text_status_error():
    """Test processing error status."""
    base_url = "https://llmwhisperer-api.eu-west.unstract.com/api/v2"
    respx.post(f"{base_url}/whisper").mock(return_value=httpx.Response(202, json={"whisper_hash": "h"}))
    respx.get(f"{base_url}/whisper-status").mock(return_value=httpx.Response(
        200, json={"status": "error", "message": "OCR failed"}
    ))
    
    with pytest.raises(RuntimeError, match="OCR failed"):
        await extract_text(b"fake pdf")

@pytest.mark.asyncio
@respx.mock
async def test_extract_text_unknown_status():
    """Test polling with an unknown status."""
    base_url = "https://llmwhisperer-api.eu-west.unstract.com/api/v2"
    respx.post(f"{base_url}/whisper").mock(return_value=httpx.Response(202, json={"whisper_hash": "h"}))
    respx.get(f"{base_url}/whisper-status").mock(side_effect=[
        httpx.Response(200, json={"status": "mysterious"}),
        httpx.Response(200, json={"status": "processed"}),
    ])
    respx.get(f"{base_url}/whisper-retrieve").mock(return_value=httpx.Response(200, json={"result_text": "ok"}))
    
    with patch("asyncio.sleep", return_value=None):
        result = await extract_text(b"fake pdf")
        assert result == "ok"

@pytest.mark.asyncio
@respx.mock
async def test_extract_text_timeout():
    """Test polling timeout."""
    base_url = "https://llmwhisperer-api.eu-west.unstract.com/api/v2"
    respx.post(f"{base_url}/whisper").mock(return_value=httpx.Response(202, json={"whisper_hash": "h"}))
    respx.get(f"{base_url}/whisper-status").mock(return_value=httpx.Response(
        200, json={"status": "processing"}
    ))
    
    with patch("app.cv.llmwhisperer.WHISPER_TIMEOUT", 1), \
         patch("asyncio.sleep", return_value=None):
        with pytest.raises(TimeoutError):
            await extract_text(b"fake pdf")
