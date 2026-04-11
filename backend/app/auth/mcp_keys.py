"""MCP API key lifecycle — long-lived machine credentials per user.

The MCP server authenticates agent callers via ``X-MCP-Key: orbk_...``.
Keys are user-scoped, so every tool call resolves to a single user_id
and can only touch that user's graph.

Raw keys are shown to the user exactly once at creation time. Only
SHA-256 hashes are persisted.
"""

from __future__ import annotations

import hashlib
import logging
import secrets
import uuid
from typing import Any

from neo4j import AsyncDriver

from app.graph.queries import (
    CREATE_MCP_API_KEY,
    GET_MCP_KEY_BY_HASH,
    LIST_MCP_KEYS_FOR_USER,
    REVOKE_MCP_KEY,
    TOUCH_MCP_KEY_LAST_USED,
)

logger = logging.getLogger(__name__)

_PREFIX = "orbk_"


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _generate_raw_key() -> str:
    return _PREFIX + secrets.token_urlsafe(32)


async def create_api_key(
    db: AsyncDriver,
    *,
    user_id: str,
    label: str,
) -> tuple[str, dict]:
    """Mint a new API key. Returns ``(raw_key, metadata_dict)``.

    The raw key is only visible here — the caller must surface it to the
    user immediately and never persist it anywhere else.
    """
    raw = _generate_raw_key()
    key_id = str(uuid.uuid4())

    async with db.session() as session:
        result = await session.run(
            CREATE_MCP_API_KEY,
            user_id=user_id,
            key_id=key_id,
            hash=_hash_key(raw),
            label=label[:80] if label else "",
        )
        record = await result.single()
        if record is None:
            raise RuntimeError("failed to create MCP API key")
        meta = _serialize(dict(record["k"]))
    return raw, meta


async def resolve_api_key(
    db: AsyncDriver,
    *,
    raw_key: str,
) -> str | None:
    """Look up a raw key and return the owning user_id, or ``None`` if
    the key is invalid or revoked. Also bumps last_used_at."""
    if not raw_key or not raw_key.startswith(_PREFIX):
        return None

    async with db.session() as session:
        result = await session.run(GET_MCP_KEY_BY_HASH, hash=_hash_key(raw_key))
        record = await result.single()
        if record is None:
            return None
        user_id = record["user_id"]
        key_id = dict(record["k"])["key_id"]
        # Best-effort touch — don't block the request if it fails.
        try:
            await session.run(TOUCH_MCP_KEY_LAST_USED, key_id=key_id)
        except Exception as exc:
            logger.warning("touch mcp key failed: %s", exc)
    return user_id


async def list_api_keys(
    db: AsyncDriver,
    *,
    user_id: str,
) -> list[dict]:
    """List metadata for a user's API keys. Never includes the raw key."""
    async with db.session() as session:
        result = await session.run(LIST_MCP_KEYS_FOR_USER, user_id=user_id)
        records = [r async for r in result]
    return [_serialize(dict(r["k"])) for r in records]


async def revoke_api_key(
    db: AsyncDriver,
    *,
    user_id: str,
    key_id: str,
) -> bool:
    async with db.session() as session:
        result = await session.run(REVOKE_MCP_KEY, user_id=user_id, key_id=key_id)
        record = await result.single()
        return record is not None


def _serialize(k: dict) -> dict:
    """Strip the hash from the returned payload — the user doesn't need it
    and shouldn't see it — and coerce datetimes to ISO strings."""
    out: dict[str, Any] = {}
    for field in ("key_id", "label", "revoked"):
        if field in k:
            out[field] = k[field]
    for field in ("created_at", "last_used_at", "revoked_at"):
        val = k.get(field)
        if val is None:
            out[field] = None
        elif hasattr(val, "iso_format"):
            out[field] = val.iso_format()
        elif hasattr(val, "isoformat"):
            out[field] = val.isoformat()
        else:
            out[field] = str(val)
    return out
