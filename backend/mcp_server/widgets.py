"""Widget registry and response wrapper for ChatGPT Apps SDK.

Exposes 5 widget resources (`ui://widget/*`) that ChatGPT reads via
`resources/read` to get the HTML shell. Each tool response is wrapped
so that ChatGPT sees `_meta.openai/outputTemplate` at the top level of
the tool result on the wire.

Share-context requests are NOT widget-enabled: `_meta` is omitted so
the share-mode data path (restricted view) doesn't trigger UI
rendering the widgets weren't designed for.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from mcp.types import CallToolResult, TextContent

from app.config import settings
from mcp_server.auth import get_share_context


@dataclass(frozen=True)
class WidgetMeta:
    name: str
    title: str
    bundle_filename: str  # e.g. "summary.js"


WIDGET_REGISTRY: dict[str, WidgetMeta] = {
    "summary": WidgetMeta(
        name="summary",
        title="Orbis Profile Summary",
        bundle_filename="summary.js",
    ),
    "nodes": WidgetMeta(
        name="nodes",
        title="Orbis Nodes",
        bundle_filename="nodes.js",
    ),
    "full-orb": WidgetMeta(
        name="full-orb",
        title="Orbis Full Graph",
        bundle_filename="full-orb.js",
    ),
    "connections": WidgetMeta(
        name="connections",
        title="Orbis Node Connections",
        bundle_filename="connections.js",
    ),
    "skills-for-experience": WidgetMeta(
        name="skills-for-experience",
        title="Skills for Experience",
        bundle_filename="skills-for-experience.js",
    ),
}


def wrap_tool_response(*, payload: dict | list, widget_name: str) -> CallToolResult:
    """Wrap a tool response so the wire shape exposes:

    - ``content[0].text`` = JSON of the raw payload (backward-compat with
      MCP clients that parse text content — Cursor, Claude Code, Cline, etc).
    - ``structuredContent`` = the raw payload (MCP-spec structured field;
      ChatGPT Apps SDK widgets read this via ``window.openai.toolOutput``).
    - ``_meta`` (top-level) = widget metadata: dual-keyed canonical
      ``ui.resourceUri`` / ``ui.visibility`` plus ChatGPT-legacy
      ``openai/outputTemplate`` / ``openai/widgetAccessible``.

    Under ``ShareContext`` the ``_meta`` is intentionally omitted so
    share-mode tool calls don't trigger widget rendering.

    Returning ``CallToolResult`` directly is load-bearing: FastMCP's
    ``convert_result`` recognizes the type and returns it as-is, so the
    structuredContent + top-level _meta survive to the wire response.
    Returning a plain ``dict`` would route through the "no output_schema"
    branch and end up stringified into ``content[0].text`` only —
    breaking both backwards-compat and Apps SDK widget triggering.
    """
    if widget_name not in WIDGET_REGISTRY:
        raise KeyError(f"Unknown widget: {widget_name!r}")

    text_block = TextContent(type="text", text=json.dumps(payload))

    # Share-mode: intentionally drop _meta — widgets aren't designed
    # for the restricted-view shape and share tokens are outside the
    # Apps SDK flow.
    if get_share_context() is not None:
        return CallToolResult(
            content=[text_block],
            structuredContent=_to_structured(payload),
        )

    uri = f"ui://widget/{widget_name}"
    # Dual-keyed for portability: canonical MCP-Apps standard keys under
    # _meta.ui.* (readable by Claude.ai, mcp-ui clients) and ChatGPT-legacy
    # aliases under openai/* (still required for ChatGPT compatibility).
    # See docs/chatgpt-apps/apps-sdk-verified.md for the full rationale.
    #
    # NOTE: ``_meta`` is the alias on the Pydantic field; passing
    # ``meta=`` would set an extra attribute (model has extra='allow')
    # rather than populating the actual field. Using **{"_meta": ...}
    # routes through the alias.
    return CallToolResult(
        content=[text_block],
        structuredContent=_to_structured(payload),
        **{
            "_meta": {
                "ui": {
                    "resourceUri": uri,
                    "visibility": ["model", "app"],
                },
                "openai/outputTemplate": uri,
                "openai/widgetAccessible": True,
            }
        },
    )


def _to_structured(payload: dict | list) -> dict:
    """``CallToolResult.structuredContent`` is typed as ``dict | None`` per
    the MCP spec. When a tool's natural shape is a list (e.g.
    ``orbis_get_nodes_by_type`` returns ``list[dict]``) we wrap it under
    ``items`` so it still fits.
    """
    if isinstance(payload, list):
        return {"items": payload}
    return payload


def build_html_shell(widget_name: str) -> str:
    """Return the HTML document ChatGPT loads into the widget iframe.

    The shell is intentionally minimal: a single <div id="root"> + a
    script tag pointing at the widget bundle on the public frontend.
    The bundle reads `window.openai.toolOutput` and renders into
    `#root`. A fallback <noscript> keeps the experience graceful when
    JS fails or the CDN is unreachable.
    """
    meta = WIDGET_REGISTRY[widget_name]
    bundle_url = (
        f"{settings.frontend_url.rstrip('/')}/chatgpt-widgets/{meta.bundle_filename}"
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>{meta.title}</title>
</head>
<body>
  <div id="root"></div>
  <noscript>Enable JavaScript to see Orbis data.</noscript>
  <script type="module" src="{bundle_url}"></script>
</body>
</html>
"""
