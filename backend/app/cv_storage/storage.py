"""Fernet-encrypted file storage for CV documents — supports multiple per user."""

from __future__ import annotations

import uuid as _uuid
from datetime import datetime, timezone
from pathlib import Path

from app.cv_storage import db
from app.graph.encryption import decrypt_bytes, encrypt_bytes

_CV_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "cv_files"


def _doc_path(user_id: str, document_id: str) -> Path:
    return _CV_DIR / f"{user_id}_{document_id}.pdf.enc"


def _legacy_path(user_id: str) -> Path:
    return _CV_DIR / f"{user_id}.pdf.enc"


async def save_document(
    user_id: str,
    document_id: str,
    pdf_bytes: bytes,
    filename: str,
    page_count: int,
    entities_count: int | None = None,
    edges_count: int | None = None,
) -> dict:
    """Encrypt and persist a document, then record metadata."""
    _CV_DIR.mkdir(parents=True, exist_ok=True)
    encrypted = encrypt_bytes(pdf_bytes)
    _doc_path(user_id, document_id).write_bytes(encrypted)
    now = datetime.now(timezone.utc).isoformat()
    return await db.insert_document(
        document_id=document_id,
        user_id=user_id,
        filename=filename,
        size=len(pdf_bytes),
        page_count=page_count,
        entities_count=entities_count,
        edges_count=edges_count,
        now=now,
    )


def load_document(user_id: str, document_id: str) -> bytes | None:
    """Return decrypted PDF bytes, or None if file doesn't exist."""
    path = _doc_path(user_id, document_id)
    if not path.exists():
        return None
    return decrypt_bytes(path.read_bytes())


async def delete_document(user_id: str, document_id: str) -> bool:
    """Delete a document's encrypted file and metadata row."""
    path = _doc_path(user_id, document_id)
    removed = path.exists()
    if removed:
        path.unlink()
    await db.delete_document(user_id, document_id)
    return removed


async def delete_all_for_user(user_id: str) -> int:
    """Delete all documents for a user (files + metadata). Returns count deleted."""
    docs = await db.list_documents(user_id)
    for doc in docs:
        path = _doc_path(user_id, doc["document_id"])
        if path.exists():
            path.unlink()
    # Also remove any legacy file
    legacy = _legacy_path(user_id)
    if legacy.exists():
        legacy.unlink()
    return await db.delete_all_for_user(user_id)


async def evict_oldest_if_at_limit(user_id: str) -> dict | None:
    """If user has >= MAX docs, delete the oldest. Returns evicted doc or None."""
    if await db.count_documents(user_id) < db.MAX_DOCUMENTS_PER_USER:
        return None
    oldest = await db.get_oldest_document(user_id)
    if oldest is None:
        return None
    await delete_document(user_id, oldest["document_id"])
    return oldest


def migrate_legacy_file(user_id: str, document_id: str) -> bool:
    """Rename old-style {user_id}.pdf.enc to {user_id}_{document_id}.pdf.enc."""
    legacy = _legacy_path(user_id)
    if not legacy.exists():
        return False
    _CV_DIR.mkdir(parents=True, exist_ok=True)
    legacy.rename(_doc_path(user_id, document_id))
    return True


# ---------------------------------------------------------------------------
# Backward-compatibility shims
# ---------------------------------------------------------------------------


def _cv_path(user_id: str) -> Path:
    """Deprecated: use _doc_path() instead."""
    return _legacy_path(user_id)


async def save_cv(
    user_id: str,
    pdf_bytes: bytes,
    filename: str,
    page_count: int,
) -> dict:
    """Deprecated: use save_document() instead."""
    doc_id = str(_uuid.uuid4())
    return await save_document(
        user_id=user_id,
        document_id=doc_id,
        pdf_bytes=pdf_bytes,
        filename=filename,
        page_count=page_count,
    )


async def load_cv(user_id: str) -> bytes | None:
    """Deprecated: use load_document() instead. Returns most recent document."""
    docs = await db.list_documents(user_id)
    if not docs:
        return None
    return load_document(user_id, docs[0]["document_id"])


async def delete_cv(user_id: str) -> bool:
    """Deprecated: use delete_all_for_user() instead."""
    count = await delete_all_for_user(user_id)
    return count > 0
