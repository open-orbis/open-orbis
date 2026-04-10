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
    ACTIVATE_ALL_PENDING,
    ACTIVATE_PERSON,
    ACTIVATE_PERSON_BY_ADMIN,
    AVG_ACTIVATION_TIME,
    CODE_ATTRIBUTION,
    CONSUME_ACCESS_CODE,
    COUNT_ACCESS_CODES,
    COUNT_PENDING_PERSONS,
    COUNT_PERSONS,
    CREATE_ACCESS_CODE,
    DELETE_ACCESS_CODE,
    DELETE_PERSON_FULL,
    DELETE_PERSON_NODE,
    ENGAGEMENT_DISTRIBUTION,
    FUNNEL_ACTIVATIONS_PER_DAY,
    FUNNEL_SIGNUPS_PER_DAY,
    GET_ACCESS_CODE,
    GET_BETA_CONFIG,
    GET_PERSON_BY_USER_ID,
    GET_PERSON_DETAIL,
    GRANT_ADMIN_BY_USER_ID,
    INIT_BETA_CONFIG,
    IS_ADMIN,
    LIST_ACCESS_CODES,
    LIST_ALL_PERSONS,
    LIST_PENDING_PERSONS,
    PROVIDER_BREAKDOWN,
    REVOKE_ADMIN_BY_USER_ID,
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
        config = dict(record["c"])

    # When opening the platform, auto-activate all pending users
    if properties.get("invite_code_required") is False:
        await activate_all_pending(db)

    return config


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


async def activate_all_pending(db: AsyncDriver) -> int:
    """Auto-activate all pending users (used when platform opens)."""
    async with db.session() as session:
        result = await session.run(ACTIVATE_ALL_PENDING, code="open-registration")
        record = await result.single()
        count = int(record["activated"]) if record else 0
    if count:
        logger.info("Auto-activated %d pending user(s) (platform opened)", count)
    return count


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


# ── User management ──


async def list_all_users(db: AsyncDriver) -> list[dict]:
    """Return all registered users with decrypted emails."""
    async with db.session() as session:
        result = await session.run(LIST_ALL_PERSONS)
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


async def get_user_detail(db: AsyncDriver, user_id: str) -> dict | None:
    """Return a single user with node count and decrypted email."""
    async with db.session() as session:
        result = await session.run(GET_PERSON_DETAIL, user_id=user_id)
        record = await result.single()
    if not record:
        return None
    person = dict(record["p"])
    email = person.get("email", "")
    if email:
        with contextlib.suppress(Exception):
            email = decrypt_value(email)
    return {**person, "email": email, "node_count": int(record["node_count"])}


async def activate_user_by_admin(
    db: AsyncDriver, user_id: str, code: str
) -> dict | None:
    """Activate a pending user by admin, assigning a code."""
    async with db.session() as session:
        result = await session.run(ACTIVATE_PERSON_BY_ADMIN, user_id=user_id, code=code)
        record = await result.single()
    if not record:
        return None
    person = dict(record["p"])
    email = person.get("email", "")
    if email:
        with contextlib.suppress(Exception):
            email = decrypt_value(email)
    return {**person, "email": email}


async def delete_user(db: AsyncDriver, user_id: str) -> bool:
    """Delete a user and all their graph data. Returns True if user existed."""
    async with db.session() as session:
        # Check user exists
        result = await session.run(GET_PERSON_BY_USER_ID, user_id=user_id)
        if await result.single() is None:
            return False
        # Delete all connected nodes first
        await session.run(DELETE_PERSON_FULL, user_id=user_id)
        # Delete the person node
        await session.run(DELETE_PERSON_NODE, user_id=user_id)
    return True


async def grant_admin(db: AsyncDriver, user_id: str) -> dict | None:
    """Promote a user to admin."""
    async with db.session() as session:
        result = await session.run(GRANT_ADMIN_BY_USER_ID, user_id=user_id)
        record = await result.single()
    if not record:
        return None
    person = dict(record["p"])
    email = person.get("email", "")
    if email:
        with contextlib.suppress(Exception):
            email = decrypt_value(email)
    return {**person, "email": email}


async def revoke_admin(db: AsyncDriver, user_id: str) -> dict | None:
    """Revoke admin from a user."""
    async with db.session() as session:
        result = await session.run(REVOKE_ADMIN_BY_USER_ID, user_id=user_id)
        record = await result.single()
    if not record:
        return None
    person = dict(record["p"])
    email = person.get("email", "")
    if email:
        with contextlib.suppress(Exception):
            email = decrypt_value(email)
    return {**person, "email": email}


# ── Funnel metrics ──


async def get_funnel_metrics(db: AsyncDriver, days: int = 30) -> dict:
    """Return signup and activation time-series for the last N days."""
    async with db.session() as session:
        result = await session.run(FUNNEL_SIGNUPS_PER_DAY, days=days)
        signups = [{"date": r["date"], "count": int(r["count"])} async for r in result]

        result = await session.run(FUNNEL_ACTIVATIONS_PER_DAY, days=days)
        activations = [
            {"date": r["date"], "count": int(r["count"])} async for r in result
        ]

    total_signups = sum(s["count"] for s in signups)
    total_activations = sum(a["count"] for a in activations)
    conversion_rate = (
        round(total_activations / total_signups, 4) if total_signups else 0.0
    )

    return {
        "signups": signups,
        "activations": activations,
        "total_signups": total_signups,
        "total_activations": total_activations,
        "conversion_rate": conversion_rate,
    }


# ── Insights ──


async def get_insights(db: AsyncDriver) -> dict:
    """Return provider breakdown, activation time, code attribution, engagement."""
    async with db.session() as session:
        result = await session.run(PROVIDER_BREAKDOWN)
        providers = [
            {"provider": r["provider"], "count": int(r["count"])} async for r in result
        ]

        result = await session.run(AVG_ACTIVATION_TIME)
        record = await result.single()
        activation_time = {
            "total": int(record["total"]) if record else 0,
            "avg_hours": round(float(record["avg_hours"]), 2)
            if record and record["avg_hours"] is not None
            else None,
            "min_hours": round(float(record["min_hours"]), 2)
            if record and record["min_hours"] is not None
            else None,
            "max_hours": round(float(record["max_hours"]), 2)
            if record and record["max_hours"] is not None
            else None,
        }

        result = await session.run(CODE_ATTRIBUTION)
        code_attribution = [
            {"label": r["label"], "count": int(r["count"])} async for r in result
        ]

        result = await session.run(ENGAGEMENT_DISTRIBUTION)
        engagement = [
            {"bucket": r["bucket"], "count": int(r["count"])} async for r in result
        ]

    return {
        "providers": providers,
        "activation_time": activation_time,
        "code_attribution": code_attribution,
        "engagement": engagement,
    }
