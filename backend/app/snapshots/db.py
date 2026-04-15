"""PostgreSQL database for orb snapshot metadata and data."""

from __future__ import annotations

from app.db.postgres import get_pool

MAX_SNAPSHOTS_PER_USER = 3


async def insert_snapshot(
    snapshot_id: str,
    user_id: str,
    trigger: str,
    label: str | None,
    node_count: int,
    edge_count: int,
    data: str,
    now: str,
) -> dict:
    pool = await get_pool()
    await pool.execute(
        "INSERT INTO orb_snapshots "
        "(snapshot_id, user_id, created_at, trigger, label, "
        "node_count, edge_count, data) "
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        snapshot_id,
        user_id,
        now,
        trigger,
        label,
        node_count,
        edge_count,
        data,
    )
    return {
        "snapshot_id": snapshot_id,
        "user_id": user_id,
        "created_at": now,
        "trigger": trigger,
        "label": label,
        "node_count": node_count,
        "edge_count": edge_count,
    }


async def list_snapshots(user_id: str) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT snapshot_id, user_id, created_at, trigger, label, "
        "node_count, edge_count "
        "FROM orb_snapshots WHERE user_id = $1 ORDER BY created_at DESC",
        user_id,
    )
    return [dict(row) for row in rows]


async def get_snapshot(user_id: str, snapshot_id: str) -> dict | None:
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT snapshot_id, user_id, created_at, trigger, label, "
        "node_count, edge_count, data "
        "FROM orb_snapshots WHERE user_id = $1 AND snapshot_id = $2",
        user_id,
        snapshot_id,
    )
    return dict(row) if row else None


async def count_snapshots(user_id: str) -> int:
    pool = await get_pool()
    return await pool.fetchval(
        "SELECT COUNT(*) FROM orb_snapshots WHERE user_id = $1",
        user_id,
    )


async def delete_snapshot(user_id: str, snapshot_id: str) -> bool:
    pool = await get_pool()
    result = await pool.execute(
        "DELETE FROM orb_snapshots WHERE user_id = $1 AND snapshot_id = $2",
        user_id,
        snapshot_id,
    )
    return result != "DELETE 0"


async def delete_oldest_if_at_limit(user_id: str) -> dict | None:
    count = await count_snapshots(user_id)
    if count < MAX_SNAPSHOTS_PER_USER:
        return None
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT snapshot_id, user_id, created_at, trigger, label, "
        "node_count, edge_count "
        "FROM orb_snapshots WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1",
        user_id,
    )
    if row is None:
        return None
    oldest = dict(row)
    await delete_snapshot(user_id, oldest["snapshot_id"])
    return oldest


async def delete_all_for_user(user_id: str) -> int:
    pool = await get_pool()
    result = await pool.execute(
        "DELETE FROM orb_snapshots WHERE user_id = $1",
        user_id,
    )
    return int(result.split()[-1])
