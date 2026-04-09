"""Unit tests for app.snapshots.db — SQLite snapshot metadata store."""

from __future__ import annotations

import pytest

import app.snapshots.db as snap_db

_NOW = "2026-01-01T00:00:00"
_DATA = '{"person":{},"nodes":[],"links":[]}'


@pytest.fixture(autouse=True)
def isolated_db(monkeypatch, tmp_path):
    db_file = tmp_path / "snapshots_test.db"
    monkeypatch.setattr(snap_db, "_DB_PATH", db_file)
    monkeypatch.setattr(snap_db, "_conn", None)
    yield
    if snap_db._conn is not None:
        snap_db._conn.close()
    monkeypatch.setattr(snap_db, "_conn", None)


def test_insert_and_list():
    snap_db.insert_snapshot(
        snapshot_id="snap-1",
        user_id="user-1",
        trigger="manual",
        label="Test save",
        node_count=10,
        edge_count=5,
        data=_DATA,
        now=_NOW,
    )
    snaps = snap_db.list_snapshots("user-1")
    assert len(snaps) == 1
    assert snaps[0]["snapshot_id"] == "snap-1"
    assert snaps[0]["trigger"] == "manual"
    assert snaps[0]["label"] == "Test save"
    assert snaps[0]["node_count"] == 10
    assert snaps[0]["edge_count"] == 5
    assert "data" not in snaps[0]


def test_list_ordered_by_date_desc():
    snap_db.insert_snapshot(
        "snap-old", "user-1", "manual", None, 5, 2, _DATA, "2026-01-01T00:00:00"
    )
    snap_db.insert_snapshot(
        "snap-new", "user-1", "manual", None, 10, 4, _DATA, "2026-06-01T00:00:00"
    )
    snap_db.insert_snapshot(
        "snap-mid", "user-1", "manual", None, 7, 3, _DATA, "2026-03-01T00:00:00"
    )
    snaps = snap_db.list_snapshots("user-1")
    assert [s["snapshot_id"] for s in snaps] == ["snap-new", "snap-mid", "snap-old"]


def test_get_snapshot_with_data():
    snap_db.insert_snapshot("snap-1", "user-1", "manual", None, 5, 2, _DATA, _NOW)
    snap = snap_db.get_snapshot("user-1", "snap-1")
    assert snap is not None
    assert snap["data"] == _DATA
    assert snap["snapshot_id"] == "snap-1"


def test_get_snapshot_nonexistent():
    assert snap_db.get_snapshot("user-1", "no-such") is None


def test_count_snapshots():
    assert snap_db.count_snapshots("user-1") == 0
    snap_db.insert_snapshot("snap-1", "user-1", "manual", None, 5, 2, _DATA, _NOW)
    assert snap_db.count_snapshots("user-1") == 1
    snap_db.insert_snapshot("snap-2", "user-1", "manual", None, 10, 4, _DATA, _NOW)
    assert snap_db.count_snapshots("user-1") == 2


def test_count_scoped_to_user():
    snap_db.insert_snapshot("snap-1", "user-1", "manual", None, 5, 2, _DATA, _NOW)
    snap_db.insert_snapshot("snap-2", "user-2", "manual", None, 10, 4, _DATA, _NOW)
    assert snap_db.count_snapshots("user-1") == 1
    assert snap_db.count_snapshots("user-2") == 1


def test_delete_snapshot():
    snap_db.insert_snapshot("snap-1", "user-1", "manual", None, 5, 2, _DATA, _NOW)
    deleted = snap_db.delete_snapshot("user-1", "snap-1")
    assert deleted is True
    assert snap_db.count_snapshots("user-1") == 0


def test_delete_snapshot_nonexistent():
    assert snap_db.delete_snapshot("user-1", "no-such") is False


def test_delete_oldest_if_at_limit():
    snap_db.insert_snapshot(
        "snap-old", "user-1", "manual", None, 5, 2, _DATA, "2026-01-01T00:00:00"
    )
    snap_db.insert_snapshot(
        "snap-mid", "user-1", "manual", None, 7, 3, _DATA, "2026-03-01T00:00:00"
    )
    snap_db.insert_snapshot(
        "snap-new", "user-1", "manual", None, 10, 4, _DATA, "2026-06-01T00:00:00"
    )
    evicted = snap_db.delete_oldest_if_at_limit("user-1")
    assert evicted is not None
    assert evicted["snapshot_id"] == "snap-old"
    assert snap_db.count_snapshots("user-1") == 2


def test_delete_oldest_under_limit():
    snap_db.insert_snapshot("snap-1", "user-1", "manual", None, 5, 2, _DATA, _NOW)
    evicted = snap_db.delete_oldest_if_at_limit("user-1")
    assert evicted is None
    assert snap_db.count_snapshots("user-1") == 1


def test_delete_all_for_user():
    snap_db.insert_snapshot("snap-1", "user-1", "manual", None, 5, 2, _DATA, _NOW)
    snap_db.insert_snapshot("snap-2", "user-1", "manual", None, 10, 4, _DATA, _NOW)
    snap_db.insert_snapshot("snap-3", "user-2", "manual", None, 15, 6, _DATA, _NOW)
    count = snap_db.delete_all_for_user("user-1")
    assert count == 2
    assert snap_db.count_snapshots("user-1") == 0
    assert snap_db.count_snapshots("user-2") == 1


def test_nullable_label():
    snap_db.insert_snapshot("snap-1", "user-1", "cv_import", None, 5, 2, _DATA, _NOW)
    snaps = snap_db.list_snapshots("user-1")
    assert snaps[0]["label"] is None
