"""Tests for mcp_server.widgets."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from mcp_server.widgets import (
    WIDGET_REGISTRY,
    build_html_shell,
    wrap_tool_response,
)


class TestWrapToolResponse:
    def test_wraps_payload_with_structured_content_and_meta(self):
        """User-mode request: payload wrapped + dual-keyed outputTemplate."""
        with patch("mcp_server.widgets.get_share_context", return_value=None):
            result = wrap_tool_response(
                payload={"name": "Alice"},
                widget_name="summary",
            )
        assert result["structuredContent"] == {"name": "Alice"}
        # Canonical MCP-Apps keys (portable to Claude.ai / mcp-ui clients):
        assert result["_meta"]["ui"]["resourceUri"] == "ui://widget/summary"
        assert result["_meta"]["ui"]["visibility"] == ["model", "app"]
        # ChatGPT-legacy aliases (kept for backward compatibility):
        assert result["_meta"]["openai/outputTemplate"] == "ui://widget/summary"
        assert result["_meta"]["openai/widgetAccessible"] is True

    def test_omits_meta_under_share_context(self):
        """Share-mode request: no _meta (widget rendering disabled)."""
        fake_ctx = object()
        with patch("mcp_server.widgets.get_share_context", return_value=fake_ctx):
            result = wrap_tool_response(
                payload={"name": "Alice"},
                widget_name="summary",
            )
        assert result["structuredContent"] == {"name": "Alice"}
        assert "_meta" not in result

    def test_passes_through_error_payloads(self):
        """Tool error responses: still wrapped, still tagged."""
        with patch("mcp_server.widgets.get_share_context", return_value=None):
            result = wrap_tool_response(
                payload={"error": "Orb not accessible"},
                widget_name="summary",
            )
        assert result["structuredContent"] == {"error": "Orb not accessible"}
        assert "_meta" in result

    def test_unknown_widget_name_raises(self):
        """Guardrail: typo in widget name must fail fast."""
        with pytest.raises(KeyError):
            wrap_tool_response(payload={}, widget_name="nonexistent")


class TestWidgetRegistry:
    def test_registry_has_five_widgets(self):
        assert set(WIDGET_REGISTRY) == {
            "summary",
            "nodes",
            "full-orb",
            "connections",
            "skills-for-experience",
        }


class TestBuildHtmlShell:
    def test_shell_references_bundle_and_root(self):
        html = build_html_shell("summary")
        assert '<div id="root"></div>' in html
        assert "summary.js" in html
