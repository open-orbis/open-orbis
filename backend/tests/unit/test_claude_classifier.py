import json
from unittest.mock import AsyncMock, patch

import pytest

from app.cv.claude_classifier import call_claude


@pytest.mark.asyncio
@patch("asyncio.create_subprocess_exec")
async def test_call_claude_success(mock_exec):
    # Mock process
    mock_process = AsyncMock()
    mock_process.communicate.return_value = (
        json.dumps({"result": "Classification result"}).encode("utf-8"),
        b"",
    )
    mock_process.returncode = 0
    mock_exec.return_value = mock_process

    result = await call_claude("sys prompt", "user msg")
    assert result["content"] == "Classification result"
    mock_exec.assert_called_once()


@pytest.mark.asyncio
@patch("asyncio.create_subprocess_exec")
async def test_call_claude_failure(mock_exec):
    mock_process = AsyncMock()
    mock_process.communicate.return_value = (b"", b"Error message")
    mock_process.returncode = 1
    mock_exec.return_value = mock_process

    with pytest.raises(RuntimeError) as exc:
        await call_claude("sys prompt", "user msg")
    assert "code 1" in str(exc.value)


@pytest.mark.asyncio
@patch("asyncio.create_subprocess_exec")
async def test_call_claude_raw_output(mock_exec):
    mock_process = AsyncMock()
    mock_process.communicate.return_value = (b"Raw non-json output", b"")
    mock_process.returncode = 0
    mock_exec.return_value = mock_process

    result = await call_claude("sys prompt", "user msg")
    assert result["content"] == "Raw non-json output"
    assert result["cost_usd"] is None
    assert result["duration_ms"] is None
    assert result["input_tokens"] is None
    assert result["output_tokens"] is None


@pytest.mark.asyncio
async def test_call_claude_returns_usage_metadata():
    envelope = {
        "result": '{"nodes": []}',
        "cost_usd": 0.042,
        "duration_ms": 1500,
    }
    mock_process = AsyncMock()
    mock_process.communicate.return_value = (
        json.dumps(envelope).encode(),
        b"",
    )
    mock_process.returncode = 0

    with patch("asyncio.create_subprocess_exec", return_value=mock_process):
        result = await call_claude("system", "user")

    assert result["content"] == '{"nodes": []}'
    assert result["cost_usd"] == 0.042
    assert result["duration_ms"] == 1500
    assert result["input_tokens"] is None
    assert result["output_tokens"] is None


@pytest.mark.asyncio
async def test_call_claude_handles_non_json_output():
    mock_process = AsyncMock()
    mock_process.communicate.return_value = (b"plain text", b"")
    mock_process.returncode = 0

    with patch("asyncio.create_subprocess_exec", return_value=mock_process):
        result = await call_claude("system", "user")

    assert result["content"] == "plain text"
    assert result["cost_usd"] is None
    assert result["duration_ms"] is None


@pytest.mark.asyncio
async def test_call_claude_returns_token_counts():
    """Test that input/output tokens are extracted when present in envelope."""
    envelope = {
        "result": "hello",
        "cost_usd": 0.01,
        "duration_ms": 500,
        "input_tokens": 120,
        "output_tokens": 45,
    }
    mock_process = AsyncMock()
    mock_process.communicate.return_value = (
        json.dumps(envelope).encode(),
        b"",
    )
    mock_process.returncode = 0

    with patch("asyncio.create_subprocess_exec", return_value=mock_process):
        result = await call_claude("system", "user")

    assert result["content"] == "hello"
    assert result["cost_usd"] == 0.01
    assert result["duration_ms"] == 500
    assert result["input_tokens"] == 120
    assert result["output_tokens"] == 45
