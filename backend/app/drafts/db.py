"""SQLite database for draft notes — separate from the main Neo4j graph."""

from __future__ import annotations

import sqlite3
from pathlib import Path

_DB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "drafts.db"
_conn: sqlite3.Connection | None = None


def _get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute(
            """
            CREATE TABLE IF NOT EXISTS drafts (
                uid TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                text TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        _conn.execute("CREATE INDEX IF NOT EXISTS idx_drafts_user ON drafts(user_id)")
        _conn.commit()
    return _conn


def list_drafts(user_id: str) -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT uid, text, created_at, updated_at FROM drafts "
        "WHERE user_id = ? ORDER BY updated_at DESC",
        (user_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def create_draft(uid: str, user_id: str, text: str, now: str) -> dict:
    conn = _get_conn()
    conn.execute(
        "INSERT INTO drafts (uid, user_id, text, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (uid, user_id, text, now, now),
    )
    conn.commit()
    return {"uid": uid, "text": text, "created_at": now, "updated_at": now}


def update_draft(uid: str, user_id: str, text: str, now: str) -> dict | None:
    conn = _get_conn()
    cur = conn.execute(
        "UPDATE drafts SET text = ?, updated_at = ? WHERE uid = ? AND user_id = ?",
        (text, now, uid, user_id),
    )
    conn.commit()
    if cur.rowcount == 0:
        return None
    row = conn.execute(
        "SELECT uid, text, created_at, updated_at FROM drafts WHERE uid = ?",
        (uid,),
    ).fetchone()
    return dict(row) if row else None


def delete_draft(uid: str, user_id: str) -> bool:
    conn = _get_conn()
    cur = conn.execute(
        "DELETE FROM drafts WHERE uid = ? AND user_id = ?",
        (uid, user_id),
    )
    conn.commit()
    return cur.rowcount > 0


def delete_all_for_user(user_id: str) -> int:
    """Delete all drafts for a user (e.g., on account deletion)."""
    conn = _get_conn()
    cur = conn.execute("DELETE FROM drafts WHERE user_id = ?", (user_id,))
    conn.commit()
    return cur.rowcount
