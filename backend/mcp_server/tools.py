"""MCP tool definitions for querying Orbis orbs.

Authentication is handled upstream by ``mcp_server.auth.APIKeyMiddleware``
which sets a ContextVar with the calling user_id. Authorization is
per-tool and has two modes:

1. **Owner bypass** — if the authenticated user owns the orb_id, the
   tool serves the data unfiltered. No share token needed. This is the
   "query my own private data from my own agent" case that was
   impossible before the API key layer.

2. **Share-token grant** — if the caller is not the owner, the orb must
   have a share token that was explicitly minted for it. The token
   carries keyword and hidden-type filters that are applied to the
   response. This is the model merged in from #251 and is the only way
   an agent can read a stranger's restricted orb.
"""

from __future__ import annotations

from neo4j import AsyncDriver

from app.graph.encryption import decrypt_properties
from app.graph.queries import (
    GET_FULL_ORB_PUBLIC,
    NODE_TYPE_LABELS,
    NODE_TYPE_RELATIONSHIPS,
)
from app.orbs.share_token import node_matches_filters, validate_share_token
from mcp_server.auth import get_current_user_id


async def _check_access(
    driver: AsyncDriver,
    orb_id: str,
    token: str,
) -> dict:
    """Return an access config dict or an error dict.

    Success shape: ``{"keywords": [...], "hidden_node_types": [...]}``.
    Failure shape: ``{"error": "<generic message>"}``.

    Error messages are deliberately generic so a caller can't distinguish
    "orb does not exist" from "orb exists but is private" — the MCP
    server must not become an orb enumeration oracle.
    """
    user_id = get_current_user_id()
    if user_id is None:
        return {"error": "authentication required"}

    async with driver.session() as session:
        result = await session.run(
            "MATCH (p:Person {orb_id: $orb_id}) RETURN p.user_id AS owner",
            orb_id=orb_id,
        )
        record = await result.single()

    if record is None:
        return {"error": f"Orb '{orb_id}' not accessible"}

    is_owner = record["owner"] == user_id

    # Token provided → always validate and apply its filters (even for owner).
    # The token encodes the privacy filters that were active when the MCP URI
    # was created, so filtered data must never leave Neo4j.
    if token:
        token_data = await validate_share_token(driver, token)
        if token_data is None or token_data["orb_id"] != orb_id:
            return {"error": f"Orb '{orb_id}' not accessible"}
        return {
            "keywords": token_data.get("keywords", []),
            "hidden_node_types": token_data.get("hidden_node_types", []),
        }

    # No token → owner can access unfiltered, strangers rejected.
    if is_owner:
        return {"keywords": [], "hidden_node_types": []}

    return {"error": f"Orb '{orb_id}' not accessible"}


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


async def get_orb_summary(driver: AsyncDriver, orb_id: str, token: str = "") -> dict:
    """Get a structured summary of a person's professional profile."""
    access = await _check_access(driver, orb_id, token)
    if "error" in access:
        return access

    async with driver.session() as session:
        result = await session.run(GET_FULL_ORB_PUBLIC, orb_id=orb_id)
        record = await result.single()
        if record is None:
            return {"error": f"Orb '{orb_id}' not accessible"}

        person = decrypt_properties(dict(record["p"]))
        person.pop("user_id", None)
        person.pop("encryption_key_id", None)
        person.pop("embedding", None)

        keywords = access["keywords"]
        hidden_types = access["hidden_node_types"]

        type_counts: dict[str, int] = {}
        for conn in record["connections"]:
            if conn["node"] is None:
                continue
            node = decrypt_properties(dict(conn["node"]))
            labels = list(conn["node"].labels)
            label = labels[0] if labels else "Unknown"

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


async def get_orb_full(driver: AsyncDriver, orb_id: str, token: str = "") -> dict:
    """Get the complete graph data for an orb."""
    access = await _check_access(driver, orb_id, token)
    if "error" in access:
        return access

    async with driver.session() as session:
        result = await session.run(GET_FULL_ORB_PUBLIC, orb_id=orb_id)
        record = await result.single()
        if record is None:
            return {"error": f"Orb '{orb_id}' not accessible"}

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
    driver: AsyncDriver, orb_id: str, node_type: str, token: str = ""
) -> list[dict]:
    """Get all nodes of a specific type from an orb."""
    if node_type not in NODE_TYPE_LABELS:
        return [
            {
                "error": f"Invalid node type: {node_type}. Valid types: {list(NODE_TYPE_LABELS.keys())}"
            }
        ]

    access = await _check_access(driver, orb_id, token)
    if "error" in access:
        return [access]

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
    driver: AsyncDriver, orb_id: str, node_uid: str, token: str = ""
) -> dict:
    """Get all relationships for a specific node."""
    access = await _check_access(driver, orb_id, token)
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
    driver: AsyncDriver, orb_id: str, experience_uid: str, token: str = ""
) -> list[dict]:
    """Get skills associated with a specific work experience or project."""
    access = await _check_access(driver, orb_id, token)
    if "error" in access:
        return [access]

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
