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
async def orbis_get_summary(orb_id: str, filter_token: str | None = None) -> dict:
    """Get a summary of a person's professional profile including name, headline, location, and counts of each node type (education, work, skills, etc.).

    If a filter_token is provided, nodes matching the filter keywords will be excluded from counts.
    """
    driver = await _get_driver()
    return await get_orb_summary(driver, orb_id, filter_token)


@mcp.tool()
async def orbis_get_full_orb(orb_id: str, filter_token: str | None = None) -> dict:
    """Get the complete graph data for a person's orb, including all nodes and their properties.

    If a filter_token is provided, matching nodes will be omitted from the results.
    """
    driver = await _get_driver()
    return await get_orb_full(driver, orb_id, filter_token)


@mcp.tool()
async def orbis_get_nodes_by_type(
    orb_id: str, node_type: str, filter_token: str | None = None
) -> list[dict]:
    """Get all nodes of a specific type from an orb. Valid node_types: education, work_experience, certification, language, publication, project, skill, collaborator.

    If a filter_token is provided, matching nodes will be omitted.
    """
    driver = await _get_driver()
    return await get_nodes_by_type(driver, orb_id, node_type, filter_token)


@mcp.tool()
async def orbis_get_connections(
    orb_id: str, node_uid: str, filter_token: str | None = None
) -> dict:
    """Get all relationships and connected nodes for a specific node identified by its uid.

    If a filter_token is provided, connected nodes matching the filters will be omitted.
    """
    driver = await _get_driver()
    return await get_connections(driver, orb_id, node_uid, filter_token)


@mcp.tool()
async def orbis_get_skills_for_experience(
    orb_id: str, experience_uid: str, filter_token: str | None = None
) -> list[dict]:
    """Get all skills that were used in a specific work experience or project, identified by the experience's uid.

    If a filter_token is provided, matching skills will be omitted.
    """
    driver = await _get_driver()
    return await get_skills_for_experience(driver, orb_id, experience_uid, filter_token)


@mcp.tool()
async def orbis_send_message(
    orb_id: str,
    sender_name: str,
    sender_email: str,
    subject: str,
    body: str,
) -> dict:
    """Send a message to an orb owner. Use this to contact a professional whose orb you've been exploring. The message will appear in their inbox."""
    import uuid

    driver = await _get_driver()
    message_uid = str(uuid.uuid4())
    async with driver.session() as session:
        result = await session.run(
            """
            MATCH (p:Person {orb_id: $orb_id})
            CREATE (p)-[:HAS_MESSAGE]->(m:Message {
                uid: $uid,
                sender_name: $sender_name,
                sender_email: $sender_email,
                subject: $subject,
                body: $body,
                created_at: datetime(),
                read: false
            })
            RETURN m.uid AS uid
            """,
            orb_id=orb_id,
            uid=message_uid,
            sender_name=sender_name,
            sender_email=sender_email,
            subject=subject,
            body=body,
        )
        record = await result.single()
        if record is None:
            return {"error": f"Orb '{orb_id}' not found"}
    return {"uid": message_uid, "detail": "Message sent successfully"}


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
