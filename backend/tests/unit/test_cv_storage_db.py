"""Unit tests for app.cv_storage.db — SQLite metadata store for CV uploads."""

from __future__ import annotations

import pytest

import app.cv_storage.db as cv_db


@pytest.fixture(autouse=True)
def isolated_db(monkeypatch, tmp_path):
    """
    Redirect _DB_PATH to a temp file and reset the module-level singleton
    connection before each test so every test gets a fresh, empty database.
    """
    db_file = tmp_path / "cv_uploads_test.db"
    monkeypatch.setattr(cv_db, "_DB_PATH", db_file)
    monkeypatch.setattr(cv_db, "_conn", None)
    yield
    # Close the connection opened during the test to release the file handle.
    if cv_db._conn is not None:
        cv_db._conn.close()
    monkeypatch.setattr(cv_db, "_conn", None)


_NOW = "2026-01-01T00:00:00"


def test_upsert_and_get():
    cv_db.upsert_metadata(
        user_id="user-1",
        filename="cv.pdf",
        size=12345,
        page_count=3,
        now=_NOW,
    )
    result = cv_db.get_metadata("user-1")
    assert result is not None
    assert result["user_id"] == "user-1"
    assert result["original_filename"] == "cv.pdf"
    assert result["file_size_bytes"] == 12345
    assert result["page_count"] == 3
    assert result["uploaded_at"] == _NOW


def test_upsert_replaces():
    cv_db.upsert_metadata(
        user_id="user-2",
        filename="old_cv.pdf",
        size=1000,
        page_count=1,
        now="2026-01-01T00:00:00",
    )
    new_now = "2026-06-01T12:00:00"
    cv_db.upsert_metadata(
        user_id="user-2",
        filename="new_cv.pdf",
        size=2000,
        page_count=5,
        now=new_now,
    )
    result = cv_db.get_metadata("user-2")
    assert result is not None
    assert result["original_filename"] == "new_cv.pdf"
    assert result["file_size_bytes"] == 2000
    assert result["page_count"] == 5
    assert result["uploaded_at"] == new_now


def test_get_nonexistent():
    result = cv_db.get_metadata("does-not-exist")
    assert result is None


def test_delete():
    cv_db.upsert_metadata(
        user_id="user-3",
        filename="cv.pdf",
        size=500,
        page_count=2,
        now=_NOW,
    )
    deleted = cv_db.delete_metadata("user-3")
    assert deleted is True
    assert cv_db.get_metadata("user-3") is None


def test_delete_nonexistent():
    deleted = cv_db.delete_metadata("ghost-user")
    assert deleted is False
