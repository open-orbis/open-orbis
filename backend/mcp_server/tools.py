"""MCP tool definitions for querying Orbis orbs."""

from __future__ import annotations

from neo4j import AsyncDriver

from app.graph.encryption import decrypt_properties
from app.graph.queries import (
    GET_FULL_ORB_PUBLIC,
    NODE_TYPE_LABELS,
    NODE_TYPE_RELATIONSHIPS,
)
from app.orbs.filter_token import decode_filter_token, node_matches_filters


async def get_orb_summary(
    driver: AsyncDriver, orb_id: str, filter_token: str | None = None
) -> dict:
    """Get a structured summary of a person's professional profile."""
    async with driver.session() as session:
        result = await session.run(GET_FULL_ORB_PUBLIC, orb_id=orb_id)
        record = await result.single()
        if record is None:
            return {"error": f"Orb '{orb_id}' not found"}

        person = decrypt_properties(dict(record["p"]))
        person.pop("user_id", None)
        person.pop("encryption_key_id", None)
        person.pop("embedding", None)

        # Get filter keywords if token is valid
        filters = []
        if filter_token:
            decoded = decode_filter_token(filter_token)
            if decoded and decoded["orb_id"] == orb_id:
                filters = decoded["filters"]

        # Count nodes by type
        type_counts: dict[str, int] = {}
        for conn in record["connections"]:
            if conn["node"] is None:
                continue

            node_data = decrypt_properties(dict(conn["node"]))
            if filters and node_matches_filters(node_data, filters):
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


async def get_orb_full(
    driver: AsyncDriver, orb_id: str, filter_token: str | None = None
) -> dict:
    """Get the complete graph data for an orb."""
    async with driver.session() as session:
        result = await session.run(GET_FULL_ORB_PUBLIC, orb_id=orb_id)
        record = await result.single()
        if record is None:
            return {"error": f"Orb '{orb_id}' not found"}

        person = decrypt_properties(dict(record["p"]))
        person.pop("user_id", None)
        person.pop("encryption_key_id", None)

        # Get filter keywords if token is valid
        filters = []
        if filter_token:
            decoded = decode_filter_token(filter_token)
            if decoded and decoded["orb_id"] == orb_id:
                filters = decoded["filters"]

        nodes = []
        for conn in record["connections"]:
            if conn["node"] is None:
                continue
            node = decrypt_properties(dict(conn["node"]))
            if filters and node_matches_filters(node, filters):
                continue

            node.pop("embedding", None)
            node["_type"] = list(conn["node"].labels)[0]
            node["_relationship"] = conn["rel"]
            nodes.append(node)

        return {"person": person, "nodes": nodes}


async def get_nodes_by_type(
    driver: AsyncDriver,
    orb_id: str,
    node_type: str,
    filter_token: str | None = None,
) -> list[dict]:
    """Get all nodes of a specific type from an orb."""
    if node_type not in NODE_TYPE_LABELS:
        return [
            {
                "error": f"Invalid node type: {node_type}. Valid types: {list(NODE_TYPE_LABELS.keys())}"
            }
        ]

    label = NODE_TYPE_LABELS[node_type]
    rel_type = NODE_TYPE_RELATIONSHIPS[node_type]

    # Get filter keywords if token is valid
    filters = []
    if filter_token:
        decoded = decode_filter_token(filter_token)
        if decoded and decoded["orb_id"] == orb_id:
            filters = decoded["filters"]

    query = f"""
    MATCH (p:Person {{orb_id: $orb_id}})-[:{rel_type}]->(n:{label})
    RETURN n
    """

    async with driver.session() as session:
        result = await session.run(query, orb_id=orb_id)
        nodes = []
        async for record in result:
            node = decrypt_properties(dict(record["n"]))
            if filters and node_matches_filters(node, filters):
                continue
            node.pop("embedding", None)
            nodes.append(node)
        return nodes


async def get_connections(
    driver: AsyncDriver, orb_id: str, node_uid: str, filter_token: str | None = None
) -> dict:
    """Get all relationships for a specific node."""
    # Get filter keywords if token is valid
    filters = []
    if filter_token:
        decoded = decode_filter_token(filter_token)
        if decoded and decoded["orb_id"] == orb_id:
            filters = decoded["filters"]

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

            # Filter out if the connected node matches filter keywords
            if filters and node_matches_filters(conn_node, filters):
                continue

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
    driver: AsyncDriver,
    orb_id: str,
    experience_uid: str,
    filter_token: str | None = None,
) -> list[dict]:
    """Get skills associated with a specific work experience or project."""
    # Get filter keywords if token is valid
    filters = []
    if filter_token:
        decoded = decode_filter_token(filter_token)
        if decoded and decoded["orb_id"] == orb_id:
            filters = decoded["filters"]

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
            if filters and node_matches_filters(skill, filters):
                continue
            skill.pop("embedding", None)
            skills.append(skill)
        return skills
