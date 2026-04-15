"""PostgreSQL store for user-submitted ideas."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.db.postgres import get_pool


async def ensure_source_column() -> None:
    """Add the source column if it doesn't exist (migration)."""
    pool = await get_pool()
    await pool.execute(
        "ALTER TABLE ideas ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'idea'"
    )


async def insert_idea(user_id: str, text: str, source: str = "idea") -> dict:
    """Insert a new idea or feedback and return it as a dict."""
    pool = await get_pool()
    idea_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    await pool.execute(
        "INSERT INTO ideas (idea_id, user_id, text, created_at, source) "
        "VALUES ($1, $2, $3, $4, $5)",
        idea_id,
        user_id,
        text,
        now,
        source,
    )
    return {"idea_id": idea_id, "user_id": user_id, "text": text, "created_at": now.isoformat(), "source": source}


async def list_ideas(source: str | None = None) -> list[dict]:
    """List ideas/feedback, newest first. Optionally filter by source."""
    pool = await get_pool()
    if source:
        rows = await pool.fetch(
            "SELECT idea_id, user_id, text, created_at, "
            "COALESCE(source, 'idea') AS source "
            "FROM ideas WHERE source = $1 ORDER BY created_at DESC",
            source,
        )
    else:
        rows = await pool.fetch(
            "SELECT idea_id, user_id, text, created_at, "
            "COALESCE(source, 'idea') AS source "
            "FROM ideas ORDER BY created_at DESC"
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
