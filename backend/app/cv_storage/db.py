"""SQLite database for CV upload metadata — separate from the main Neo4j graph."""

from __future__ import annotations

import sqlite3
from pathlib import Path

_DB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "cv_uploads.db"
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
            CREATE TABLE IF NOT EXISTS cv_uploads (
                user_id TEXT PRIMARY KEY,
                original_filename TEXT NOT NULL,
                file_size_bytes INTEGER NOT NULL,
                uploaded_at TEXT NOT NULL,
                page_count INTEGER NOT NULL
            )
            """
        )
        _conn.commit()
    return _conn


def upsert_metadata(
    user_id: str,
    filename: str,
    size: int,
    page_count: int,
    now: str,
) -> dict:
    conn = _get_conn()
    conn.execute(
        """
        INSERT OR REPLACE INTO cv_uploads
            (user_id, original_filename, file_size_bytes, uploaded_at, page_count)
        VALUES (?, ?, ?, ?, ?)
        """,
        (user_id, filename, size, now, page_count),
    )
    conn.commit()
    return {
        "user_id": user_id,
        "original_filename": filename,
        "file_size_bytes": size,
        "uploaded_at": now,
        "page_count": page_count,
    }


def get_metadata(user_id: str) -> dict | None:
    conn = _get_conn()
    row = conn.execute(
        "SELECT user_id, original_filename, file_size_bytes, uploaded_at, page_count "
        "FROM cv_uploads WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    return dict(row) if row else None


def delete_metadata(user_id: str) -> bool:
    conn = _get_conn()
    cur = conn.execute(
        "DELETE FROM cv_uploads WHERE user_id = ?",
        (user_id,),
    )
    conn.commit()
    return cur.rowcount > 0
