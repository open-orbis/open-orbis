import json
from unittest.mock import AsyncMock, patch

import pytest

from app.cv.claude_classifier import call_claude


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
    assert result == "Classification result"
    mock_exec.assert_called_once()


@patch("asyncio.create_subprocess_exec")
async def test_call_claude_failure(mock_exec):
    mock_process = AsyncMock()
    mock_process.communicate.return_value = (b"", b"Error message")
    mock_process.returncode = 1
    mock_exec.return_value = mock_process

    with pytest.raises(RuntimeError) as exc:
        await call_claude("sys prompt", "user msg")
    assert "code 1" in str(exc.value)


@patch("asyncio.create_subprocess_exec")
async def test_call_claude_raw_output(mock_exec):
    mock_process = AsyncMock()
    mock_process.communicate.return_value = (b"Raw non-json output", b"")
    mock_process.returncode = 0
    mock_exec.return_value = mock_process

    result = await call_claude("sys prompt", "user msg")
    assert result == "Raw non-json output"
