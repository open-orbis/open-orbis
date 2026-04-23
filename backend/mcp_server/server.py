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
from neo4j import AsyncGraphDatabase

from app.config import settings
from mcp_server.auth import APIKeyMiddleware
from mcp_server.tools import (
    get_connections,
    get_nodes_by_type,
    get_orb_full,
    get_orb_summary,
    get_skills_for_experience,
)

logger = logging.getLogger(__name__)


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

_driver = None


async def _get_driver():
    global _driver
    if _driver is None:
        _driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )
    return _driver


def _resolve_scope(orb_id_arg: str, token_arg: str) -> tuple[str, str]:
    """Return the effective (orb_id, token) for this tool invocation.

    - Share-token mode: the share context set by APIKeyMiddleware is
      authoritative. `orb_id_arg` is ignored from the LLM's perspective;
      we pass the share token's id back through as `token` so the
      existing filter code in `tools.py` treats the request uniformly.
    - Full-access mode (user API key or full-mode OAuth grant): if the
      LLM didn't provide an orb_id (or passed "me"/"self"), resolve to
      the authenticated caller's own orb. Otherwise pass through — the
      tool layer enforces visibility against public orbs.
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

    # Full-access mode: an empty or "me"/"self" orb_id resolves to the
    # authenticated caller's own orb. A Person's user_id is the orb id
    # for that person's own Orbis graph (1-1), so get_current_user_id()
    # is exactly what tools expect as orb_id.
    if not orb_id_arg or orb_id_arg.lower() in ("me", "self", "own"):
        caller_id = get_current_user_id()
        if caller_id is not None:
            return caller_id, token_arg

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
async def orbis_get_summary(orb_id: str = "", token: str = "") -> dict:
    """Get a summary of a person's professional profile (name, headline, location, and counts of each node type). Leave ``orb_id`` empty (or pass ``"me"``) to query the authenticated caller's own Orbis. Leave ``token`` empty when you already have full access."""
    orb_id, token = _resolve_scope(orb_id, token)
    driver = await _get_driver()
    return await get_orb_summary(driver, orb_id, token)


@mcp.tool()
async def orbis_get_full_orb(orb_id: str = "", token: str = "") -> dict:
    """Get the complete graph data for a person's Orbis. Leave ``orb_id`` empty (or pass ``"me"``) to query the authenticated caller's own Orbis. Results are filtered by the share token's privacy settings when a token is supplied."""
    orb_id, token = _resolve_scope(orb_id, token)
    driver = await _get_driver()
    return await get_orb_full(driver, orb_id, token)


@mcp.tool()
async def orbis_get_nodes_by_type(
    node_type: str, orb_id: str = "", token: str = ""
) -> list[dict]:
    """Get all nodes of a specific type from an Orbis. Leave ``orb_id`` empty (or pass ``"me"``) to query the authenticated caller's own Orbis. Valid ``node_type`` values: education, work_experience, certification, language, publication, project, skill, patent, award, outreach, training."""
    orb_id, token = _resolve_scope(orb_id, token)
    driver = await _get_driver()
    return await get_nodes_by_type(driver, orb_id, node_type, token)


@mcp.tool()
async def orbis_get_connections(
    node_uid: str, orb_id: str = "", token: str = ""
) -> dict:
    """Get all relationships and connected nodes for a specific node identified by its uid. Leave ``orb_id`` empty (or pass ``"me"``) to query the authenticated caller's own Orbis."""
    orb_id, token = _resolve_scope(orb_id, token)
    driver = await _get_driver()
    return await get_connections(driver, orb_id, node_uid, token)


@mcp.tool()
async def orbis_get_skills_for_experience(
    experience_uid: str, orb_id: str = "", token: str = ""
) -> list[dict]:
    """Get all skills that were used in a specific work experience or project, identified by the experience's uid. Leave ``orb_id`` empty (or pass ``"me"``) to query the authenticated caller's own Orbis."""
    orb_id, token = _resolve_scope(orb_id, token)
    driver = await _get_driver()
    return await get_skills_for_experience(driver, orb_id, experience_uid, token)


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
