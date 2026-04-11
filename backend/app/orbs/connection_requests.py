"""Connection request service for restricted orbs."""

from __future__ import annotations

import logging
import uuid

from neo4j import AsyncDriver
from neo4j.time import DateTime as Neo4jDateTime

from app.graph.queries import (
    CREATE_CONNECTION_REQUEST,
    GET_CONNECTION_REQUEST_BY_REQUESTER,
    LIST_PENDING_CONNECTION_REQUESTS,
    UPDATE_CONNECTION_REQUEST_STATUS,
)
from app.orbs.access_grants import create_access_grant

logger = logging.getLogger(__name__)


def _sanitize(d: dict) -> dict:
    result = {}
    for k, v in d.items():
        if isinstance(v, Neo4jDateTime):
            result[k] = v.iso_format()
        else:
            result[k] = v
    return result


async def create_connection_request(
    db: AsyncDriver,
    orb_id: str,
    user: dict,
) -> dict | None:
    """Create a pending connection request. Returns None if duplicate."""
    request_id = str(uuid.uuid4())
    async with db.session() as session:
        result = await session.run(
            CREATE_CONNECTION_REQUEST,
            request_id=request_id,
            orb_id=orb_id,
            requester_user_id=user["user_id"],
            requester_email=(user.get("email") or "").strip().lower(),
            requester_name=user.get("name") or "",
        )
        record = await result.single()
        if record is None:
            return None
        return _sanitize(dict(record["cr"]))


async def get_my_connection_request(
    db: AsyncDriver,
    orb_id: str,
    user_id: str,
) -> dict | None:
    """Get the current user's pending request for an orb."""
    async with db.session() as session:
        result = await session.run(
            GET_CONNECTION_REQUEST_BY_REQUESTER,
            orb_id=orb_id,
            requester_user_id=user_id,
        )
        record = await result.single()
        if record is None:
            return None
        return _sanitize(dict(record["cr"]))


async def list_pending_requests(
    db: AsyncDriver,
    user_id: str,
) -> list[dict]:
    """List all pending connection requests for the owner's orb."""
    async with db.session() as session:
        result = await session.run(
            LIST_PENDING_CONNECTION_REQUESTS,
            user_id=user_id,
        )
        return [_sanitize(dict(r["cr"])) async for r in result]


async def accept_request(
    db: AsyncDriver,
    user_id: str,
    request_id: str,
    keywords: list[str] | None = None,
    hidden_node_types: list[str] | None = None,
) -> dict | None:
    """Accept a request: update status and create an AccessGrant."""
    async with db.session() as session:
        result = await session.run(
            UPDATE_CONNECTION_REQUEST_STATUS,
            user_id=user_id,
            request_id=request_id,
            status="accepted",
        )
        record = await result.single()
        if record is None:
            return None
        cr = _sanitize(dict(record["cr"]))

    # Create AccessGrant for the requester
    grant = await create_access_grant(
        db=db,
        user_id=user_id,
        email=cr["requester_email"],
        keywords=keywords,
        hidden_node_types=hidden_node_types,
    )
    return grant


async def reject_request(
    db: AsyncDriver,
    user_id: str,
    request_id: str,
) -> dict | None:
    """Reject a connection request."""
    async with db.session() as session:
        result = await session.run(
            UPDATE_CONNECTION_REQUEST_STATUS,
            user_id=user_id,
            request_id=request_id,
            status="rejected",
        )
        record = await result.single()
        if record is None:
            return None
        return _sanitize(dict(record["cr"]))
