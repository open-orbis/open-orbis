"""CV document file storage — GCS in production, local filesystem in development.

Dispatch logic:
- CV_STORAGE_BUCKET set → GCS (no application-level encryption, GCS SSE at rest)
- CV_STORAGE_BUCKET empty → local filesystem with Fernet encryption (dev only)
"""

from __future__ import annotations

import uuid as _uuid
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.cv_storage import db

# Local filesystem paths (dev only)
_CV_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "cv_files"


def _doc_path(user_id: str, document_id: str) -> Path:
    return _CV_DIR / f"{user_id}_{document_id}.pdf.enc"


def _legacy_path(user_id: str) -> Path:
    return _CV_DIR / f"{user_id}.pdf.enc"


def _use_gcs() -> bool:
    return bool(settings.cv_storage_bucket)


async def save_document(
    user_id: str,
    document_id: str,
    pdf_bytes: bytes,
    filename: str,
    page_count: int,
    entities_count: int | None = None,
    edges_count: int | None = None,
) -> dict:
    """Persist a document (GCS or local) and record metadata."""
    if _use_gcs():
        from app.cv_storage.gcs import upload_file

        await upload_file(settings.cv_storage_bucket, user_id, document_id, pdf_bytes)
    else:
        from app.graph.encryption import encrypt_bytes

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
    """Return PDF bytes, or None if file doesn't exist.

    Note: synchronous for local files. For GCS, use load_document_async().
    """
    if _use_gcs():
        raise RuntimeError(
            "Use load_document_async() for GCS storage. "
            "Sync load_document() is only for local filesystem."
        )
    path = _doc_path(user_id, document_id)
    if not path.exists():
        return None
    from app.graph.encryption import decrypt_bytes

    return decrypt_bytes(path.read_bytes())


async def load_document_async(user_id: str, document_id: str) -> bytes | None:
    """Return PDF bytes (async). Works for both GCS and local."""
    if _use_gcs():
        from app.cv_storage.gcs import download_file

        return await download_file(settings.cv_storage_bucket, user_id, document_id)
    # Local: delegate to sync version in thread to not block
    import asyncio

    return await asyncio.to_thread(load_document, user_id, document_id)


async def delete_document(user_id: str, document_id: str) -> bool:
    """Delete a document's file and metadata row."""
    removed = False
    if _use_gcs():
        from app.cv_storage.gcs import delete_file

        removed = await delete_file(settings.cv_storage_bucket, user_id, document_id)
    else:
        path = _doc_path(user_id, document_id)
        removed = path.exists()
        if removed:
            path.unlink()
    await db.delete_document(user_id, document_id)
    return removed


async def delete_all_for_user(user_id: str) -> int:
    """Delete all documents for a user (files + metadata). Returns count deleted."""
    if _use_gcs():
        from app.cv_storage.gcs import delete_prefix

        await delete_prefix(settings.cv_storage_bucket, f"{user_id}/")
    else:
        docs = await db.list_documents(user_id)
        for doc in docs:
            path = _doc_path(user_id, doc["document_id"])
            if path.exists():
                path.unlink()
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
    """Deprecated: use load_document_async() instead."""
    docs = await db.list_documents(user_id)
    if not docs:
        return None
    return await load_document_async(user_id, docs[0]["document_id"])


async def delete_cv(user_id: str) -> bool:
    """Deprecated: use delete_all_for_user() instead."""
    count = await delete_all_for_user(user_id)
    return count > 0
