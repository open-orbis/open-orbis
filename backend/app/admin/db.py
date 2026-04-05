"""PostgreSQL connection pool for the orbis_admin schema.

Uses asyncpg for async operations. The pool is created on app startup
and closed on shutdown via the lifespan hooks in main.py.
"""

from __future__ import annotations

import logging

import asyncpg

from app.config import settings

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None

_INIT_SQL = """
CREATE SCHEMA IF NOT EXISTS orbis_admin;

CREATE TABLE IF NOT EXISTS orbis_admin.admin_users (
    admin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_login TIMESTAMPTZ
);
"""


async def init_admin_db() -> None:
    """Create the connection pool and ensure schema exists."""
    global _pool
    if _pool is not None:
        return

    _pool = await asyncpg.create_pool(
        host=settings.admin_db_host,
        port=settings.admin_db_port,
        database=settings.admin_db_name,
        user=settings.admin_db_user,
        password=settings.admin_db_password,
        min_size=1,
        max_size=5,
    )

    async with _pool.acquire() as conn:
        await conn.execute(_INIT_SQL)

    logger.info("Admin DB pool created (orbis_admin schema ready)")


async def get_admin_pool() -> asyncpg.Pool:
    """Return the admin DB connection pool."""
    if _pool is None:
        raise RuntimeError("Admin DB pool not initialized — call init_admin_db() first")
    return _pool


async def close_admin_db() -> None:
    """Close the connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("Admin DB pool closed")
