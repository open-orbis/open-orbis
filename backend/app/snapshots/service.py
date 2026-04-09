"""Snapshot creation and restore logic for orb versioning."""

from __future__ import annotations

import contextlib
import json
import logging
import uuid

from neo4j import AsyncDriver
from neo4j.time import Date as Neo4jDate
from neo4j.time import DateTime as Neo4jDateTime
from neo4j.time import Time as Neo4jTime

from app.graph.queries import (
    ADD_NODE,
    DELETE_USER_GRAPH,
    GET_FULL_ORB,
    LINK_SKILL,
    NODE_TYPE_LABELS,
    NODE_TYPE_RELATIONSHIPS,
    UPDATE_PERSON,
)
from app.snapshots import db as snap_db

logger = logging.getLogger(__name__)

_LABEL_TO_TYPE: dict[str, str] = {v: k for k, v in NODE_TYPE_LABELS.items()}


def _sanitize(d: dict) -> dict:
    """Convert Neo4j temporal types to ISO strings; pass everything else through."""
    result = {}
    for k, v in d.items():
        if isinstance(v, (Neo4jDateTime, Neo4jDate, Neo4jTime)):
            result[k] = v.iso_format()
        else:
            result[k] = v
    return result


def serialize_orb_raw(record) -> str:
    """Serialize an orb record to JSON WITHOUT decrypting PII.

    Raw encrypted values are preserved so snapshots can be restored
    without access to the encryption key at read time.
    """
    person = _sanitize(dict(record["p"]))
    nodes: list[dict] = []
    links: list[dict] = []
    seen: set[str] = set()

    for conn in record["connections"]:
        if conn["node"] is None:
            continue
        node_data = _sanitize(dict(conn["node"]))
        uid = node_data.get("uid")
        if uid and uid in seen:
            continue
        if uid:
            seen.add(uid)
        node_data.pop("embedding", None)
        node_data["_labels"] = list(conn["node"].labels)
        nodes.append(node_data)
        links.append(
            {
                "source": person.get("user_id") or person.get("orb_id"),
                "target": uid,
                "type": conn["rel"],
            }
        )

    for skill_node in record.get("cross_skill_nodes") or []:
        if skill_node is None:
            continue
        skill_data = _sanitize(dict(skill_node))
        uid = skill_data.get("uid")
        if uid and uid in seen:
            continue
        if uid:
            seen.add(uid)
        skill_data.pop("embedding", None)
        skill_data["_labels"] = list(skill_node.labels)
        nodes.append(skill_data)
        links.append(
            {
                "source": person.get("user_id") or person.get("orb_id"),
                "target": uid,
                "type": "HAS_SKILL",
            }
        )

    seen_links: set[tuple] = set()
    for cl in record.get("cross_links") or []:
        src, tgt = cl.get("source"), cl.get("target")
        if src and tgt and src in seen and tgt in seen:
            key = (src, tgt, cl.get("rel", ""))
            if key not in seen_links:
                seen_links.add(key)
                links.append(
                    {
                        "source": src,
                        "target": tgt,
                        "type": cl.get("rel", "USED_SKILL"),
                    }
                )

    return json.dumps({"person": person, "nodes": nodes, "links": links})


def count_from_serialized(data: str) -> tuple[int, int]:
    """Return (node_count, edge_count) from a serialized orb JSON string."""
    parsed = json.loads(data)
    return len(parsed.get("nodes", [])), len(parsed.get("links", []))


async def create_snapshot(
    user_id: str,
    db: AsyncDriver,
    trigger: str,
    label: str | None = None,
) -> dict:
    """Fetch the current orb from Neo4j and store a snapshot in SQLite."""
    from datetime import datetime, timezone

    async with db.session() as session:
        result = await session.run(GET_FULL_ORB, user_id=user_id)
        record = await result.single()

    if record is None:
        raise ValueError(f"No orb found for user {user_id}")

    data = serialize_orb_raw(record)
    node_count, edge_count = count_from_serialized(data)

    # Skip snapshot if orb is empty (nothing to preserve)
    if node_count == 0:
        return {
            "snapshot_id": None,
            "user_id": user_id,
            "trigger": trigger,
            "label": label,
            "node_count": 0,
            "edge_count": 0,
            "skipped": True,
        }

    snapshot_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    snap_db.delete_oldest_if_at_limit(user_id)

    return snap_db.insert_snapshot(
        snapshot_id=snapshot_id,
        user_id=user_id,
        trigger=trigger,
        label=label,
        node_count=node_count,
        edge_count=edge_count,
        data=data,
        now=now,
    )


async def restore_snapshot(
    user_id: str,
    snapshot_id: str,
    db: AsyncDriver,
) -> dict:
    """Restore a previously saved snapshot: wipe graph, recreate nodes."""
    snap = snap_db.get_snapshot(user_id, snapshot_id)
    if snap is None:
        raise ValueError(f"Snapshot {snapshot_id} not found")

    # Create a safety snapshot before wiping
    with contextlib.suppress(ValueError):
        await create_snapshot(
            user_id=user_id,
            db=db,
            trigger="pre_restore",
            label="Before restoring version",
        )

    async with db.session() as session:
        await session.run(DELETE_USER_GRAPH, user_id=user_id)

    parsed = json.loads(snap["data"])
    await _restore_nodes(user_id, parsed, db)

    return {"status": "restored", "snapshot_id": snapshot_id}


async def _restore_nodes(
    user_id: str,
    parsed: dict,
    db: AsyncDriver,
) -> None:
    """Recreate nodes and cross-links from parsed snapshot JSON."""
    uid_map: dict[str, str] = {}

    async with db.session() as session:
        # Restore person profile fields
        person_data = parsed.get("person", {})
        profile_fields = {}
        for key in (
            "name",
            "headline",
            "location",
            "email",
            "phone",
            "linkedin_url",
            "github_url",
            "twitter_url",
            "instagram_url",
            "scholar_url",
            "website_url",
            "orcid_url",
            "open_to_work",
            "cv_display_name",
            "profile_image",
        ):
            if key in person_data and person_data[key]:
                profile_fields[key] = person_data[key]
        if profile_fields:
            await session.run(
                UPDATE_PERSON,
                user_id=user_id,
                properties=profile_fields,
            )

        # Restore child nodes
        for node in parsed.get("nodes", []):
            labels = node.get("_labels", [])
            if not labels:
                continue
            label = labels[0]
            node_type = _LABEL_TO_TYPE.get(label)
            if node_type is None:
                logger.warning("Skipping unknown node type: %s", label)
                continue
            rel_type = NODE_TYPE_RELATIONSHIPS[node_type]

            old_uid = node.get("uid", str(uuid.uuid4()))
            new_uid = old_uid

            properties = {
                k: v
                for k, v in node.items()
                if k not in ("_labels", "uid", "embedding") and v is not None
            }

            query = ADD_NODE.replace("{label}", label).replace("{rel_type}", rel_type)
            await session.run(
                query,
                user_id=user_id,
                properties=properties,
                uid=new_uid,
            )
            uid_map[old_uid] = new_uid

        # Restore cross-links (USED_SKILL)
        for link in parsed.get("links", []):
            if link.get("type") != "USED_SKILL":
                continue
            src = uid_map.get(link["source"], link["source"])
            tgt = uid_map.get(link["target"], link["target"])
            try:
                await session.run(LINK_SKILL, node_uid=src, skill_uid=tgt)
            except Exception as e:
                logger.warning("Failed to restore link %s->%s: %s", src, tgt, e)
