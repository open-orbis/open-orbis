"""PostgreSQL database for CV document metadata — supports multiple documents per user."""

from __future__ import annotations

import uuid

from app.db.postgres import get_pool

MAX_DOCUMENTS_PER_USER = 3


async def insert_document(
    document_id: str,
    user_id: str,
    filename: str,
    size: int,
    page_count: int,
    entities_count: int | None,
    edges_count: int | None,
    now: str,
) -> dict:
    pool = await get_pool()
    await pool.execute(
        "INSERT INTO cv_documents "
        "(document_id, user_id, original_filename, file_size_bytes, "
        "uploaded_at, page_count, entities_count, edges_count) "
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        document_id,
        user_id,
        filename,
        size,
        now,
        page_count,
        entities_count,
        edges_count,
    )
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


async def list_documents(user_id: str) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT document_id, user_id, original_filename, file_size_bytes, "
        "uploaded_at, page_count, entities_count, edges_count "
        "FROM cv_documents WHERE user_id = $1 ORDER BY uploaded_at DESC",
        user_id,
    )
    return [dict(row) for row in rows]


async def count_documents(user_id: str) -> int:
    pool = await get_pool()
    return await pool.fetchval(
        "SELECT COUNT(*) FROM cv_documents WHERE user_id = $1",
        user_id,
    )


async def get_oldest_document(user_id: str) -> dict | None:
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT document_id, user_id, original_filename, file_size_bytes, "
        "uploaded_at, page_count, entities_count, edges_count "
        "FROM cv_documents WHERE user_id = $1 ORDER BY uploaded_at ASC LIMIT 1",
        user_id,
    )
    return dict(row) if row else None


async def delete_document(user_id: str, document_id: str) -> bool:
    pool = await get_pool()
    result = await pool.execute(
        "DELETE FROM cv_documents WHERE user_id = $1 AND document_id = $2",
        user_id,
        document_id,
    )
    return result != "DELETE 0"


async def delete_all_for_user(user_id: str) -> int:
    pool = await get_pool()
    result = await pool.execute(
        "DELETE FROM cv_documents WHERE user_id = $1",
        user_id,
    )
    return int(result.split()[-1])


# ---------------------------------------------------------------------------
# Backward-compatibility shims — to be removed after CV storage migration
# ---------------------------------------------------------------------------


async def get_metadata(user_id: str) -> dict | None:
    """Return the most-recent document metadata for user, or None."""
    docs = await list_documents(user_id)
    return docs[0] if docs else None


async def upsert_metadata(
    user_id: str,
    filename: str,
    size: int,
    page_count: int,
    now: str,
) -> dict:
    """Insert or replace the single-row CV record for a user."""
    doc_id = str(uuid.uuid4())
    await delete_all_for_user(user_id)
    return await insert_document(
        document_id=doc_id,
        user_id=user_id,
        filename=filename,
        size=size,
        page_count=page_count,
        entities_count=None,
        edges_count=None,
        now=now,
    )


async def delete_metadata(user_id: str) -> bool:
    """Delete the CV metadata record for a user."""
    count = await delete_all_for_user(user_id)
    return count > 0
