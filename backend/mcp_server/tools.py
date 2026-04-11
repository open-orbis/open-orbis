"""MCP tool definitions for querying Orbis orbs."""

from __future__ import annotations

from neo4j import AsyncDriver

from app.graph.encryption import decrypt_properties
from app.graph.queries import (
    GET_FULL_ORB_PUBLIC,
    GET_PERSON_VISIBILITY,
    NODE_TYPE_LABELS,
    NODE_TYPE_RELATIONSHIPS,
)


async def _check_visibility(driver: AsyncDriver, orb_id: str) -> dict | None:
    """Return an error dict if the orb is not publicly accessible, else ``None``.

    The MCP server is anonymous (no user context), so it can only serve
    ``public`` orbs. ``private`` and ``restricted`` orbs are rejected
    with a generic message that doesn't leak which mode is in use.
    """
    async with driver.session() as session:
        result = await session.run(GET_PERSON_VISIBILITY, orb_id=orb_id)
        record = await result.single()
    if record is None:
        return {"error": f"Orb '{orb_id}' not found"}
    if record["visibility"] != "public":
        return {"error": f"Orb '{orb_id}' is not publicly accessible"}
    return None


async def get_orb_summary(driver: AsyncDriver, orb_id: str) -> dict:
    """Get a structured summary of a person's professional profile."""
    blocked = await _check_visibility(driver, orb_id)
    if blocked is not None:
        return blocked
    async with driver.session() as session:
        result = await session.run(GET_FULL_ORB_PUBLIC, orb_id=orb_id)
        record = await result.single()
        if record is None:
            return {"error": f"Orb '{orb_id}' not found"}

        person = decrypt_properties(dict(record["p"]))
        person.pop("user_id", None)
        person.pop("encryption_key_id", None)
        person.pop("embedding", None)

        # Count nodes by type
        type_counts: dict[str, int] = {}
        for conn in record["connections"]:
            if conn["node"] is None:
                continue
            labels = list(conn["node"].labels)
            label = labels[0] if labels else "Unknown"
            type_counts[label] = type_counts.get(label, 0) + 1

        return {
            "name": person.get("name", ""),
            "headline": person.get("headline", ""),
            "location": person.get("location", ""),
            "orb_id": orb_id,
            "open_to_work": person.get("open_to_work", False),
            "node_counts": type_counts,
            "total_nodes": sum(type_counts.values()),
        }


async def get_orb_full(driver: AsyncDriver, orb_id: str) -> dict:
    """Get the complete graph data for an orb."""
    blocked = await _check_visibility(driver, orb_id)
    if blocked is not None:
        return blocked
    async with driver.session() as session:
        result = await session.run(GET_FULL_ORB_PUBLIC, orb_id=orb_id)
        record = await result.single()
        if record is None:
            return {"error": f"Orb '{orb_id}' not found"}

        person = decrypt_properties(dict(record["p"]))
        person.pop("user_id", None)
        person.pop("encryption_key_id", None)

        nodes = []
        for conn in record["connections"]:
            if conn["node"] is None:
                continue
            node = decrypt_properties(dict(conn["node"]))
            node.pop("embedding", None)
            node["_type"] = list(conn["node"].labels)[0]
            node["_relationship"] = conn["rel"]
            nodes.append(node)

        return {"person": person, "nodes": nodes}


async def get_nodes_by_type(
    driver: AsyncDriver, orb_id: str, node_type: str
) -> list[dict]:
    """Get all nodes of a specific type from an orb."""
    if node_type not in NODE_TYPE_LABELS:
        return [
            {
                "error": f"Invalid node type: {node_type}. Valid types: {list(NODE_TYPE_LABELS.keys())}"
            }
        ]

    blocked = await _check_visibility(driver, orb_id)
    if blocked is not None:
        return [blocked]

    label = NODE_TYPE_LABELS[node_type]
    rel_type = NODE_TYPE_RELATIONSHIPS[node_type]

    query = f"""
    MATCH (p:Person {{orb_id: $orb_id}})-[:{rel_type}]->(n:{label})
    RETURN n
    """

    async with driver.session() as session:
        result = await session.run(query, orb_id=orb_id)
        nodes = []
        async for record in result:
            node = decrypt_properties(dict(record["n"]))
            node.pop("embedding", None)
            nodes.append(node)
        return nodes


async def get_connections(driver: AsyncDriver, orb_id: str, node_uid: str) -> dict:
    """Get all relationships for a specific node."""
    blocked = await _check_visibility(driver, orb_id)
    if blocked is not None:
        return blocked
    query = """
    MATCH (n {uid: $node_uid})-[r]-(connected)
    MATCH (p:Person {orb_id: $orb_id})-[*1..2]-(n)
    RETURN n, type(r) AS rel_type, connected, labels(connected) AS connected_labels
    """

    async with driver.session() as session:
        result = await session.run(query, orb_id=orb_id, node_uid=node_uid)
        connections = []
        async for record in result:
            conn_node = decrypt_properties(dict(record["connected"]))
            conn_node.pop("embedding", None)
            conn_node["_labels"] = record["connected_labels"]
            connections.append(
                {
                    "relationship": record["rel_type"],
                    "node": conn_node,
                }
            )
        return {"node_uid": node_uid, "connections": connections}


async def get_skills_for_experience(
    driver: AsyncDriver, orb_id: str, experience_uid: str
) -> list[dict]:
    """Get skills associated with a specific work experience or project."""
    blocked = await _check_visibility(driver, orb_id)
    if blocked is not None:
        return [blocked]
    query = """
    MATCH (p:Person {orb_id: $orb_id})-[]->(exp {uid: $experience_uid})
    MATCH (exp)-[:USED_SKILL]->(s:Skill)
    RETURN s
    """

    async with driver.session() as session:
        result = await session.run(query, orb_id=orb_id, experience_uid=experience_uid)
        skills = []
        async for record in result:
            skill = dict(record["s"])
            skill.pop("embedding", None)
            skills.append(skill)
        return skills
