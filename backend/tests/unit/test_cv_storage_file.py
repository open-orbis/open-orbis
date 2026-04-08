"""Unit tests for app.cv_storage.storage — encrypted file storage for CVs."""

from __future__ import annotations

import pytest

import app.cv_storage.db as cv_db
import app.cv_storage.storage as cv_storage


@pytest.fixture(autouse=True)
def isolated_storage(monkeypatch, tmp_path):
    """
    Redirect both _CV_DIR (file storage) and _DB_PATH/_conn (SQLite metadata)
    to tmp_path so every test runs fully isolated with a fresh directory and
    an empty database.
    """
    cv_dir = tmp_path / "cv_files"
    monkeypatch.setattr(cv_storage, "_CV_DIR", cv_dir)

    db_file = tmp_path / "cv_uploads_test.db"
    monkeypatch.setattr(cv_db, "_DB_PATH", db_file)
    monkeypatch.setattr(cv_db, "_conn", None)

    yield

    if cv_db._conn is not None:
        cv_db._conn.close()
    monkeypatch.setattr(cv_db, "_conn", None)


_PDF = b"%PDF-1.4 fake pdf content for testing"
_USER = "user-test-001"


def test_save_and_load():
    cv_storage.save_cv(_USER, _PDF, "resume.pdf", page_count=2)
    result = cv_storage.load_cv(_USER)
    assert result == _PDF


def test_save_overwrites():
    cv_storage.save_cv(_USER, _PDF, "old.pdf", page_count=1)
    new_pdf = b"%PDF-1.4 updated content"
    cv_storage.save_cv(_USER, new_pdf, "new.pdf", page_count=3)
    result = cv_storage.load_cv(_USER)
    assert result == new_pdf


def test_load_nonexistent():
    result = cv_storage.load_cv("no-such-user")
    assert result is None


def test_delete():
    cv_storage.save_cv(_USER, _PDF, "resume.pdf", page_count=2)
    removed = cv_storage.delete_cv(_USER)
    assert removed is True
    assert cv_storage.load_cv(_USER) is None
    assert not cv_storage._cv_path(_USER).exists()


def test_delete_nonexistent():
    removed = cv_storage.delete_cv("ghost-user")
    assert removed is False


def test_file_is_encrypted_on_disk():
    cv_storage.save_cv(_USER, _PDF, "resume.pdf", page_count=1)
    raw = cv_storage._cv_path(_USER).read_bytes()
    # The Fernet token is base64 and starts with 'gAAAAA'; it must NOT contain
    # plaintext PDF bytes.
    assert _PDF not in raw
    assert b"%PDF" not in raw


def test_metadata_saved():
    cv_storage.save_cv(_USER, _PDF, "resume.pdf", page_count=4)
    meta = cv_db.get_metadata(_USER)
    assert meta is not None
    assert meta["original_filename"] == "resume.pdf"
    assert meta["file_size_bytes"] == len(_PDF)
    assert meta["page_count"] == 4
    assert meta["user_id"] == _USER


def test_delete_removes_metadata():
    cv_storage.save_cv(_USER, _PDF, "resume.pdf", page_count=2)
    cv_storage.delete_cv(_USER)
    assert cv_db.get_metadata(_USER) is None
