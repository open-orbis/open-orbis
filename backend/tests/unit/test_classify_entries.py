"""Unit tests for classify_entries() — the LLM fallback chain pipeline.

Tests cover: empty input, fallback chain traversal (claude-opus → claude-sonnet
→ ollama → rule-based), per-provider timeout, truncation, progress callback,
rule-based fallback, and final unmatched fallback.
All LLM calls are mocked — no external services required.
"""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import respx
from httpx import Response

from app.cv.ollama_classifier import (
    TEXT_LIMIT_OLLAMA,
    classify_entries,
    parse_fallback_chain,
)

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

# LLM response with no nodes and no unmatched (triggers fallback to next provider)
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


def _make_settings(**overrides):
    """Return a mock settings object with sensible fallback-chain defaults."""
    s = MagicMock()
    s.llm_fallback_chain = overrides.get(
        "llm_fallback_chain", "claude-opus,claude-sonnet,ollama,rule-based"
    )
    s.llm_timeout_seconds = overrides.get("llm_timeout_seconds", 120)
    s.llm_provider = overrides.get("llm_provider", "claude")
    s.ollama_base_url = overrides.get("ollama_base_url", "http://localhost:11434")
    s.ollama_model = overrides.get("ollama_model", "llama3.2:3b")
    s.claude_model = overrides.get("claude_model", "claude-opus-4-6")
    return s


@pytest.fixture(autouse=True)
def _mock_settings():
    with patch("app.cv.ollama_classifier.settings", _make_settings()):
        yield


# ── parse_fallback_chain ──


class TestParseFallbackChain:
    def test_parses_valid_chain(self):
        chain = parse_fallback_chain("claude-opus,ollama,rule-based")
        assert chain == ["claude-opus", "ollama", "rule-based"]

    def test_strips_whitespace(self):
        chain = parse_fallback_chain(" claude-opus , ollama ")
        assert chain == ["claude-opus", "ollama"]

    def test_drops_unknown_entries(self):
        chain = parse_fallback_chain("claude-opus,unknown,ollama")
        assert chain == ["claude-opus", "ollama"]

    def test_empty_string_falls_back_to_llm_provider_claude(self):
        chain = parse_fallback_chain("")
        assert chain == ["claude-opus", "rule-based"]

    def test_all_invalid_falls_back_to_llm_provider(self):
        chain = parse_fallback_chain("foo,bar")
        assert chain == ["claude-opus", "rule-based"]


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
    async def test_first_provider_succeeds(self):
        with patch(
            "app.cv.ollama_classifier._call_claude_provider",
            new_callable=AsyncMock,
            return_value=(GOOD_LLM_RESPONSE, {}),
        ):
            result = await classify_entries("Some CV text here")
            assert len(result.nodes) == 2
            assert result.cv_owner_name == "Alice Smith"
            assert result.nodes[0].node_type == "skill"
            assert result.metadata.llm_model == "claude-opus-4-6"
            assert result.metadata.extraction_method == "primary"

    async def test_relationships_preserved(self):
        with patch(
            "app.cv.ollama_classifier._call_claude_provider",
            new_callable=AsyncMock,
            return_value=(GOOD_LLM_RESPONSE, {}),
        ):
            result = await classify_entries("Some CV text here")
            assert len(result.relationships) == 1
            assert result.relationships[0].type == "USED_SKILL"

    async def test_ollama_only_chain(self):
        with patch(
            "app.cv.ollama_classifier.settings",
            _make_settings(llm_fallback_chain="ollama,rule-based"),
        ), patch(
            "app.cv.ollama_classifier._call_ollama_provider",
            new_callable=AsyncMock,
            return_value=(GOOD_LLM_RESPONSE, {}),
        ):
            result = await classify_entries("Some CV text here")
            assert len(result.nodes) == 2
            assert result.metadata.llm_provider == "ollama"


# ── Fallback chain traversal ──


class TestFallbackChain:
    async def test_falls_back_to_sonnet_on_opus_failure(self):
        with (
            patch(
                "app.cv.ollama_classifier._call_claude_provider",
                new_callable=AsyncMock,
            ) as mock_claude,
        ):
            # Opus fails, Sonnet succeeds
            mock_claude.side_effect = [
                RuntimeError("Opus down"),
                (GOOD_LLM_RESPONSE, {}),
            ]
            result = await classify_entries("Some CV text here")
            assert len(result.nodes) == 2
            assert result.metadata.llm_model == "claude-sonnet-4-6"
            assert result.metadata.extraction_method == "fallback_claude-sonnet"

    async def test_falls_back_to_ollama_on_claude_failure(self):
        with (
            patch(
                "app.cv.ollama_classifier._call_claude_provider",
                new_callable=AsyncMock,
                side_effect=RuntimeError("Claude down"),
            ),
            patch(
                "app.cv.ollama_classifier._call_ollama_provider",
                new_callable=AsyncMock,
                return_value=(GOOD_LLM_RESPONSE, {}),
            ),
        ):
            result = await classify_entries("Some CV text here")
            assert len(result.nodes) == 2
            assert result.metadata.llm_provider == "ollama"

    async def test_falls_back_to_rule_based_when_all_llms_fail(self):
        with (
            patch(
                "app.cv.ollama_classifier._call_claude_provider",
                new_callable=AsyncMock,
                side_effect=RuntimeError("Claude down"),
            ),
            patch(
                "app.cv.ollama_classifier._call_ollama_provider",
                new_callable=AsyncMock,
                side_effect=ConnectionError("Ollama down"),
            ),
        ):
            result = await classify_entries(SAMPLE_CV_TEXT)
            types = {n.node_type for n in result.nodes}
            assert "skill" in types
            assert result.metadata.extraction_method == "fallback_rule_based"

    async def test_empty_result_triggers_fallback_to_next(self):
        """A provider returning an empty result falls through to the next."""
        with patch(
            "app.cv.ollama_classifier._call_claude_provider",
            new_callable=AsyncMock,
        ) as mock_claude:
            mock_claude.side_effect = [
                (EMPTY_LLM_RESPONSE, {}),
                (GOOD_LLM_RESPONSE, {}),
            ]
            result = await classify_entries("Some CV text")
            assert len(result.nodes) == 2

    async def test_timeout_triggers_fallback(self):
        with patch(
            "app.cv.ollama_classifier.settings",
            _make_settings(
                llm_fallback_chain="claude-opus,rule-based",
                llm_timeout_seconds=1,
            ),
        ):

            async def slow_claude(*args, **kwargs):
                await asyncio.sleep(10)
                return (GOOD_LLM_RESPONSE, {})

            with patch(
                "app.cv.ollama_classifier._call_claude_provider",
                side_effect=slow_claude,
            ):
                result = await classify_entries(SAMPLE_CV_TEXT)
                # Should have fallen back to rule-based
                assert result.metadata.extraction_method == "fallback_rule_based"


# ── Truncation ──


class TestTruncation:
    async def test_ollama_short_text_not_truncated(self):
        with patch(
            "app.cv.ollama_classifier.settings",
            _make_settings(llm_fallback_chain="ollama"),
        ), patch(
            "app.cv.ollama_classifier._call_ollama_provider",
            new_callable=AsyncMock,
            return_value=(GOOD_LLM_RESPONSE, {}),
        ):
            result = await classify_entries("Short CV")
            assert result.truncated is False

    async def test_ollama_long_text_truncated(self):
        long_text = "x" * (TEXT_LIMIT_OLLAMA + 3000)
        with patch(
            "app.cv.ollama_classifier.settings",
            _make_settings(llm_fallback_chain="ollama"),
        ), patch(
            "app.cv.ollama_classifier._call_ollama_provider",
            new_callable=AsyncMock,
            return_value=(GOOD_LLM_RESPONSE, {}),
        ):
            result = await classify_entries(long_text)
            assert result.truncated is True

    async def test_claude_long_text_not_truncated(self):
        long_text = "x" * (TEXT_LIMIT_OLLAMA + 3000)
        with patch(
            "app.cv.ollama_classifier._call_claude_provider",
            new_callable=AsyncMock,
            return_value=(GOOD_LLM_RESPONSE, {}),
        ):
            result = await classify_entries(long_text)
            # Claude handles full text — not truncated
            assert result.truncated is False


# ── Progress callback ──


class TestProgressCallback:
    async def test_callback_called_for_first_provider(self):
        callback = MagicMock()
        with patch(
            "app.cv.ollama_classifier._call_claude_provider",
            new_callable=AsyncMock,
            return_value=(GOOD_LLM_RESPONSE, {}),
        ):
            await classify_entries("Some CV text", progress_callback=callback)
            callback.assert_any_call("Trying Claude Opus...")

    async def test_callback_shows_fallback_message(self):
        callback = MagicMock()
        with (
            patch(
                "app.cv.ollama_classifier._call_claude_provider",
                new_callable=AsyncMock,
            ) as mock_claude,
        ):
            mock_claude.side_effect = [
                RuntimeError("Opus down"),
                (GOOD_LLM_RESPONSE, {}),
            ]
            await classify_entries("Some CV text", progress_callback=callback)
            callback.assert_any_call("Trying Claude Opus...")
            callback.assert_any_call("Claude Opus failed, trying Claude Sonnet...")


# ── Rule-based fallback ──


class TestRuleBasedFallback:
    async def test_fallback_produces_nodes_from_cv(self):
        with (
            patch(
                "app.cv.ollama_classifier._call_claude_provider",
                new_callable=AsyncMock,
                side_effect=RuntimeError("down"),
            ),
            patch(
                "app.cv.ollama_classifier._call_ollama_provider",
                new_callable=AsyncMock,
                side_effect=ConnectionError("down"),
            ),
        ):
            result = await classify_entries(SAMPLE_CV_TEXT)
            types = {n.node_type for n in result.nodes}
            assert "skill" in types

    async def test_fallback_extracts_cv_owner_name(self):
        with (
            patch(
                "app.cv.ollama_classifier._call_claude_provider",
                new_callable=AsyncMock,
                side_effect=RuntimeError("down"),
            ),
            patch(
                "app.cv.ollama_classifier._call_ollama_provider",
                new_callable=AsyncMock,
                side_effect=ConnectionError("down"),
            ),
        ):
            result = await classify_entries(SAMPLE_CV_TEXT)
            assert result.cv_owner_name == "John Smith"

    async def test_fallback_skips_invalid_nodes(self):
        with (
            patch(
                "app.cv.ollama_classifier._call_claude_provider",
                new_callable=AsyncMock,
                side_effect=RuntimeError("down"),
            ),
            patch(
                "app.cv.ollama_classifier._call_ollama_provider",
                new_callable=AsyncMock,
                side_effect=ConnectionError("down"),
            ),
            patch(
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
                "app.cv.ollama_classifier._call_claude_provider",
                new_callable=AsyncMock,
                side_effect=RuntimeError("down"),
            ),
            patch(
                "app.cv.ollama_classifier._call_ollama_provider",
                new_callable=AsyncMock,
                side_effect=ConnectionError("down"),
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
                "app.cv.ollama_classifier._call_claude_provider",
                new_callable=AsyncMock,
                side_effect=RuntimeError("down"),
            ),
            patch(
                "app.cv.ollama_classifier._call_ollama_provider",
                new_callable=AsyncMock,
                side_effect=ConnectionError("down"),
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
                "app.cv.ollama_classifier._call_claude_provider",
                new_callable=AsyncMock,
                side_effect=RuntimeError("down"),
            ),
            patch(
                "app.cv.ollama_classifier._call_ollama_provider",
                new_callable=AsyncMock,
                side_effect=ConnectionError("down"),
            ),
            patch(
                "app.cv.parser.rule_based_extract",
                side_effect=RuntimeError("parser broken"),
            ),
        ):
            result = await classify_entries(text)
            for line in result.unmatched:
                assert len(line) > 5


# ── Single-provider backwards compat ──


class TestSingleProviderChain:
    async def test_single_entry_chain_works(self):
        with patch(
            "app.cv.ollama_classifier.settings",
            _make_settings(llm_fallback_chain="ollama"),
        ), patch(
            "app.cv.ollama_classifier._call_ollama_provider",
            new_callable=AsyncMock,
            return_value=(GOOD_LLM_RESPONSE, {}),
        ):
            result = await classify_entries("Some CV text here")
            assert len(result.nodes) == 2
            assert result.metadata.llm_provider == "ollama"


# ── Ollama HTTP call ──


@respx.mock
async def test_call_ollama_provider_success():
    from app.cv.ollama_classifier import _call_ollama_provider

    with patch(
        "app.cv.ollama_classifier.settings",
        _make_settings(),
    ):
        url = "http://localhost:11434/api/chat"
        respx.post(url).mock(
            return_value=Response(200, json={"message": {"content": "ollama response"}})
        )
        result, usage = await _call_ollama_provider("user msg")
        assert result == "ollama response"
        assert usage == {}
