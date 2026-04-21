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

mcp = FastMCP(
    "Orbis", instructions="Query professional knowledge graphs (orbs) from Orbis."
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

    - User-key mode: both args pass through unchanged (today's behavior).
    - Share-token mode: the share context set by APIKeyMiddleware is
      authoritative. `orb_id_arg` is ignored from the LLM's perspective;
      we pass the share token's id back through as `token` so the
      existing filter code in `tools.py` treats the request uniformly.
    """
    from mcp_server.auth import get_share_context

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
    return orb_id_arg, token_arg


def _build_starlette_app():
    """Return the FastMCP Starlette app wrapped with auth + rate limit."""
    from mcp_server.rate_limit import RateLimitMiddleware

    app = mcp.streamable_http_app()
    # Order matters: APIKeyMiddleware sets ContextVars that
    # RateLimitMiddleware reads. Starlette runs middleware in reverse
    # registration order (last added runs first), so we add
    # RateLimitMiddleware FIRST so APIKeyMiddleware runs first per request.
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(APIKeyMiddleware, driver_factory=_get_driver)
    return app


@mcp.tool()
async def orbis_get_summary(orb_id: str, token: str = "") -> dict:
    """Get a summary of a person's professional profile including name, headline, location, and counts of each node type. Leave ``token`` empty when querying an orb you own."""
    orb_id, token = _resolve_scope(orb_id, token)
    driver = await _get_driver()
    return await get_orb_summary(driver, orb_id, token)


@mcp.tool()
async def orbis_get_full_orb(orb_id: str, token: str = "") -> dict:
    """Get the complete graph data for a person's orb, filtered according to the share token's privacy settings when a token is supplied."""
    orb_id, token = _resolve_scope(orb_id, token)
    driver = await _get_driver()
    return await get_orb_full(driver, orb_id, token)


@mcp.tool()
async def orbis_get_nodes_by_type(
    orb_id: str, node_type: str, token: str = ""
) -> list[dict]:
    """Get all nodes of a specific type from an orb. Valid node_types: education, work_experience, certification, language, publication, project, skill, patent, award, outreach, training."""
    orb_id, token = _resolve_scope(orb_id, token)
    driver = await _get_driver()
    return await get_nodes_by_type(driver, orb_id, node_type, token)


@mcp.tool()
async def orbis_get_connections(orb_id: str, node_uid: str, token: str = "") -> dict:
    """Get all relationships and connected nodes for a specific node identified by its uid."""
    orb_id, token = _resolve_scope(orb_id, token)
    driver = await _get_driver()
    return await get_connections(driver, orb_id, node_uid, token)


@mcp.tool()
async def orbis_get_skills_for_experience(
    orb_id: str, experience_uid: str, token: str = ""
) -> list[dict]:
    """Get all skills that were used in a specific work experience or project, identified by the experience's uid."""
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
