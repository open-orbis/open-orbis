"""Unit tests for LiteLLM integration and branching logic in ollama_classifier."""

from __future__ import annotations

import json
from unittest.mock import ANY, AsyncMock, patch

import pytest

from app.cv.ollama_classifier import _call_llm, classify_entries

GOOD_LLM_RESPONSE = json.dumps(
    {
        "cv_owner_name": "Alice Smith",
        "nodes": [
            {"node_type": "skill", "properties": {"name": "Python"}},
            {
                "node_type": "work_experience",
                "properties": {"company": "Acme", "title": "SWE"},
            },
        ],
        "relationships": [{"from_index": 0, "to_index": 1, "type": "USED_SKILL"}],
        "unmatched": [],
    }
)


@pytest.fixture
def mock_settings():
    with patch("app.cv.ollama_classifier.settings") as mock:
        mock.llm_provider = "ollama"
        mock.ollama_base_url = "http://localhost:11434"
        mock.ollama_model = "llama3.2:3b"
        mock.claude_model = "claude-3-5-sonnet"
        mock.anthropic_api_key = "sk-test-123"
        yield mock


@pytest.mark.asyncio
async def test_call_llm_ollama(mock_settings):
    """Test _call_llm with ollama provider."""
    mock_response = AsyncMock()
    mock_response.choices = [AsyncMock(message=AsyncMock(content=GOOD_LLM_RESPONSE))]

    with patch("litellm.acompletion", return_value=mock_response) as mock_acompletion:
        result = await _call_llm("hello", "ollama", "llama3.2:3b")

        assert result == GOOD_LLM_RESPONSE
        mock_acompletion.assert_called_once()
        kwargs = mock_acompletion.call_args.kwargs
        assert kwargs["model"] == "ollama/llama3.2:3b"
        assert kwargs["api_base"] == "http://localhost:11434"
        assert kwargs["response_format"] == {"type": "json_object"}


@pytest.mark.asyncio
async def test_call_llm_claude(mock_settings):
    """Test _call_llm with claude provider."""
    mock_response = AsyncMock()
    mock_response.choices = [AsyncMock(message=AsyncMock(content=GOOD_LLM_RESPONSE))]

    with patch("litellm.acompletion", return_value=mock_response) as mock_acompletion:
        result = await _call_llm("hello", "claude", "claude-3-5-sonnet")

        assert result == GOOD_LLM_RESPONSE
        mock_acompletion.assert_called_once()
        kwargs = mock_acompletion.call_args.kwargs
        assert kwargs["model"] == "anthropic/claude-3-5-sonnet"
        assert kwargs["api_key"] == "sk-test-123"


@pytest.mark.asyncio
async def test_call_llm_error_handling(mock_settings):
    """Test _call_llm exception handling."""
    with (
        patch("litellm.acompletion", side_effect=Exception("LiteLLM Error")),
        pytest.raises(Exception, match="LiteLLM Error"),
    ):
        await _call_llm("hello", "ollama", "llama3.2:3b")


@pytest.mark.asyncio
async def test_classify_entries_claude_cli_fallback(mock_settings):
    """Test classify_entries falls back to Claude CLI if API key is missing."""
    mock_settings.llm_provider = "claude"
    mock_settings.anthropic_api_key = ""

    with patch(
        "app.cv.claude_classifier.call_claude",
        new_callable=AsyncMock,
        return_value=GOOD_LLM_RESPONSE,
    ) as mock_cli:
        result = await classify_entries("Some CV text")

        assert result.nodes != []
        mock_cli.assert_called_once()


@pytest.mark.asyncio
async def test_classify_entries_claude_api_call(mock_settings):
    """Test classify_entries uses LiteLLM when Claude API key is present."""
    mock_settings.llm_provider = "claude"
    mock_settings.anthropic_api_key = "has-key"

    with patch(
        "app.cv.ollama_classifier._call_llm",
        new_callable=AsyncMock,
        return_value=GOOD_LLM_RESPONSE,
    ) as mock_llm:
        result = await classify_entries("Some CV text")

        assert result.nodes != []
        mock_llm.assert_called_once_with(ANY, "claude", "claude-3-5-sonnet")


@pytest.mark.asyncio
async def test_classify_entries_ollama_call(mock_settings):
    """Test classify_entries uses LiteLLM for Ollama."""
    mock_settings.llm_provider = "ollama"

    with patch(
        "app.cv.ollama_classifier._call_llm",
        new_callable=AsyncMock,
        return_value=GOOD_LLM_RESPONSE,
    ) as mock_llm:
        result = await classify_entries("Some CV text")

        assert result.nodes != []
        mock_llm.assert_called_once_with(ANY, "ollama", "llama3.2:3b")
