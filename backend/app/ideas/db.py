"""PostgreSQL store for user-submitted ideas."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.db.postgres import get_pool


async def insert_idea(user_id: str, text: str) -> dict:
    """Insert a new idea and return it as a dict."""
    pool = await get_pool()
    idea_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await pool.execute(
        "INSERT INTO ideas (idea_id, user_id, text, created_at) "
        "VALUES ($1, $2, $3, $4)",
        idea_id,
        user_id,
        text,
        now,
    )
    return {"idea_id": idea_id, "user_id": user_id, "text": text, "created_at": now}


async def list_ideas() -> list[dict]:
    """List all ideas, newest first."""
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT idea_id, user_id, text, created_at FROM ideas ORDER BY created_at DESC"
    )
    return [dict(r) for r in rows]


async def delete_idea(idea_id: str) -> bool:
    """Delete an idea by ID. Returns True if found."""
    pool = await get_pool()
    result = await pool.execute(
        "DELETE FROM ideas WHERE idea_id = $1",
        idea_id,
    )
    return result != "DELETE 0"
