"""Orbis MCP Server — exposes orb data via MCP tools.

Every request to the streamable-http transport is authenticated via an
``X-MCP-Key`` header resolved by ``mcp_server.auth.APIKeyMiddleware``.
Tools then see the caller's user_id via a ContextVar and can serve
either that user's own orb or any public orb.
"""

from __future__ import annotations

import hashlib
import logging

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import CallToolResult
from neo4j import AsyncGraphDatabase

from app.config import settings
from app.graph.queries import NODE_TYPE_LABELS
from mcp_server.auth import APIKeyMiddleware
from mcp_server.tools import (
    get_connections,
    get_nodes_by_type,
    get_orb_full,
    get_orb_summary,
    get_skills_for_experience,
)
from mcp_server.widgets import WIDGET_REGISTRY, build_html_shell, wrap_tool_response

logger = logging.getLogger(__name__)

# Inverse of NODE_TYPE_LABELS for the full-orb widget which displays
# snake_case type names (e.g. "work_experience") not the Cypher PascalCase.
_LABEL_TO_TYPE: dict[str, str] = {v: k for k, v in NODE_TYPE_LABELS.items()}


def _resolve_node_type(node: dict) -> str:
    """Map a node's Cypher labels to its snake_case type."""
    labels = node.get("_labels") or []
    for label in labels:
        if label in _LABEL_TO_TYPE:
            return _LABEL_TO_TYPE[label]
    return "unknown"


def _full_orb_widget_payload(raw: dict) -> dict:
    """Shape get_orb_full output for the full-orb widget.

    Tool returns ``{person, nodes}`` where each node has ``_type`` (PascalCase
    Cypher label) and ``_relationship`` (relationship type from person).
    Widget expects ``{person, nodes, edges, total_nodes}`` with snake_case
    ``type`` and explicit edges from person.
    """
    if not isinstance(raw, dict) or "error" in raw:
        return raw  # let widget render error / empty state
    person = raw.get("person") or {}
    nodes = raw.get("nodes") or []
    widget_nodes = [
        {
            "uid": n.get("uid", ""),
            "type": _LABEL_TO_TYPE.get(n.get("_type") or "", "unknown"),
            "title": n.get("title") or n.get("name") or n.get("uid", ""),
            "name": n.get("name"),
            # Real degree is not in the orb_full output; widget sorts hero
            # nodes by degree, so fall back to 1 for all. Future enhancement:
            # compute real degree from a richer query.
            "degree": 1,
        }
        for n in nodes
    ]
    edges = [
        {"source": person.get("uid", ""), "target": n.get("uid", "")}
        for n in nodes
        if n.get("uid")
    ]
    return {
        "person": {
            "uid": person.get("uid", ""),
            "name": person.get("name", ""),
            "orb_id": person.get("orb_id", ""),
        },
        "nodes": widget_nodes,
        "edges": edges,
        "total_nodes": len(nodes),
    }


def _nodes_widget_payload(raw: list | dict, *, node_type: str) -> dict:
    """Shape get_nodes_by_type output for the nodes widget.

    Tool returns a bare ``list[dict]`` (or a single-element list with an
    error envelope). Widget expects ``{node_type, nodes: [...]}``.
    """
    # Tool returns [{"error": "..."}] on invalid type / inaccessible orb;
    # surface that to the widget via the same envelope so ToolErrorState renders.
    if (
        isinstance(raw, list)
        and len(raw) == 1
        and isinstance(raw[0], dict)
        and "error" in raw[0]
    ):
        return raw[0]
    return {
        "node_type": node_type,
        "nodes": list(raw) if isinstance(raw, list) else [],
    }


def _connections_widget_payload(raw: dict, *, node_uid: str) -> dict:
    """Shape get_connections output for the connections widget.

    Tool returns ``{node_uid, connections: [{relationship, node}]}``.
    Widget expects ``{focus, related}`` where each related entry has the node
    fields flattened with the relationship.

    Focus type/title are NOT in the tool response; we synthesize a minimal
    focus from the input ``node_uid``. Widget falls back to uid for label.
    """
    if not isinstance(raw, dict) or "error" in raw:
        return raw
    connections = raw.get("connections") or []
    related = [
        {
            "uid": (c.get("node") or {}).get("uid", ""),
            "type": _resolve_node_type(c.get("node") or {}),
            "title": (c.get("node") or {}).get("title"),
            "name": (c.get("node") or {}).get("name"),
            "relationship": c.get("relationship", ""),
        }
        for c in connections
    ]
    return {
        "focus": {"uid": node_uid, "type": "", "title": "", "name": ""},
        "related": related,
    }


def _skills_for_experience_widget_payload(
    raw: list | dict, *, experience_uid: str
) -> dict:
    """Shape get_skills_for_experience output for the widget.

    Tool returns a bare ``list[dict]`` of skills. Widget expects
    ``{experience, skills}``. Experience metadata isn't in the tool
    response; we synthesize a minimal envelope from the input uid.
    """
    if (
        isinstance(raw, list)
        and len(raw) == 1
        and isinstance(raw[0], dict)
        and "error" in raw[0]
    ):
        return raw[0]
    return {
        "experience": {"uid": experience_uid, "title": "", "start_date": None},
        "skills": list(raw) if isinstance(raw, list) else [],
    }


def _build_transport_security() -> TransportSecuritySettings:
    """DNS rebinding protection allowlist.

    FastMCP auto-enables host validation for localhost and blocks every
    other Host header, so in production the public domain must be added
    here explicitly — otherwise every authenticated MCP call from
    ChatGPT / Claude / Cursor gets 421 "Invalid Host header".

    Parsed from settings.cloud_run_url (set on the orbis-mcp Cloud Run
    service, e.g. https://mcp.open-orbis.com). Localhost entries stay in
    the list so dev still works after flipping the env var.
    """
    allowed_hosts: list[str] = [
        "127.0.0.1:*",
        "localhost:*",
        "[::1]:*",
    ]
    allowed_origins: list[str] = [
        "http://127.0.0.1:*",
        "http://localhost:*",
        "http://[::1]:*",
    ]
    if settings.cloud_run_url:
        # cloud_run_url is e.g. "https://mcp.open-orbis.com". Extract the
        # bare host (no scheme, no trailing slash) for allowed_hosts, and
        # keep the full origin in allowed_origins.
        from urllib.parse import urlparse

        parsed = urlparse(settings.cloud_run_url.rstrip("/"))
        if parsed.hostname:
            allowed_hosts.append(parsed.hostname)
            allowed_hosts.append(f"{parsed.hostname}:*")
        allowed_origins.append(f"{parsed.scheme}://{parsed.netloc}")
    return TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=allowed_hosts,
        allowed_origins=allowed_origins,
    )


mcp = FastMCP(
    "Orbis",
    instructions="Query professional knowledge graphs (orbs) from Orbis.",
    transport_security=_build_transport_security(),
)


def _register_widget_resources() -> None:
    """Register each widget as an MCP-App HTML resource.

    ChatGPT reads these via resources/read to get the HTML shell that
    loads the actual widget bundle from open-orbis.com. Each resource
    is static per-deploy — no per-request data.

    Two Apps-SDK-specific conventions (see docs/chatgpt-apps/apps-sdk-verified.md):
    - MIME type is "text/html;profile=mcp-app" so ChatGPT treats the
      response as a widget shell rather than plain HTML.
    - ``meta={"ui": {"csp": {...}}}`` lists the external hosts the iframe
      is allowed to reach. Without ``open-orbis.com`` in ``resourceDomains``,
      the bundle <script src> is blocked by ChatGPT's iframe CSP.
    """
    # CSP applied uniformly to all 5 widgets — they all load a bundle
    # from the public frontend host. connectDomains stays empty because
    # widgets never fetch beyond the tool response they already receive.
    csp_meta = {
        "ui": {
            "csp": {
                "connectDomains": [],
                "resourceDomains": [settings.frontend_url.rstrip("/")],
                "frameDomains": [],
            },
        },
    }

    def _make_shell_fn(name: str):
        # Factory closure: FastMCP validates that the resource function's
        # signature matches the URI template. Since our URIs have no
        # template variables, the resource fn must take zero args — so
        # we capture ``name`` in an outer factory rather than as a
        # default arg on the inner function.
        def _widget_shell() -> str:
            return build_html_shell(name)

        return _widget_shell

    for widget_name, meta in WIDGET_REGISTRY.items():
        uri = f"ui://widget/{widget_name}"
        mcp.resource(
            uri,
            name=meta.name,
            title=meta.title,
            mime_type="text/html;profile=mcp-app",
            meta=csp_meta,
        )(_make_shell_fn(widget_name))


_register_widget_resources()

_driver = None


async def _get_driver():
    global _driver
    if _driver is None:
        _driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )
    return _driver


async def _resolve_scope(orb_id_arg: str, token_arg: str) -> tuple[str, str]:
    """Return the effective (orb_id, token) for this tool invocation.

    - Share-token mode: the share context set by APIKeyMiddleware is
      authoritative. `orb_id_arg` is ignored from the LLM's perspective;
      we pass the share token's id back through as `token` so the
      existing filter code in `tools.py` treats the request uniformly.
    - Full-access mode (user API key or full-mode OAuth grant): if the
      LLM didn't provide an orb_id (or passed "me"/"self"), look up the
      authenticated caller's own orb_id from Neo4j (user_id and orb_id
      are distinct fields on the Person node — the tool layer queries
      by orb_id, not user_id, so the conversion happens here).
    - Anonymous (shouldn't happen — middleware blocks): pass through.
    """
    from mcp_server.auth import get_current_user_id, get_share_context

    ctx = get_share_context()
    if ctx is not None:
        if orb_id_arg and orb_id_arg != ctx.orb_id:
            # Hash the token_id so the bearer credential never appears in
            # application logs. Orb ids are identifiers without access
            # capability on their own, so they're safe to log.
            token_hint = hashlib.sha256(ctx.token_id.encode()).hexdigest()[:12]
            logger.warning(
                "Share-scoped MCP call with mismatched orb_id: "
                "requested=%s scoped=%s token=sha256:%s…",
                orb_id_arg,
                ctx.orb_id,
                token_hint,
            )
        return ctx.orb_id, ctx.token_id

    if not orb_id_arg or orb_id_arg.lower() in ("me", "self", "own"):
        caller_id = get_current_user_id()
        if caller_id is not None:
            driver = await _get_driver()
            async with driver.session() as session:
                result = await session.run(
                    "MATCH (p:Person {user_id: $user_id}) RETURN p.orb_id AS orb_id",
                    user_id=caller_id,
                )
                record = await result.single()
            if record and record["orb_id"]:
                return record["orb_id"], token_arg

    return orb_id_arg, token_arg


def _build_starlette_app():
    """Return the FastMCP Starlette app wrapped with auth + rate limit."""
    from starlette.responses import JSONResponse
    from starlette.routing import Route

    from mcp_server.rate_limit import RateLimitMiddleware

    async def oauth_protected_resource(request):
        # MCP resource URL: use settings if in Cloud Run, else a dev default.
        resource_url = (
            f"{settings.cloud_run_url}/mcp"
            if settings.cloud_run_url
            else "http://localhost:8081/mcp"
        )
        return JSONResponse(
            {
                "resource": resource_url,
                "authorization_servers": [settings.frontend_url.rstrip("/")],
            }
        )

    app = mcp.streamable_http_app()
    app.routes.append(
        Route(
            "/.well-known/oauth-protected-resource",
            oauth_protected_resource,
            methods=["GET"],
        )
    )
    # Order matters: APIKeyMiddleware sets ContextVars that
    # RateLimitMiddleware reads. Starlette runs middleware in reverse
    # registration order (last added runs first), so we add
    # RateLimitMiddleware FIRST so APIKeyMiddleware runs first per request.
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(APIKeyMiddleware, driver_factory=_get_driver)
    return app


@mcp.tool()
async def orbis_get_summary(orb_id: str = "", token: str = "") -> CallToolResult:
    """Get a summary of a person's professional profile (name, headline, location, and counts of each node type). Leave ``orb_id`` empty (or pass ``"me"``) to query the authenticated caller's own Orbis. Leave ``token`` empty when you already have full access."""
    orb_id, token = await _resolve_scope(orb_id, token)
    driver = await _get_driver()
    payload = await get_orb_summary(driver, orb_id, token)
    return wrap_tool_response(payload=payload, widget_name="summary")


@mcp.tool()
async def orbis_get_full_orb(orb_id: str = "", token: str = "") -> CallToolResult:
    """Get the complete graph data for a person's Orbis. Leave ``orb_id`` empty (or pass ``"me"``) to query the authenticated caller's own Orbis. Results are filtered by the share token's privacy settings when a token is supplied."""
    orb_id, token = await _resolve_scope(orb_id, token)
    driver = await _get_driver()
    raw = await get_orb_full(driver, orb_id, token)
    return wrap_tool_response(
        payload=raw,
        widget_payload=_full_orb_widget_payload(raw),
        widget_name="full-orb",
    )


@mcp.tool()
async def orbis_get_nodes_by_type(
    node_type: str, orb_id: str = "", token: str = ""
) -> CallToolResult:
    """Get all nodes of a specific type from an Orbis. Leave ``orb_id`` empty (or pass ``"me"``) to query the authenticated caller's own Orbis. Valid ``node_type`` values: education, work_experience, certification, language, publication, project, skill, patent, award, outreach, training."""
    orb_id, token = await _resolve_scope(orb_id, token)
    driver = await _get_driver()
    raw = await get_nodes_by_type(driver, orb_id, node_type, token)
    return wrap_tool_response(
        payload=raw,
        widget_payload=_nodes_widget_payload(raw, node_type=node_type),
        widget_name="nodes",
    )


@mcp.tool()
async def orbis_get_connections(
    node_uid: str, orb_id: str = "", token: str = ""
) -> CallToolResult:
    """Get all relationships and connected nodes for a specific node identified by its uid. Leave ``orb_id`` empty (or pass ``"me"``) to query the authenticated caller's own Orbis."""
    orb_id, token = await _resolve_scope(orb_id, token)
    driver = await _get_driver()
    raw = await get_connections(driver, orb_id, node_uid, token)
    return wrap_tool_response(
        payload=raw,
        widget_payload=_connections_widget_payload(raw, node_uid=node_uid),
        widget_name="connections",
    )


@mcp.tool()
async def orbis_get_skills_for_experience(
    experience_uid: str, orb_id: str = "", token: str = ""
) -> CallToolResult:
    """Get all skills that were used in a specific work experience or project, identified by the experience's uid. Leave ``orb_id`` empty (or pass ``"me"``) to query the authenticated caller's own Orbis."""
    orb_id, token = await _resolve_scope(orb_id, token)
    driver = await _get_driver()
    raw = await get_skills_for_experience(driver, orb_id, experience_uid, token)
    return wrap_tool_response(
        payload=raw,
        widget_payload=_skills_for_experience_widget_payload(
            raw, experience_uid=experience_uid
        ),
        widget_name="skills-for-experience",
    )


if __name__ == "__main__":
    # Serve the middleware-wrapped app directly via uvicorn so the auth
    # layer runs on every request. mcp.run(transport="streamable-http")
    # would bypass our add_middleware() call.
    import os

    import uvicorn

    uvicorn.run(
        _build_starlette_app(),
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "8080")),
    )
