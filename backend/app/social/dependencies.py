from __future__ import annotations

from neo4j import AsyncDriver

from app.social.neo4j_client import get_social_driver


async def get_social_db() -> AsyncDriver:
    return await get_social_driver()
