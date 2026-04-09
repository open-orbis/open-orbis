"""SQLite database for CV document metadata — supports multiple documents per user."""

from __future__ import annotations

import sqlite3
import uuid
from pathlib import Path

_DB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "cv_uploads.db"
_conn: sqlite3.Connection | None = None

MAX_DOCUMENTS_PER_USER = 3


def _get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
        _maybe_migrate(_conn)
        _conn.execute(
            """
            CREATE TABLE IF NOT EXISTS cv_documents (
                document_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                original_filename TEXT NOT NULL,
                file_size_bytes INTEGER NOT NULL,
                uploaded_at TEXT NOT NULL,
                page_count INTEGER NOT NULL,
                entities_count INTEGER,
                edges_count INTEGER,
                PRIMARY KEY (user_id, document_id)
            )
            """
        )
        _conn.commit()
    return _conn


def _maybe_migrate(conn: sqlite3.Connection) -> None:
    """Migrate from old cv_uploads (single-row) to cv_documents (multi-row)."""
    tables = {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    if "cv_uploads" not in tables:
        return
    # Old table exists — migrate rows
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS cv_documents (
            document_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            original_filename TEXT NOT NULL,
            file_size_bytes INTEGER NOT NULL,
            uploaded_at TEXT NOT NULL,
            page_count INTEGER NOT NULL,
            entities_count INTEGER,
            edges_count INTEGER,
            PRIMARY KEY (user_id, document_id)
        )
        """
    )
    rows = conn.execute(
        "SELECT user_id, original_filename, file_size_bytes, uploaded_at, page_count "
        "FROM cv_uploads"
    ).fetchall()
    for row in rows:
        doc_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT OR IGNORE INTO cv_documents
                (document_id, user_id, original_filename, file_size_bytes,
                 uploaded_at, page_count, entities_count, edges_count)
            VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)
            """,
            (doc_id, row[0], row[1], row[2], row[3], row[4]),
        )
    conn.execute("DROP TABLE cv_uploads")
    conn.commit()


def insert_document(
    document_id: str,
    user_id: str,
    filename: str,
    size: int,
    page_count: int,
    entities_count: int | None,
    edges_count: int | None,
    now: str,
) -> dict:
    conn = _get_conn()
    conn.execute(
        """
        INSERT INTO cv_documents
            (document_id, user_id, original_filename, file_size_bytes,
             uploaded_at, page_count, entities_count, edges_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (document_id, user_id, filename, size, now, page_count,
         entities_count, edges_count),
    )
    conn.commit()
    return {
        "document_id": document_id,
        "user_id": user_id,
        "original_filename": filename,
        "file_size_bytes": size,
        "uploaded_at": now,
        "page_count": page_count,
        "entities_count": entities_count,
        "edges_count": edges_count,
    }


def list_documents(user_id: str) -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT document_id, user_id, original_filename, file_size_bytes, "
        "uploaded_at, page_count, entities_count, edges_count "
        "FROM cv_documents WHERE user_id = ? ORDER BY uploaded_at DESC",
        (user_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def count_documents(user_id: str) -> int:
    conn = _get_conn()
    row = conn.execute(
        "SELECT COUNT(*) FROM cv_documents WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    return row[0]


def get_oldest_document(user_id: str) -> dict | None:
    conn = _get_conn()
    row = conn.execute(
        "SELECT document_id, user_id, original_filename, file_size_bytes, "
        "uploaded_at, page_count, entities_count, edges_count "
        "FROM cv_documents WHERE user_id = ? ORDER BY uploaded_at ASC LIMIT 1",
        (user_id,),
    ).fetchone()
    return dict(row) if row else None


def delete_document(user_id: str, document_id: str) -> bool:
    conn = _get_conn()
    cur = conn.execute(
        "DELETE FROM cv_documents WHERE user_id = ? AND document_id = ?",
        (user_id, document_id),
    )
    conn.commit()
    return cur.rowcount > 0


def delete_all_for_user(user_id: str) -> int:
    conn = _get_conn()
    cur = conn.execute(
        "DELETE FROM cv_documents WHERE user_id = ?",
        (user_id,),
    )
    conn.commit()
    return cur.rowcount


# ---------------------------------------------------------------------------
# Backward-compatibility shims — to be removed once the router is updated
# (Task 3: Update backend models and router)
# ---------------------------------------------------------------------------


def get_metadata(user_id: str) -> dict | None:
    """Return the most-recent document metadata for user, or None.

    Deprecated: use list_documents() instead. Kept for router compatibility
    until Task 3 updates the CV router.
    """
    docs = list_documents(user_id)
    return docs[0] if docs else None


def upsert_metadata(
    user_id: str,
    filename: str,
    size: int,
    page_count: int,
    now: str,
) -> dict:
    """Insert or replace the single-row CV record for a user.

    Deprecated: use insert_document() instead. Kept for storage.py compatibility
    until Task 2 updates the CV storage layer.
    """
    doc_id = str(uuid.uuid4())
    # Delete existing documents for this user first (old single-doc semantics)
    delete_all_for_user(user_id)
    return insert_document(
        document_id=doc_id,
        user_id=user_id,
        filename=filename,
        size=size,
        page_count=page_count,
        entities_count=None,
        edges_count=None,
        now=now,
    )


def delete_metadata(user_id: str) -> bool:
    """Delete the CV metadata record for a user.

    Deprecated: use delete_all_for_user() instead. Kept for storage.py
    compatibility until Task 2 updates the CV storage layer.
    """
    count = delete_all_for_user(user_id)
    return count > 0
