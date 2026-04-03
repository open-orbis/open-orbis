"""Unit tests for Claude Code CLI classifier."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest

from app.cv.claude_classifier import call_claude

@pytest.mark.asyncio
async def test_call_claude_success_json_envelope():
    """Test call_claude with JSON envelope output."""
    mock_stdout = json.dumps({
        "result": "Expected LLM Output",
        "cost_usd": 0.01
    }).encode("utf-8")
    
    mock_process = AsyncMock()
    mock_process.communicate.return_value = (mock_stdout, b"")
    mock_process.returncode = 0
    
    with patch("asyncio.create_subprocess_exec", return_value=mock_process) as mock_exec:
        result = await call_claude("sys", "user", "model-x")
        
        assert result == "Expected LLM Output"
        mock_exec.assert_called_once()
        args = mock_exec.call_args[0]
        assert "claude" in args
        assert "model-x" in args

@pytest.mark.asyncio
async def test_call_claude_success_raw_output():
    """Test call_claude with raw text output (fallback)."""
    mock_stdout = b"Raw LLM Output"
    
    mock_process = AsyncMock()
    mock_process.communicate.return_value = (mock_stdout, b"")
    mock_process.returncode = 0
    
    with patch("asyncio.create_subprocess_exec", return_value=mock_process):
        result = await call_claude("sys", "user")
        assert result == "Raw LLM Output"

@pytest.mark.asyncio
async def test_call_claude_error_exit_code():
    """Test call_claude with non-zero exit code."""
    mock_process = AsyncMock()
    mock_process.communicate.return_value = (b"", b"Claude CLI Error")
    mock_process.returncode = 1
    
    with patch("asyncio.create_subprocess_exec", return_value=mock_process):
        with pytest.raises(RuntimeError, match="Claude CLI exited with code 1"):
            await call_claude("sys", "user")
