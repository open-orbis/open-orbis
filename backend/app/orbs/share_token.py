"""Share-token service for controlled public access to orbs.

Share tokens are opaque, server-side tokens stored in Neo4j.  Each token
encodes an orb_id and optional exclusion keywords.  When a shared link
includes this token, the public API excludes any node whose string
fields contain any of the keywords.
"""

from __future__ import annotations

import hashlib
import logging
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
    INCREMENT_SHARE_TOKEN_MCP_USE,
    LIST_SHARE_TOKENS,
    REVOKE_SHARE_TOKEN,
    VALIDATE_SHARE_TOKEN,
)

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    # TYPE_CHECKING block: lets mypy/pyright resolve the return annotation
    # without importing at runtime. `from __future__ import annotations` at
    # the top of this module makes the annotation a string at runtime, so
    # no real import happens there. The corresponding *runtime* import
    # inside validate_share_token_for_mcp is still required — removing
    # either one breaks something (static analysis or runtime resolution).
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
    db: AsyncDriver,
    user_id: str,
    token_id: str,
    *,
    pg_pool=None,
) -> dict | None:
    """Revoke a share token.  Returns the token dict or ``None``.

    If ``pg_pool`` is provided, OAuth access + refresh tokens bound to this
    share token are cascade-revoked as well, so a user revoking their
    share token also terminates any AI client connections that used it.
    """
    async with db.session() as session:
        result = await session.run(
            REVOKE_SHARE_TOKEN, user_id=user_id, token_id=token_id
        )
        record = await result.single()
        if record is None:
            return None
        out = _sanitize(dict(record["st"]))

    if pg_pool is not None:
        from app.oauth.db import cascade_revoke_oauth_by_share_token

        await cascade_revoke_oauth_by_share_token(pg_pool, token_id)

    return out


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
    # orb_id is a load-bearing contract: validate_share_token returns None
    # rather than a row with a missing orb_id, so a KeyError here would
    # mean the contract has silently broken. Surface it loudly rather
    # than defaulting. keywords / hidden_node_types ARE genuinely
    # nullable in the data model, so we coerce them to empty tuples.
    return ShareContext(
        orb_id=row["orb_id"],
        keywords=tuple(row.get("keywords") or ()),
        hidden_node_types=tuple(row.get("hidden_node_types") or ()),
        token_id=bare_token,
    )


async def get_share_token_row(db: AsyncDriver, token_id: str) -> dict | None:
    """Return Person.user_id + filter data for a token, or None.

    Used by the OAuth consent flow to verify the current user owns the
    share token they're trying to bind to an OAuth grant.
    """
    async with db.session() as session:
        result = await session.run(
            """
            MATCH (p:Person)-[:HAS_SHARE_TOKEN]->(st:ShareToken {token_id: $tid})
            WHERE coalesce(st.revoked, false) = false
              AND (st.expires_at IS NULL OR st.expires_at > datetime())
            RETURN p.user_id AS user_id,
                   st.keywords AS keywords,
                   coalesce(st.hidden_node_types, []) AS hidden_node_types
            """,
            tid=token_id,
        )
        row = await result.single()
    return dict(row) if row else None


def node_matches_filters(node: dict, keywords: list[str]) -> bool:
    """Check if any string property of a node contains any of the keywords (case-insensitive)."""
    for value in node.values():
        if isinstance(value, str):
            lower_val = value.lower()
            for kw in keywords:
                if kw.lower() in lower_val:
                    return True
    return False


async def increment_mcp_use(db: AsyncDriver, token_id: str) -> None:
    """Best-effort counter increment for MCP share-token usage.

    Callers dispatch this via `asyncio.create_task` — the response must
    NOT wait on it. Failures are logged (never raised), and the
    `token_id` is logged only as a short sha256 hint, never in clear,
    because `orbs_<token_id>` IS the bearer credential for this
    request — a plaintext log could end up in a log aggregator and
    leak the token.

    Missing tokens (e.g., deleted between auth and counter write) are
    a silent no-op by virtue of the `MATCH` clause: zero rows match,
    no update happens, no error.

    On process shutdown (e.g. Cloud Run SIGTERM) any in-flight task
    created here may be abandoned silently. This is accepted under
    the best-effort counter contract — the counter is eventually
    consistent, not authoritative.
    """
    try:
        async with db.session() as session:
            await session.run(INCREMENT_SHARE_TOKEN_MCP_USE, token_id=token_id)
    except Exception as exc:  # noqa: BLE001
        token_hint = hashlib.sha256(token_id.encode()).hexdigest()[:12]
        logger.warning(
            "Failed to increment mcp_use_count for token sha256:%s…: %s",
            token_hint,
            exc,
        )
