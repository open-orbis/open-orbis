# Orb Versioning with Restore + Undo/Redo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add graph version snapshots (up to 3, stored in SQLite, auto-created before CV imports, manually creatable/restorable from Settings) and ephemeral undo/redo for individual node add/delete operations.

**Architecture:** Snapshots serialize the full orb graph (person + nodes + links) as JSON into a SQLite table. A dedicated `_serialize_orb_raw` function captures the graph without decrypting PII. Restore wipes the graph and recreates all nodes from the snapshot JSON. Undo/redo uses a Zustand store tracking node add/delete operations, calling existing API endpoints to reverse them.

**Tech Stack:** FastAPI, SQLite, Neo4j, React/TypeScript, Zustand, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-09-orb-versioning-design.md`

---

## File Map

### Backend — New
- `backend/app/snapshots/` — New module for snapshot storage
  - `__init__.py`
  - `db.py` — SQLite CRUD for `orb_snapshots` table
  - `service.py` — Snapshot creation and restore logic (serialize orb, deserialize + recreate)

### Backend — Modified
- `backend/app/orbs/router.py` — Add version endpoints (`GET/POST/DELETE /orbs/me/versions`, `POST /orbs/me/versions/{id}/restore`)
- `backend/app/cv/router.py` — Auto-snapshot before `confirm_cv` wipe
- `backend/app/main.py` — GDPR cleanup for snapshots

### Backend — Tests
- `backend/tests/unit/test_snapshots_db.py` — SQLite layer tests
- `backend/tests/unit/test_snapshots_service.py` — Service layer tests

### Frontend — New
- `frontend/src/stores/undoStore.ts` — Zustand undo/redo store

### Frontend — Modified
- `frontend/src/api/orbs.ts` — Add version API functions
- `frontend/src/stores/orbStore.ts` — Integrate undo tracking into addNode/deleteNode
- `frontend/src/pages/OrbViewPage.tsx` — Undo/redo buttons in navbar
- `frontend/src/components/UserMenu.tsx` — Versions tab in AccountSettingsModal

---

## Task 1: Snapshot SQLite DB Layer

**Files:**
- Create: `backend/app/snapshots/__init__.py`
- Create: `backend/app/snapshots/db.py`
- Create: `backend/tests/unit/test_snapshots_db.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/unit/test_snapshots_db.py`:

```python
"""Unit tests for app.snapshots.db — SQLite snapshot metadata store."""

from __future__ import annotations

import sqlite3

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
    # list_snapshots should NOT return data field
    assert "data" not in snaps[0]


def test_list_ordered_by_date_desc():
    snap_db.insert_snapshot("snap-old", "user-1", "manual", None, 5, 2, _DATA, "2026-01-01T00:00:00")
    snap_db.insert_snapshot("snap-new", "user-1", "manual", None, 10, 4, _DATA, "2026-06-01T00:00:00")
    snap_db.insert_snapshot("snap-mid", "user-1", "manual", None, 7, 3, _DATA, "2026-03-01T00:00:00")
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
    snap_db.insert_snapshot("snap-old", "user-1", "manual", None, 5, 2, _DATA, "2026-01-01T00:00:00")
    snap_db.insert_snapshot("snap-mid", "user-1", "manual", None, 7, 3, _DATA, "2026-03-01T00:00:00")
    snap_db.insert_snapshot("snap-new", "user-1", "manual", None, 10, 4, _DATA, "2026-06-01T00:00:00")
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
```

- [ ] **Step 2: Create empty module**

Create `backend/app/snapshots/__init__.py` (empty file).

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/unit/test_snapshots_db.py -v`
Expected: All tests FAIL (module doesn't exist yet)

- [ ] **Step 4: Implement db.py**

Create `backend/app/snapshots/db.py`:

```python
"""SQLite database for orb snapshot metadata and data."""

from __future__ import annotations

import sqlite3
from pathlib import Path

_DB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "cv_uploads.db"
_conn: sqlite3.Connection | None = None

MAX_SNAPSHOTS_PER_USER = 3


def _get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute(
            """
            CREATE TABLE IF NOT EXISTS orb_snapshots (
                snapshot_id TEXT NOT NULL,
                user_id     TEXT NOT NULL,
                created_at  TEXT NOT NULL,
                trigger     TEXT NOT NULL,
                label       TEXT,
                node_count  INTEGER NOT NULL,
                edge_count  INTEGER NOT NULL,
                data        TEXT NOT NULL,
                PRIMARY KEY (user_id, snapshot_id)
            )
            """
        )
        _conn.commit()
    return _conn


def insert_snapshot(
    snapshot_id: str,
    user_id: str,
    trigger: str,
    label: str | None,
    node_count: int,
    edge_count: int,
    data: str,
    now: str,
) -> dict:
    conn = _get_conn()
    conn.execute(
        """
        INSERT INTO orb_snapshots
            (snapshot_id, user_id, created_at, trigger, label,
             node_count, edge_count, data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (snapshot_id, user_id, now, trigger, label, node_count, edge_count, data),
    )
    conn.commit()
    return {
        "snapshot_id": snapshot_id,
        "user_id": user_id,
        "created_at": now,
        "trigger": trigger,
        "label": label,
        "node_count": node_count,
        "edge_count": edge_count,
    }


def list_snapshots(user_id: str) -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT snapshot_id, user_id, created_at, trigger, label, "
        "node_count, edge_count "
        "FROM orb_snapshots WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def get_snapshot(user_id: str, snapshot_id: str) -> dict | None:
    conn = _get_conn()
    row = conn.execute(
        "SELECT snapshot_id, user_id, created_at, trigger, label, "
        "node_count, edge_count, data "
        "FROM orb_snapshots WHERE user_id = ? AND snapshot_id = ?",
        (user_id, snapshot_id),
    ).fetchone()
    return dict(row) if row else None


def count_snapshots(user_id: str) -> int:
    conn = _get_conn()
    row = conn.execute(
        "SELECT COUNT(*) FROM orb_snapshots WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    return row[0]


def delete_snapshot(user_id: str, snapshot_id: str) -> bool:
    conn = _get_conn()
    cur = conn.execute(
        "DELETE FROM orb_snapshots WHERE user_id = ? AND snapshot_id = ?",
        (user_id, snapshot_id),
    )
    conn.commit()
    return cur.rowcount > 0


def delete_oldest_if_at_limit(user_id: str) -> dict | None:
    if count_snapshots(user_id) < MAX_SNAPSHOTS_PER_USER:
        return None
    conn = _get_conn()
    row = conn.execute(
        "SELECT snapshot_id, user_id, created_at, trigger, label, "
        "node_count, edge_count "
        "FROM orb_snapshots WHERE user_id = ? ORDER BY created_at ASC LIMIT 1",
        (user_id,),
    ).fetchone()
    if row is None:
        return None
    oldest = dict(row)
    delete_snapshot(user_id, oldest["snapshot_id"])
    return oldest


def delete_all_for_user(user_id: str) -> int:
    conn = _get_conn()
    cur = conn.execute(
        "DELETE FROM orb_snapshots WHERE user_id = ?",
        (user_id,),
    )
    conn.commit()
    return cur.rowcount
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/unit/test_snapshots_db.py -v`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/snapshots/ backend/tests/unit/test_snapshots_db.py
git commit -m "feat: add snapshot SQLite DB layer (#149)"
```

---

## Task 2: Snapshot Service Layer

**Files:**
- Create: `backend/app/snapshots/service.py`
- Create: `backend/tests/unit/test_snapshots_service.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/unit/test_snapshots_service.py`:

```python
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


def _make_orb_record():
    """Build a mock Neo4j record matching the GET_FULL_ORB shape."""
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


def test_serialize_orb_raw():
    record = _make_orb_record()
    data = snap_service.serialize_orb_raw(record)
    parsed = json.loads(data)
    assert parsed["person"]["name"] == "Test User"
    # PII should NOT be decrypted (kept as-is)
    assert parsed["person"]["email"] == "enc:test@example.com"
    assert len(parsed["nodes"]) == 2
    assert len(parsed["links"]) >= 2  # person->skill, person->work, work->skill


def test_count_from_serialized():
    record = _make_orb_record()
    data = snap_service.serialize_orb_raw(record)
    node_count, edge_count = snap_service.count_from_serialized(data)
    assert node_count == 2
    assert edge_count >= 2


@pytest.mark.asyncio
async def test_create_snapshot():
    record = _make_orb_record()
    mock_session = AsyncMock()
    mock_session.run.return_value.single = AsyncMock(return_value=record)

    mock_db = MagicMock()
    mock_db.session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    mock_db.session.return_value.__aexit__ = AsyncMock(return_value=False)

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
    """Snapshot of an orb with no nodes should work."""
    person = MockNode({"user_id": "user-1", "name": "Empty User"}, ["Person"])
    record = {
        "p": person,
        "connections": [],
        "cross_skill_nodes": [],
        "cross_links": [],
    }
    mock_session = AsyncMock()
    mock_session.run.return_value.single = AsyncMock(return_value=record)

    mock_db = MagicMock()
    mock_db.session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    mock_db.session.return_value.__aexit__ = AsyncMock(return_value=False)

    result = await snap_service.create_snapshot(
        user_id="user-1", db=mock_db, trigger="manual",
    )
    assert result["node_count"] == 0
    assert result["edge_count"] == 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/unit/test_snapshots_service.py -v`
Expected: All tests FAIL

- [ ] **Step 3: Implement service.py**

Create `backend/app/snapshots/service.py`:

```python
"""Snapshot creation and restore logic for orb versioning."""

from __future__ import annotations

import json
import logging
import uuid

from neo4j import AsyncDriver
from neo4j.time import Date as Neo4jDate
from neo4j.time import DateTime as Neo4jDateTime
from neo4j.time import Time as Neo4jTime

from app.graph.queries import (
    ADD_NODE,
    DELETE_USER_GRAPH,
    GET_FULL_ORB,
    LINK_SKILL,
    NODE_TYPE_LABELS,
    NODE_TYPE_RELATIONSHIPS,
)
from app.snapshots import db as snap_db

logger = logging.getLogger(__name__)

# Reverse mapping: Neo4j label -> node_type key
_LABEL_TO_TYPE: dict[str, str] = {v: k for k, v in NODE_TYPE_LABELS.items()}


def _sanitize(d: dict) -> dict:
    """Convert Neo4j temporal types to JSON-safe strings."""
    result = {}
    for k, v in d.items():
        if isinstance(v, (Neo4jDateTime, Neo4jDate, Neo4jTime)):
            result[k] = v.iso_format()
        else:
            result[k] = v
    return result


def serialize_orb_raw(record) -> str:
    """Serialize an orb record to JSON WITHOUT decrypting PII."""
    person = _sanitize(dict(record["p"]))
    nodes = []
    links = []
    seen: set[str] = set()

    for conn in record["connections"]:
        if conn["node"] is None:
            continue
        node_data = _sanitize(dict(conn["node"]))
        uid = node_data.get("uid")
        if uid and uid in seen:
            continue
        if uid:
            seen.add(uid)
        node_data.pop("embedding", None)
        node_data["_labels"] = list(conn["node"].labels)
        nodes.append(node_data)
        links.append({
            "source": person.get("user_id") or person.get("orb_id"),
            "target": uid,
            "type": conn["rel"],
        })

    for skill_node in record.get("cross_skill_nodes") or []:
        if skill_node is None:
            continue
        skill_data = _sanitize(dict(skill_node))
        uid = skill_data.get("uid")
        if uid and uid in seen:
            continue
        if uid:
            seen.add(uid)
        skill_data.pop("embedding", None)
        skill_data["_labels"] = list(skill_node.labels)
        nodes.append(skill_data)
        links.append({
            "source": person.get("user_id") or person.get("orb_id"),
            "target": uid,
            "type": "HAS_SKILL",
        })

    seen_links: set[tuple] = set()
    for cl in record.get("cross_links") or []:
        src, tgt = cl.get("source"), cl.get("target")
        if src and tgt and src in seen and tgt in seen:
            key = (src, tgt, cl.get("rel", ""))
            if key not in seen_links:
                seen_links.add(key)
                links.append({
                    "source": src,
                    "target": tgt,
                    "type": cl.get("rel", "USED_SKILL"),
                })

    return json.dumps({"person": person, "nodes": nodes, "links": links})


def count_from_serialized(data: str) -> tuple[int, int]:
    """Return (node_count, edge_count) from a serialized snapshot."""
    parsed = json.loads(data)
    return len(parsed.get("nodes", [])), len(parsed.get("links", []))


async def create_snapshot(
    user_id: str,
    db: AsyncDriver,
    trigger: str,
    label: str | None = None,
) -> dict:
    """Snapshot the current orb state into SQLite."""
    from datetime import datetime, timezone

    async with db.session() as session:
        result = await session.run(GET_FULL_ORB, user_id=user_id)
        record = await result.single()

    if record is None:
        raise ValueError(f"No orb found for user {user_id}")

    data = serialize_orb_raw(record)
    node_count, edge_count = count_from_serialized(data)
    snapshot_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    snap_db.delete_oldest_if_at_limit(user_id)

    return snap_db.insert_snapshot(
        snapshot_id=snapshot_id,
        user_id=user_id,
        trigger=trigger,
        label=label,
        node_count=node_count,
        edge_count=edge_count,
        data=data,
        now=now,
    )


async def restore_snapshot(
    user_id: str,
    snapshot_id: str,
    db: AsyncDriver,
) -> dict:
    """Restore an orb from a snapshot. Snapshots current state first."""
    snap = snap_db.get_snapshot(user_id, snapshot_id)
    if snap is None:
        raise ValueError(f"Snapshot {snapshot_id} not found")

    # Snapshot current state before restoring (so restore is undoable)
    try:
        await create_snapshot(
            user_id=user_id,
            db=db,
            trigger="pre_restore",
            label="Before restoring version",
        )
    except ValueError:
        pass  # No orb to snapshot (shouldn't happen, but safe)

    # Wipe current graph
    async with db.session() as session:
        await session.run(DELETE_USER_GRAPH, user_id=user_id)

    # Recreate from snapshot
    parsed = json.loads(snap["data"])
    await _restore_nodes(user_id, parsed, db)

    return {"status": "restored", "snapshot_id": snapshot_id}


async def _restore_nodes(
    user_id: str,
    parsed: dict,
    db: AsyncDriver,
) -> None:
    """Recreate all nodes and relationships from a snapshot.

    Properties are written as-is (already encrypted).
    Uses CREATE, not MERGE, since the graph was just wiped.
    """
    uid_map: dict[str, str] = {}  # old_uid -> new_uid (in case of collisions)

    async with db.session() as session:
        # Restore person profile fields (not the node itself — it still exists)
        person_data = parsed.get("person", {})
        profile_fields = {}
        for key in ("name", "headline", "location", "email", "phone",
                     "linkedin_url", "github_url", "twitter_url",
                     "instagram_url", "scholar_url", "website_url",
                     "orcid_url", "open_to_work", "cv_display_name",
                     "profile_image"):
            if key in person_data and person_data[key]:
                profile_fields[key] = person_data[key]
        if profile_fields:
            from app.graph.queries import UPDATE_PERSON

            await session.run(
                UPDATE_PERSON,
                user_id=user_id,
                properties=profile_fields,
            )

        # Restore nodes
        for node in parsed.get("nodes", []):
            labels = node.get("_labels", [])
            if not labels:
                continue
            label = labels[0]
            node_type = _LABEL_TO_TYPE.get(label)
            if node_type is None:
                logger.warning("Skipping unknown node type: %s", label)
                continue
            rel_type = NODE_TYPE_RELATIONSHIPS[node_type]

            old_uid = node.get("uid", str(uuid.uuid4()))
            new_uid = old_uid  # Preserve original UIDs

            # Build properties, excluding metadata fields
            properties = {
                k: v
                for k, v in node.items()
                if k not in ("_labels", "uid", "embedding")
                and v is not None
            }

            query = ADD_NODE.replace("{label}", label).replace(
                "{rel_type}", rel_type
            )
            await session.run(
                query,
                user_id=user_id,
                properties=properties,
                uid=new_uid,
            )
            uid_map[old_uid] = new_uid

        # Restore USED_SKILL cross-links
        for link in parsed.get("links", []):
            if link.get("type") != "USED_SKILL":
                continue
            src = uid_map.get(link["source"], link["source"])
            tgt = uid_map.get(link["target"], link["target"])
            try:
                await session.run(LINK_SKILL, node_uid=src, skill_uid=tgt)
            except Exception as e:
                logger.warning("Failed to restore link %s->%s: %s", src, tgt, e)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/unit/test_snapshots_service.py -v`
Expected: All tests PASS

- [ ] **Step 5: Run full test suite**

Run: `cd backend && uv run pytest tests/unit/ -v --cov=app --cov-fail-under=75`
Expected: All tests PASS, coverage >= 75%

- [ ] **Step 6: Commit**

```bash
git add backend/app/snapshots/service.py backend/tests/unit/test_snapshots_service.py
git commit -m "feat: add snapshot service layer for orb versioning (#149)"
```

---

## Task 3: Version Endpoints + Auto-Snapshot in CV Confirm

**Files:**
- Modify: `backend/app/orbs/router.py`
- Modify: `backend/app/cv/router.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Add version endpoints to orbs router**

In `backend/app/orbs/router.py`, add imports at the top:

```python
from app.snapshots import db as snap_db
from app.snapshots.service import create_snapshot, restore_snapshot
```

Add the following endpoints after the existing `unlink_skill` endpoint:

```python
# ── Versions ──


@router.get("/me/versions")
async def list_versions(
    current_user: dict = Depends(get_current_user),
):
    """List orb snapshots (metadata only, no data)."""
    return snap_db.list_snapshots(current_user["user_id"])


@router.post("/me/versions")
async def create_version(
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Manually create a snapshot of the current orb state."""
    return await create_snapshot(
        user_id=current_user["user_id"],
        db=db,
        trigger="manual",
        label="Manual save",
    )


@router.post("/me/versions/{snapshot_id}/restore")
async def restore_version(
    snapshot_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Restore an orb from a snapshot. Current state is saved first."""
    try:
        return await restore_snapshot(
            user_id=current_user["user_id"],
            snapshot_id=snapshot_id,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from None


@router.delete("/me/versions/{snapshot_id}")
async def delete_version(
    snapshot_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a specific snapshot."""
    deleted = snap_db.delete_snapshot(current_user["user_id"], snapshot_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return {"status": "deleted"}
```

- [ ] **Step 2: Add auto-snapshot before CV confirm wipe**

In `backend/app/cv/router.py`, add import at the top:

```python
from app.snapshots.service import create_snapshot as create_orb_snapshot
```

In the `confirm_cv` function, add auto-snapshot **before** `_persist_nodes` (which calls `DELETE_USER_GRAPH` when `wipe_existing=True`). Insert right after `user_id = current_user["user_id"]`:

```python
    # Auto-snapshot before destructive CV import
    try:
        await create_orb_snapshot(
            user_id=user_id,
            db=db,
            trigger="cv_import",
            label="Before CV import",
        )
    except Exception as e:
        logger.warning("Failed to create pre-import snapshot: %s", e)
```

- [ ] **Step 3: Update GDPR cleanup in main.py**

In `backend/app/main.py`, add import:

```python
from app.snapshots.db import delete_all_for_user as delete_user_snapshots
```

Add cleanup call after the existing `delete_user_drafts` block (around line 65):

```python
            try:
                delete_user_snapshots(user_id)
            except Exception as e:
                logging.getLogger(__name__).warning(
                    "Failed to delete snapshots for %s: %s", user_id, e
                )
```

- [ ] **Step 4: Run full backend tests and lint**

Run: `cd backend && uv run pytest tests/unit/ -v --cov=app --cov-fail-under=75`
Run: `cd backend && uv run ruff check . && uv run ruff format .`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add backend/app/orbs/router.py backend/app/cv/router.py backend/app/main.py
git commit -m "feat: add version endpoints and auto-snapshot before CV import (#149)"
```

---

## Task 4: Frontend API + Undo Store

**Files:**
- Modify: `frontend/src/api/orbs.ts`
- Create: `frontend/src/stores/undoStore.ts`
- Modify: `frontend/src/stores/orbStore.ts`

- [ ] **Step 1: Add version API functions to orbs.ts**

Append to `frontend/src/api/orbs.ts`:

```typescript
// ── Versions ──

export interface SnapshotMetadata {
  snapshot_id: string;
  user_id: string;
  created_at: string;
  trigger: string;
  label: string | null;
  node_count: number;
  edge_count: number;
}

export async function getVersions(): Promise<SnapshotMetadata[]> {
  const { data } = await client.get('/orbs/me/versions');
  return data;
}

export async function createVersion(): Promise<SnapshotMetadata> {
  const { data } = await client.post('/orbs/me/versions');
  return data;
}

export async function restoreVersion(snapshotId: string): Promise<void> {
  await client.post(`/orbs/me/versions/${snapshotId}/restore`);
}

export async function deleteVersion(snapshotId: string): Promise<void> {
  await client.delete(`/orbs/me/versions/${snapshotId}`);
}
```

- [ ] **Step 2: Create the undo store**

Create `frontend/src/stores/undoStore.ts`:

```typescript
import { create } from 'zustand';
import * as orbsApi from '../api/orbs';

interface UndoEntry {
  type: 'add' | 'delete';
  nodeUid: string;
  nodeType: string;
  properties: Record<string, unknown>;
  relationships?: Array<{ source: string; target: string; type: string }>;
}

interface UndoState {
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
  pushUndo: (entry: UndoEntry) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clear: () => void;
}

export const useUndoStore = create<UndoState>((set, get) => ({
  undoStack: [],
  redoStack: [],

  pushUndo: (entry: UndoEntry) => {
    set((state) => ({
      undoStack: [...state.undoStack, entry],
      redoStack: [], // New action clears redo
    }));
  },

  undo: async () => {
    const { undoStack } = get();
    if (undoStack.length === 0) return;

    const entry = undoStack[undoStack.length - 1];

    if (entry.type === 'add') {
      // Undo an add = delete the node
      await orbsApi.deleteNode(entry.nodeUid);
    } else {
      // Undo a delete = recreate the node
      const node = await orbsApi.addNode(entry.nodeType, entry.properties);
      // Re-link skills if any
      if (entry.relationships) {
        for (const rel of entry.relationships) {
          if (rel.type === 'USED_SKILL') {
            try {
              await orbsApi.linkSkill(node.uid, rel.target);
            } catch { /* best effort */ }
          }
        }
      }
      // Update entry with new uid for redo
      entry.nodeUid = node.uid;
    }

    set((state) => ({
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, entry],
    }));
  },

  redo: async () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return;

    const entry = redoStack[redoStack.length - 1];

    if (entry.type === 'add') {
      // Redo an add = re-add the node
      const node = await orbsApi.addNode(entry.nodeType, entry.properties);
      entry.nodeUid = node.uid;
    } else {
      // Redo a delete = re-delete the node
      await orbsApi.deleteNode(entry.nodeUid);
    }

    set((state) => ({
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, entry],
    }));
  },

  clear: () => set({ undoStack: [], redoStack: [] }),
}));
```

- [ ] **Step 3: Integrate undo tracking into orbStore**

In `frontend/src/stores/orbStore.ts`, add import:

```typescript
import { useUndoStore } from './undoStore';
```

Modify the `addNode` method to push to undo stack after success:

```typescript
  addNode: async (nodeType: string, properties: Record<string, unknown>) => {
    try {
      const node = await orbsApi.addNode(nodeType, properties);
      await get().fetchOrb();
      useToastStore.getState().addToast('Entry added to your orbis', 'success');
      useUndoStore.getState().pushUndo({
        type: 'add',
        nodeUid: node.uid,
        nodeType,
        properties,
      });
      return node;
    } catch (e) {
      useToastStore.getState().addToast('Failed to add entry', 'error');
      throw e;
    }
  },
```

Modify the `deleteNode` method. It needs to capture node data **before** deleting. Update to accept node metadata:

```typescript
  deleteNode: async (uid: string, nodeType?: string, properties?: Record<string, unknown>, relationships?: Array<{ source: string; target: string; type: string }>) => {
    try {
      await orbsApi.deleteNode(uid);
      await get().fetchOrb();
      useToastStore.getState().addToast('Entry deleted', 'success');
      if (nodeType && properties) {
        useUndoStore.getState().pushUndo({
          type: 'delete',
          nodeUid: uid,
          nodeType,
          properties,
          relationships,
        });
      }
    } catch (e) {
      useToastStore.getState().addToast('Failed to delete entry', 'error');
      throw e;
    }
  },
```

Also update the `OrbState` interface to match the new `deleteNode` signature:

```typescript
  deleteNode: (uid: string, nodeType?: string, properties?: Record<string, unknown>, relationships?: Array<{ source: string; target: string; type: string }>) => Promise<void>;
```

- [ ] **Step 4: Lint**

Run: `cd frontend && npm run lint`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/orbs.ts frontend/src/stores/undoStore.ts frontend/src/stores/orbStore.ts
git commit -m "feat: add version API, undo store, and undo tracking in orbStore (#149)"
```

---

## Task 5: Undo/Redo Buttons in Navbar

**Files:**
- Modify: `frontend/src/pages/OrbViewPage.tsx`

- [ ] **Step 1: Add undo store import and undo/redo handler**

Add import at the top of OrbViewPage.tsx:

```typescript
import { useUndoStore } from '../stores/undoStore';
```

Inside the component, add:

```typescript
  const undoStack = useUndoStore((s) => s.undoStack);
  const redoStack = useUndoStore((s) => s.redoStack);
  const undo = useUndoStore((s) => s.undo);
  const redo = useUndoStore((s) => s.redo);

  const handleUndo = useCallback(async () => {
    try {
      await undo();
      await fetchOrb();
    } catch {
      addToast('Failed to undo', 'error');
    }
  }, [undo, fetchOrb, addToast]);

  const handleRedo = useCallback(async () => {
    try {
      await redo();
      await fetchOrb();
    } catch {
      addToast('Failed to redo', 'error');
    }
  }, [redo, fetchOrb, addToast]);
```

- [ ] **Step 2: Add undo/redo buttons in desktop navbar**

In the desktop header section, find the `{!isPendingDeletion && (` block containing `<NodeTypeFilter`. Insert the undo/redo buttons **before** `<NodeTypeFilter`:

```tsx
                  {/* Undo / Redo */}
                  <div className="flex items-center">
                    <button
                      onClick={handleUndo}
                      disabled={undoStack.length === 0}
                      className={`h-8 w-8 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
                        undoStack.length === 0
                          ? 'text-white/15 cursor-default'
                          : 'text-white/40 hover:text-white hover:bg-white/10'
                      }`}
                      title="Undo"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
                      </svg>
                    </button>
                    <button
                      onClick={handleRedo}
                      disabled={redoStack.length === 0}
                      className={`h-8 w-8 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
                        redoStack.length === 0
                          ? 'text-white/15 cursor-default'
                          : 'text-white/40 hover:text-white hover:bg-white/10'
                      }`}
                      title="Redo"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" />
                      </svg>
                    </button>
                  </div>
```

- [ ] **Step 3: Add undo/redo to mobile Tools menu**

Find the mobile Tools dropdown section. Add undo/redo buttons inside the dropdown, before the NodeTypeFilter:

```tsx
                      {/* Undo / Redo (mobile) */}
                      <div className="flex items-center gap-1 mb-2">
                        <button
                          onClick={handleUndo}
                          disabled={undoStack.length === 0}
                          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg border transition-all ${
                            undoStack.length === 0
                              ? 'border-white/5 text-white/20 cursor-default'
                              : 'border-white/10 text-white/70 hover:text-white hover:bg-white/10 cursor-pointer'
                          }`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
                          </svg>
                          Undo
                        </button>
                        <button
                          onClick={handleRedo}
                          disabled={redoStack.length === 0}
                          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg border transition-all ${
                            redoStack.length === 0
                              ? 'border-white/5 text-white/20 cursor-default'
                              : 'border-white/10 text-white/70 hover:text-white hover:bg-white/10 cursor-pointer'
                          }`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" />
                          </svg>
                          Redo
                        </button>
                      </div>
```

- [ ] **Step 4: Update deleteNode calls to pass node metadata for undo**

Find all places in OrbViewPage.tsx where `deleteNode` is called and update them to pass `nodeType`, `properties`, and `relationships` so undo can recreate the node. The delete is triggered from the node edit modal. Find the delete handler and update it. The node data is available from the `data.nodes` array — look up the node by uid before deleting:

```typescript
// When deleting a node, capture its data first:
const nodeToDelete = data.nodes.find(n => n.uid === uid);
const nodeType = nodeToDelete?._labels?.[0]?.toLowerCase() || '';
// Map label back to node_type key
const nodeTypeKey = Object.entries(NODE_TYPE_LABELS_MAP).find(([, v]) => v === nodeToDelete?._labels?.[0])?.[0] || nodeType;
const properties = { ...nodeToDelete };
delete properties.uid;
delete properties._labels;
delete properties.score;
// Find USED_SKILL relationships for this node
const relationships = data.links
  .filter(l => l.type === 'USED_SKILL' && (l.source === uid || l.target === uid))
  .map(l => ({ source: l.source, target: l.target, type: l.type }));

await deleteNode(uid, nodeTypeKey, properties, relationships);
```

The exact integration depends on where the delete button handler is in the file. Read the file to find the delete call site and update it accordingly.

- [ ] **Step 5: Lint and type-check**

Run: `cd frontend && npm run lint`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/OrbViewPage.tsx
git commit -m "feat: add undo/redo buttons to navbar (#149)"
```

---

## Task 6: Versions Tab in AccountSettingsModal

**Files:**
- Modify: `frontend/src/components/UserMenu.tsx`

- [ ] **Step 1: Add versions tab to TABS array**

In `AccountSettingsModal`, update the `activeTab` type:

```typescript
  const [activeTab, setActiveTab] = useState<'orb-id' | 'versions' | 'account'>('orb-id');
```

Add a `'versions'` tab to the TABS array after `'orb-id'`:

```typescript
    { id: 'versions' as const, label: 'Versions', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )},
```

- [ ] **Step 2: Add versions state and handlers**

Inside `AccountSettingsModal`, add state:

```typescript
  // Versions state
  const [versions, setVersions] = useState<SnapshotMetadata[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState<SnapshotMetadata | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
```

Add imports at the top of the file:

```typescript
import { getVersions, createVersion, restoreVersion, deleteVersion } from '../api/orbs';
import type { SnapshotMetadata } from '../api/orbs';
```

Add fetch and handlers:

```typescript
  const fetchVersions = useCallback(async () => {
    setVersionsLoading(true);
    try {
      const v = await getVersions();
      setVersions(v);
    } catch { /* ignore */ }
    finally { setVersionsLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'versions') fetchVersions();
  }, [activeTab, fetchVersions]);

  const handleSaveVersion = async () => {
    setSavingVersion(true);
    try {
      await createVersion();
      addToast('Version saved', 'success');
      await fetchVersions();
    } catch {
      addToast('Failed to save version', 'error');
    } finally { setSavingVersion(false); }
  };

  const handleRestore = async (snap: SnapshotMetadata) => {
    setRestoring(true);
    try {
      await restoreVersion(snap.snapshot_id);
      addToast('Orb restored to previous version', 'success');
      setRestoreConfirm(null);
      onClose();
      window.location.reload();
    } catch {
      addToast('Failed to restore version', 'error');
    } finally { setRestoring(false); }
  };

  const handleDeleteVersion = async (snapshotId: string) => {
    try {
      await deleteVersion(snapshotId);
      await fetchVersions();
      addToast('Version deleted', 'success');
    } catch {
      addToast('Failed to delete version', 'error');
    }
  };
```

- [ ] **Step 3: Add versions tab content**

Add a new `AnimatePresence` case for the `'versions'` tab in the content area, after the `'orb-id'` tab and before the `'account'` tab:

```tsx
              {activeTab === 'versions' && (
                <motion.div
                  key="versions"
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15, ease: 'easeInOut' }}
                  className="flex flex-col h-full"
                >
                  <p className="text-[11px] text-gray-500 mb-3">
                    Your orb is automatically saved before major changes like CV imports.
                  </p>

                  <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                    {versionsLoading ? (
                      <p className="text-white/30 text-xs py-4 text-center">Loading versions...</p>
                    ) : versions.length === 0 ? (
                      <p className="text-white/30 text-xs py-4 text-center">No saved versions yet.</p>
                    ) : (
                      versions.map((snap) => (
                        <div key={snap.snapshot_id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-white/70 text-sm font-medium">
                                {snap.label || (snap.trigger === 'cv_import' ? 'Before CV import' : snap.trigger === 'pre_restore' ? 'Before restore' : 'Manual save')}
                              </div>
                              <div className="text-white/30 text-xs mt-0.5">
                                {new Date(snap.created_at).toLocaleString()} · {snap.node_count} nodes · {snap.edge_count} edges
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => setRestoreConfirm(snap)}
                              className="text-xs text-purple-400 hover:text-purple-300 font-medium cursor-pointer"
                            >
                              Restore
                            </button>
                            <button
                              onClick={() => handleDeleteVersion(snap.snapshot_id)}
                              className="text-xs text-white/30 hover:text-red-400 font-medium cursor-pointer"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-white/5">
                    <button
                      onClick={handleSaveVersion}
                      disabled={savingVersion}
                      className="w-full bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-xs font-medium py-2 px-4 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {savingVersion ? 'Saving...' : 'Save current version'}
                    </button>
                    <p className="text-white/20 text-[10px] mt-2 text-center">
                      Up to 3 versions are kept. Oldest are automatically removed.
                    </p>
                  </div>

                  {/* Restore confirmation */}
                  {restoreConfirm && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center rounded-2xl">
                      <div className="bg-neutral-950 border border-white/10 rounded-xl p-5 max-w-sm w-full mx-4">
                        <h3 className="text-white text-sm font-semibold mb-2">Restore this version?</h3>
                        <p className="text-white/50 text-xs leading-relaxed mb-1">
                          This will replace your current orb with the version from{' '}
                          <span className="text-white font-medium">{new Date(restoreConfirm.created_at).toLocaleString()}</span>{' '}
                          ({restoreConfirm.node_count} nodes).
                        </p>
                        <p className="text-white/40 text-xs mb-4">
                          Your current orb will be saved as a new version before restoring.
                        </p>
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setRestoreConfirm(null)}
                            className="border border-white/10 text-white/60 hover:text-white text-xs font-medium py-2 px-4 rounded-lg transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleRestore(restoreConfirm)}
                            disabled={restoring}
                            className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold py-2 px-4 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {restoring ? 'Restoring...' : 'Restore'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
```

- [ ] **Step 4: Lint**

Run: `cd frontend && npm run lint`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/UserMenu.tsx
git commit -m "feat: add Versions tab to account settings modal (#149)"
```

---

## Task 7: Final Verification and Documentation

**Files:** Verification only + docs

- [ ] **Step 1: Run backend tests**

Run: `cd backend && uv run pytest tests/unit/ -v --cov=app --cov-fail-under=75`
Expected: All tests PASS, coverage >= 75%

- [ ] **Step 2: Run backend lint**

Run: `cd backend && uv run ruff check . && uv run ruff format --check .`
Expected: No errors

- [ ] **Step 3: Run frontend lint and build**

Run: `cd frontend && npm run lint && npm run build`
Expected: No errors (pre-existing warnings are acceptable)

- [ ] **Step 4: Update docs/api.md**

Add the new version endpoints to `docs/api.md`:

```markdown
## Versions (`/orbs/me/versions`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/orbs/me/versions` | JWT | List orb snapshots (metadata only) |
| POST | `/orbs/me/versions` | JWT | Manually save current orb state |
| POST | `/orbs/me/versions/{snapshot_id}/restore` | JWT | Restore orb from snapshot (current state saved first) |
| DELETE | `/orbs/me/versions/{snapshot_id}` | JWT | Delete a specific snapshot |
```

- [ ] **Step 5: Update docs/database.md**

Add the `orb_snapshots` SQLite table documentation.

- [ ] **Step 6: Commit docs**

```bash
git add docs/
git commit -m "docs: update API and database docs for orb versioning (#149)"
```
