"""Unit tests for app.snapshots.db — asyncpg snapshot metadata store."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

import app.snapshots.db as snap_db

_NOW = "2026-01-01T00:00:00"
_DATA = '{"person":{},"nodes":[],"links":[]}'


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
    with patch("app.snapshots.db.get_pool", AsyncMock(return_value=pool)):
        yield pool


# ── insert_snapshot ──


async def test_insert_returns_dict(mock_get_pool):
    result = await snap_db.insert_snapshot(
        snapshot_id="snap-1",
        user_id="user-1",
        trigger="manual",
        label="Test save",
        node_count=10,
        edge_count=5,
        data=_DATA,
        now=_NOW,
    )
    assert result["snapshot_id"] == "snap-1"
    assert result["trigger"] == "manual"
    assert result["label"] == "Test save"
    assert result["node_count"] == 10
    assert result["edge_count"] == 5
    mock_get_pool.execute.assert_awaited_once()


async def test_insert_calls_execute_with_args(mock_get_pool):
    await snap_db.insert_snapshot("snap-1", "user-1", "manual", None, 5, 2, _DATA, _NOW)
    args = mock_get_pool.execute.call_args
    assert "INSERT INTO orb_snapshots" in args[0][0]
    assert args[0][1] == "snap-1"
    assert args[0][2] == "user-1"


# ── list_snapshots ──


async def test_list_snapshots_empty(mock_get_pool):
    mock_get_pool.fetch.return_value = []
    snaps = await snap_db.list_snapshots("user-1")
    assert snaps == []
    mock_get_pool.fetch.assert_awaited_once()


async def test_list_snapshots_returns_dicts(mock_get_pool):
    mock_get_pool.fetch.return_value = [
        {
            "snapshot_id": "snap-new",
            "user_id": "user-1",
            "created_at": "2026-06-01T00:00:00",
            "trigger": "manual",
            "label": None,
            "node_count": 10,
            "edge_count": 4,
        },
        {
            "snapshot_id": "snap-old",
            "user_id": "user-1",
            "created_at": "2026-01-01T00:00:00",
            "trigger": "manual",
            "label": None,
            "node_count": 5,
            "edge_count": 2,
        },
    ]
    snaps = await snap_db.list_snapshots("user-1")
    assert len(snaps) == 2
    assert snaps[0]["snapshot_id"] == "snap-new"
    assert snaps[1]["snapshot_id"] == "snap-old"


async def test_list_snapshots_excludes_data(mock_get_pool):
    """list_snapshots SQL does not select the 'data' column."""
    mock_get_pool.fetch.return_value = [
        {
            "snapshot_id": "snap-1",
            "user_id": "user-1",
            "created_at": _NOW,
            "trigger": "manual",
            "label": "Test",
            "node_count": 10,
            "edge_count": 5,
        },
    ]
    snaps = await snap_db.list_snapshots("user-1")
    assert "data" not in snaps[0]


# ── get_snapshot ──


async def test_get_snapshot_with_data(mock_get_pool):
    mock_get_pool.fetchrow.return_value = {
        "snapshot_id": "snap-1",
        "user_id": "user-1",
        "created_at": _NOW,
        "trigger": "manual",
        "label": None,
        "node_count": 5,
        "edge_count": 2,
        "data": _DATA,
    }
    snap = await snap_db.get_snapshot("user-1", "snap-1")
    assert snap is not None
    assert snap["data"] == _DATA
    assert snap["snapshot_id"] == "snap-1"


async def test_get_snapshot_nonexistent(mock_get_pool):
    mock_get_pool.fetchrow.return_value = None
    assert await snap_db.get_snapshot("user-1", "no-such") is None


# ── count_snapshots ──


async def test_count_snapshots_zero(mock_get_pool):
    mock_get_pool.fetchval.return_value = 0
    assert await snap_db.count_snapshots("user-1") == 0


async def test_count_snapshots_nonzero(mock_get_pool):
    mock_get_pool.fetchval.return_value = 3
    assert await snap_db.count_snapshots("user-1") == 3


async def test_count_snapshots_calls_fetchval(mock_get_pool):
    mock_get_pool.fetchval.return_value = 2
    await snap_db.count_snapshots("user-1")
    args = mock_get_pool.fetchval.call_args
    assert "COUNT(*)" in args[0][0]
    assert args[0][1] == "user-1"


# ── delete_snapshot ──


async def test_delete_snapshot_found(mock_get_pool):
    mock_get_pool.execute.return_value = "DELETE 1"
    deleted = await snap_db.delete_snapshot("user-1", "snap-1")
    assert deleted is True


async def test_delete_snapshot_nonexistent(mock_get_pool):
    mock_get_pool.execute.return_value = "DELETE 0"
    assert await snap_db.delete_snapshot("user-1", "no-such") is False


# ── delete_oldest_if_at_limit ──


async def test_delete_oldest_if_at_limit_under_limit(mock_get_pool):
    """Under the limit, should return None without querying for oldest."""
    mock_get_pool.fetchval.return_value = 1  # under MAX_SNAPSHOTS_PER_USER
    evicted = await snap_db.delete_oldest_if_at_limit("user-1")
    assert evicted is None
    mock_get_pool.fetchrow.assert_not_awaited()


async def test_delete_oldest_if_at_limit_at_limit(mock_get_pool):
    """At the limit, should fetch oldest and delete it."""
    mock_get_pool.fetchval.return_value = snap_db.MAX_SNAPSHOTS_PER_USER
    mock_get_pool.fetchrow.return_value = {
        "snapshot_id": "snap-old",
        "user_id": "user-1",
        "created_at": "2026-01-01T00:00:00",
        "trigger": "manual",
        "label": None,
        "node_count": 5,
        "edge_count": 2,
    }
    mock_get_pool.execute.return_value = "DELETE 1"
    evicted = await snap_db.delete_oldest_if_at_limit("user-1")
    assert evicted is not None
    assert evicted["snapshot_id"] == "snap-old"


async def test_delete_oldest_if_at_limit_no_oldest_row(mock_get_pool):
    """At the limit but fetchrow returns None (edge case)."""
    mock_get_pool.fetchval.return_value = snap_db.MAX_SNAPSHOTS_PER_USER
    mock_get_pool.fetchrow.return_value = None
    evicted = await snap_db.delete_oldest_if_at_limit("user-1")
    assert evicted is None


# ── delete_all_for_user ──


async def test_delete_all_for_user(mock_get_pool):
    mock_get_pool.execute.return_value = "DELETE 2"
    count = await snap_db.delete_all_for_user("user-1")
    assert count == 2


async def test_delete_all_for_user_zero(mock_get_pool):
    mock_get_pool.execute.return_value = "DELETE 0"
    count = await snap_db.delete_all_for_user("user-1")
    assert count == 0


# ── nullable label ──


async def test_nullable_label(mock_get_pool):
    result = await snap_db.insert_snapshot(
        "snap-1", "user-1", "cv_import", None, 5, 2, _DATA, _NOW
    )
    assert result["label"] is None
