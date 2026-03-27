import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from neo4j import AsyncDriver
from neo4j.time import DateTime as Neo4jDateTime, Date as Neo4jDate, Time as Neo4jTime

from app.dependencies import get_current_user, get_db
from app.graph.encryption import decrypt_properties, encrypt_properties
from pydantic import BaseModel

from app.graph.queries import (
    ADD_NODE,
    DELETE_NODE,
    GET_FULL_ORB,
    GET_FULL_ORB_PUBLIC,
    GET_PERSON_BY_ORB_ID,
    GET_SKILL_LINKS,
    LINK_SKILL,
    NODE_TYPE_LABELS,
    NODE_TYPE_RELATIONSHIPS,
    UNLINK_SKILL,
    UPDATE_NODE,
    UPDATE_ORB_ID,
    UPDATE_PERSON,
)
from app.orbs.models import NodeCreate, NodeUpdate, OrbIdUpdate, PersonUpdate
from app.orbs.filter_token import (
    create_filter_token,
    decode_filter_token,
    node_matches_filters,
)


class SkillLinkRequest(BaseModel):
    node_uid: str
    skill_uid: str


class FilterTokenRequest(BaseModel):
    keywords: list[str]

router = APIRouter(prefix="/orbs", tags=["orbs"])


def _sanitize_neo4j_types(d: dict) -> dict:
    """Convert Neo4j temporal types to JSON-safe strings."""
    result = {}
    for k, v in d.items():
        if isinstance(v, Neo4jDateTime):
            result[k] = v.iso_format()
        elif isinstance(v, (Neo4jDate, Neo4jTime)):
            result[k] = v.iso_format()
        else:
            result[k] = v
    return result


def _serialize_orb(record) -> dict:
    person = _sanitize_neo4j_types(dict(record["p"]))
    person = decrypt_properties(person)
    nodes = []
    links = []
    seen_node_uids: set[str] = set()

    for conn in record["connections"]:
        if conn["node"] is None:
            continue
        node_data = _sanitize_neo4j_types(dict(conn["node"]))
        uid = node_data.get("uid")
        # Deduplicate nodes
        if uid and uid in seen_node_uids:
            continue
        if uid:
            seen_node_uids.add(uid)
        node_data = decrypt_properties(node_data)
        # Remove embedding from response (too large)
        node_data.pop("embedding", None)
        node_data["_labels"] = list(conn["node"].labels)
        nodes.append(node_data)
        links.append(
            {
                "source": person.get("user_id") or person.get("orb_id"),
                "target": node_data["uid"],
                "type": conn["rel"],
            }
        )

    # Include Skill nodes referenced by USED_SKILL but not directly connected to Person
    cross_skill_nodes = record.get("cross_skill_nodes") or []
    for skill_node in cross_skill_nodes:
        if skill_node is None:
            continue
        skill_data = _sanitize_neo4j_types(dict(skill_node))
        uid = skill_data.get("uid")
        if uid and uid in seen_node_uids:
            continue
        if uid:
            seen_node_uids.add(uid)
        skill_data = decrypt_properties(skill_data)
        skill_data.pop("embedding", None)
        skill_data["_labels"] = list(skill_node.labels)
        nodes.append(skill_data)
        # These orphan skills need a link from Person to appear in the graph
        links.append(
            {
                "source": person.get("user_id") or person.get("orb_id"),
                "target": uid,
                "type": "HAS_SKILL",
            }
        )

    # Add cross-node links (USED_SKILL etc.)
    cross_links = record.get("cross_links") or []
    seen_links: set[tuple] = set()
    for cl in cross_links:
        src = cl.get("source")
        tgt = cl.get("target")
        if src and tgt and src in seen_node_uids and tgt in seen_node_uids:
            key = (src, tgt, cl.get("rel", ""))
            if key not in seen_links:
                seen_links.add(key)
                links.append({"source": src, "target": tgt, "type": cl.get("rel", "USED_SKILL")})

    return {"person": person, "nodes": nodes, "links": links}


@router.get("/me")
async def get_my_orb(
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    async with db.session() as session:
        result = await session.run(GET_FULL_ORB, user_id=current_user["user_id"])
        record = await result.single()
        if record is None:
            raise HTTPException(status_code=404, detail="Orb not found")
        return _serialize_orb(record)


@router.put("/me")
async def update_my_profile(
    data: PersonUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    props = {k: v for k, v in data.model_dump().items() if v is not None}
    async with db.session() as session:
        result = await session.run(
            UPDATE_PERSON, user_id=current_user["user_id"], properties=props
        )
        record = await result.single()
        if record is None:
            raise HTTPException(status_code=404, detail="User not found")
        return {"status": "updated"}


@router.put("/me/orb-id")
async def claim_orb_id(
    data: OrbIdUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    async with db.session() as session:
        # Check if orb_id is taken
        existing = await session.run(GET_PERSON_BY_ORB_ID, orb_id=data.orb_id)
        record = await existing.single()
        if record is not None:
            existing_user_id = dict(record["p"]).get("user_id")
            if existing_user_id != current_user["user_id"]:
                raise HTTPException(status_code=409, detail="Orb ID already taken")

        await session.run(
            UPDATE_ORB_ID, user_id=current_user["user_id"], orb_id=data.orb_id
        )
        return {"orb_id": data.orb_id}


@router.post("/me/nodes")
async def add_node(
    data: NodeCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    if data.node_type not in NODE_TYPE_LABELS:
        raise HTTPException(status_code=400, detail=f"Invalid node type: {data.node_type}")

    label = NODE_TYPE_LABELS[data.node_type]
    rel_type = NODE_TYPE_RELATIONSHIPS[data.node_type]
    uid = str(uuid.uuid4())
    properties = encrypt_properties(data.properties)

    query = ADD_NODE.replace("{label}", label).replace("{rel_type}", rel_type)

    async with db.session() as session:
        result = await session.run(
            query, user_id=current_user["user_id"], properties=properties, uid=uid
        )
        record = await result.single()
        if record is None:
            raise HTTPException(status_code=404, detail="User not found")
        node = dict(record["n"])
        node = decrypt_properties(node)
        node["_labels"] = [label]
        return node


@router.put("/me/nodes/{uid}")
async def update_node(
    uid: str,
    data: NodeUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    properties = encrypt_properties(data.properties)
    async with db.session() as session:
        result = await session.run(UPDATE_NODE, uid=uid, properties=properties)
        record = await result.single()
        if record is None:
            raise HTTPException(status_code=404, detail="Node not found")
        node = dict(record["n"])
        node = decrypt_properties(node)
        return node


@router.delete("/me/nodes/{uid}")
async def delete_node(
    uid: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    async with db.session() as session:
        await session.run(DELETE_NODE, uid=uid)
        return {"status": "deleted"}


@router.post("/me/link-skill")
async def link_skill(
    data: SkillLinkRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    async with db.session() as session:
        result = await session.run(
            LINK_SKILL, node_uid=data.node_uid, skill_uid=data.skill_uid
        )
        record = await result.single()
        if record is None:
            raise HTTPException(status_code=404, detail="Node or skill not found")
        return {"status": "linked"}


@router.post("/me/unlink-skill")
async def unlink_skill(
    data: SkillLinkRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    async with db.session() as session:
        result = await session.run(
            UNLINK_SKILL, node_uid=data.node_uid, skill_uid=data.skill_uid
        )
        record = await result.single()
        if record is None:
            raise HTTPException(status_code=404, detail="Link not found")
        return {"status": "unlinked"}


@router.post("/me/filter-token")
async def generate_filter_token(
    data: FilterTokenRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Generate a shareable token that encodes a visibility filter for this user's orb."""
    async with db.session() as session:
        result = await session.run(GET_FULL_ORB, user_id=current_user["user_id"])
        record = await result.single()
        if record is None:
            raise HTTPException(status_code=404, detail="Orb not found")
        person = dict(record["p"])
        orb_id = person.get("orb_id", "")
        if not orb_id:
            raise HTTPException(status_code=400, detail="Set an orb ID first")

    token = create_filter_token(orb_id, data.keywords)
    return {"token": token, "keywords": [kw.strip().lower() for kw in data.keywords]}


@router.get("/{orb_id}")
async def get_public_orb(
    orb_id: str,
    filter_token: str | None = Query(None),
    db: AsyncDriver = Depends(get_db),
):
    async with db.session() as session:
        result = await session.run(GET_FULL_ORB_PUBLIC, orb_id=orb_id)
        record = await result.single()
        if record is None:
            raise HTTPException(status_code=404, detail="Orb not found")

    orb_data = _serialize_orb(record)

    # Apply filter if a valid filter token is provided
    if filter_token:
        decoded = decode_filter_token(filter_token)
        if decoded and decoded["orb_id"] == orb_id:
            keywords = decoded["filters"]
            # Remove nodes that match any filter keyword
            filtered_nodes = []
            filtered_uids = set()
            for node in orb_data["nodes"]:
                if node_matches_filters(node, keywords):
                    filtered_uids.add(node.get("uid"))
                else:
                    filtered_nodes.append(node)
            # Remove links connected to filtered nodes
            filtered_links = [
                link for link in orb_data["links"]
                if link["target"] not in filtered_uids and link["source"] not in filtered_uids
            ]
            orb_data["nodes"] = filtered_nodes
            orb_data["links"] = filtered_links

    return orb_data
