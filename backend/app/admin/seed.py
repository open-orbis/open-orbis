"""CLI script to seed admin credentials.

Usage: python -m app.admin.seed --username admin --password <password>
"""

from __future__ import annotations

import argparse
import asyncio
import logging

from app.admin.auth import hash_password
from app.admin.db import get_admin_pool, init_admin_db

logger = logging.getLogger(__name__)


async def seed_admin(username: str, password: str) -> None:
    """Create an admin user if one with that username doesn't already exist."""
    pool = await get_admin_pool()

    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT admin_id FROM orbis_admin.admin_users WHERE username = $1",
            username,
        )
        if existing:
            logger.info("Admin user '%s' already exists — skipping", username)
            return

        hashed = hash_password(password)
        await conn.execute(
            "INSERT INTO orbis_admin.admin_users (username, password_hash) VALUES ($1, $2)",
            username,
            hashed,
        )
        logger.info("Admin user '%s' created", username)


async def _main() -> None:
    parser = argparse.ArgumentParser(description="Seed admin credentials")
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", required=True)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)
    await init_admin_db()
    await seed_admin(args.username, args.password)


if __name__ == "__main__":
    asyncio.run(_main())
