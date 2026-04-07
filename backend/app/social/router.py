from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from neo4j import AsyncDriver

from app.config import settings
from app.dependencies import get_current_user
from app.graph.encryption import decrypt_value, encrypt_value
from app.rate_limit import limiter
from app.social.dependencies import get_social_db
from app.social.models import (
    ConnectionListResponse,
    ConnectionOut,
    CreateConnectionRequest,
    Direction,
)
from app.social.queries import (
    CREATE_CONNECTION,
    DELETE_CONNECTION,
    GET_CONNECTIONS,
    MERGE_USER,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/connections", tags=["connections"])


@router.post("/dev", status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
async def create_connection_dev(
    request: Request,
    payload: CreateConnectionRequest,
    db: AsyncDriver = Depends(get_social_db),
    user: dict = Depends(get_current_user),
):
    """Dev-only endpoint: create a directed connection between two users."""
    if not settings.social_dev_endpoints:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Endpoint not available",
        )

    current_user_id = user["user_id"]

    if payload.target_user_id == current_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot connect to yourself",
        )

    if payload.direction == Direction.outgoing:
        from_id = current_user_id
        to_id = payload.target_user_id
    else:
        from_id = payload.target_user_id
        to_id = current_user_id

    encrypted_from = encrypt_value(from_id)
    encrypted_to = encrypt_value(to_id)

    async with db.session() as session:
        # Lazily create User nodes
        await session.run(MERGE_USER, user_id=encrypted_from)
        await session.run(MERGE_USER, user_id=encrypted_to)

        # Create the directed connection
        result = await session.run(
            CREATE_CONNECTION,
            from_user_id=encrypted_from,
            to_user_id=encrypted_to,
        )
        record = await result.single()

    if record is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Connection already exists",
        )

    return {"detail": "Connection created"}


@router.get("/me", response_model=ConnectionListResponse)
async def get_my_connections(
    db: AsyncDriver = Depends(get_social_db),
    user: dict = Depends(get_current_user),
):
    """List the authenticated user's connections (outgoing and incoming)."""
    encrypted_user_id = encrypt_value(user["user_id"])

    async with db.session() as session:
        result = await session.run(GET_CONNECTIONS, user_id=encrypted_user_id)
        record = await result.single()

    raw_connections = record["connections"] if record else []

    connections = []
    for conn in raw_connections:
        if conn.get("user_id") is None:
            continue
        connections.append(
            ConnectionOut(
                user_id=decrypt_value(conn["user_id"]),
                direction=conn["direction"],
                created_at=conn["created_at"],
            )
        )

    return ConnectionListResponse(connections=connections)


@router.delete("/{target_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_connection(
    target_user_id: str,
    db: AsyncDriver = Depends(get_social_db),
    user: dict = Depends(get_current_user),
):
    """Remove a connection between the authenticated user and the target."""
    encrypted_user_id = encrypt_value(user["user_id"])
    encrypted_target = encrypt_value(target_user_id)

    async with db.session() as session:
        result = await session.run(
            DELETE_CONNECTION,
            user_id=encrypted_user_id,
            target_user_id=encrypted_target,
        )
        record = await result.single()

    if record is None or record["deleted_count"] == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connection not found",
        )
