"""End-to-end integration: tool call produces _meta, resource read
returns matching HTML shell. Runs against FastMCP in-process, mocks
the Neo4j driver at the boundary.

Does NOT hit ChatGPT — that's manual QA in Developer Mode (see
docs/chatgpt-apps/qa-checklist.md).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest


@pytest.mark.asyncio
async def test_full_flow_summary_tool_to_resource(monkeypatch):
    monkeypatch.setattr(
        "mcp_server.widgets.settings",
        type("S", (), {"frontend_url": "https://open-orbis.com"})(),
    )

    from mcp.types import CallToolResult

    from mcp_server.server import mcp

    fake_tool_data = {
        "name": "Alice",
        "headline": "Engineer",
        "location": "Roma",
        "orb_id": "orb1",
        "node_counts": {"skill": 3},
        "total_nodes": 3,
    }
    with (
        patch(
            "mcp_server.server._resolve_scope",
            new=AsyncMock(return_value=("orb1", "")),
        ),
        patch("mcp_server.server._get_driver", new=AsyncMock(return_value=None)),
        patch(
            "mcp_server.server.get_orb_summary",
            new=AsyncMock(return_value=fake_tool_data),
        ),
        patch("mcp_server.widgets.get_share_context", return_value=None),
    ):
        tool_result = await mcp.call_tool(
            "orbis_get_summary", {"orb_id": "", "token": ""}
        )

    assert isinstance(tool_result, CallToolResult)
    widget_uri = tool_result.meta["openai/outputTemplate"]
    assert widget_uri == "ui://widget/summary"
    assert tool_result.structuredContent == fake_tool_data

    # Resource read returns matching HTML shell
    contents = list(await mcp.read_resource(widget_uri))
    html = contents[0].content
    assert '<div id="root"></div>' in html
    assert "chatgpt-widgets/summary.js" in html


@pytest.mark.asyncio
async def test_share_context_omits_meta():
    """Share-token request: tool returns data but NO _meta (widget disabled)."""
    from mcp.types import CallToolResult

    from mcp_server.server import mcp

    with (
        patch(
            "mcp_server.server._resolve_scope",
            new=AsyncMock(return_value=("orb1", "tok")),
        ),
        patch("mcp_server.server._get_driver", new=AsyncMock(return_value=None)),
        patch(
            "mcp_server.server.get_orb_summary",
            new=AsyncMock(return_value={"name": "X"}),
        ),
        patch("mcp_server.widgets.get_share_context", return_value=object()),
    ):
        result = await mcp.call_tool(
            "orbis_get_summary", {"orb_id": "orb1", "token": "tok"}
        )

    assert isinstance(result, CallToolResult)
    assert result.structuredContent == {"name": "X"}
    assert result.meta is None  # widgets disabled in share-mode
