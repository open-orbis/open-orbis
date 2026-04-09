"""Fernet-encrypted file storage for CV documents — supports multiple per user."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from app.cv_storage import db
from app.graph.encryption import _get_fernet

_CV_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "cv_files"


def _doc_path(user_id: str, document_id: str) -> Path:
    return _CV_DIR / f"{user_id}_{document_id}.pdf.enc"


def _legacy_path(user_id: str) -> Path:
    return _CV_DIR / f"{user_id}.pdf.enc"


def save_document(
    user_id: str,
    document_id: str,
    pdf_bytes: bytes,
    filename: str,
    page_count: int,
    entities_count: int | None = None,
    edges_count: int | None = None,
) -> dict:
    """Encrypt and persist a document, then record metadata in SQLite."""
    _CV_DIR.mkdir(parents=True, exist_ok=True)
    encrypted = _get_fernet().encrypt(pdf_bytes)
    _doc_path(user_id, document_id).write_bytes(encrypted)
    now = datetime.now(timezone.utc).isoformat()
    return db.insert_document(
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
    return _get_fernet().decrypt(path.read_bytes())


def delete_document(user_id: str, document_id: str) -> bool:
    """Delete a document's encrypted file and metadata row."""
    path = _doc_path(user_id, document_id)
    removed = path.exists()
    if removed:
        path.unlink()
    db.delete_document(user_id, document_id)
    return removed


def delete_all_for_user(user_id: str) -> int:
    """Delete all documents for a user (files + metadata). Returns count deleted."""
    docs = db.list_documents(user_id)
    for doc in docs:
        path = _doc_path(user_id, doc["document_id"])
        if path.exists():
            path.unlink()
    # Also remove any legacy file
    legacy = _legacy_path(user_id)
    if legacy.exists():
        legacy.unlink()
    return db.delete_all_for_user(user_id)


def evict_oldest_if_at_limit(user_id: str) -> dict | None:
    """If user has >= MAX docs, delete the oldest. Returns evicted doc or None."""
    if db.count_documents(user_id) < db.MAX_DOCUMENTS_PER_USER:
        return None
    oldest = db.get_oldest_document(user_id)
    if oldest is None:
        return None
    delete_document(user_id, oldest["document_id"])
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
# Backward-compatibility shims — to be removed once the router is updated
# (Task 3: Update backend models and router)
# ---------------------------------------------------------------------------

import uuid as _uuid  # noqa: E402


def _cv_path(user_id: str) -> Path:
    """Deprecated: use _doc_path() instead."""
    return _legacy_path(user_id)


def save_cv(
    user_id: str,
    pdf_bytes: bytes,
    filename: str,
    page_count: int,
) -> dict:
    """Deprecated: use save_document() instead."""
    # Evict oldest if at limit, then save as new document
    doc_id = str(_uuid.uuid4())
    return save_document(
        user_id=user_id,
        document_id=doc_id,
        pdf_bytes=pdf_bytes,
        filename=filename,
        page_count=page_count,
    )


def load_cv(user_id: str) -> bytes | None:
    """Deprecated: use load_document() instead. Returns most recent document."""
    docs = db.list_documents(user_id)
    if not docs:
        return None
    return load_document(user_id, docs[0]["document_id"])


def delete_cv(user_id: str) -> bool:
    """Deprecated: use delete_all_for_user() instead."""
    count = delete_all_for_user(user_id)
    return count > 0
