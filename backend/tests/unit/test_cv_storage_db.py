"""Unit tests for app.cv_storage.db — asyncpg CV document metadata store."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

import app.cv_storage.db as cv_db

_NOW = "2026-01-01T00:00:00"


def _mock_pool():
    """Return an AsyncMock that behaves like an asyncpg Pool."""
    pool = AsyncMock()
    pool.execute = AsyncMock(return_value="INSERT 0 1")
    pool.fetch = AsyncMock(return_value=[])
    pool.fetchrow = AsyncMock(return_value=None)
    pool.fetchval = AsyncMock(return_value=0)
    return pool


@pytest.fixture(autouse=True)
def mock_get_pool():
    pool = _mock_pool()
    with patch("app.cv_storage.db.get_pool", AsyncMock(return_value=pool)):
        yield pool


# ── insert_document ──


async def test_insert_and_list(mock_get_pool):
    result = await cv_db.insert_document(
        document_id="doc-1",
        user_id="user-1",
        filename="cv.pdf",
        size=12345,
        page_count=3,
        entities_count=10,
        edges_count=5,
        now=_NOW,
    )
    assert result["document_id"] == "doc-1"
    assert result["user_id"] == "user-1"
    assert result["original_filename"] == "cv.pdf"
    assert result["file_size_bytes"] == 12345
    assert result["page_count"] == 3
    assert result["entities_count"] == 10
    assert result["edges_count"] == 5
    assert result["uploaded_at"] == _NOW
    mock_get_pool.execute.assert_awaited_once()


async def test_insert_calls_execute(mock_get_pool):
    await cv_db.insert_document("doc-1", "user-1", "cv.pdf", 100, 1, 5, 2, _NOW)
    args = mock_get_pool.execute.call_args
    assert "INSERT INTO cv_documents" in args[0][0]
    assert args[0][1] == "doc-1"
    assert args[0][2] == "user-1"


# ── list_documents ──


async def test_list_documents_empty(mock_get_pool):
    mock_get_pool.fetch.return_value = []
    docs = await cv_db.list_documents("user-1")
    assert docs == []


async def test_list_documents_returns_dicts(mock_get_pool):
    mock_get_pool.fetch.return_value = [
        {
            "document_id": "doc-new",
            "user_id": "user-1",
            "original_filename": "new.pdf",
            "file_size_bytes": 200,
            "uploaded_at": "2026-06-01T00:00:00",
            "page_count": 2,
            "entities_count": 10,
            "edges_count": 4,
        },
        {
            "document_id": "doc-old",
            "user_id": "user-1",
            "original_filename": "old.pdf",
            "file_size_bytes": 100,
            "uploaded_at": "2026-01-01T00:00:00",
            "page_count": 1,
            "entities_count": 5,
            "edges_count": 2,
        },
    ]
    docs = await cv_db.list_documents("user-1")
    assert len(docs) == 2
    assert docs[0]["document_id"] == "doc-new"
    assert docs[1]["document_id"] == "doc-old"


async def test_list_ordered_by_date_desc(mock_get_pool):
    """Verify that the SQL query includes ORDER BY ... DESC."""
    await cv_db.list_documents("user-1")
    args = mock_get_pool.fetch.call_args
    assert "ORDER BY uploaded_at DESC" in args[0][0]


# ── count_documents ──


async def test_count_documents_zero(mock_get_pool):
    mock_get_pool.fetchval.return_value = 0
    assert await cv_db.count_documents("user-1") == 0


async def test_count_documents_nonzero(mock_get_pool):
    mock_get_pool.fetchval.return_value = 3
    assert await cv_db.count_documents("user-1") == 3


async def test_count_scoped_to_user(mock_get_pool):
    """count_documents passes the user_id to the query."""
    await cv_db.count_documents("user-1")
    args = mock_get_pool.fetchval.call_args
    assert args[0][1] == "user-1"


# ── get_oldest_document ──


async def test_get_oldest_document(mock_get_pool):
    mock_get_pool.fetchrow.return_value = {
        "document_id": "doc-old",
        "user_id": "user-1",
        "original_filename": "old.pdf",
        "file_size_bytes": 100,
        "uploaded_at": "2026-01-01T00:00:00",
        "page_count": 1,
        "entities_count": 5,
        "edges_count": 2,
    }
    oldest = await cv_db.get_oldest_document("user-1")
    assert oldest is not None
    assert oldest["document_id"] == "doc-old"


async def test_get_oldest_document_empty(mock_get_pool):
    mock_get_pool.fetchrow.return_value = None
    assert await cv_db.get_oldest_document("user-1") is None


# ── delete_document ──


async def test_delete_document(mock_get_pool):
    mock_get_pool.execute.return_value = "DELETE 1"
    deleted = await cv_db.delete_document("user-1", "doc-1")
    assert deleted is True


async def test_delete_document_nonexistent(mock_get_pool):
    mock_get_pool.execute.return_value = "DELETE 0"
    assert await cv_db.delete_document("user-1", "no-such-doc") is False


# ── delete_all_for_user ──


async def test_delete_all_for_user(mock_get_pool):
    mock_get_pool.execute.return_value = "DELETE 2"
    count = await cv_db.delete_all_for_user("user-1")
    assert count == 2


async def test_delete_all_for_user_zero(mock_get_pool):
    mock_get_pool.execute.return_value = "DELETE 0"
    count = await cv_db.delete_all_for_user("user-1")
    assert count == 0


# ── nullable counts ──


async def test_nullable_counts(mock_get_pool):
    result = await cv_db.insert_document(
        "doc-1", "user-1", "cv.pdf", 100, 1, None, None, _NOW
    )
    assert result["entities_count"] is None
    assert result["edges_count"] is None


# ── backward-compat shims ──


async def test_get_metadata_returns_first_doc(mock_get_pool):
    mock_get_pool.fetch.return_value = [
        {
            "document_id": "doc-1",
            "user_id": "user-1",
            "original_filename": "cv.pdf",
            "file_size_bytes": 100,
            "uploaded_at": _NOW,
            "page_count": 1,
            "entities_count": 5,
            "edges_count": 2,
        },
    ]
    meta = await cv_db.get_metadata("user-1")
    assert meta is not None
    assert meta["document_id"] == "doc-1"


async def test_get_metadata_none_when_empty(mock_get_pool):
    mock_get_pool.fetch.return_value = []
    assert await cv_db.get_metadata("user-1") is None


async def test_delete_metadata(mock_get_pool):
    mock_get_pool.execute.return_value = "DELETE 1"
    assert await cv_db.delete_metadata("user-1") is True


async def test_delete_metadata_nothing(mock_get_pool):
    mock_get_pool.execute.return_value = "DELETE 0"
    assert await cv_db.delete_metadata("user-1") is False
