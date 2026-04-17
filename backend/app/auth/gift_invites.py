"""User-issued 'gift' invite codes (#385).

Each activated user gets a lifetime quota of 3 invite codes to share with
friends. Codes are stored as ``:AccessCode`` nodes with ``source='gift'``
and ``created_by = <user_id>`` — they flow through the same
``/auth/activate`` consumption logic as admin codes.
"""

from __future__ import annotations

import secrets
from typing import Any

from neo4j import AsyncDriver
from neo4j.time import Date as Neo4jDate
from neo4j.time import DateTime as Neo4jDateTime
from neo4j.time import Time as Neo4jTime

from app.graph.queries import (
    COUNT_GIFT_INVITES,
    CREATE_GIFT_INVITE,
    LIST_GIFT_INVITES,
)

GIFT_INVITE_QUOTA = 3
GIFT_INVITE_PREFIX = "gift-"


def _sanitize(d: dict) -> dict:
    result = {}
    for k, v in d.items():
        if isinstance(v, (Neo4jDateTime, Neo4jDate, Neo4jTime)):
            result[k] = v.iso_format()
        else:
            result[k] = v
    return result


def _generate_code() -> str:
    """Short, human-readable, URL-safe invite code."""
    return f"{GIFT_INVITE_PREFIX}{secrets.token_urlsafe(6)}"


async def list_gift_invites(db: AsyncDriver, user_id: str) -> list[dict[str, Any]]:
    async with db.session() as session:
        result = await session.run(LIST_GIFT_INVITES, user_id=user_id)
        items: list[dict[str, Any]] = []
        async for record in result:
            items.append(_sanitize(dict(record["a"])))
        return items


async def count_gift_invites(db: AsyncDriver, user_id: str) -> tuple[int, int]:
    """Return ``(total_issued, consumed)`` for the user."""
    async with db.session() as session:
        result = await session.run(COUNT_GIFT_INVITES, user_id=user_id)
        record = await result.single()
        if record is None:
            return (0, 0)
        return (int(record["total_issued"]), int(record["consumed"]))


async def generate_gift_invite(
    db: AsyncDriver, user_id: str
) -> tuple[str, dict[str, Any] | None]:
    """Create one invite if the user is under the quota.

    Returns a ``(status, code_dict | None)`` tuple where status is one of
    ``"created" | "quota_reached"``.
    """
    total_issued, _consumed = await count_gift_invites(db, user_id)
    if total_issued >= GIFT_INVITE_QUOTA:
        return ("quota_reached", None)

    code = _generate_code()
    label = f"Gift from {user_id}"
    async with db.session() as session:
        result = await session.run(
            CREATE_GIFT_INVITE,
            code=code,
            label=label,
            user_id=user_id,
        )
        record = await result.single()
        if record is None:
            return ("quota_reached", None)
        return ("created", _sanitize(dict(record["a"])))
