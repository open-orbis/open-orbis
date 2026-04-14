"""Async PostgreSQL connection pool for tabular data (drafts, ideas, snapshots, CV metadata)."""

from __future__ import annotations

import logging

import asyncpg

from app.config import settings

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    """Return the global asyncpg pool, creating it on first call."""
    global _pool
    if _pool is None:
        logger.info("Creating PostgreSQL connection pool")
        _pool = await asyncpg.create_pool(
            settings.database_url,
            min_size=2,
            max_size=10,
        )
    return _pool


async def close_pool() -> None:
    """Close the global asyncpg pool."""
    global _pool
    if _pool is not None:
        logger.info("Closing PostgreSQL connection pool")
        await _pool.close()
        _pool = None
