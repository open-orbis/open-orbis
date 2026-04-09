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
