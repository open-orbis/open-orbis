"""Unit tests for classify_entries() — the main async classification pipeline.

Tests cover: empty input, provider branching (ollama/claude), retry logic,
truncation flag, rule-based fallback, final unmatched fallback.
All LLM calls are mocked — no external services required.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest
import respx
from httpx import Response

from app.cv.ollama_classifier import TEXT_LIMIT, classify_entries

# A valid LLM JSON response
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

# LLM response with no nodes and no unmatched (triggers retry)
EMPTY_LLM_RESPONSE = json.dumps(
    {
        "nodes": [],
        "relationships": [],
        "unmatched": [],
    }
)

# Sample CV text for rule-based fallback
SAMPLE_CV_TEXT = """John Smith
john@example.com

Skills
Python, Java, Go

Languages
English - Native
"""


@pytest.fixture(autouse=True)
def _mock_settings():
    with patch("app.cv.ollama_classifier.settings") as mock_settings:
        mock_settings.llm_provider = "ollama"
        mock_settings.ollama_base_url = "http://localhost:11434"
        mock_settings.ollama_model = "llama3.2:3b"
        mock_settings.claude_model = ""
        yield mock_settings


# ── Empty input ──


class TestEmptyInput:
    async def test_empty_string_returns_empty_result(self):
        result = await classify_entries("")
        assert result.nodes == []
        assert result.unmatched == []

    async def test_whitespace_only_returns_empty_result(self):
        result = await classify_entries("   \n\t  ")
        assert result.nodes == []


# ── Successful classification ──


class TestSuccessfulClassification:
    async def test_ollama_provider_returns_parsed_nodes(self):
        with patch(
            "app.cv.ollama_classifier._call_ollama",
            new_callable=AsyncMock,
            return_value=GOOD_LLM_RESPONSE,
        ):
            result = await classify_entries("Some CV text here")
            assert len(result.nodes) == 2
            assert result.cv_owner_name == "Alice Smith"
            assert result.nodes[0].node_type == "skill"

    async def test_claude_provider_calls_claude(self, _mock_settings):
        _mock_settings.llm_provider = "claude"
        _mock_settings.claude_model = "claude-sonnet-4-6"
        # call_claude is lazily imported inside classify_entries, mock at source
        with patch(
            "app.cv.claude_classifier.call_claude",
            new_callable=AsyncMock,
            return_value=GOOD_LLM_RESPONSE,
        ) as mock_claude:
            result = await classify_entries("Some CV text here")
            assert len(result.nodes) == 2
            mock_claude.assert_called_once()

    async def test_relationships_preserved(self):
        with patch(
            "app.cv.ollama_classifier._call_ollama",
            new_callable=AsyncMock,
            return_value=GOOD_LLM_RESPONSE,
        ):
            result = await classify_entries("Some CV text here")
            assert len(result.relationships) == 1
            assert result.relationships[0].type == "USED_SKILL"


# ── Truncation ──


class TestTruncation:
    async def test_short_text_not_truncated(self):
        with patch(
            "app.cv.ollama_classifier._call_ollama",
            new_callable=AsyncMock,
            return_value=GOOD_LLM_RESPONSE,
        ):
            result = await classify_entries("Short CV")
            assert result.truncated is False

    async def test_long_text_truncated(self):
        long_text = "x" * (TEXT_LIMIT + 3000)
        with patch(
            "app.cv.ollama_classifier._call_ollama",
            new_callable=AsyncMock,
            return_value=GOOD_LLM_RESPONSE,
        ):
            result = await classify_entries(long_text)
            assert result.truncated is True

    async def test_long_text_sends_truncated_content_to_llm(self):
        # Use a unique marker that only appears after TEXT_LIMIT
        long_text = "a" * TEXT_LIMIT + "UNIQUE_TAIL_MARKER"
        with patch(
            "app.cv.ollama_classifier._call_ollama",
            new_callable=AsyncMock,
            return_value=GOOD_LLM_RESPONSE,
        ) as mock_ollama:
            await classify_entries(long_text)
            call_args = mock_ollama.call_args[0][0]
            assert "UNIQUE_TAIL_MARKER" not in call_args


# ── Retry logic ──


class TestRetryLogic:
    async def test_retries_on_empty_result(self):
        call_count = 0

        async def mock_ollama(msg):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return EMPTY_LLM_RESPONSE
            return GOOD_LLM_RESPONSE

        with patch(
            "app.cv.ollama_classifier._call_ollama",
            side_effect=mock_ollama,
        ):
            result = await classify_entries("Some CV text")
            assert call_count == 2
            assert len(result.nodes) == 2

    async def test_retries_on_exception(self):
        call_count = 0

        async def mock_ollama(msg):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise ConnectionError("Ollama down")
            return GOOD_LLM_RESPONSE

        with patch(
            "app.cv.ollama_classifier._call_ollama",
            side_effect=mock_ollama,
        ):
            result = await classify_entries("Some CV text")
            assert call_count == 2
            assert len(result.nodes) == 2

    async def test_max_retries_exhausted_triggers_fallback(self):
        with patch(
            "app.cv.ollama_classifier._call_ollama",
            new_callable=AsyncMock,
            side_effect=ConnectionError("always fails"),
        ):
            result = await classify_entries(SAMPLE_CV_TEXT)
            # Rule-based fallback should find skills from SAMPLE_CV_TEXT
            types = {n.node_type for n in result.nodes}
            assert "skill" in types


# ── Rule-based fallback ──


class TestRuleBasedFallback:
    async def test_fallback_produces_nodes_from_cv(self):
        with patch(
            "app.cv.ollama_classifier._call_ollama",
            new_callable=AsyncMock,
            side_effect=ConnectionError("always fails"),
        ):
            result = await classify_entries(SAMPLE_CV_TEXT)
            types = {n.node_type for n in result.nodes}
            assert "skill" in types

    async def test_fallback_extracts_cv_owner_name(self):
        with patch(
            "app.cv.ollama_classifier._call_ollama",
            new_callable=AsyncMock,
            side_effect=ConnectionError("always fails"),
        ):
            result = await classify_entries(SAMPLE_CV_TEXT)
            assert result.cv_owner_name == "John Smith"

    async def test_fallback_sets_truncated_flag(self):
        long_text = SAMPLE_CV_TEXT + "x" * (TEXT_LIMIT + 1000)
        with patch(
            "app.cv.ollama_classifier._call_ollama",
            new_callable=AsyncMock,
            side_effect=ConnectionError("always fails"),
        ):
            result = await classify_entries(long_text)
            assert result.truncated is True

    async def test_fallback_skips_invalid_nodes(self):
        """Rule-based fallback validates nodes the same way _parse_result does."""
        with (
            patch(
                "app.cv.ollama_classifier._call_ollama",
                new_callable=AsyncMock,
                side_effect=ConnectionError("always fails"),
            ),
            patch(
                # Mock at source module — classify_entries imports lazily from app.cv.parser
                "app.cv.parser.rule_based_to_nodes",
                return_value=[
                    {"node_type": "skill", "properties": {"name": "Python"}},
                    {"node_type": "unknown", "properties": {"name": "X"}},
                ],
            ),
        ):
            result = await classify_entries(SAMPLE_CV_TEXT)
            assert any(n.node_type == "skill" for n in result.nodes)
            assert any("Unknown node type" in s.reason for s in result.skipped)


# ── Final fallback (unmatched lines) ──


class TestFinalFallback:
    async def test_returns_unmatched_lines_when_all_fails(self):
        with (
            patch(
                "app.cv.ollama_classifier._call_ollama",
                new_callable=AsyncMock,
                side_effect=ConnectionError("always fails"),
            ),
            patch(
                "app.cv.parser.rule_based_extract",
                side_effect=RuntimeError("parser broken"),
            ),
        ):
            result = await classify_entries(
                "This is a line of text that should appear as unmatched"
            )
            assert result.nodes == []
            assert len(result.unmatched) > 0

    async def test_final_fallback_limits_to_50_lines(self):
        text = "\n".join(f"Line number {i} with enough text" for i in range(100))
        with (
            patch(
                "app.cv.ollama_classifier._call_ollama",
                new_callable=AsyncMock,
                side_effect=ConnectionError("always fails"),
            ),
            patch(
                "app.cv.parser.rule_based_extract",
                side_effect=RuntimeError("parser broken"),
            ),
        ):
            result = await classify_entries(text)
            assert len(result.unmatched) <= 50

    async def test_final_fallback_filters_short_lines(self):
        text = "Hi\nX\nThis is a real line of content"
        with (
            patch(
                "app.cv.ollama_classifier._call_ollama",
                new_callable=AsyncMock,
                side_effect=ConnectionError("always fails"),
            ),
            patch(
                "app.cv.parser.rule_based_extract",
                side_effect=RuntimeError("parser broken"),
            ),
        ):
            result = await classify_entries(text)
            # Lines with len <= 5 should be filtered
            for line in result.unmatched:
                assert len(line) > 5


@respx.mock
async def test_call_ollama_success():
    from app.config import settings
    from app.cv.ollama_classifier import _call_ollama

    url = f"{settings.ollama_base_url}/api/chat"
    respx.post(url).mock(
        return_value=Response(200, json={"message": {"content": "ollama response"}})
    )

    result = await _call_ollama("user msg")
    assert result == "ollama response"
