"""Orbis MCP Server — exposes orb data via MCP tools."""

from __future__ import annotations

from mcp.server.fastmcp import FastMCP
from neo4j import AsyncGraphDatabase

from app.config import settings
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


@mcp.tool()
async def orbis_get_summary(orb_id: str) -> dict:
    """Get a summary of a person's professional profile including name, headline, location, and counts of each node type (education, work, skills, etc.)."""
    driver = await _get_driver()
    return await get_orb_summary(driver, orb_id)


@mcp.tool()
async def orbis_get_full_orb(orb_id: str) -> dict:
    """Get the complete graph data for a person's orb, including all nodes (education, work experience, skills, publications, projects, certifications, languages, collaborators) and their properties."""
    driver = await _get_driver()
    return await get_orb_full(driver, orb_id)


@mcp.tool()
async def orbis_get_nodes_by_type(orb_id: str, node_type: str) -> list[dict]:
    """Get all nodes of a specific type from an orb. Valid node_types: education, work_experience, certification, language, publication, project, skill, collaborator."""
    driver = await _get_driver()
    return await get_nodes_by_type(driver, orb_id, node_type)


@mcp.tool()
async def orbis_get_connections(orb_id: str, node_uid: str) -> dict:
    """Get all relationships and connected nodes for a specific node identified by its uid."""
    driver = await _get_driver()
    return await get_connections(driver, orb_id, node_uid)


@mcp.tool()
async def orbis_get_skills_for_experience(
    orb_id: str, experience_uid: str
) -> list[dict]:
    """Get all skills that were used in a specific work experience or project, identified by the experience's uid."""
    driver = await _get_driver()
    return await get_skills_for_experience(driver, orb_id, experience_uid)


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
