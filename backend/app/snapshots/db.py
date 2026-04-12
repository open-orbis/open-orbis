"""SQLite database for orb snapshot metadata and data."""

from __future__ import annotations

import sqlite3
from pathlib import Path

_DB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "cv_uploads.db"
_conn: sqlite3.Connection | None = None

MAX_SNAPSHOTS_PER_USER = 3


def _get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute(
            """
            CREATE TABLE IF NOT EXISTS orb_snapshots (
                snapshot_id TEXT NOT NULL,
                user_id     TEXT NOT NULL,
                created_at  TEXT NOT NULL,
                trigger     TEXT NOT NULL,
                label       TEXT,
                node_count  INTEGER NOT NULL,
                edge_count  INTEGER NOT NULL,
                data        TEXT NOT NULL,
                PRIMARY KEY (user_id, snapshot_id)
            )
            """
        )
        _conn.commit()
    return _conn


def insert_snapshot(
    snapshot_id: str,
    user_id: str,
    trigger: str,
    label: str | None,
    node_count: int,
    edge_count: int,
    data: str,
    now: str,
) -> dict:
    conn = _get_conn()
    conn.execute(
        """
        INSERT INTO orb_snapshots
            (snapshot_id, user_id, created_at, trigger, label,
             node_count, edge_count, data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (snapshot_id, user_id, now, trigger, label, node_count, edge_count, data),
    )
    conn.commit()
    return {
        "snapshot_id": snapshot_id,
        "user_id": user_id,
        "created_at": now,
        "trigger": trigger,
        "label": label,
        "node_count": node_count,
        "edge_count": edge_count,
    }


def list_snapshots(user_id: str) -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT snapshot_id, user_id, created_at, trigger, label, "
        "node_count, edge_count "
        "FROM orb_snapshots WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def get_snapshot(user_id: str, snapshot_id: str) -> dict | None:
    conn = _get_conn()
    row = conn.execute(
        "SELECT snapshot_id, user_id, created_at, trigger, label, "
        "node_count, edge_count, data "
        "FROM orb_snapshots WHERE user_id = ? AND snapshot_id = ?",
        (user_id, snapshot_id),
    ).fetchone()
    return dict(row) if row else None


def count_snapshots(user_id: str) -> int:
    conn = _get_conn()
    row = conn.execute(
        "SELECT COUNT(*) FROM orb_snapshots WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    return row[0]


def delete_snapshot(user_id: str, snapshot_id: str) -> bool:
    conn = _get_conn()
    cur = conn.execute(
        "DELETE FROM orb_snapshots WHERE user_id = ? AND snapshot_id = ?",
        (user_id, snapshot_id),
    )
    conn.commit()
    return cur.rowcount > 0


def delete_oldest_if_at_limit(user_id: str) -> dict | None:
    if count_snapshots(user_id) < MAX_SNAPSHOTS_PER_USER:
        return None
    conn = _get_conn()
    row = conn.execute(
        "SELECT snapshot_id, user_id, created_at, trigger, label, "
        "node_count, edge_count "
        "FROM orb_snapshots WHERE user_id = ? ORDER BY created_at ASC LIMIT 1",
        (user_id,),
    ).fetchone()
    if row is None:
        return None
    oldest = dict(row)
    delete_snapshot(user_id, oldest["snapshot_id"])
    return oldest


def delete_all_for_user(user_id: str) -> int:
    conn = _get_conn()
    cur = conn.execute(
        "DELETE FROM orb_snapshots WHERE user_id = ?",
        (user_id,),
    )
    conn.commit()
    return cur.rowcount
