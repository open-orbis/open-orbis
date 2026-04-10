"""Simple SQLite store for user-submitted ideas."""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

_DB_PATH = Path(__file__).parent.parent.parent / "data" / "ideas.db"
_conn: sqlite3.Connection | None = None


def _get_conn() -> sqlite3.Connection:
    global _conn  # noqa: PLW0603
    if _conn is None:
        _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute("""
            CREATE TABLE IF NOT EXISTS ideas (
                idea_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                text TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        _conn.commit()
    return _conn


def insert_idea(user_id: str, text: str) -> dict:
    """Insert a new idea and return it as a dict."""
    conn = _get_conn()
    idea_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO ideas (idea_id, user_id, text, created_at) VALUES (?, ?, ?, ?)",
        (idea_id, user_id, text, now),
    )
    conn.commit()
    return {"idea_id": idea_id, "user_id": user_id, "text": text, "created_at": now}


def list_ideas() -> list[dict]:
    """List all ideas, newest first."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT idea_id, user_id, text, created_at FROM ideas ORDER BY created_at DESC"
    ).fetchall()
    return [dict(r) for r in rows]


def delete_idea(idea_id: str) -> bool:
    """Delete an idea by ID. Returns True if found."""
    conn = _get_conn()
    cursor = conn.execute("DELETE FROM ideas WHERE idea_id = ?", (idea_id,))
    conn.commit()
    return cursor.rowcount > 0
