"""PostgreSQL database for draft notes."""

from __future__ import annotations

from datetime import datetime

from app.db.postgres import get_pool


async def list_drafts(user_id: str) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT uid, text, created_at, updated_at FROM drafts "
        "WHERE user_id = $1 ORDER BY updated_at DESC",
        user_id,
    )
    return [dict(r) for r in rows]


async def create_draft(uid: str, user_id: str, text: str, now: datetime) -> dict:
    pool = await get_pool()
    await pool.execute(
        "INSERT INTO drafts (uid, user_id, text, created_at, updated_at) "
        "VALUES ($1, $2, $3, $4, $5)",
        uid,
        user_id,
        text,
        now,
        now,
    )
    return {"uid": uid, "text": text, "created_at": now, "updated_at": now}


async def update_draft(uid: str, user_id: str, text: str, now: datetime) -> dict | None:
    pool = await get_pool()
    result = await pool.execute(
        "UPDATE drafts SET text = $1, updated_at = $2 WHERE uid = $3 AND user_id = $4",
        text,
        now,
        uid,
        user_id,
    )
    if result == "UPDATE 0":
        return None
    row = await pool.fetchrow(
        "SELECT uid, text, created_at, updated_at FROM drafts WHERE uid = $1",
        uid,
    )
    return dict(row) if row else None


async def delete_draft(uid: str, user_id: str) -> bool:
    pool = await get_pool()
    result = await pool.execute(
        "DELETE FROM drafts WHERE uid = $1 AND user_id = $2",
        uid,
        user_id,
    )
    return result != "DELETE 0"


async def delete_all_for_user(user_id: str) -> int:
    """Delete all drafts for a user (e.g., on account deletion)."""
    pool = await get_pool()
    result = await pool.execute(
        "DELETE FROM drafts WHERE user_id = $1",
        user_id,
    )
    # result is like "DELETE 3"
    return int(result.split()[-1])
