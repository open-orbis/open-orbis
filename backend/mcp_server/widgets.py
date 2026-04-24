"""Widget registry and response wrapper for ChatGPT Apps SDK.

Exposes 5 widget resources (`ui://widget/*`) that ChatGPT reads via
`resources/read` to get the HTML shell. Each tool response is wrapped
so that ChatGPT sees `_meta.openai/outputTemplate` pointing at the
right widget.

Share-context requests are NOT widget-enabled: `_meta` is omitted so
the share-mode data path (restricted view) doesn't trigger UI
rendering the widgets weren't designed for.
"""

from __future__ import annotations

from dataclasses import dataclass

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


def wrap_tool_response(*, payload: dict | list, widget_name: str) -> dict:
    """Wrap a tool response in structuredContent + _meta.

    Raises KeyError if `widget_name` isn't in the registry (typos fail
    fast rather than producing a broken tool response).
    """
    if widget_name not in WIDGET_REGISTRY:
        raise KeyError(f"Unknown widget: {widget_name!r}")

    wrapped: dict = {"structuredContent": payload}

    # Share-mode: intentionally drop _meta — widgets aren't designed
    # for the restricted-view shape and share tokens are outside the
    # Apps SDK flow.
    if get_share_context() is not None:
        return wrapped

    uri = f"ui://widget/{widget_name}"
    # Dual-keyed for portability: canonical MCP-Apps standard keys under
    # _meta.ui.* (readable by Claude.ai, mcp-ui clients) and ChatGPT-legacy
    # aliases under openai/* (still required for ChatGPT compatibility).
    # See docs/chatgpt-apps/apps-sdk-verified.md for the full rationale.
    wrapped["_meta"] = {
        "ui": {
            "resourceUri": uri,
            "visibility": ["model", "app"],
        },
        "openai/outputTemplate": uri,
        "openai/widgetAccessible": True,
    }
    return wrapped


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
  <script src="{bundle_url}" defer></script>
</body>
</html>
"""
