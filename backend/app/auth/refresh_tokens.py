"""Refresh token lifecycle — issue, rotate, revoke, reuse detection.

Rotation rules enforced here:
- Every /auth/refresh invalidates the presented token and issues a new one.
- If a token is presented twice (already rotated), the whole family rooted
  at that token is revoked. This catches the "attacker stole the cookie and
  used it, then the victim's legitimate refresh fires later" scenario —
  whoever loses the race gets logged out globally and re-authenticates.
- Raw tokens are never persisted. We store SHA-256 of the token and look
  up by that hash. A DB leak cannot be replayed.
"""

from __future__ import annotations

import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from neo4j import AsyncDriver

from app.graph.queries import (
    CREATE_REFRESH_TOKEN,
    GET_REFRESH_TOKEN_BY_HASH,
    MARK_REFRESH_TOKEN_ROTATED,
    PURGE_EXPIRED_REFRESH_TOKENS,
    REVOKE_ALL_REFRESH_TOKENS_FOR_USER,
    REVOKE_REFRESH_TOKEN,
    REVOKE_REFRESH_TOKEN_FAMILY,
)

logger = logging.getLogger(__name__)


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _generate_raw_token() -> str:
    # 32 bytes = 256 bits of entropy, url-safe encoded for cookie transport.
    return secrets.token_urlsafe(32)


async def issue_refresh_token(
    db: AsyncDriver,
    *,
    user_id: str,
    ttl_days: int,
    user_agent: str = "",
) -> tuple[str, str, datetime]:
    """Create a new refresh token and return ``(raw_token, token_id, expires_at)``.

    The raw token is the only copy returned — the caller puts it in the
    cookie and forgets it. Only the hash is persisted.
    """
    raw = _generate_raw_token()
    token_id = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(days=ttl_days)

    async with db.session() as session:
        await session.run(
            CREATE_REFRESH_TOKEN,
            user_id=user_id,
            token_id=token_id,
            hash=_hash_token(raw),
            expires_at=expires_at.isoformat(),
            user_agent=user_agent[:255] if user_agent else "",
        )
    return raw, token_id, expires_at


async def rotate_refresh_token(
    db: AsyncDriver,
    *,
    raw_token: str,
    ttl_days: int,
    user_agent: str = "",
) -> tuple[str, str, str, datetime] | None:
    """Validate, rotate, and return ``(raw_new, token_id_new, user_id, expires_at)``.

    Returns ``None`` if the token is missing, expired, or failed reuse
    detection. In the reuse case the entire token family is revoked as a
    side effect so any concurrent session for that user is killed.
    """
    token_hash = _hash_token(raw_token)

    async with db.session() as session:
        result = await session.run(GET_REFRESH_TOKEN_BY_HASH, hash=token_hash)
        record = await result.single()

        if record is None:
            logger.info("refresh: token hash not found")
            return None

        rt = dict(record["rt"])
        user_id = record["user_id"]
        token_id = rt["token_id"]

        expires_at_raw = rt.get("expires_at")
        if expires_at_raw is None:
            return None
        expires_at_dt = _to_datetime(expires_at_raw)
        if expires_at_dt < datetime.now(timezone.utc):
            logger.info("refresh: token %s expired", token_id)
            return None

        if rt.get("revoked"):
            logger.warning(
                "refresh: reuse detected on token_id=%s user=%s — revoking family",
                token_id,
                user_id,
            )
            await session.run(REVOKE_REFRESH_TOKEN_FAMILY, token_id=token_id)
            return None

        # Happy path: mint a new token first, then mark the old one as
        # rotated pointing to the new one.
        raw_new = _generate_raw_token()
        token_id_new = str(uuid.uuid4())
        expires_new = datetime.now(timezone.utc) + timedelta(days=ttl_days)

        await session.run(
            CREATE_REFRESH_TOKEN,
            user_id=user_id,
            token_id=token_id_new,
            hash=_hash_token(raw_new),
            expires_at=expires_new.isoformat(),
            user_agent=user_agent[:255] if user_agent else "",
        )
        await session.run(
            MARK_REFRESH_TOKEN_ROTATED,
            token_id=token_id,
            replaced_by=token_id_new,
        )

    return raw_new, token_id_new, user_id, expires_new


async def revoke_refresh_token(db: AsyncDriver, *, raw_token: str) -> bool:
    """Revoke a single token by its raw value. Used on /auth/logout."""
    token_hash = _hash_token(raw_token)
    async with db.session() as session:
        result = await session.run(GET_REFRESH_TOKEN_BY_HASH, hash=token_hash)
        record = await result.single()
        if record is None:
            return False
        token_id = dict(record["rt"])["token_id"]
        await session.run(REVOKE_REFRESH_TOKEN, token_id=token_id)
    return True


async def revoke_all_for_user(db: AsyncDriver, *, user_id: str) -> int:
    """Revoke every non-revoked refresh token for a user. Used on account
    deletion and 'log out everywhere'."""
    async with db.session() as session:
        result = await session.run(REVOKE_ALL_REFRESH_TOKENS_FOR_USER, user_id=user_id)
        record = await result.single()
        return int(record["revoked_count"]) if record else 0


async def purge_expired(db: AsyncDriver) -> int:
    """Delete refresh tokens whose expires_at is in the past. Safe to run
    periodically from the cleanup task."""
    async with db.session() as session:
        result = await session.run(PURGE_EXPIRED_REFRESH_TOKENS)
        record = await result.single()
        return int(record["deleted"]) if record else 0


def _to_datetime(value: Any) -> datetime:
    """Coerce neo4j DateTime or ISO string into a tz-aware datetime."""
    if hasattr(value, "to_native"):
        dt = value.to_native()
    elif isinstance(value, str):
        dt = datetime.fromisoformat(value)
    else:
        dt = value
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt
