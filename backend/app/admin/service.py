"""Service layer for the closed-beta invitation system.

Functions here are shared by:
- the admin router (CRUD on access codes, beta config, waitlist)
- the auth router (signup-time validation: code check, cap check, waitlist write)

Keeping the data access in one place avoids duplicating Cypher across two
modules and makes the invariants ("a signup needs a valid code AND a free
seat OR it goes to waitlist") easier to reason about.
"""

from __future__ import annotations

import logging

from neo4j import AsyncDriver

from app.config import settings
from app.graph.encryption import decrypt_value, encrypt_value
from app.graph.queries import (
    COUNT_PERSONS,
    CREATE_ACCESS_CODE,
    DELETE_ACCESS_CODE,
    GET_ACCESS_CODE,
    GET_BETA_CONFIG,
    INIT_BETA_CONFIG,
    IS_ADMIN,
    LIST_ACCESS_CODES,
    LIST_WAITLIST,
    MARK_WAITLIST_CONTACTED,
    SET_ACCESS_CODE_ACTIVE,
    UPDATE_BETA_CONFIG,
    UPSERT_WAITLIST,
    WAITLIST_STATS,
)

logger = logging.getLogger(__name__)


# ── BetaConfig (singleton) ──


async def get_beta_config(db: AsyncDriver) -> dict:
    """Return the singleton BetaConfig, creating it on first read.

    The default cap is taken from settings.beta_default_cap, so a fresh
    deployment behaves predictably without manual seeding.
    """
    async with db.session() as session:
        result = await session.run(GET_BETA_CONFIG)
        record = await result.single()
        if record is not None:
            return dict(record["c"])

        # Lazy init
        result = await session.run(
            INIT_BETA_CONFIG, max_users=settings.beta_default_cap
        )
        record = await result.single()
        return dict(record["c"])


async def update_beta_config(db: AsyncDriver, properties: dict) -> dict:
    """Update fields on the singleton BetaConfig and return the new state."""
    # Make sure the singleton exists before we try to SET on it.
    await get_beta_config(db)
    async with db.session() as session:
        result = await session.run(UPDATE_BETA_CONFIG, properties=properties)
        record = await result.single()
        return dict(record["c"])


# ── Person count + admin flag ──


async def count_persons(db: AsyncDriver) -> int:
    async with db.session() as session:
        result = await session.run(COUNT_PERSONS)
        record = await result.single()
        return int(record["total"]) if record else 0


async def is_admin(db: AsyncDriver, user_id: str) -> bool:
    async with db.session() as session:
        result = await session.run(IS_ADMIN, user_id=user_id)
        record = await result.single()
        return bool(record["is_admin"]) if record else False


# ── AccessCode ──


async def create_access_code(
    db: AsyncDriver, code: str, label: str, created_by: str
) -> dict:
    async with db.session() as session:
        result = await session.run(
            CREATE_ACCESS_CODE,
            code=code,
            label=label,
            created_by=created_by,
        )
        record = await result.single()
        return dict(record["a"])


async def get_access_code(db: AsyncDriver, code: str) -> dict | None:
    async with db.session() as session:
        result = await session.run(GET_ACCESS_CODE, code=code)
        record = await result.single()
        return dict(record["a"]) if record else None


async def list_access_codes(db: AsyncDriver) -> list[dict]:
    async with db.session() as session:
        result = await session.run(LIST_ACCESS_CODES)
        records = [r async for r in result]
    return [{**dict(r["a"]), "uses": int(r["uses"])} for r in records]


async def set_access_code_active(
    db: AsyncDriver, code: str, active: bool
) -> dict | None:
    async with db.session() as session:
        result = await session.run(SET_ACCESS_CODE_ACTIVE, code=code, active=active)
        record = await result.single()
        return dict(record["a"]) if record else None


async def delete_access_code(db: AsyncDriver, code: str) -> None:
    async with db.session() as session:
        await session.run(DELETE_ACCESS_CODE, code=code)


async def is_access_code_valid(db: AsyncDriver, code: str | None) -> bool:
    """Return True iff the code exists and is currently active."""
    if not code:
        return False
    record = await get_access_code(db, code)
    return bool(record and record.get("active"))


# ── Waitlist ──


def _decrypt_waitlist_node(node: dict) -> dict:
    """Decrypt the email field on a Waitlist node for outbound responses."""
    out = dict(node)
    if out.get("email"):
        try:
            out["email"] = decrypt_value(out["email"])
        except Exception as e:
            logger.warning("Failed to decrypt waitlist email: %s", e)
    return out


async def upsert_waitlist(
    db: AsyncDriver,
    *,
    email: str,
    name: str,
    provider: str,
    attempted_code: str | None,
    reason: str,
) -> None:
    """Record a rejected signup attempt. Email is stored Fernet-encrypted."""
    async with db.session() as session:
        await session.run(
            UPSERT_WAITLIST,
            email=encrypt_value(email),
            name=name or "",
            provider=provider,
            attempted_code=attempted_code,
            reason=reason,
        )


async def list_waitlist(db: AsyncDriver) -> list[dict]:
    async with db.session() as session:
        result = await session.run(LIST_WAITLIST)
        records = [r async for r in result]
    return [_decrypt_waitlist_node(dict(r["w"])) for r in records]


async def mark_waitlist_contacted(
    db: AsyncDriver, email: str, contacted: bool
) -> dict | None:
    async with db.session() as session:
        result = await session.run(
            MARK_WAITLIST_CONTACTED,
            email=encrypt_value(email),
            contacted=contacted,
        )
        record = await result.single()
        return _decrypt_waitlist_node(dict(record["w"])) if record else None


async def waitlist_stats(db: AsyncDriver) -> dict[str, int]:
    """Return waitlist counts grouped by reason."""
    async with db.session() as session:
        result = await session.run(WAITLIST_STATS)
        records = [r async for r in result]
    return {r["reason"]: int(r["count"]) for r in records if r["reason"]}
