"""Tests for mcp_server.widgets."""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest

from mcp_server.widgets import (
    WIDGET_REGISTRY,
    build_html_shell,
    wrap_tool_response,
)


class TestWrapToolResponse:
    def test_returns_call_tool_result_with_structured_and_meta(self):
        """User-mode: CallToolResult with content + structuredContent + _meta."""
        with patch("mcp_server.widgets.get_share_context", return_value=None):
            result = wrap_tool_response(
                payload={"name": "Alice"},
                widget_name="summary",
            )
        from mcp.types import CallToolResult

        assert isinstance(result, CallToolResult)
        # content[0].text is the raw payload JSON (backwards-compat)
        assert result.content[0].text == json.dumps({"name": "Alice"})
        # structuredContent is the payload itself
        assert result.structuredContent == {"name": "Alice"}
        # meta at top level, dual-keyed
        assert result.meta["ui"]["resourceUri"] == "ui://widget/summary"
        assert result.meta["ui"]["visibility"] == ["model", "app"]
        assert result.meta["openai/outputTemplate"] == "ui://widget/summary"
        assert result.meta["openai/widgetAccessible"] is True

    def test_omits_meta_under_share_context(self):
        """Share-mode: still wrapped, but no _meta."""
        with patch("mcp_server.widgets.get_share_context", return_value=object()):
            result = wrap_tool_response(
                payload={"name": "Alice"},
                widget_name="summary",
            )
        assert result.structuredContent == {"name": "Alice"}
        assert result.content[0].text == json.dumps({"name": "Alice"})
        assert result.meta is None

    def test_passes_through_error_payloads(self):
        """Tool error responses: still wrapped, still tagged."""
        with patch("mcp_server.widgets.get_share_context", return_value=None):
            result = wrap_tool_response(
                payload={"error": "Orb not accessible"},
                widget_name="summary",
            )
        assert result.structuredContent == {"error": "Orb not accessible"}
        assert result.meta is not None  # error payloads still get widget hint

    def test_unknown_widget_name_raises(self):
        """Guardrail: typo in widget name must fail fast."""
        with pytest.raises(KeyError):
            wrap_tool_response(payload={}, widget_name="nonexistent")

    def test_list_payload_wrapped_under_items(self):
        """Tool returning list[dict] (e.g. nodes_by_type, skills_for_exp):
        structuredContent must be a dict per MCP spec, so wrap under 'items'."""
        with patch("mcp_server.widgets.get_share_context", return_value=None):
            result = wrap_tool_response(
                payload=[{"uid": "x"}, {"uid": "y"}],
                widget_name="nodes",
            )
        assert result.structuredContent == {"items": [{"uid": "x"}, {"uid": "y"}]}
        # content text is still the raw list, so existing clients see what
        # they expect
        assert json.loads(result.content[0].text) == [{"uid": "x"}, {"uid": "y"}]


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
    def test_returns_html_with_bundle_src(self, monkeypatch):
        monkeypatch.setattr(
            "mcp_server.widgets.settings",
            type("S", (), {"frontend_url": "https://open-orbis.com"})(),
        )
        html = build_html_shell("summary")
        assert '<div id="root"></div>' in html
        assert "https://open-orbis.com/chatgpt-widgets/summary.js" in html
        assert "<noscript>" in html

    def test_strips_trailing_slash_from_frontend_url(self, monkeypatch):
        monkeypatch.setattr(
            "mcp_server.widgets.settings",
            type("S", (), {"frontend_url": "https://open-orbis.com/"})(),
        )
        html = build_html_shell("nodes")
        assert "https://open-orbis.com/chatgpt-widgets/nodes.js" in html
        # double-slash bug guard
        assert "chatgpt-widgets//nodes.js" not in html

    def test_unknown_widget_raises(self):
        with pytest.raises(KeyError):
            build_html_shell("nonexistent")


class TestResourceRegistration:
    @pytest.mark.asyncio
    async def test_all_5_widgets_are_registered(self):
        """list_resources() should return exactly the 5 widget URIs."""
        from mcp_server.server import mcp

        resources = await mcp.list_resources()
        uris = {str(r.uri) for r in resources}
        assert uris == {
            "ui://widget/summary",
            "ui://widget/nodes",
            "ui://widget/full-orb",
            "ui://widget/connections",
            "ui://widget/skills-for-experience",
        }

    @pytest.mark.asyncio
    async def test_read_resource_returns_html_shell(self, monkeypatch):
        from mcp_server.server import mcp

        monkeypatch.setattr(
            "mcp_server.widgets.settings",
            type("S", (), {"frontend_url": "https://open-orbis.com"})(),
        )
        contents = await mcp.read_resource("ui://widget/summary")
        content_list = list(contents)
        assert len(content_list) == 1
        html = content_list[0].content
        assert '<div id="root"></div>' in html
        assert "chatgpt-widgets/summary.js" in html
        # Apps SDK requires this specific mime type for widget resources:
        assert content_list[0].mime_type == "text/html;profile=mcp-app"

    @pytest.mark.asyncio
    async def test_read_resource_includes_csp_meta(self):
        """_meta.ui.csp must list open-orbis.com in resourceDomains so
        ChatGPT's iframe CSP allows loading the bundle."""
        from mcp_server.server import mcp

        resources = await mcp.list_resources()
        summary_resource = next(
            r for r in resources if str(r.uri) == "ui://widget/summary"
        )
        csp = summary_resource.meta["ui"]["csp"]
        assert "https://open-orbis.com" in csp["resourceDomains"] or any(
            "open-orbis.com" in d for d in csp["resourceDomains"]
        )
        assert csp["frameDomains"] == []
