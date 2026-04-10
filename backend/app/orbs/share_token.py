"""Share-token service for controlled public access to orbs.

Share tokens are opaque, server-side tokens stored in Neo4j.  Each token
encodes an orb_id and optional exclusion keywords.  When a shared link
includes this token, the public API excludes any node whose string
fields contain any of the keywords.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from neo4j import AsyncDriver

from app.config import settings
from app.graph.queries import (
    CREATE_SHARE_TOKEN,
    DELETE_SHARE_TOKEN,
    LIST_SHARE_TOKENS,
    REVOKE_SHARE_TOKEN,
    VALIDATE_SHARE_TOKEN,
)


async def create_share_token(
    db: AsyncDriver,
    user_id: str,
    keywords: list[str] | None = None,
    label: str | None = None,
    expires_in_days: int | None = None,
) -> dict | None:
    """Create a share token in Neo4j.

    Returns the token dict or ``None`` if the user has no orb_id set.
    """
    token_id = secrets.token_urlsafe(32)

    normalized = [kw.strip().lower() for kw in (keywords or []) if kw.strip()]

    if expires_in_days is None:
        ttl = settings.share_token_default_ttl_days
    else:
        ttl = expires_in_days

    expires_at: datetime | None = None
    if ttl > 0:
        expires_at = datetime.now(timezone.utc) + timedelta(days=ttl)

    async with db.session() as session:
        result = await session.run(
            CREATE_SHARE_TOKEN,
            user_id=user_id,
            token_id=token_id,
            keywords=normalized,
            label=label or "",
            expires_at=expires_at,
        )
        record = await result.single()
        if record is None:
            return None
        return dict(record["st"])


async def validate_share_token(db: AsyncDriver, token_id: str) -> dict | None:
    """Validate a share token.

    Returns ``{"orb_id": ..., "keywords": [...]}`` or ``None`` when the
    token is missing, revoked, or expired.  All failure modes collapse
    into a single ``None`` so callers never leak why access was denied.
    """
    async with db.session() as session:
        result = await session.run(VALIDATE_SHARE_TOKEN, token_id=token_id)
        record = await result.single()
        if record is None:
            return None
        return {
            "orb_id": record["orb_id"],
            "keywords": list(record["keywords"]),
        }


async def list_share_tokens(db: AsyncDriver, user_id: str) -> list[dict]:
    """List all share tokens for a user."""
    async with db.session() as session:
        result = await session.run(LIST_SHARE_TOKENS, user_id=user_id)
        tokens = []
        async for record in result:
            tokens.append(dict(record["st"]))
        return tokens


async def revoke_share_token(
    db: AsyncDriver, user_id: str, token_id: str
) -> dict | None:
    """Revoke a share token.  Returns the token dict or ``None``."""
    async with db.session() as session:
        result = await session.run(
            REVOKE_SHARE_TOKEN, user_id=user_id, token_id=token_id
        )
        record = await result.single()
        if record is None:
            return None
        return dict(record["st"])


async def delete_share_token(db: AsyncDriver, user_id: str, token_id: str) -> bool:
    """Hard-delete a share token.  Returns ``True`` if deleted."""
    async with db.session() as session:
        result = await session.run(
            DELETE_SHARE_TOKEN, user_id=user_id, token_id=token_id
        )
        record = await result.single()
        return record is not None


def node_matches_filters(node: dict, keywords: list[str]) -> bool:
    """Check if any string property of a node contains any of the keywords (case-insensitive)."""
    for value in node.values():
        if isinstance(value, str):
            lower_val = value.lower()
            for kw in keywords:
                if kw.lower() in lower_val:
                    return True
    return False
