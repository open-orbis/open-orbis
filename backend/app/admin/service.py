"""Service layer for the closed-beta invitation system.

Functions here are shared by:
- the admin router (CRUD on access codes, beta config, pending users)
- the auth router (activation: code validation + consumption)
"""

from __future__ import annotations

import contextlib
import logging

from neo4j import AsyncDriver

from app.config import settings
from app.graph.encryption import decrypt_value
from app.graph.queries import (
    ACTIVATE_PERSON,
    CONSUME_ACCESS_CODE,
    COUNT_ACCESS_CODES,
    COUNT_PENDING_PERSONS,
    COUNT_PERSONS,
    CREATE_ACCESS_CODE,
    DELETE_ACCESS_CODE,
    GET_ACCESS_CODE,
    GET_BETA_CONFIG,
    INIT_BETA_CONFIG,
    IS_ADMIN,
    LIST_ACCESS_CODES,
    LIST_PENDING_PERSONS,
    SET_ACCESS_CODE_ACTIVE,
    UPDATE_BETA_CONFIG,
)

logger = logging.getLogger(__name__)


# ── BetaConfig (singleton) ──


async def get_beta_config(db: AsyncDriver) -> dict:
    """Return the singleton BetaConfig, creating it on first read."""
    async with db.session() as session:
        result = await session.run(GET_BETA_CONFIG)
        record = await result.single()
        if record is not None:
            return dict(record["c"])

        result = await session.run(
            INIT_BETA_CONFIG,
            invite_code_required=settings.invite_only_registration,
        )
        record = await result.single()
        return dict(record["c"])


async def update_beta_config(db: AsyncDriver, properties: dict) -> dict:
    await get_beta_config(db)
    async with db.session() as session:
        result = await session.run(UPDATE_BETA_CONFIG, properties=properties)
        record = await result.single()
        return dict(record["c"])


async def is_invite_code_required(db: AsyncDriver) -> bool:
    """Check if the invite code gate is active."""
    if not settings.invite_only_registration:
        return False
    config = await get_beta_config(db)
    return bool(config.get("invite_code_required", True))


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


# ── Pending users (registered but not activated) ──


async def count_pending_persons(db: AsyncDriver) -> int:
    async with db.session() as session:
        result = await session.run(COUNT_PENDING_PERSONS)
        record = await result.single()
        return int(record["total"]) if record else 0


async def list_pending_persons(db: AsyncDriver) -> list[dict]:
    async with db.session() as session:
        result = await session.run(LIST_PENDING_PERSONS)
        records = [r async for r in result]
    out = []
    for r in records:
        person = dict(r["p"])
        email = person.get("email", "")
        if email:
            with contextlib.suppress(Exception):
                email = decrypt_value(email)
        out.append({**person, "email": email})
    return out


# ── Activation ──


async def activate_person(db: AsyncDriver, user_id: str, code: str) -> bool:
    """Set signup_code on a Person after successful code consumption."""
    async with db.session() as session:
        result = await session.run(ACTIVATE_PERSON, user_id=user_id, code=code)
        return await result.single() is not None


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
    return [dict(r["a"]) for r in records]


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


async def validate_access_code(db: AsyncDriver, code: str | None) -> str | None:
    """Validate a code. Returns rejection reason, or None if valid."""
    if not code:
        return "no_code"
    record = await get_access_code(db, code)
    if record is None or not record.get("active"):
        return "invalid_code"
    if record.get("used_at") is not None:
        return "code_already_used"
    return None


async def consume_access_code(db: AsyncDriver, code: str, user_id: str) -> bool:
    """Atomically consume an unused code. Returns True on success."""
    async with db.session() as session:
        result = await session.run(CONSUME_ACCESS_CODE, code=code, user_id=user_id)
        return await result.single() is not None


async def count_access_codes(db: AsyncDriver) -> dict[str, int]:
    async with db.session() as session:
        result = await session.run(COUNT_ACCESS_CODES)
        record = await result.single()
    if not record:
        return {"total": 0, "used": 0, "available": 0}
    return {
        "total": int(record["total"]),
        "used": int(record["used"]),
        "available": int(record["available"]),
    }


async def create_batch_access_codes(
    db: AsyncDriver,
    *,
    prefix: str,
    count: int,
    label: str,
    created_by: str,
) -> list[dict]:
    import uuid

    codes = []
    async with db.session() as session:
        for _ in range(count):
            code = f"{prefix}-{uuid.uuid4().hex[:6]}"
            result = await session.run(
                CREATE_ACCESS_CODE,
                code=code,
                label=label,
                created_by=created_by,
            )
            record = await result.single()
            if record:
                codes.append(dict(record["a"]))
    return codes
