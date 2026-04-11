"""MCP tool definitions for querying Orbis orbs."""

from __future__ import annotations

from neo4j import AsyncDriver

from app.graph.encryption import decrypt_properties
from app.graph.queries import (
    GET_FULL_ORB_PUBLIC,
    NODE_TYPE_LABELS,
    NODE_TYPE_RELATIONSHIPS,
)
from app.orbs.share_token import node_matches_filters, validate_share_token


async def _validate_access(driver: AsyncDriver, orb_id: str, token: str) -> dict | None:
    """Validate a share token and return filter config, or an error dict.

    Returns ``{"keywords": [...], "hidden_node_types": [...]}`` on success,
    or ``{"error": "..."}`` on failure.
    """
    if not token:
        return {"error": "A share token is required to access this orb via MCP."}

    token_data = await validate_share_token(driver, token)
    if token_data is None:
        return {"error": "Invalid or expired share token."}
    if token_data["orb_id"] != orb_id:
        return {"error": "Token does not grant access to this orb."}

    return {
        "keywords": token_data.get("keywords", []),
        "hidden_node_types": token_data.get("hidden_node_types", []),
    }


def _apply_filters(
    nodes: list[dict],
    keywords: list[str],
    hidden_node_types: list[str],
) -> list[dict]:
    """Filter out nodes matching keywords or hidden types."""
    if not keywords and not hidden_node_types:
        return nodes
    hidden_set = set(hidden_node_types)
    filtered = []
    for node in nodes:
        labels = set(node.get("_labels", []) or [node.get("_type", "")])
        if hidden_set and labels & hidden_set:
            continue
        if keywords and node_matches_filters(node, keywords):
            continue
        filtered.append(node)
    return filtered


async def get_orb_summary(driver: AsyncDriver, orb_id: str, token: str) -> dict:
    """Get a structured summary of a person's professional profile."""
    access = await _validate_access(driver, orb_id, token)
    if "error" in access:
        return access

    async with driver.session() as session:
        result = await session.run(GET_FULL_ORB_PUBLIC, orb_id=orb_id)
        record = await result.single()
        if record is None:
            return {"error": f"Orb '{orb_id}' not found"}

        person = decrypt_properties(dict(record["p"]))
        person.pop("user_id", None)
        person.pop("encryption_key_id", None)
        person.pop("embedding", None)

        keywords = access["keywords"]
        hidden_types = access["hidden_node_types"]

        # Count nodes by type, respecting filters
        type_counts: dict[str, int] = {}
        for conn in record["connections"]:
            if conn["node"] is None:
                continue
            node = decrypt_properties(dict(conn["node"]))
            labels = list(conn["node"].labels)
            label = labels[0] if labels else "Unknown"

            # Apply filters
            if label in hidden_types:
                continue
            if keywords and node_matches_filters(node, keywords):
                continue

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


async def get_orb_full(driver: AsyncDriver, orb_id: str, token: str) -> dict:
    """Get the complete graph data for an orb."""
    access = await _validate_access(driver, orb_id, token)
    if "error" in access:
        return access

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

        nodes = _apply_filters(nodes, access["keywords"], access["hidden_node_types"])

        return {"person": person, "nodes": nodes}


async def get_nodes_by_type(
    driver: AsyncDriver, orb_id: str, node_type: str, token: str
) -> list[dict]:
    """Get all nodes of a specific type from an orb."""
    if node_type not in NODE_TYPE_LABELS:
        return [
            {
                "error": f"Invalid node type: {node_type}. Valid types: {list(NODE_TYPE_LABELS.keys())}"
            }
        ]

    access = await _validate_access(driver, orb_id, token)
    if "error" in access:
        return [access]

    # Block if this node type is hidden
    label = NODE_TYPE_LABELS[node_type]
    if label in access.get("hidden_node_types", []):
        return []

    rel_type = NODE_TYPE_RELATIONSHIPS[node_type]

    query = f"""
    MATCH (p:Person {{orb_id: $orb_id}})-[:{rel_type}]->(n:{label})
    RETURN n
    """

    keywords = access["keywords"]
    async with driver.session() as session:
        result = await session.run(query, orb_id=orb_id)
        nodes = []
        async for record in result:
            node = decrypt_properties(dict(record["n"]))
            node.pop("embedding", None)
            if keywords and node_matches_filters(node, keywords):
                continue
            nodes.append(node)
        return nodes


async def get_connections(
    driver: AsyncDriver, orb_id: str, node_uid: str, token: str
) -> dict:
    """Get all relationships for a specific node."""
    access = await _validate_access(driver, orb_id, token)
    if "error" in access:
        return access

    query = """
    MATCH (n {uid: $node_uid})-[r]-(connected)
    MATCH (p:Person {orb_id: $orb_id})-[*1..2]-(n)
    RETURN n, type(r) AS rel_type, connected, labels(connected) AS connected_labels
    """

    keywords = access["keywords"]
    hidden_types = set(access["hidden_node_types"])

    async with driver.session() as session:
        result = await session.run(query, orb_id=orb_id, node_uid=node_uid)
        connections = []
        async for record in result:
            conn_labels = set(record["connected_labels"])
            if hidden_types and conn_labels & hidden_types:
                continue
            conn_node = decrypt_properties(dict(record["connected"]))
            conn_node.pop("embedding", None)
            if keywords and node_matches_filters(conn_node, keywords):
                continue
            conn_node["_labels"] = record["connected_labels"]
            connections.append(
                {
                    "relationship": record["rel_type"],
                    "node": conn_node,
                }
            )
        return {"node_uid": node_uid, "connections": connections}


async def get_skills_for_experience(
    driver: AsyncDriver, orb_id: str, experience_uid: str, token: str
) -> list[dict]:
    """Get skills associated with a specific work experience or project."""
    access = await _validate_access(driver, orb_id, token)
    if "error" in access:
        return [access]

    # If Skill type is hidden, return empty
    if "Skill" in access.get("hidden_node_types", []):
        return []

    query = """
    MATCH (p:Person {orb_id: $orb_id})-[]->(exp {uid: $experience_uid})
    MATCH (exp)-[:USED_SKILL]->(s:Skill)
    RETURN s
    """

    keywords = access["keywords"]
    async with driver.session() as session:
        result = await session.run(query, orb_id=orb_id, experience_uid=experience_uid)
        skills = []
        async for record in result:
            skill = dict(record["s"])
            skill.pop("embedding", None)
            if keywords and node_matches_filters(skill, keywords):
                continue
            skills.append(skill)
        return skills
