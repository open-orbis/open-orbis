"""Fernet-encrypted file storage for CV PDFs."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from app.cv_storage import db
from app.graph.encryption import _get_fernet

_CV_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "cv_files"


def _cv_path(user_id: str) -> Path:
    return _CV_DIR / f"{user_id}.pdf.enc"


def save_cv(
    user_id: str,
    pdf_bytes: bytes,
    filename: str,
    page_count: int,
) -> dict:
    """Encrypt *pdf_bytes* and persist to disk, then record metadata in SQLite."""
    _CV_DIR.mkdir(parents=True, exist_ok=True)
    encrypted = _get_fernet().encrypt(pdf_bytes)
    _cv_path(user_id).write_bytes(encrypted)
    now = datetime.now(timezone.utc).isoformat()
    return db.upsert_metadata(
        user_id=user_id,
        filename=filename,
        size=len(pdf_bytes),
        page_count=page_count,
        now=now,
    )


def load_cv(user_id: str) -> bytes | None:
    """Return decrypted PDF bytes, or *None* if no file exists for *user_id*."""
    path = _cv_path(user_id)
    if not path.exists():
        return None
    return _get_fernet().decrypt(path.read_bytes())


def delete_cv(user_id: str) -> bool:
    """Delete the encrypted file and its metadata row.

    Returns *True* when a file was removed, *False* when nothing existed.
    """
    path = _cv_path(user_id)
    removed = path.exists()
    if removed:
        path.unlink()
    db.delete_metadata(user_id)
    return removed
