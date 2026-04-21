"""Share-token service for controlled public access to orbs.

Share tokens are opaque, server-side tokens stored in Neo4j.  Each token
encodes an orb_id and optional exclusion keywords.  When a shared link
includes this token, the public API excludes any node whose string
fields contain any of the keywords.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

from neo4j import AsyncDriver
from neo4j.time import Date as Neo4jDate
from neo4j.time import DateTime as Neo4jDateTime
from neo4j.time import Time as Neo4jTime

from app.config import settings
from app.graph.queries import (
    CREATE_SHARE_TOKEN,
    DELETE_SHARE_TOKEN,
    LIST_SHARE_TOKENS,
    REVOKE_SHARE_TOKEN,
    VALIDATE_SHARE_TOKEN,
)

if TYPE_CHECKING:
    from mcp_server.auth import ShareContext


def _sanitize(d: dict) -> dict:
    """Convert Neo4j temporal types to JSON-safe strings."""
    result = {}
    for k, v in d.items():
        if isinstance(v, (Neo4jDateTime, Neo4jDate, Neo4jTime)):
            result[k] = v.iso_format()
        else:
            result[k] = v
    return result


async def create_share_token(
    db: AsyncDriver,
    user_id: str,
    keywords: list[str] | None = None,
    hidden_node_types: list[str] | None = None,
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

    norm_types = list(hidden_node_types or [])

    async with db.session() as session:
        result = await session.run(
            CREATE_SHARE_TOKEN,
            user_id=user_id,
            token_id=token_id,
            keywords=normalized,
            hidden_node_types=norm_types,
            label=label or "",
            expires_at=expires_at,
        )
        record = await result.single()
        if record is None:
            return None
        return _sanitize(dict(record["st"]))


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
            "hidden_node_types": list(record["hidden_node_types"]),
        }


async def list_share_tokens(db: AsyncDriver, user_id: str) -> list[dict]:
    """List all share tokens for a user."""
    async with db.session() as session:
        result = await session.run(LIST_SHARE_TOKENS, user_id=user_id)
        tokens = []
        async for record in result:
            tokens.append(_sanitize(dict(record["st"])))
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
        return _sanitize(dict(record["st"]))


async def delete_share_token(db: AsyncDriver, user_id: str, token_id: str) -> bool:
    """Hard-delete a share token.  Returns ``True`` if deleted."""
    async with db.session() as session:
        result = await session.run(
            DELETE_SHARE_TOKEN, user_id=user_id, token_id=token_id
        )
        record = await result.single()
        return record is not None


async def validate_share_token_for_mcp(
    db: AsyncDriver, bare_token: str
) -> ShareContext | None:
    """Resolve a bare share-token string to a ShareContext.

    Returns None if the token is missing, revoked, or expired. Used by
    the MCP server's APIKeyMiddleware when it sees the `orbs_` prefix.
    """
    # Local import avoids a cycle: mcp_server.auth imports app.orbs,
    # app.orbs should not import mcp_server at module load time.
    from mcp_server.auth import ShareContext

    row = await validate_share_token(db, bare_token)
    if row is None:
        return None
    return ShareContext(
        orb_id=row["orb_id"],
        keywords=list(row.get("keywords") or []),
        hidden_node_types=list(row.get("hidden_node_types") or []),
        token_id=bare_token,
    )


def node_matches_filters(node: dict, keywords: list[str]) -> bool:
    """Check if any string property of a node contains any of the keywords (case-insensitive)."""
    for value in node.values():
        if isinstance(value, str):
            lower_val = value.lower()
            for kw in keywords:
                if kw.lower() in lower_val:
                    return True
    return False
