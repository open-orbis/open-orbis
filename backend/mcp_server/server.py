"""Orbis MCP Server — exposes orb data via MCP tools.

Every request to the streamable-http transport is authenticated via an
``X-MCP-Key`` header resolved by ``mcp_server.auth.APIKeyMiddleware``.
Tools then see the caller's user_id via a ContextVar and can serve
either that user's own orb or any public orb.
"""

from __future__ import annotations

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


def _build_starlette_app():
    """Return the FastMCP Starlette app wrapped with the API key middleware.

    Called from ``if __name__ == "__main__"`` below and from tests that
    need to exercise the middleware without touching mcp.run().
    """
    app = mcp.streamable_http_app()
    app.add_middleware(APIKeyMiddleware, driver_factory=_get_driver)
    return app


@mcp.tool()
async def orbis_get_summary(orb_id: str, token: str = "") -> dict:
    """Get a summary of a person's professional profile including name, headline, location, and counts of each node type. Leave ``token`` empty when querying an orb you own."""
    driver = await _get_driver()
    return await get_orb_summary(driver, orb_id, token)


@mcp.tool()
async def orbis_get_full_orb(orb_id: str, token: str = "") -> dict:
    """Get the complete graph data for a person's orb, filtered according to the share token's privacy settings when a token is supplied."""
    driver = await _get_driver()
    return await get_orb_full(driver, orb_id, token)


@mcp.tool()
async def orbis_get_nodes_by_type(
    orb_id: str, node_type: str, token: str = ""
) -> list[dict]:
    """Get all nodes of a specific type from an orb. Valid node_types: education, work_experience, certification, language, publication, project, skill, collaborator."""
    driver = await _get_driver()
    return await get_nodes_by_type(driver, orb_id, node_type, token)


@mcp.tool()
async def orbis_get_connections(orb_id: str, node_uid: str, token: str = "") -> dict:
    """Get all relationships and connected nodes for a specific node identified by its uid."""
    driver = await _get_driver()
    return await get_connections(driver, orb_id, node_uid, token)


@mcp.tool()
async def orbis_get_skills_for_experience(
    orb_id: str, experience_uid: str, token: str = ""
) -> list[dict]:
    """Get all skills that were used in a specific work experience or project, identified by the experience's uid."""
    driver = await _get_driver()
    return await get_skills_for_experience(driver, orb_id, experience_uid, token)


if __name__ == "__main__":
    # Serve the middleware-wrapped app directly via uvicorn so the auth
    # layer runs on every request. mcp.run(transport="streamable-http")
    # would bypass our add_middleware() call.
    import uvicorn

    uvicorn.run(
        _build_starlette_app(),
        host=mcp.settings.host,
        port=mcp.settings.port,
    )
