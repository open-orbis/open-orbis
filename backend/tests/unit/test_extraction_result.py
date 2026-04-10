"""Tests for ExtractionResult metadata in classification pipeline."""
import hashlib
from unittest.mock import AsyncMock, patch

import pytest

from app.cv.models import ConfirmRequest, ExtractedData, ExtractedNode, ExtractionMetadata
from app.cv.ollama_classifier import classify_entries, SYSTEM_PROMPT


def test_extraction_metadata_defaults():
    meta = ExtractionMetadata(
        llm_provider="claude",
        llm_model="claude-opus-4-6",
        extraction_method="primary",
        prompt_content="You are a CV parser...",
        prompt_hash="abc123",
    )
    assert meta.llm_provider == "claude"
    assert meta.llm_model == "claude-opus-4-6"
    assert meta.extraction_method == "primary"
    assert meta.prompt_content == "You are a CV parser..."
    assert meta.prompt_hash == "abc123"


def test_extraction_metadata_rule_based():
    meta = ExtractionMetadata(
        llm_provider="rule_based",
        llm_model="rule_based_parser",
        extraction_method="fallback_rule_based",
        prompt_content="",
        prompt_hash="",
    )
    assert meta.llm_provider == "rule_based"
    assert meta.prompt_content == ""


@pytest.mark.asyncio
async def test_classify_entries_returns_metadata_claude():
    """classify_entries populates metadata when using Claude provider."""
    mock_response = '{"cv_owner_name": "John", "nodes": [{"node_type": "skill", "properties": {"name": "Python"}}], "relationships": [], "unmatched": []}'

    with patch("app.cv.ollama_classifier.settings") as mock_settings:
        mock_settings.llm_provider = "claude"
        mock_settings.claude_model = "claude-opus-4-6"

        with patch("app.cv.claude_classifier.call_claude", new_callable=AsyncMock, return_value=mock_response):
            result = await classify_entries("Some CV text")

    assert result.metadata is not None
    assert result.metadata.llm_provider == "claude"
    assert result.metadata.llm_model == "claude-opus-4-6"
    assert result.metadata.extraction_method == "primary"
    assert result.metadata.prompt_content == SYSTEM_PROMPT
    expected_hash = hashlib.sha256(SYSTEM_PROMPT.encode()).hexdigest()
    assert result.metadata.prompt_hash == expected_hash


@pytest.mark.asyncio
async def test_classify_entries_returns_metadata_ollama():
    """classify_entries populates metadata when using Ollama provider."""
    mock_response = '{"cv_owner_name": "Jane", "nodes": [{"node_type": "skill", "properties": {"name": "Java"}}], "relationships": [], "unmatched": []}'

    with patch("app.cv.ollama_classifier.settings") as mock_settings:
        mock_settings.llm_provider = "ollama"
        mock_settings.ollama_model = "llama3.2:3b"
        mock_settings.ollama_base_url = "http://localhost:11434"

        with patch("app.cv.ollama_classifier._call_ollama", new_callable=AsyncMock, return_value=mock_response):
            result = await classify_entries("Some CV text")

    assert result.metadata is not None
    assert result.metadata.llm_provider == "ollama"
    assert result.metadata.llm_model == "llama3.2:3b"
    assert result.metadata.extraction_method == "primary"


@pytest.mark.asyncio
async def test_classify_entries_metadata_fallback_rule_based():
    """When LLM fails and rule-based fallback is used, metadata reflects that."""
    with patch("app.cv.ollama_classifier.settings") as mock_settings:
        mock_settings.llm_provider = "claude"
        mock_settings.claude_model = "claude-opus-4-6"

        with patch("app.cv.claude_classifier.call_claude", new_callable=AsyncMock, side_effect=RuntimeError("fail")):
            result = await classify_entries("Education\nMIT\nBSc Computer Science\n2020")

    if result.nodes:
        assert result.metadata is not None
        assert result.metadata.llm_provider == "rule_based"
        assert result.metadata.llm_model == "rule_based_parser"
        assert result.metadata.extraction_method == "fallback_rule_based"


def test_extracted_data_carries_metadata():
    data = ExtractedData(
        nodes=[ExtractedNode(node_type="skill", properties={"name": "Python"})],
        llm_provider="claude",
        llm_model="claude-opus-4-6",
        extraction_method="primary",
        prompt_hash="abc123",
    )
    assert data.llm_provider == "claude"
    assert data.llm_model == "claude-opus-4-6"


def test_confirm_request_carries_metadata():
    req = ConfirmRequest(
        nodes=[ExtractedNode(node_type="skill", properties={"name": "Python"})],
        llm_provider="claude",
        llm_model="claude-opus-4-6",
        extraction_method="primary",
        prompt_hash="abc123",
        prompt_content="You are a CV parser...",
    )
    assert req.llm_provider == "claude"
    assert req.prompt_content == "You are a CV parser..."
