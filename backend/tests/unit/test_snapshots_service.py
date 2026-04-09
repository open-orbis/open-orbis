"""Unit tests for app.snapshots.service — snapshot creation and restore."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

import app.snapshots.db as snap_db
import app.snapshots.service as snap_service
from tests.unit.conftest import MockNode


@pytest.fixture(autouse=True)
def isolated_db(monkeypatch, tmp_path):
    db_file = tmp_path / "snapshots_test.db"
    monkeypatch.setattr(snap_db, "_DB_PATH", db_file)
    monkeypatch.setattr(snap_db, "_conn", None)
    yield
    if snap_db._conn is not None:
        snap_db._conn.close()
    monkeypatch.setattr(snap_db, "_conn", None)


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
    # The encrypted email must be preserved verbatim — not decrypted
    assert parsed["person"]["email"] == "enc:test@example.com"
    assert parsed["person"]["name"] == "Test User"


def test_serialize_orb_raw_nodes_and_links():
    record = _make_orb_record()
    data = snap_service.serialize_orb_raw(record)
    parsed = json.loads(data)
    assert len(parsed["nodes"]) == 2
    # 2 direct links (person→skill, person→work) + 1 cross-link (work→skill)
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


@pytest.mark.asyncio
async def test_create_snapshot():
    record = _make_orb_record()
    mock_db, _ = _mock_db_with_record(record)

    result = await snap_service.create_snapshot(
        user_id="user-1",
        db=mock_db,
        trigger="manual",
        label="Test save",
    )
    assert result["trigger"] == "manual"
    assert result["label"] == "Test save"
    assert result["node_count"] == 2
    assert snap_db.count_snapshots("user-1") == 1


@pytest.mark.asyncio
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


@pytest.mark.asyncio
async def test_create_snapshot_no_orb_raises():
    mock_db, _ = _mock_db_with_record(None)  # no record
    with pytest.raises(ValueError, match="No orb found"):
        await snap_service.create_snapshot(
            user_id="no-user", db=mock_db, trigger="manual"
        )


@pytest.mark.asyncio
async def test_create_snapshot_evicts_oldest():
    """When at the limit, the oldest snapshot should be evicted."""
    record = _make_orb_record()
    mock_db, _ = _mock_db_with_record(record)

    for i in range(snap_db.MAX_SNAPSHOTS_PER_USER):
        await snap_service.create_snapshot(
            user_id="user-1", db=mock_db, trigger="manual", label=f"v{i}"
        )
    assert snap_db.count_snapshots("user-1") == snap_db.MAX_SNAPSHOTS_PER_USER

    # One more should evict the oldest
    await snap_service.create_snapshot(
        user_id="user-1", db=mock_db, trigger="manual", label="new"
    )
    assert snap_db.count_snapshots("user-1") == snap_db.MAX_SNAPSHOTS_PER_USER


# ── restore_snapshot ──


@pytest.mark.asyncio
async def test_restore_snapshot():
    record = _make_orb_record()
    mock_db, mock_session = _mock_db_with_record(record)

    snap = await snap_service.create_snapshot(
        user_id="user-1", db=mock_db, trigger="manual", label="Before"
    )
    snapshot_id = snap["snapshot_id"]

    result = await snap_service.restore_snapshot(
        user_id="user-1", snapshot_id=snapshot_id, db=mock_db
    )
    assert result["status"] == "restored"
    assert result["snapshot_id"] == snapshot_id

    # The session should have run DELETE_USER_GRAPH and then ADD_NODE queries
    calls = mock_session.run.call_args_list
    assert len(calls) > 1  # at least read + delete + node creation


@pytest.mark.asyncio
async def test_restore_snapshot_not_found():
    record = _make_orb_record()
    mock_db, _ = _mock_db_with_record(record)

    with pytest.raises(ValueError, match="not found"):
        await snap_service.restore_snapshot(
            user_id="user-1", snapshot_id="no-such", db=mock_db
        )


@pytest.mark.asyncio
async def test_restore_creates_pre_restore_snapshot():
    """Restoring should first create a pre_restore snapshot."""
    record = _make_orb_record()
    mock_db, _ = _mock_db_with_record(record)

    snap = await snap_service.create_snapshot(
        user_id="user-1", db=mock_db, trigger="manual"
    )
    assert snap_db.count_snapshots("user-1") == 1

    await snap_service.restore_snapshot(
        user_id="user-1", snapshot_id=snap["snapshot_id"], db=mock_db
    )
    # Should now have the original + a pre_restore snapshot
    assert snap_db.count_snapshots("user-1") == 2
    snaps = snap_db.list_snapshots("user-1")
    triggers = {s["trigger"] for s in snaps}
    assert "pre_restore" in triggers


# ── _sanitize (neo4j temporal types) ──


def test_sanitize_neo4j_date():
    from neo4j.time import Date as Neo4jDate

    result = snap_service._sanitize({"started": Neo4jDate(2024, 1, 15)})
    assert result["started"] == "2024-01-15"


def test_sanitize_passthrough():
    result = snap_service._sanitize({"name": "Alice", "count": 42})
    assert result == {"name": "Alice", "count": 42}
