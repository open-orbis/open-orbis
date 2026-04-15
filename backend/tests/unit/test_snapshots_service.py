"""Unit tests for app.snapshots.service — snapshot creation and restore."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import app.snapshots.db as snap_db
import app.snapshots.service as snap_service
from tests.unit.conftest import MockNode

# ── Helpers ──


def _make_orb_record():
    person = MockNode(
        {"user_id": "user-1", "name": "Test User", "email": "enc:test@example.com"},
        ["Person"],
    )
    skill = MockNode({"uid": "skill-1", "name": "Python"}, ["Skill"])
    work = MockNode(
        {"uid": "work-1", "company": "Acme", "title": "Dev"},
        ["WorkExperience"],
    )
    return {
        "p": person,
        "connections": [
            {"node": skill, "rel": "HAS_SKILL"},
            {"node": work, "rel": "HAS_WORK_EXPERIENCE"},
        ],
        "cross_skill_nodes": [],
        "cross_links": [
            {"source": "work-1", "target": "skill-1", "rel": "USED_SKILL"},
        ],
    }


def _mock_db_with_record(record):
    """Build a MagicMock AsyncDriver whose session().run().single() returns *record*."""
    mock_session = AsyncMock()
    mock_session.run.return_value.single = AsyncMock(return_value=record)

    mock_db = MagicMock()
    mock_db.session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    mock_db.session.return_value.__aexit__ = AsyncMock(return_value=False)
    return mock_db, mock_session


# ── serialize_orb_raw ──


def test_serialize_orb_raw_preserves_encrypted_pii():
    record = _make_orb_record()
    data = snap_service.serialize_orb_raw(record)
    parsed = json.loads(data)
    assert parsed["person"]["email"] == "enc:test@example.com"
    assert parsed["person"]["name"] == "Test User"


def test_serialize_orb_raw_nodes_and_links():
    record = _make_orb_record()
    data = snap_service.serialize_orb_raw(record)
    parsed = json.loads(data)
    assert len(parsed["nodes"]) == 2
    # 2 direct links (person->skill, person->work) + 1 cross-link (work->skill)
    assert len(parsed["links"]) == 3


def test_serialize_orb_raw_stores_labels():
    record = _make_orb_record()
    data = snap_service.serialize_orb_raw(record)
    parsed = json.loads(data)
    labels = {tuple(n["_labels"]) for n in parsed["nodes"]}
    assert ("Skill",) in labels
    assert ("WorkExperience",) in labels


def test_serialize_orb_raw_strips_embedding():
    """Embeddings should be removed — they are large and regenerated."""
    person = MockNode({"user_id": "u1", "name": "X"}, ["Person"])
    node_with_embed = MockNode(
        {"uid": "n1", "name": "Foo", "embedding": [0.1, 0.2, 0.3]},
        ["Skill"],
    )
    record = {
        "p": person,
        "connections": [{"node": node_with_embed, "rel": "HAS_SKILL"}],
        "cross_skill_nodes": [],
        "cross_links": [],
    }
    data = snap_service.serialize_orb_raw(record)
    parsed = json.loads(data)
    assert "embedding" not in parsed["nodes"][0]


def test_serialize_orb_raw_deduplicates_nodes():
    """Nodes seen via connections should not appear again from cross_skill_nodes."""
    person = MockNode({"user_id": "u1", "name": "X"}, ["Person"])
    skill = MockNode({"uid": "s1", "name": "Python"}, ["Skill"])
    record = {
        "p": person,
        "connections": [{"node": skill, "rel": "HAS_SKILL"}],
        "cross_skill_nodes": [skill],  # same node duplicated
        "cross_links": [],
    }
    data = snap_service.serialize_orb_raw(record)
    parsed = json.loads(data)
    assert len(parsed["nodes"]) == 1


def test_serialize_orb_raw_skips_none_nodes():
    person = MockNode({"user_id": "u1", "name": "X"}, ["Person"])
    record = {
        "p": person,
        "connections": [{"node": None, "rel": "HAS_SKILL"}],
        "cross_skill_nodes": [None],
        "cross_links": [],
    }
    data = snap_service.serialize_orb_raw(record)
    parsed = json.loads(data)
    assert len(parsed["nodes"]) == 0


def test_serialize_orb_raw_empty_orb():
    person = MockNode({"user_id": "u1", "name": "Empty"}, ["Person"])
    record = {
        "p": person,
        "connections": [],
        "cross_skill_nodes": [],
        "cross_links": [],
    }
    data = snap_service.serialize_orb_raw(record)
    parsed = json.loads(data)
    assert parsed["person"]["name"] == "Empty"
    assert parsed["nodes"] == []
    assert parsed["links"] == []


# ── count_from_serialized ──


def test_count_from_serialized():
    record = _make_orb_record()
    data = snap_service.serialize_orb_raw(record)
    node_count, edge_count = snap_service.count_from_serialized(data)
    assert node_count == 2
    assert edge_count == 3


# ── create_snapshot ──


async def test_create_snapshot():
    record = _make_orb_record()
    mock_db, _ = _mock_db_with_record(record)

    with (
        patch.object(
            snap_db, "delete_oldest_if_at_limit", new_callable=AsyncMock
        ) as mock_evict,
        patch.object(snap_db, "insert_snapshot", new_callable=AsyncMock) as mock_insert,
    ):
        mock_evict.return_value = None
        mock_insert.return_value = {
            "snapshot_id": "snap-1",
            "user_id": "user-1",
            "trigger": "manual",
            "label": "Test save",
            "node_count": 2,
            "edge_count": 3,
        }
        result = await snap_service.create_snapshot(
            user_id="user-1",
            db=mock_db,
            trigger="manual",
            label="Test save",
        )
        assert result["trigger"] == "manual"
        assert result["label"] == "Test save"
        assert result["node_count"] == 2
        mock_evict.assert_awaited_once()
        mock_insert.assert_awaited_once()


async def test_create_snapshot_empty_orb():
    person = MockNode({"user_id": "user-1", "name": "Empty User"}, ["Person"])
    record = {
        "p": person,
        "connections": [],
        "cross_skill_nodes": [],
        "cross_links": [],
    }
    mock_db, _ = _mock_db_with_record(record)

    result = await snap_service.create_snapshot(
        user_id="user-1",
        db=mock_db,
        trigger="manual",
    )
    assert result["node_count"] == 0
    assert result["edge_count"] == 0
    assert result.get("skipped") is True


async def test_create_snapshot_no_orb_raises():
    mock_db, _ = _mock_db_with_record(None)  # no record
    with pytest.raises(ValueError, match="No orb found"):
        await snap_service.create_snapshot(
            user_id="no-user", db=mock_db, trigger="manual"
        )


async def test_create_snapshot_evicts_oldest():
    """When at the limit, delete_oldest_if_at_limit should be called."""
    record = _make_orb_record()
    mock_db, _ = _mock_db_with_record(record)

    with (
        patch.object(
            snap_db, "delete_oldest_if_at_limit", new_callable=AsyncMock
        ) as mock_evict,
        patch.object(snap_db, "insert_snapshot", new_callable=AsyncMock) as mock_insert,
    ):
        mock_evict.return_value = {
            "snapshot_id": "snap-old",
            "user_id": "user-1",
        }
        mock_insert.return_value = {
            "snapshot_id": "snap-new",
            "user_id": "user-1",
            "trigger": "manual",
            "label": "new",
            "node_count": 2,
            "edge_count": 3,
        }
        result = await snap_service.create_snapshot(
            user_id="user-1", db=mock_db, trigger="manual", label="new"
        )
        assert result["snapshot_id"] == "snap-new"
        mock_evict.assert_awaited_once_with("user-1")


# ── restore_snapshot ──


async def test_restore_snapshot():
    record = _make_orb_record()
    mock_db, mock_session = _mock_db_with_record(record)
    data = snap_service.serialize_orb_raw(record)

    with (
        patch.object(snap_db, "get_snapshot", new_callable=AsyncMock) as mock_get,
        patch.object(
            snap_db, "delete_oldest_if_at_limit", new_callable=AsyncMock
        ) as mock_evict,
        patch.object(snap_db, "insert_snapshot", new_callable=AsyncMock) as mock_insert,
    ):
        mock_get.return_value = {
            "snapshot_id": "snap-1",
            "user_id": "user-1",
            "data": data,
        }
        mock_evict.return_value = None
        mock_insert.return_value = {
            "snapshot_id": "snap-pre",
            "user_id": "user-1",
            "trigger": "pre_restore",
            "label": "Before restoring version",
            "node_count": 2,
            "edge_count": 3,
        }

        result = await snap_service.restore_snapshot(
            user_id="user-1", snapshot_id="snap-1", db=mock_db
        )
        assert result["status"] == "restored"
        assert result["snapshot_id"] == "snap-1"

        # Session should have been used for DELETE + node creation
        calls = mock_session.run.call_args_list
        assert len(calls) > 1


async def test_restore_snapshot_not_found():
    record = _make_orb_record()
    mock_db, _ = _mock_db_with_record(record)

    with patch.object(snap_db, "get_snapshot", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = None
        with pytest.raises(ValueError, match="not found"):
            await snap_service.restore_snapshot(
                user_id="user-1", snapshot_id="no-such", db=mock_db
            )


async def test_restore_creates_pre_restore_snapshot():
    """Restoring should first create a pre_restore snapshot."""
    record = _make_orb_record()
    mock_db, _ = _mock_db_with_record(record)
    data = snap_service.serialize_orb_raw(record)

    with (
        patch.object(snap_db, "get_snapshot", new_callable=AsyncMock) as mock_get,
        patch.object(
            snap_db, "delete_oldest_if_at_limit", new_callable=AsyncMock
        ) as mock_evict,
        patch.object(snap_db, "insert_snapshot", new_callable=AsyncMock) as mock_insert,
    ):
        mock_get.return_value = {
            "snapshot_id": "snap-1",
            "user_id": "user-1",
            "data": data,
        }
        mock_evict.return_value = None
        mock_insert.return_value = {
            "snapshot_id": "snap-pre",
            "user_id": "user-1",
            "trigger": "pre_restore",
            "label": "Before restoring version",
            "node_count": 2,
            "edge_count": 3,
        }

        await snap_service.restore_snapshot(
            user_id="user-1", snapshot_id="snap-1", db=mock_db
        )

        # insert_snapshot should have been called for pre_restore
        # The create_snapshot called during restore uses trigger="pre_restore"
        assert mock_evict.await_count >= 1


# ── _sanitize (neo4j temporal types) ──


def test_sanitize_neo4j_date():
    from neo4j.time import Date as Neo4jDate

    result = snap_service._sanitize({"started": Neo4jDate(2024, 1, 15)})
    assert result["started"] == "2024-01-15"


def test_sanitize_passthrough():
    result = snap_service._sanitize({"name": "Alice", "count": 42})
    assert result == {"name": "Alice", "count": 42}
