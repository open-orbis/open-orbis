from __future__ import annotations

import base64
import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from neo4j import AsyncDriver
from neo4j.time import Date as Neo4jDate
from neo4j.time import DateTime as Neo4jDateTime
from neo4j.time import Time as Neo4jTime
from pydantic import BaseModel

from app.config import settings
from app.dependencies import get_current_user, get_current_user_optional, get_db
from app.email.service import send_access_grant_email
from app.graph.encryption import decrypt_properties, encrypt_properties
from app.graph.queries import (
    ADD_NODE,
    DELETE_NODE,
    DELETE_PERSON_FULL,
    GET_FULL_ORB,
    GET_FULL_ORB_PUBLIC,
    GET_PERSON_BY_ORB_ID,
    LINK_SKILL,
    NODE_TYPE_LABELS,
    NODE_TYPE_RELATIONSHIPS,
    UNLINK_SKILL,
    UPDATE_NODE,
    UPDATE_ORB_ID,
    UPDATE_PERSON,
)
from app.orbs.access_grants import (
    create_access_grant,
    list_access_grants,
    revoke_access_grant,
    update_access_grant_filters,
)
from app.orbs.connection_requests import (
    accept_request,
    create_connection_request,
    get_my_connection_request,
    list_pending_requests,
    reject_request,
)
from app.orbs.models import (
    AcceptConnectionRequestBody,
    AccessGrantCreate,
    AccessGrantFiltersUpdate,
    AccessGrantListResponse,
    AccessGrantResponse,
    ConnectionRequestListResponse,
    ConnectionRequestResponse,
    NodeCreate,
    NodeUpdate,
    OrbIdUpdate,
    PersonUpdate,
    ShareTokenCreate,
    ShareTokenListResponse,
    ShareTokenResponse,
    VisibilityUpdate,
)
from app.orbs.share_token import (
    create_share_token,
    list_share_tokens,
    node_matches_filters,
    revoke_share_token,
    validate_share_token,
)
from app.orbs.visibility import (
    assert_orb_accessible,
    assert_user_can_access_restricted,
    get_orb_visibility,
)
from app.rate_limit import limiter
from app.snapshots import db as snap_db
from app.snapshots.service import create_snapshot, restore_snapshot

logger = logging.getLogger(__name__)


class SkillLinkRequest(BaseModel):
    node_uid: str
    skill_uid: str


router = APIRouter(prefix="/orbs", tags=["orbs"])


def _sanitize_neo4j_types(d: dict) -> dict:
    """Convert Neo4j temporal types to JSON-safe strings."""
    result = {}
    for k, v in d.items():
        if isinstance(v, (Neo4jDateTime, Neo4jDate, Neo4jTime)):
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
        if not uid:
            continue
        # Deduplicate nodes
        if uid in seen_node_uids:
            continue
        seen_node_uids.add(uid)
        node_data = decrypt_properties(node_data)
        # Remove embedding from response (too large)
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
                links.append(
                    {"source": src, "target": tgt, "type": cl.get("rel", "USED_SKILL")}
                )

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
    props = encrypt_properties(props)
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


@router.put("/me/visibility")
async def update_visibility(
    data: VisibilityUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Update the visibility of the current user's orb."""
    async with db.session() as session:
        result = await session.run(
            UPDATE_PERSON,
            user_id=current_user["user_id"],
            properties={"visibility": data.visibility},
        )
        record = await result.single()
        if record is None:
            raise HTTPException(status_code=404, detail="User not found")
        return {"visibility": data.visibility}


@router.post("/me/profile-image")
async def upload_profile_image(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Upload a profile picture. Stored as base64 on the Person node."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    image_bytes = await file.read()
    max_size = 2 * 1024 * 1024  # 2MB
    if len(image_bytes) > max_size:
        raise HTTPException(status_code=400, detail="Image too large (max 2MB)")

    b64 = base64.b64encode(image_bytes).decode("ascii")
    data_uri = f"data:{file.content_type};base64,{b64}"

    async with db.session() as session:
        result = await session.run(
            UPDATE_PERSON,
            user_id=current_user["user_id"],
            properties={"profile_image": data_uri},
        )
        record = await result.single()
        if record is None:
            raise HTTPException(status_code=404, detail="User not found")

    return {"status": "uploaded"}


@router.delete("/me/profile-image")
async def delete_profile_image(
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Remove the profile picture."""
    async with db.session() as session:
        result = await session.run(
            UPDATE_PERSON,
            user_id=current_user["user_id"],
            properties={"profile_image": ""},
        )
        record = await result.single()
        if record is None:
            raise HTTPException(status_code=404, detail="User not found")
    return {"status": "deleted"}


@router.post("/me/nodes")
async def add_node(
    data: NodeCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    if data.node_type not in NODE_TYPE_LABELS:
        raise HTTPException(
            status_code=400, detail=f"Invalid node type: {data.node_type}"
        )

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


@router.delete("/me/content")
async def discard_orb_content(
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Delete all orb content (nodes, relationships) but keep the account."""
    user_id = current_user["user_id"]
    async with db.session() as session:
        await session.run(DELETE_PERSON_FULL, user_id=user_id)

    # Clear stored CVs, drafts, and snapshots
    try:
        from app.cv_storage.storage import delete_all_for_user as delete_cvs

        delete_cvs(user_id)
    except Exception:
        logger.warning("Failed to clear stored CVs for %s", user_id)
    try:
        from app.drafts.db import delete_all_for_user as delete_drafts

        delete_drafts(user_id)
    except Exception:
        logger.warning("Failed to clear drafts for %s", user_id)
    try:
        from app.snapshots.db import delete_all_for_user as delete_snapshots

        delete_snapshots(user_id)
    except Exception:
        logger.warning("Failed to clear snapshots for %s", user_id)

    return {"status": "discarded"}


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


# ── Versions ──


@router.get("/me/versions")
async def list_versions(
    current_user: dict = Depends(get_current_user),
):
    """List orb snapshots (metadata only, no data)."""
    return snap_db.list_snapshots(current_user["user_id"])


@router.post("/me/versions")
async def create_version(
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Manually create a snapshot of the current orb state."""
    return await create_snapshot(
        user_id=current_user["user_id"],
        db=db,
        trigger="manual",
        label="Manual save",
    )


@router.post("/me/versions/{snapshot_id}/restore")
async def restore_version(
    snapshot_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Restore an orb from a snapshot. Current state is saved first."""
    try:
        return await restore_snapshot(
            user_id=current_user["user_id"],
            snapshot_id=snapshot_id,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from None


@router.delete("/me/versions/{snapshot_id}")
async def delete_version(
    snapshot_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a specific snapshot."""
    deleted = snap_db.delete_snapshot(current_user["user_id"], snapshot_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return {"status": "deleted"}


@router.post("/me/share-tokens", response_model=ShareTokenResponse)
async def create_share_token_endpoint(
    data: ShareTokenCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Create a shareable token for this user's orb."""
    token = await create_share_token(
        db=db,
        user_id=current_user["user_id"],
        keywords=data.keywords,
        hidden_node_types=data.hidden_node_types,
        label=data.label,
        expires_in_days=data.expires_in_days,
    )
    if token is None:
        raise HTTPException(status_code=400, detail="Set an orb ID first")
    return token


@router.get("/me/share-tokens", response_model=ShareTokenListResponse)
async def list_share_tokens_endpoint(
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """List all share tokens for this user's orb."""
    tokens = await list_share_tokens(db, current_user["user_id"])
    return {"tokens": tokens}


@router.delete("/me/share-tokens/{token_id}")
async def revoke_share_token_endpoint(
    token_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Revoke a share token."""
    result = await revoke_share_token(db, current_user["user_id"], token_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Token not found")
    return {"status": "revoked"}


# ── Access grants (restricted-mode allowlist) ──


@router.post("/me/access-grants", response_model=AccessGrantResponse)
async def create_access_grant_endpoint(
    data: AccessGrantCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Grant a specific email access to this user's restricted orb.

    Sends a notification email to the recipient. Email failure is
    swallowed (best-effort) so the grant is still created.
    """
    grant = await create_access_grant(
        db=db,
        user_id=current_user["user_id"],
        email=data.email,
        keywords=data.keywords,
        hidden_node_types=data.hidden_node_types,
    )
    if grant is None:
        raise HTTPException(status_code=400, detail="Set an orb ID first")

    orb_url = f"{settings.frontend_url.rstrip('/')}/{grant['orb_id']}"
    try:
        await send_access_grant_email(
            to=grant["email"],
            owner_name=grant.get("owner_name") or "An OpenOrbis user",
            orb_url=orb_url,
        )
    except Exception:
        logger.exception("Failed to send access grant email to %s", grant["email"])

    return grant


@router.get("/me/access-grants", response_model=AccessGrantListResponse)
async def list_access_grants_endpoint(
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """List active access grants on this user's orb."""
    grants = await list_access_grants(db, current_user["user_id"])
    return {"grants": grants}


@router.delete("/me/access-grants/{grant_id}")
async def revoke_access_grant_endpoint(
    grant_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Revoke an access grant."""
    result = await revoke_access_grant(db, current_user["user_id"], grant_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Grant not found")
    return {"status": "revoked"}


@router.put("/me/access-grants/{grant_id}/filters", response_model=AccessGrantResponse)
async def update_access_grant_filters_endpoint(
    grant_id: str,
    data: AccessGrantFiltersUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Update filter scope for a specific access grant."""
    grant = await update_access_grant_filters(
        db=db,
        user_id=current_user["user_id"],
        grant_id=grant_id,
        keywords=data.keywords,
        hidden_node_types=data.hidden_node_types,
    )
    if grant is None:
        raise HTTPException(status_code=404, detail="Grant not found")
    return grant


# ── Connection Requests ──


@router.post(
    "/{orb_id}/connection-requests",
    response_model=ConnectionRequestResponse,
    status_code=201,
)
async def request_access(
    orb_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Request access to a restricted orb."""
    result = await create_connection_request(db=db, orb_id=orb_id, user=current_user)
    if result is None:
        raise HTTPException(
            status_code=409, detail="Request already pending or orb not restricted"
        )
    return result


@router.get(
    "/{orb_id}/connection-requests/me",
    response_model=ConnectionRequestResponse,
)
async def get_my_request(
    orb_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Check if the current user has a pending request for this orb."""
    result = await get_my_connection_request(
        db=db, orb_id=orb_id, user_id=current_user["user_id"]
    )
    if result is None:
        raise HTTPException(status_code=404, detail="No pending request")
    return result


@router.get("/me/connection-requests", response_model=ConnectionRequestListResponse)
async def list_my_connection_requests(
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """List pending connection requests for the current user's orb."""
    requests = await list_pending_requests(db=db, user_id=current_user["user_id"])
    return {"requests": requests}


@router.post(
    "/me/connection-requests/{request_id}/accept",
    response_model=AccessGrantResponse,
)
async def accept_connection_request(
    request_id: str,
    data: AcceptConnectionRequestBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Accept a connection request and create an access grant with optional filters."""
    grant = await accept_request(
        db=db,
        user_id=current_user["user_id"],
        request_id=request_id,
        keywords=data.keywords,
        hidden_node_types=data.hidden_node_types,
    )
    if grant is None:
        raise HTTPException(
            status_code=404, detail="Request not found or already resolved"
        )
    return grant


@router.post("/me/connection-requests/{request_id}/reject")
async def reject_connection_request(
    request_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Reject a connection request."""
    result = await reject_request(
        db=db, user_id=current_user["user_id"], request_id=request_id
    )
    if result is None:
        raise HTTPException(
            status_code=404, detail="Request not found or already resolved"
        )
    return {"status": "rejected"}


@router.get("/{orb_id}")
@limiter.limit("30/minute")
async def get_public_orb(
    request: Request,
    orb_id: str,
    token: str | None = Query(None, description="Share token (public orbs only)"),
    db: AsyncDriver = Depends(get_db),
    current_user: dict | None = Depends(get_current_user_optional),
):
    # 1. Visibility gate
    visibility = await get_orb_visibility(db, orb_id)
    assert_orb_accessible(visibility)

    # 2. Branch on visibility mode
    token_data: dict | None = None
    if visibility == "restricted":
        # Require auth + email in allowlist (or owner)
        token_data = await assert_user_can_access_restricted(db, orb_id, current_user)
        if token_data is None:
            token_data = {"keywords": [], "hidden_node_types": []}
    else:
        # public: require a valid share token
        if not token:
            raise HTTPException(
                status_code=403, detail="Share token required for this orb."
            )
        token_data = await validate_share_token(db, token)
        if token_data is None:
            raise HTTPException(
                status_code=403,
                detail="Invalid or expired share token.",
            )
        if token_data["orb_id"] != orb_id:
            raise HTTPException(
                status_code=403,
                detail="Token does not grant access to this orb.",
            )

    async with db.session() as session:
        result = await session.run(GET_FULL_ORB_PUBLIC, orb_id=orb_id)
        record = await result.single()
        if record is None:
            raise HTTPException(status_code=404, detail="Orb not found")

    # Block access to accounts pending deletion
    person = dict(record["p"])
    if person.get("deletion_requested_at"):
        raise HTTPException(status_code=404, detail="Orb not found")

    orb_data = _serialize_orb(record)

    # Apply filters in public mode (share token) and restricted mode (per-grant scope)
    keywords = token_data["keywords"] if token_data else []
    hidden_types = set(token_data.get("hidden_node_types", []) if token_data else [])
    if keywords or hidden_types:
        filtered_nodes = []
        filtered_uids = set()
        for node in orb_data["nodes"]:
            labels = set(node.get("_labels", []))
            if (hidden_types and labels & hidden_types) or (
                keywords and node_matches_filters(node, keywords)
            ):
                filtered_uids.add(node.get("uid"))
            else:
                filtered_nodes.append(node)
        filtered_links = [
            link
            for link in orb_data["links"]
            if link["target"] not in filtered_uids
            and link["source"] not in filtered_uids
        ]
        orb_data["nodes"] = filtered_nodes
        orb_data["links"] = filtered_links

    client_ip = request.client.host if request.client else "unknown"
    logger.info(
        "PUBLIC_ACCESS | ip=%s | orb_id=%s | mode=%s | status=200",
        client_ip,
        orb_id,
        visibility,
    )
    return orb_data
