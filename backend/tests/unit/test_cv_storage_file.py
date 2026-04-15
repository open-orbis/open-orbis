"""Unit tests for app.cv_storage.storage — multi-document encrypted file storage."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

import app.cv_storage.db as cv_db
import app.cv_storage.storage as cv_storage

_PDF = b"%PDF-1.4 fake pdf content for testing"
_USER = "user-test-001"
_NOW = "2026-01-01T00:00:00"


@pytest.fixture(autouse=True)
def isolated_storage(monkeypatch, tmp_path):
    cv_dir = tmp_path / "cv_files"
    monkeypatch.setattr(cv_storage, "_CV_DIR", cv_dir)
    yield cv_dir


# ── save_document + load_document ──


async def test_save_and_load(isolated_storage):
    with patch.object(cv_db, "insert_document", new_callable=AsyncMock) as mock_insert:
        mock_insert.return_value = {
            "document_id": "doc-1",
            "user_id": _USER,
            "original_filename": "resume.pdf",
            "file_size_bytes": len(_PDF),
            "uploaded_at": _NOW,
            "page_count": 2,
            "entities_count": 10,
            "edges_count": 5,
        }
        doc = await cv_storage.save_document(
            user_id=_USER,
            document_id="doc-1",
            pdf_bytes=_PDF,
            filename="resume.pdf",
            page_count=2,
            entities_count=10,
            edges_count=5,
        )
        assert doc["document_id"] == "doc-1"
        mock_insert.assert_awaited_once()

    result = cv_storage.load_document(_USER, "doc-1")
    assert result == _PDF


async def test_load_nonexistent():
    assert cv_storage.load_document(_USER, "no-such-doc") is None


async def test_multiple_documents(isolated_storage):
    with patch.object(cv_db, "insert_document", new_callable=AsyncMock) as mock_insert:
        mock_insert.return_value = {"document_id": "doc-1"}
        await cv_storage.save_document(_USER, "doc-1", _PDF, "a.pdf", 1, 5, 2)
        mock_insert.return_value = {"document_id": "doc-2"}
        await cv_storage.save_document(_USER, "doc-2", b"other pdf", "b.pdf", 2, 10, 4)

    assert cv_storage.load_document(_USER, "doc-1") == _PDF
    assert cv_storage.load_document(_USER, "doc-2") == b"other pdf"


# ── delete_document ──


async def test_delete_document(isolated_storage):
    with patch.object(cv_db, "insert_document", new_callable=AsyncMock) as mock_insert:
        mock_insert.return_value = {"document_id": "doc-1"}
        await cv_storage.save_document(_USER, "doc-1", _PDF, "resume.pdf", 2, 10, 5)

    with patch.object(cv_db, "delete_document", new_callable=AsyncMock) as mock_del:
        mock_del.return_value = True
        removed = await cv_storage.delete_document(_USER, "doc-1")
        assert removed is True
        assert cv_storage.load_document(_USER, "doc-1") is None
        mock_del.assert_awaited_once()


async def test_delete_document_nonexistent():
    with patch.object(cv_db, "delete_document", new_callable=AsyncMock) as mock_del:
        mock_del.return_value = False
        result = await cv_storage.delete_document(_USER, "no-such-doc")
        assert result is False


# ── delete_all_for_user ──


async def test_delete_all_for_user(isolated_storage):
    with patch.object(cv_db, "insert_document", new_callable=AsyncMock) as mock_insert:
        mock_insert.return_value = {"document_id": "doc-1"}
        await cv_storage.save_document(_USER, "doc-1", _PDF, "a.pdf", 1, 5, 2)
        mock_insert.return_value = {"document_id": "doc-2"}
        await cv_storage.save_document(_USER, "doc-2", b"other", "b.pdf", 2, 10, 4)

    with (
        patch.object(cv_db, "list_documents", new_callable=AsyncMock) as mock_list,
        patch.object(cv_db, "delete_all_for_user", new_callable=AsyncMock) as mock_del,
    ):
        mock_list.return_value = [
            {"document_id": "doc-1"},
            {"document_id": "doc-2"},
        ]
        mock_del.return_value = 2
        count = await cv_storage.delete_all_for_user(_USER)
        assert count == 2
        assert cv_storage.load_document(_USER, "doc-1") is None
        assert cv_storage.load_document(_USER, "doc-2") is None


# ── evict_oldest_if_at_limit ──


async def test_evict_oldest(isolated_storage):
    # Pre-create some files
    with patch.object(cv_db, "insert_document", new_callable=AsyncMock) as mock_insert:
        for doc_id in ("doc-old", "doc-mid", "doc-new"):
            mock_insert.return_value = {"document_id": doc_id}
            await cv_storage.save_document(
                _USER, doc_id, _PDF, f"{doc_id}.pdf", 1, 5, 2
            )

    with (
        patch.object(cv_db, "count_documents", new_callable=AsyncMock) as mock_count,
        patch.object(
            cv_db, "get_oldest_document", new_callable=AsyncMock
        ) as mock_oldest,
        patch.object(cv_db, "delete_document", new_callable=AsyncMock) as mock_del,
    ):
        mock_count.return_value = cv_db.MAX_DOCUMENTS_PER_USER
        mock_oldest.return_value = {
            "document_id": "doc-old",
            "user_id": _USER,
            "original_filename": "doc-old.pdf",
            "file_size_bytes": len(_PDF),
            "uploaded_at": "2026-01-01T00:00:00",
            "page_count": 1,
            "entities_count": 5,
            "edges_count": 2,
        }
        mock_del.return_value = True
        evicted = await cv_storage.evict_oldest_if_at_limit(_USER)
        assert evicted is not None
        assert evicted["document_id"] == "doc-old"
        assert cv_storage.load_document(_USER, "doc-old") is None


async def test_evict_oldest_under_limit():
    with patch.object(cv_db, "count_documents", new_callable=AsyncMock) as mock_count:
        mock_count.return_value = 1
        evicted = await cv_storage.evict_oldest_if_at_limit(_USER)
        assert evicted is None


# ── file encryption ──


async def test_file_is_encrypted_on_disk(isolated_storage):
    with patch.object(cv_db, "insert_document", new_callable=AsyncMock) as mock_insert:
        mock_insert.return_value = {"document_id": "doc-1"}
        await cv_storage.save_document(_USER, "doc-1", _PDF, "resume.pdf", 1, 5, 2)

    raw = cv_storage._doc_path(_USER, "doc-1").read_bytes()
    assert _PDF not in raw
    assert b"%PDF" not in raw


# ── migrate_legacy_file ──


def test_file_migration_on_save(isolated_storage):
    """Old-style file {user_id}.pdf.enc should be migrated."""
    from app.graph.encryption import encrypt_bytes

    cv_dir = isolated_storage
    cv_dir.mkdir(parents=True, exist_ok=True)

    old_path = cv_dir / f"{_USER}.pdf.enc"
    old_path.write_bytes(encrypt_bytes(_PDF))

    cv_storage.migrate_legacy_file(_USER, "doc-legacy")
    assert not old_path.exists()
    assert cv_storage._doc_path(_USER, "doc-legacy").exists()
    assert cv_storage.load_document(_USER, "doc-legacy") == _PDF
