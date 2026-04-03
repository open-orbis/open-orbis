from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_current_user, get_db
from app.messages.models import (
    MessageOut,
    MessageSentResponse,
    ReplyOut,
    ReplyRequest,
    SendMessageRequest,
)

if TYPE_CHECKING:
    from neo4j import AsyncDriver

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/messages", tags=["messages"])


# ── Public endpoint: anyone / MCP can send a message to an orb ──


@router.post(
    "/{orb_id}", response_model=MessageSentResponse, status_code=status.HTTP_201_CREATED
)
async def send_message(
    orb_id: str,
    payload: SendMessageRequest,
    db: AsyncDriver = Depends(get_db),
):
    """Public endpoint — send a message to an orb owner by orb_id."""
    message_uid = str(uuid.uuid4())
    async with db.session() as session:
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
            sender_name=payload.sender_name,
            sender_email=payload.sender_email,
            subject=payload.subject,
            body=payload.body,
        )
        record = await result.single()
        if record is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Orb '{orb_id}' not found",
            )
    return MessageSentResponse(uid=message_uid)


# ── Authenticated endpoints ──


@router.get("/me", response_model=list[MessageOut])
async def get_my_messages(
    user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Return all messages for the current user, newest first, with replies."""
    async with db.session() as session:
        result = await session.run(
            """
            MATCH (p:Person {user_id: $user_id})-[:HAS_MESSAGE]->(m:Message)
            OPTIONAL MATCH (m)-[:HAS_REPLY]->(r:Reply)
            WITH m, r ORDER BY r.created_at ASC
            WITH m, collect(
                CASE WHEN r IS NOT NULL
                    THEN {
                        uid: r.uid,
                        body: r.body,
                        created_at: toString(r.created_at),
                        from_owner: r.from_owner
                    }
                    ELSE NULL
                END
            ) AS raw_replies
            WITH m, [x IN raw_replies WHERE x IS NOT NULL] AS replies
            RETURN m {
                .uid, .sender_name, .sender_email, .subject, .body, .read,
                created_at: toString(m.created_at)
            } AS message, replies
            ORDER BY m.created_at DESC
            """,
            user_id=user["user_id"],
        )
        messages = []
        async for record in result:
            msg = dict(record["message"])
            msg["replies"] = record["replies"]
            messages.append(MessageOut(**msg))
        return messages


@router.post(
    "/me/{message_id}/reply",
    response_model=ReplyOut,
    status_code=status.HTTP_201_CREATED,
)
async def reply_to_message(
    message_id: str,
    payload: ReplyRequest,
    user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Reply to a message. The reply is stored as a child of the original message."""
    reply_uid = str(uuid.uuid4())
    async with db.session() as session:
        result = await session.run(
            """
            MATCH (p:Person {user_id: $user_id})-[:HAS_MESSAGE]->(m:Message {uid: $message_id})
            CREATE (m)-[:HAS_REPLY]->(r:Reply {
                uid: $reply_uid,
                body: $body,
                created_at: datetime(),
                from_owner: true
            })
            RETURN r {
                .uid, .body, .from_owner,
                created_at: toString(r.created_at)
            } AS reply
            """,
            user_id=user["user_id"],
            message_id=message_id,
            reply_uid=reply_uid,
            body=payload.body,
        )
        record = await result.single()
        if record is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Message not found",
            )
        return ReplyOut(**dict(record["reply"]))


@router.put("/me/{message_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_message_read(
    message_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Mark a message as read."""
    async with db.session() as session:
        result = await session.run(
            """
            MATCH (p:Person {user_id: $user_id})-[:HAS_MESSAGE]->(m:Message {uid: $message_id})
            SET m.read = true
            RETURN m.uid AS uid
            """,
            user_id=user["user_id"],
            message_id=message_id,
        )
        record = await result.single()
        if record is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Message not found",
            )


@router.delete("/me/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    message_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Delete a message and its replies."""
    async with db.session() as session:
        result = await session.run(
            """
            MATCH (p:Person {user_id: $user_id})-[:HAS_MESSAGE]->(m:Message {uid: $message_id})
            OPTIONAL MATCH (m)-[:HAS_REPLY]->(r:Reply)
            DETACH DELETE r, m
            RETURN count(m) AS deleted
            """,
            user_id=user["user_id"],
            message_id=message_id,
        )
        record = await result.single()
        if record is None or record["deleted"] == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Message not found",
            )
