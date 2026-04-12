"""Per-user access grants for restricted orbs.

When an orb's visibility is ``restricted``, only logged-in users whose
email matches an active ``AccessGrant`` can view it. The owner manages
the allowlist via dedicated endpoints. Grants are stored as nodes
parallel to ``ShareToken`` so they support audit trail and future
extensions (expiry, view tracking).
"""

from __future__ import annotations

import secrets

from neo4j import AsyncDriver
from neo4j.time import Date as Neo4jDate
from neo4j.time import DateTime as Neo4jDateTime
from neo4j.time import Time as Neo4jTime

from app.graph.queries import (
    CHECK_ACCESS_GRANT,
    CREATE_ACCESS_GRANT,
    LIST_ACCESS_GRANTS,
    REVOKE_ACCESS_GRANT,
    UPDATE_ACCESS_GRANT_FILTERS,
)


def _sanitize(d: dict) -> dict:
    """Convert Neo4j temporal types to JSON-safe strings."""
    result = {}
    for k, v in d.items():
        if isinstance(v, (Neo4jDateTime, Neo4jDate, Neo4jTime)):
            result[k] = v.iso_format()
        else:
            result[k] = v
    return result


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _normalize_keywords(keywords: list[str] | None) -> list[str]:
    normalized = [kw.strip().lower() for kw in (keywords or []) if kw.strip()]
    return list(dict.fromkeys(normalized))


def _normalize_hidden_types(hidden_node_types: list[str] | None) -> list[str]:
    normalized = [
        node_type.strip()
        for node_type in (hidden_node_types or [])
        if node_type.strip()
    ]
    return list(dict.fromkeys(normalized))


def _apply_filter_defaults(grant: dict) -> dict:
    grant["keywords"] = list(grant.get("keywords") or [])
    grant["hidden_node_types"] = list(grant.get("hidden_node_types") or [])
    return grant


async def create_access_grant(
    db: AsyncDriver,
    user_id: str,
    email: str,
    keywords: list[str] | None = None,
    hidden_node_types: list[str] | None = None,
) -> dict | None:
    """Create an access grant for the given email on the user's orb.

    Returns ``None`` if the user has no orb_id set.
    """
    # 32 bytes (256 bit) matches share_token and access-token hash widths.
    # Grant ids are used in URLs shared by owners to recipients, so the
    # extra margin guards against any future brute-force enumeration.
    grant_id = secrets.token_urlsafe(32)
    normalized = _normalize_email(email)
    normalized_keywords = _normalize_keywords(keywords)
    normalized_hidden_types = _normalize_hidden_types(hidden_node_types)

    async with db.session() as session:
        result = await session.run(
            CREATE_ACCESS_GRANT,
            user_id=user_id,
            grant_id=grant_id,
            email=normalized,
            keywords=normalized_keywords,
            hidden_node_types=normalized_hidden_types,
        )
        record = await result.single()
        if record is None:
            return None
        grant = _apply_filter_defaults(_sanitize(dict(record["g"])))
        grant["owner_name"] = record["owner_name"] or ""
        return grant


async def list_access_grants(db: AsyncDriver, user_id: str) -> list[dict]:
    """List active (non-revoked) grants for the user's orb."""
    async with db.session() as session:
        result = await session.run(LIST_ACCESS_GRANTS, user_id=user_id)
        grants = []
        async for record in result:
            grants.append(_apply_filter_defaults(_sanitize(dict(record["g"]))))
        return grants


async def revoke_access_grant(
    db: AsyncDriver, user_id: str, grant_id: str
) -> dict | None:
    """Mark a grant as revoked. Returns the grant dict or ``None``."""
    async with db.session() as session:
        result = await session.run(
            REVOKE_ACCESS_GRANT, user_id=user_id, grant_id=grant_id
        )
        record = await result.single()
        if record is None:
            return None
        return _apply_filter_defaults(_sanitize(dict(record["g"])))


async def update_access_grant_filters(
    db: AsyncDriver,
    user_id: str,
    grant_id: str,
    keywords: list[str] | None,
    hidden_node_types: list[str] | None,
) -> dict | None:
    """Update filter scope for an existing active access grant."""
    normalized_keywords = _normalize_keywords(keywords)
    normalized_hidden_types = _normalize_hidden_types(hidden_node_types)
    async with db.session() as session:
        result = await session.run(
            UPDATE_ACCESS_GRANT_FILTERS,
            user_id=user_id,
            grant_id=grant_id,
            keywords=normalized_keywords,
            hidden_node_types=normalized_hidden_types,
        )
        record = await result.single()
        if record is None:
            return None
        return _apply_filter_defaults(_sanitize(dict(record["g"])))


async def get_access_grant_for_user(
    db: AsyncDriver, orb_id: str, email: str
) -> dict | None:
    """Return the active grant for this orb/email, or None."""
    normalized = _normalize_email(email)
    if not normalized:
        return None
    async with db.session() as session:
        result = await session.run(CHECK_ACCESS_GRANT, orb_id=orb_id, email=normalized)
        record = await result.single()
        if record is None:
            return None
        return _apply_filter_defaults(_sanitize(dict(record["g"])))


async def user_has_access(db: AsyncDriver, orb_id: str, email: str) -> bool:
    """Return True if the email has an active grant for the orb."""
    return await get_access_grant_for_user(db, orb_id, email) is not None
