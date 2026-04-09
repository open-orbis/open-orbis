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
