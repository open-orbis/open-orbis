# CV Metadata Tracking & 3-Document Retention — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track per-document metadata (uploaded_at, entities_count, edges_count) for each CV/document upload and enforce a maximum of 3 stored documents per user.

**Architecture:** Evolve the existing SQLite `cv_uploads` table into a multi-row `cv_documents` table keyed by `(user_id, document_id)`. Encrypted files change from `{user_id}.pdf.enc` to `{user_id}_{document_id}.pdf.enc`. The 3-document cap is enforced at confirm time — when exceeded, the oldest document's metadata and file are evicted. The Neo4j graph is unaffected (no provenance tracking).

**Tech Stack:** FastAPI, SQLite, React/TypeScript, Zustand, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-09-cv-metadata-retention-design.md`

---

## File Map

### Backend — Modified
- `backend/app/cv_storage/db.py` — Replace `cv_uploads` schema with `cv_documents`, new multi-row API
- `backend/app/cv_storage/storage.py` — Multi-document file storage, per-document paths, eviction
- `backend/app/cv/router.py` — New endpoints, modified confirm flows, document_id tracking
- `backend/app/cv/models.py` — Add `document_id` to response/request models
- `backend/app/main.py` — Update GDPR deletion to delete all documents for a user

### Backend — Modified (Tests)
- `backend/tests/unit/test_cv_storage_db.py` — Rewrite for new multi-row schema + migration
- `backend/tests/unit/test_cv_storage_file.py` — Rewrite for multi-document storage
- `backend/tests/unit/test_cv_router.py` — Update for new endpoints and confirm flow

### Frontend — Modified
- `frontend/src/api/cv.ts` — New API functions, updated signatures
- `frontend/src/pages/OrbViewPage.tsx` — Document list, pre-upload cap check, updated confirm flow
- `frontend/src/components/onboarding/CVUploadOnboarding.tsx` — Pass document_id through confirm, pre-upload cap check
- `frontend/src/components/onboarding/ExtractedDataReview.tsx` — Accept and pass document_id + file

---

## Task 1: Rewrite SQLite DB Layer (`cv_storage/db.py`)

**Files:**
- Modify: `backend/app/cv_storage/db.py`
- Modify: `backend/tests/unit/test_cv_storage_db.py`

- [ ] **Step 1: Write failing tests for the new multi-row schema**

Replace the contents of `backend/tests/unit/test_cv_storage_db.py` with:

```python
"""Unit tests for app.cv_storage.db — multi-document metadata store."""

from __future__ import annotations

import sqlite3

import pytest

import app.cv_storage.db as cv_db

_NOW = "2026-01-01T00:00:00"


@pytest.fixture(autouse=True)
def isolated_db(monkeypatch, tmp_path):
    db_file = tmp_path / "cv_documents_test.db"
    monkeypatch.setattr(cv_db, "_DB_PATH", db_file)
    monkeypatch.setattr(cv_db, "_conn", None)
    yield
    if cv_db._conn is not None:
        cv_db._conn.close()
    monkeypatch.setattr(cv_db, "_conn", None)


def test_insert_and_list():
    cv_db.insert_document(
        document_id="doc-1",
        user_id="user-1",
        filename="cv.pdf",
        size=12345,
        page_count=3,
        entities_count=10,
        edges_count=5,
        now=_NOW,
    )
    docs = cv_db.list_documents("user-1")
    assert len(docs) == 1
    assert docs[0]["document_id"] == "doc-1"
    assert docs[0]["user_id"] == "user-1"
    assert docs[0]["original_filename"] == "cv.pdf"
    assert docs[0]["file_size_bytes"] == 12345
    assert docs[0]["page_count"] == 3
    assert docs[0]["entities_count"] == 10
    assert docs[0]["edges_count"] == 5
    assert docs[0]["uploaded_at"] == _NOW


def test_list_ordered_by_date_desc():
    cv_db.insert_document("doc-old", "user-1", "old.pdf", 100, 1, 5, 2, "2026-01-01T00:00:00")
    cv_db.insert_document("doc-new", "user-1", "new.pdf", 200, 2, 10, 4, "2026-06-01T00:00:00")
    cv_db.insert_document("doc-mid", "user-1", "mid.pdf", 150, 1, 7, 3, "2026-03-01T00:00:00")
    docs = cv_db.list_documents("user-1")
    assert [d["document_id"] for d in docs] == ["doc-new", "doc-mid", "doc-old"]


def test_count_documents():
    assert cv_db.count_documents("user-1") == 0
    cv_db.insert_document("doc-1", "user-1", "a.pdf", 100, 1, 5, 2, _NOW)
    assert cv_db.count_documents("user-1") == 1
    cv_db.insert_document("doc-2", "user-1", "b.pdf", 200, 2, 10, 4, _NOW)
    assert cv_db.count_documents("user-1") == 2


def test_count_scoped_to_user():
    cv_db.insert_document("doc-1", "user-1", "a.pdf", 100, 1, 5, 2, _NOW)
    cv_db.insert_document("doc-2", "user-2", "b.pdf", 200, 2, 10, 4, _NOW)
    assert cv_db.count_documents("user-1") == 1
    assert cv_db.count_documents("user-2") == 1


def test_get_oldest_document():
    cv_db.insert_document("doc-new", "user-1", "new.pdf", 200, 2, 10, 4, "2026-06-01T00:00:00")
    cv_db.insert_document("doc-old", "user-1", "old.pdf", 100, 1, 5, 2, "2026-01-01T00:00:00")
    oldest = cv_db.get_oldest_document("user-1")
    assert oldest is not None
    assert oldest["document_id"] == "doc-old"


def test_get_oldest_document_empty():
    assert cv_db.get_oldest_document("user-1") is None


def test_delete_document():
    cv_db.insert_document("doc-1", "user-1", "cv.pdf", 100, 1, 5, 2, _NOW)
    deleted = cv_db.delete_document("user-1", "doc-1")
    assert deleted is True
    assert cv_db.count_documents("user-1") == 0


def test_delete_document_nonexistent():
    assert cv_db.delete_document("user-1", "no-such-doc") is False


def test_delete_all_for_user():
    cv_db.insert_document("doc-1", "user-1", "a.pdf", 100, 1, 5, 2, _NOW)
    cv_db.insert_document("doc-2", "user-1", "b.pdf", 200, 2, 10, 4, _NOW)
    cv_db.insert_document("doc-3", "user-2", "c.pdf", 300, 3, 15, 6, _NOW)
    count = cv_db.delete_all_for_user("user-1")
    assert count == 2
    assert cv_db.count_documents("user-1") == 0
    assert cv_db.count_documents("user-2") == 1


def test_nullable_counts():
    cv_db.insert_document("doc-1", "user-1", "cv.pdf", 100, 1, None, None, _NOW)
    docs = cv_db.list_documents("user-1")
    assert docs[0]["entities_count"] is None
    assert docs[0]["edges_count"] is None


def test_migration_from_old_schema(monkeypatch, tmp_path):
    """Simulate the old cv_uploads table and verify migration to cv_documents."""
    db_file = tmp_path / "cv_migration_test.db"
    monkeypatch.setattr(cv_db, "_DB_PATH", db_file)
    monkeypatch.setattr(cv_db, "_conn", None)

    # Create old schema and insert a row
    conn = sqlite3.connect(str(db_file))
    conn.execute(
        """
        CREATE TABLE cv_uploads (
            user_id TEXT PRIMARY KEY,
            original_filename TEXT NOT NULL,
            file_size_bytes INTEGER NOT NULL,
            uploaded_at TEXT NOT NULL,
            page_count INTEGER NOT NULL
        )
        """
    )
    conn.execute(
        "INSERT INTO cv_uploads VALUES (?, ?, ?, ?, ?)",
        ("user-legacy", "old_cv.pdf", 9999, "2025-12-01T00:00:00", 5),
    )
    conn.commit()
    conn.close()

    # Now open via the module — should trigger migration
    docs = cv_db.list_documents("user-legacy")
    assert len(docs) == 1
    assert docs[0]["original_filename"] == "old_cv.pdf"
    assert docs[0]["file_size_bytes"] == 9999
    assert docs[0]["page_count"] == 5
    assert docs[0]["uploaded_at"] == "2025-12-01T00:00:00"
    assert docs[0]["entities_count"] is None
    assert docs[0]["edges_count"] is None
    # document_id should be a non-empty string (generated UUID)
    assert len(docs[0]["document_id"]) > 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/unit/test_cv_storage_db.py -v`
Expected: All tests FAIL (functions don't exist yet)

- [ ] **Step 3: Implement the new db.py**

Replace the contents of `backend/app/cv_storage/db.py` with:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/unit/test_cv_storage_db.py -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/cv_storage/db.py backend/tests/unit/test_cv_storage_db.py
git commit -m "feat: rewrite cv_storage/db.py for multi-document metadata (#192)"
```

---

## Task 2: Rewrite File Storage Layer (`cv_storage/storage.py`)

**Files:**
- Modify: `backend/app/cv_storage/storage.py`
- Modify: `backend/tests/unit/test_cv_storage_file.py`

- [ ] **Step 1: Write failing tests for multi-document file storage**

Replace the contents of `backend/tests/unit/test_cv_storage_file.py` with:

```python
"""Unit tests for app.cv_storage.storage — multi-document encrypted file storage."""

from __future__ import annotations

import pytest

import app.cv_storage.db as cv_db
import app.cv_storage.storage as cv_storage


@pytest.fixture(autouse=True)
def isolated_storage(monkeypatch, tmp_path):
    cv_dir = tmp_path / "cv_files"
    monkeypatch.setattr(cv_storage, "_CV_DIR", cv_dir)
    db_file = tmp_path / "cv_documents_test.db"
    monkeypatch.setattr(cv_db, "_DB_PATH", db_file)
    monkeypatch.setattr(cv_db, "_conn", None)
    yield
    if cv_db._conn is not None:
        cv_db._conn.close()
    monkeypatch.setattr(cv_db, "_conn", None)


_PDF = b"%PDF-1.4 fake pdf content for testing"
_USER = "user-test-001"


def test_save_and_load():
    doc = cv_storage.save_document(
        user_id=_USER,
        document_id="doc-1",
        pdf_bytes=_PDF,
        filename="resume.pdf",
        page_count=2,
        entities_count=10,
        edges_count=5,
    )
    assert doc["document_id"] == "doc-1"
    result = cv_storage.load_document(_USER, "doc-1")
    assert result == _PDF


def test_load_nonexistent():
    assert cv_storage.load_document(_USER, "no-such-doc") is None


def test_multiple_documents():
    cv_storage.save_document(_USER, "doc-1", _PDF, "a.pdf", 1, 5, 2)
    cv_storage.save_document(_USER, "doc-2", b"other pdf", "b.pdf", 2, 10, 4)
    assert cv_storage.load_document(_USER, "doc-1") == _PDF
    assert cv_storage.load_document(_USER, "doc-2") == b"other pdf"


def test_delete_document():
    cv_storage.save_document(_USER, "doc-1", _PDF, "resume.pdf", 2, 10, 5)
    removed = cv_storage.delete_document(_USER, "doc-1")
    assert removed is True
    assert cv_storage.load_document(_USER, "doc-1") is None
    assert cv_db.count_documents(_USER) == 0


def test_delete_document_nonexistent():
    assert cv_storage.delete_document(_USER, "no-such-doc") is False


def test_delete_all_for_user():
    cv_storage.save_document(_USER, "doc-1", _PDF, "a.pdf", 1, 5, 2)
    cv_storage.save_document(_USER, "doc-2", b"other", "b.pdf", 2, 10, 4)
    cv_storage.save_document("other-user", "doc-3", _PDF, "c.pdf", 1, 5, 2)
    count = cv_storage.delete_all_for_user(_USER)
    assert count == 2
    assert cv_storage.load_document(_USER, "doc-1") is None
    assert cv_storage.load_document(_USER, "doc-2") is None
    assert cv_storage.load_document("other-user", "doc-3") is not None


def test_evict_oldest():
    cv_storage.save_document(_USER, "doc-old", _PDF, "old.pdf", 1, 5, 2)
    # Insert with explicit timestamps via db layer for ordering
    cv_db.delete_document(_USER, "doc-old")
    cv_db.insert_document("doc-old", _USER, "old.pdf", len(_PDF), 1, 5, 2, "2026-01-01T00:00:00")
    cv_storage.save_document(_USER, "doc-mid", b"mid", "mid.pdf", 1, 7, 3)
    cv_db.delete_document(_USER, "doc-mid")
    cv_db.insert_document("doc-mid", _USER, "mid.pdf", 3, 1, 7, 3, "2026-03-01T00:00:00")
    cv_storage.save_document(_USER, "doc-new", b"new", "new.pdf", 2, 10, 4)
    cv_db.delete_document(_USER, "doc-new")
    cv_db.insert_document("doc-new", _USER, "new.pdf", 3, 2, 10, 4, "2026-06-01T00:00:00")

    evicted = cv_storage.evict_oldest_if_at_limit(_USER)
    assert evicted is not None
    assert evicted["document_id"] == "doc-old"
    assert cv_db.count_documents(_USER) == 2
    assert cv_storage.load_document(_USER, "doc-old") is None


def test_evict_oldest_under_limit():
    cv_storage.save_document(_USER, "doc-1", _PDF, "a.pdf", 1, 5, 2)
    evicted = cv_storage.evict_oldest_if_at_limit(_USER)
    assert evicted is None
    assert cv_db.count_documents(_USER) == 1


def test_file_is_encrypted_on_disk():
    cv_storage.save_document(_USER, "doc-1", _PDF, "resume.pdf", 1, 5, 2)
    raw = cv_storage._doc_path(_USER, "doc-1").read_bytes()
    assert _PDF not in raw
    assert b"%PDF" not in raw


def test_metadata_saved():
    cv_storage.save_document(_USER, "doc-1", _PDF, "resume.pdf", 4, 12, 7)
    docs = cv_db.list_documents(_USER)
    assert len(docs) == 1
    assert docs[0]["original_filename"] == "resume.pdf"
    assert docs[0]["file_size_bytes"] == len(_PDF)
    assert docs[0]["page_count"] == 4
    assert docs[0]["entities_count"] == 12
    assert docs[0]["edges_count"] == 7


def test_file_migration_on_save(monkeypatch, tmp_path):
    """Old-style file {user_id}.pdf.enc should be migrated when saving a new doc."""
    cv_dir = tmp_path / "cv_files_mig"
    monkeypatch.setattr(cv_storage, "_CV_DIR", cv_dir)
    cv_dir.mkdir()
    # Simulate old file
    from app.graph.encryption import _get_fernet
    old_path = cv_dir / f"{_USER}.pdf.enc"
    old_path.write_bytes(_get_fernet().encrypt(_PDF))

    # Insert a legacy document record (simulating migration from db layer)
    cv_db.insert_document("doc-legacy", _USER, "old.pdf", len(_PDF), 2, None, None, "2025-12-01T00:00:00")

    # migrate_legacy_file should rename the old file
    cv_storage.migrate_legacy_file(_USER, "doc-legacy")
    assert not old_path.exists()
    assert cv_storage._doc_path(_USER, "doc-legacy").exists()
    assert cv_storage.load_document(_USER, "doc-legacy") == _PDF
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/unit/test_cv_storage_file.py -v`
Expected: All tests FAIL

- [ ] **Step 3: Implement the new storage.py**

Replace the contents of `backend/app/cv_storage/storage.py` with:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/unit/test_cv_storage_file.py -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/cv_storage/storage.py backend/tests/unit/test_cv_storage_file.py
git commit -m "feat: rewrite cv_storage/storage.py for multi-document files (#192)"
```

---

## Task 3: Update Backend Models and Router

**Files:**
- Modify: `backend/app/cv/models.py`
- Modify: `backend/app/cv/router.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Add document_id to models**

In `backend/app/cv/models.py`, add `document_id` field to `ExtractedData` and `ConfirmRequest`:

```python
# Add to ExtractedData class:
    document_id: str | None = None

# Add to ConfirmRequest class:
    document_id: str | None = None
    original_filename: str | None = None
    file_size_bytes: int | None = None
    page_count: int | None = None
```

- [ ] **Step 2: Update router imports**

In `backend/app/cv/router.py`, replace the old imports:

```python
# Replace these lines:
from app.cv_storage.db import get_metadata as get_cv_metadata
from app.cv_storage.storage import load_cv
from app.cv_storage.storage import save_cv as store_cv_file

# With:
from app.cv_storage import db as cv_db
from app.cv_storage.storage import (
    delete_document as delete_stored_document,
    evict_oldest_if_at_limit,
    load_document,
    save_document as store_document,
)
```

- [ ] **Step 3: Update upload endpoint to generate document_id**

In `backend/app/cv/router.py`, modify the `upload_cv` function. After `user_id = current_user.get("user_id", "")` (line 67), add:

```python
    document_id = str(uuid.uuid4())
```

Remove the existing best-effort file storage block (lines 70-78, the `try: import fitz ... store_cv_file(...)` block) — file storage now happens at confirm time.

In the return statement, add `document_id`:

```python
        return ExtractedData(
            nodes=result.nodes,
            unmatched=result.unmatched,
            skipped_nodes=result.skipped,
            relationships=result.relationships,
            truncated=result.truncated,
            cv_owner_name=result.cv_owner_name,
            profile=extracted_profile,
            document_id=document_id,
        )
```

- [ ] **Step 4: Update import endpoint to generate document_id**

In `backend/app/cv/router.py`, modify the `import_document` function. After `user_id = current_user.get("user_id", "")` (line 245), add:

```python
    document_id = str(uuid.uuid4())
```

In the return statement, add `document_id`:

```python
        return ExtractedData(
            nodes=result.nodes,
            unmatched=result.unmatched,
            skipped_nodes=result.skipped,
            relationships=result.relationships,
            truncated=result.truncated,
            cv_owner_name=result.cv_owner_name,
            profile=extracted_profile,
            document_id=document_id,
        )
```

- [ ] **Step 5: Update confirm endpoint to handle document tracking**

In `backend/app/cv/router.py`, modify the `confirm_cv` function to accept file and store the document:

```python
@router.post("/confirm")
async def confirm_cv(
    data: ConfirmRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Persist confirmed CV nodes to Neo4j with dedup and cross-entity linking."""
    await _require_consent(current_user, db)
    user_id = current_user["user_id"]

    # Document tracking: evict oldest if at limit, then record this document
    if data.document_id:
        evict_oldest_if_at_limit(user_id)

    result = await _persist_nodes(data, current_user, db, wipe_existing=True)

    if data.document_id:
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc).isoformat()
        cv_db.insert_document(
            document_id=data.document_id,
            user_id=user_id,
            filename=data.original_filename or "cv-upload",
            size=data.file_size_bytes or 0,
            page_count=data.page_count or 0,
            entities_count=len(data.nodes),
            edges_count=len(data.relationships),
            now=now,
        )

    return result
```

- [ ] **Step 6: Update import-confirm endpoint similarly**

In `backend/app/cv/router.py`, modify `import_confirm`:

```python
@router.post("/import-confirm")
async def import_confirm(
    data: ConfirmRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Merge imported nodes into existing orb (no deletion of existing data)."""
    await _require_consent(current_user, db)
    user_id = current_user["user_id"]

    if data.document_id:
        evict_oldest_if_at_limit(user_id)

    result = await _persist_nodes(data, current_user, db, wipe_existing=False)

    if data.document_id:
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc).isoformat()
        cv_db.insert_document(
            document_id=data.document_id,
            user_id=user_id,
            filename=data.original_filename or "document-import",
            size=data.file_size_bytes or 0,
            page_count=data.page_count or 0,
            entities_count=len(data.nodes),
            edges_count=len(data.relationships),
            now=now,
        )

    return result
```

- [ ] **Step 7: Add new GET /cv/documents endpoint**

Add to `backend/app/cv/router.py`:

```python
@router.get("/documents")
async def list_documents(
    current_user: dict = Depends(get_current_user),
):
    """List all document metadata for the current user (up to 3)."""
    return cv_db.list_documents(current_user["user_id"])
```

- [ ] **Step 8: Update download endpoint to support document_id**

Replace the existing `download_cv` function:

```python
@router.get("/documents/{document_id}/download")
async def download_document(
    document_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Download a specific stored document (decrypted)."""
    user_id = current_user["user_id"]
    docs = cv_db.list_documents(user_id)
    doc = next((d for d in docs if d["document_id"] == document_id), None)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    pdf_bytes = load_document(user_id, document_id)
    if pdf_bytes is None:
        raise HTTPException(status_code=404, detail="Document file not found")

    filename = doc.get("original_filename", "document.pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```

Keep the old `GET /cv/download` endpoint as a redirect to the latest document for backward compatibility:

```python
@router.get("/download")
async def download_cv(
    current_user: dict = Depends(get_current_user),
):
    """Download the latest uploaded CV (backward compat)."""
    user_id = current_user["user_id"]
    docs = cv_db.list_documents(user_id)
    if not docs:
        raise HTTPException(status_code=404, detail="No CV stored")
    return await download_document(docs[0]["document_id"], current_user)
```

- [ ] **Step 9: Remove store-file endpoint**

Delete the `store_file` function from `backend/app/cv/router.py` (the `@router.post("/store-file")` endpoint). It is replaced by the automatic document tracking in confirm.

- [ ] **Step 10: Update GDPR deletion in main.py**

In `backend/app/main.py`, change the import:

```python
# Replace:
from app.cv_storage.storage import delete_cv as delete_stored_cv

# With:
from app.cv_storage.storage import delete_all_for_user as delete_stored_cvs
```

And update the call site (around line 55):

```python
# Replace:
                delete_stored_cv(user_id)
# With:
                delete_stored_cvs(user_id)
```

- [ ] **Step 11: Run full backend tests**

Run: `cd backend && uv run pytest tests/unit/ -v --cov=app --cov-fail-under=75`
Expected: All tests PASS, coverage >= 75%

- [ ] **Step 12: Lint**

Run: `cd backend && uv run ruff check . && uv run ruff format .`
Expected: No errors

- [ ] **Step 13: Commit**

```bash
git add backend/app/cv/models.py backend/app/cv/router.py backend/app/main.py
git commit -m "feat: add document tracking to CV upload/import/confirm endpoints (#192)"
```

---

## Task 4: Update Frontend API Layer

**Files:**
- Modify: `frontend/src/api/cv.ts`

- [ ] **Step 1: Add document_id to ExtractedData interface**

In `frontend/src/api/cv.ts`, add to the `ExtractedData` interface:

```typescript
export interface ExtractedData {
  nodes: Array<{
    node_type: string;
    properties: Record<string, unknown>;
  }>;
  unmatched: string[];
  skipped_nodes?: SkippedNode[];
  relationships?: ExtractedRelationship[];
  truncated?: boolean;
  cv_owner_name?: string | null;
  document_id?: string | null;  // <-- add this
}
```

- [ ] **Step 2: Add DocumentMetadata interface and getDocuments function**

```typescript
export interface DocumentMetadata {
  document_id: string;
  original_filename: string;
  uploaded_at: string;
  file_size_bytes: number;
  page_count: number;
  entities_count: number | null;
  edges_count: number | null;
}

export async function getDocuments(): Promise<DocumentMetadata[]> {
  const { data } = await client.get('/cv/documents');
  return data;
}
```

- [ ] **Step 3: Update confirmCV to pass document metadata**

```typescript
export async function confirmCV(
  nodes: ExtractedData['nodes'],
  relationships?: ExtractedRelationship[],
  cv_owner_name?: string | null,
  document_id?: string | null,
  original_filename?: string | null,
  file_size_bytes?: number | null,
  page_count?: number | null,
): Promise<void> {
  await client.post('/cv/confirm', {
    nodes,
    relationships: relationships || [],
    cv_owner_name: cv_owner_name || null,
    document_id: document_id || null,
    original_filename: original_filename || null,
    file_size_bytes: file_size_bytes || null,
    page_count: page_count || null,
  });
}
```

- [ ] **Step 4: Update confirmImport similarly**

```typescript
export async function confirmImport(
  nodes: ExtractedData['nodes'],
  relationships?: ExtractedRelationship[],
  cv_owner_name?: string | null,
  document_id?: string | null,
  original_filename?: string | null,
  file_size_bytes?: number | null,
  page_count?: number | null,
): Promise<void> {
  await client.post('/cv/import-confirm', {
    nodes,
    relationships: relationships || [],
    cv_owner_name: cv_owner_name || null,
    document_id: document_id || null,
    original_filename: original_filename || null,
    file_size_bytes: file_size_bytes || null,
    page_count: page_count || null,
  });
}
```

- [ ] **Step 5: Update downloadCV to support document_id**

```typescript
export async function downloadCV(documentId?: string): Promise<void> {
  const url = documentId ? `/cv/documents/${documentId}/download` : '/cv/download';
  const response = await client.get(url, { responseType: 'blob' });
  const disposition = response.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : 'cv.pdf';
  const blobUrl = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(blobUrl);
}
```

- [ ] **Step 6: Remove storeFile function**

Delete the `storeFile` export from `frontend/src/api/cv.ts`.

- [ ] **Step 7: Lint**

Run: `cd frontend && npm run lint`
Expected: No errors (there will be unused import warnings in consuming files — we fix those in the next tasks)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/api/cv.ts
git commit -m "feat: update frontend API layer for multi-document tracking (#192)"
```

---

## Task 5: Update ExtractedDataReview Component

**Files:**
- Modify: `frontend/src/components/onboarding/ExtractedDataReview.tsx`

- [ ] **Step 1: Add document metadata props to the interface**

Add these to the `ExtractedDataReviewProps` interface:

```typescript
  documentId?: string | null;
  originalFilename?: string | null;
  fileSizeBytes?: number | null;
  pageCount?: number | null;
```

Update the `onConfirm` signature to pass document metadata:

```typescript
  onConfirm?: (
    nodes: ExtractedData['nodes'],
    relationships: ExtractedRelationship[],
    cvOwnerName: string | null,
    documentId?: string | null,
    originalFilename?: string | null,
    fileSizeBytes?: number | null,
    pageCount?: number | null,
  ) => Promise<void>;
```

- [ ] **Step 2: Destructure new props and update handleConfirm**

Add to the destructured props:

```typescript
  documentId,
  originalFilename,
  fileSizeBytes,
  pageCount,
```

Update the default `confirmCV` import and `handleConfirm`:

```typescript
  const handleConfirm = async () => {
    setShowReplaceWarning(false);
    setConfirming(true);
    try {
      const replaced = existingNodeCount ?? 0;
      if (onConfirmOverride) {
        await onConfirmOverride(extractedNodes, relationships, cvOwnerName, documentId, originalFilename, fileSizeBytes, pageCount);
      } else {
        await confirmCV(extractedNodes, relationships, cvOwnerName, documentId, originalFilename, fileSizeBytes, pageCount);
      }
      await fetchUser();
      if (isReplaceMode && replaced > 0) {
        addToast(
          `Imported ${extractedNodes.length} entries (replaced ${replaced} existing)`,
          'success',
        );
      } else {
        addToast(`Imported ${extractedNodes.length} entries into your orb`, 'success');
      }
      navigate('/myorbis');
    } catch {
      setError('Failed to save entries. Please try again.');
      addToast('Failed to import CV data', 'error');
    } finally {
      setConfirming(false);
    }
  };
```

- [ ] **Step 3: Lint**

Run: `cd frontend && npm run lint`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/onboarding/ExtractedDataReview.tsx
git commit -m "feat: pass document metadata through ExtractedDataReview (#192)"
```

---

## Task 6: Update CVUploadOnboarding

**Files:**
- Modify: `frontend/src/components/onboarding/CVUploadOnboarding.tsx`

- [ ] **Step 1: Store document_id and file metadata from upload response**

Update the `extractedData` state type to include document metadata:

```typescript
  const [extractedData, setExtractedData] = useState<{
    nodes: ExtractedData['nodes'];
    relationships: ExtractedRelationship[];
    cvOwnerName: string | null;
    unmatchedCount: number;
    skippedCount: number;
    truncated: boolean;
    documentId: string | null;
    originalFilename: string | null;
    fileSizeBytes: number | null;
    pageCount: number | null;
  } | null>(null);
```

In `handleFile`, update the `setExtractedData` call to include:

```typescript
        setExtractedData({
          nodes: data.nodes,
          relationships: data.relationships || [],
          cvOwnerName: data.cv_owner_name || null,
          unmatchedCount,
          skippedCount: data.skipped_nodes?.length || 0,
          truncated: data.truncated || false,
          documentId: data.document_id || null,
          originalFilename: file.name,
          fileSizeBytes: file.size,
          pageCount: null, // page count comes from backend, not available here
        });
```

- [ ] **Step 2: Add pre-upload document limit check**

Add a state for showing the limit warning and import the `getDocuments` API:

```typescript
import { uploadCV, getCVProgress, getDocuments } from '../../api/cv';
```

Add state:

```typescript
  const [showLimitWarning, setShowLimitWarning] = useState(false);
  const [oldestDoc, setOldestDoc] = useState<{ name: string; date: string } | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
```

Update `handleFile` to check the limit before uploading:

```typescript
  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'pdf') {
      setError('Please upload a PDF file.');
      return;
    }

    // Check document limit
    try {
      const docs = await getDocuments();
      if (docs.length >= 3) {
        const oldest = docs[docs.length - 1]; // list is ordered desc, last = oldest
        setOldestDoc({
          name: oldest.original_filename,
          date: new Date(oldest.uploaded_at).toLocaleDateString(),
        });
        setPendingFile(file);
        setShowLimitWarning(true);
        return;
      }
    } catch {
      // If check fails, proceed anyway — cap is also enforced server-side
    }

    await doUpload(file);
  }, [user]);
```

Extract the actual upload logic into a helper:

```typescript
  const doUpload = useCallback(async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const data = await uploadCV(file);

      let unmatchedCount = 0;
      if (data.unmatched && data.unmatched.length > 0 && user?.user_id) {
        const existing = loadDraftNotes(user.user_id);
        const newNotes = data.unmatched.map((text: string) => ({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          text: `[From CV] ${text}`,
          createdAt: Date.now(),
          fromVoice: false,
        }));
        saveDraftNotes(user.user_id, [...newNotes, ...existing]);
        unmatchedCount = data.unmatched.length;
      }

      if (data.nodes.length === 0 && (!data.unmatched || data.unmatched.length === 0)) {
        setError('No entries could be extracted from this file. Try a different CV or use manual entry.');
      } else {
        setExtractedData({
          nodes: data.nodes,
          relationships: data.relationships || [],
          cvOwnerName: data.cv_owner_name || null,
          unmatchedCount,
          skippedCount: data.skipped_nodes?.length || 0,
          truncated: data.truncated || false,
          documentId: data.document_id || null,
          originalFilename: file.name,
          fileSizeBytes: file.size,
          pageCount: null,
        });
      }
    } catch {
      setError('Failed to parse CV. Please try again or use manual entry.');
    } finally {
      setUploading(false);
    }
  }, [user]);

  const handleLimitConfirm = useCallback(async () => {
    setShowLimitWarning(false);
    if (pendingFile) {
      await doUpload(pendingFile);
      setPendingFile(null);
    }
  }, [pendingFile, doUpload]);
```

- [ ] **Step 3: Pass document metadata to ExtractedDataReview**

Update the review mode JSX:

```typescript
  if (extractedData) {
    return (
      <ExtractedDataReview
        initialNodes={extractedData.nodes}
        initialRelationships={extractedData.relationships}
        cvOwnerName={extractedData.cvOwnerName}
        unmatchedCount={extractedData.unmatchedCount}
        skippedCount={extractedData.skippedCount}
        truncated={extractedData.truncated}
        onReset={() => setExtractedData(null)}
        resetLabel="Try another file"
        documentId={extractedData.documentId}
        originalFilename={extractedData.originalFilename}
        fileSizeBytes={extractedData.fileSizeBytes}
        pageCount={extractedData.pageCount}
      />
    );
  }
```

- [ ] **Step 4: Add limit warning modal JSX**

Add before the closing `</div>` of the upload mode section, a modal similar to the replace warning in ExtractedDataReview:

```typescript
      {showLimitWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div className="bg-neutral-950 border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-white text-lg font-semibold mb-1">Document limit reached</h3>
                <p className="text-white/50 text-sm leading-relaxed">
                  You already have 3 documents stored. Uploading this file will remove the oldest document
                  {oldestDoc && (
                    <> (<span className="text-white font-medium">{oldestDoc.name}</span>, uploaded {oldestDoc.date})</>
                  )}.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={() => { setShowLimitWarning(false); setPendingFile(null); }}
                className="border border-white/10 text-white/60 hover:text-white hover:bg-white/5 font-medium py-2 px-4 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleLimitConfirm}
                className="bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors cursor-pointer"
              >
                Replace & upload
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Lint**

Run: `cd frontend && npm run lint`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/onboarding/CVUploadOnboarding.tsx
git commit -m "feat: add document limit check and metadata to CV upload onboarding (#192)"
```

---

## Task 7: Update OrbViewPage — Import Flow & Document List

**Files:**
- Modify: `frontend/src/pages/OrbViewPage.tsx`

- [ ] **Step 1: Add document list state and fetch**

Near the top of the `OrbViewPage` component, add state and a fetch for documents:

```typescript
import { getDocuments, confirmImport } from '../api/cv';
import type { DocumentMetadata } from '../api/cv';
```

Add state:

```typescript
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
```

Add fetch alongside the existing orb fetch:

```typescript
  const fetchDocuments = useCallback(async () => {
    try {
      const docs = await getDocuments();
      setDocuments(docs);
    } catch { /* ignore */ }
  }, []);
```

Call `fetchDocuments()` in the existing `useEffect` that fetches orb data (or add a new one):

```typescript
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);
```

- [ ] **Step 2: Add pre-import document limit check**

Add state for the limit warning modal:

```typescript
  const [showImportLimitWarning, setShowImportLimitWarning] = useState(false);
  const [importOldestDoc, setImportOldestDoc] = useState<{ name: string; date: string } | null>(null);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
```

Update `handleImportFile` to check the document limit before importing:

```typescript
  const handleImportFile = useCallback(async (file: File) => {
    // Check document limit
    try {
      const docs = await getDocuments();
      if (docs.length >= 3) {
        const oldest = docs[docs.length - 1];
        setImportOldestDoc({
          name: oldest.original_filename,
          date: new Date(oldest.uploaded_at).toLocaleDateString(),
        });
        setPendingImportFile(file);
        setShowImportLimitWarning(true);
        return;
      }
    } catch { /* proceed — server enforces cap too */ }

    await doImport(file);
  }, [addToast]);
```

Extract the import logic into `doImport`:

```typescript
  const doImport = useCallback(async (file: File) => {
    setImporting(true);
    setImportStatus('Reading file...');
    const pollId = setInterval(async () => {
      try {
        const { getCVProgress } = await import('../api/cv');
        const p = await getCVProgress();
        if (p.active && p.message) {
          setImportStatus(p.detail || p.message);
        }
      } catch { /* ignore */ }
    }, 2000);

    try {
      const { importDocument } = await import('../api/cv');
      const result = await importDocument(file);
      clearInterval(pollId);
      if (result.nodes.length > 0) {
        setExtractedImport({
          nodes: result.nodes,
          relationships: result.relationships || [],
          cvOwnerName: result.cv_owner_name || null,
          unmatchedCount: result.unmatched?.length || 0,
          skippedCount: result.skipped_nodes?.length || 0,
          file,
          documentId: result.document_id || null,
        });
      } else {
        addToast('Error processing document. Please try again.', 'error');
      }
    } catch {
      clearInterval(pollId);
      addToast('Failed to import document', 'error');
    } finally {
      setImporting(false);
      setImportStatus('');
    }
  }, [addToast]);
```

- [ ] **Step 3: Update extractedImport state type**

Update the `extractedImport` state type to include `documentId`:

```typescript
  const [extractedImport, setExtractedImport] = useState<{
    nodes: ExtractedData['nodes'];
    relationships: ExtractedRelationship[];
    cvOwnerName: string | null;
    unmatchedCount: number;
    skippedCount: number;
    file: File;
    documentId: string | null;
  } | null>(null);
```

Remove the `replaceCV` field — the "Replace my latest uploaded CV" checkbox is no longer needed since document storage is automatic.

- [ ] **Step 4: Update the import confirm callback**

Update the `onConfirm` in the import review overlay:

```typescript
            onConfirm={async (nodes, rels, name, documentId, originalFilename, fileSizeBytes, pageCount) => {
              const { confirmImport } = await import('../api/cv');
              await confirmImport(nodes, rels, name, documentId, originalFilename, fileSizeBytes, pageCount);
              fetchDocuments(); // refresh document list
            }}
```

Pass document metadata props to `ExtractedDataReview`:

```typescript
            documentId={extractedImport.documentId}
            originalFilename={extractedImport.file.name}
            fileSizeBytes={extractedImport.file.size}
            pageCount={null}
```

Remove the "Replace my latest uploaded CV" checkbox `children` block.

- [ ] **Step 5: Add document list UI in the sidebar**

In the sidebar area (near the "Import data" label and "Export Orbis" button), add a documents section. Place it after the import button:

```typescript
                      {/* Document history */}
                      {documents.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <span className="text-[10px] text-white/30 uppercase tracking-wider font-medium">Documents ({documents.length}/3)</span>
                          {documents.map((doc) => (
                            <div
                              key={doc.document_id}
                              className="flex items-center gap-1.5 text-[11px] text-white/50 bg-white/[0.03] rounded-lg px-2 py-1.5"
                            >
                              <svg className="w-3 h-3 flex-shrink-0 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <div className="flex-1 min-w-0">
                                <div className="truncate">{doc.original_filename}</div>
                                <div className="text-white/25 text-[10px]">
                                  {new Date(doc.uploaded_at).toLocaleDateString()}
                                  {doc.entities_count != null && ` · ${doc.entities_count} nodes`}
                                  {doc.edges_count != null && ` · ${doc.edges_count} edges`}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
```

- [ ] **Step 6: Add import limit warning modal**

Add a limit warning modal similar to the one in CVUploadOnboarding. Place it alongside the other modals:

```typescript
      {showImportLimitWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div className="bg-neutral-950 border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-white text-lg font-semibold mb-1">Document limit reached</h3>
                <p className="text-white/50 text-sm leading-relaxed">
                  You already have 3 documents stored. Importing this file will remove the oldest document
                  {importOldestDoc && (
                    <> (<span className="text-white font-medium">{importOldestDoc.name}</span>, uploaded {importOldestDoc.date})</>
                  )}.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={() => { setShowImportLimitWarning(false); setPendingImportFile(null); }}
                className="border border-white/10 text-white/60 hover:text-white hover:bg-white/5 font-medium py-2 px-4 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowImportLimitWarning(false);
                  if (pendingImportFile) {
                    await doImport(pendingImportFile);
                    setPendingImportFile(null);
                  }
                }}
                className="bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors cursor-pointer"
              >
                Replace & import
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 7: Lint and type-check**

Run: `cd frontend && npm run lint && npm run build`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/OrbViewPage.tsx
git commit -m "feat: add document list and import limit check to OrbViewPage (#192)"
```

---

## Task 8: Run All Tests and Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run backend tests**

Run: `cd backend && uv run pytest tests/unit/ -v --cov=app --cov-fail-under=75`
Expected: All tests PASS, coverage >= 75%

- [ ] **Step 2: Run backend lint**

Run: `cd backend && uv run ruff check . && uv run ruff format --check .`
Expected: No errors

- [ ] **Step 3: Run frontend lint and build**

Run: `cd frontend && npm run lint && npm run build`
Expected: No errors

- [ ] **Step 4: Commit any remaining fixes**

If any fixes were needed, commit them:

```bash
git add -A
git commit -m "fix: address lint and test issues for document tracking (#192)"
```

---

## Task 9: Update Documentation

**Files:**
- Modify: `CLAUDE.md` (if API changes warrant it)
- Modify: `docs/api.md` (new/changed endpoints)
- Modify: `docs/database.md` (SQLite schema change)

- [ ] **Step 1: Update docs/database.md**

Add a section documenting the `cv_documents` SQLite table schema, the migration from `cv_uploads`, and the 3-document cap.

- [ ] **Step 2: Update docs/api.md**

Document the new/changed endpoints:
- `GET /cv/documents` — list documents
- `GET /cv/documents/{document_id}/download` — download specific document
- Updated `POST /cv/confirm` and `POST /cv/import-confirm` request bodies (new fields)
- Removed `POST /cv/store-file`

- [ ] **Step 3: Commit**

```bash
git add docs/
git commit -m "docs: update API and database docs for document tracking (#192)"
```
