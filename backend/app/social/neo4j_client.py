from __future__ import annotations

import logging

from neo4j import AsyncDriver, AsyncGraphDatabase

from app.config import settings

logger = logging.getLogger(__name__)

_driver: AsyncDriver | None = None


async def get_social_driver() -> AsyncDriver:
    global _driver
    if _driver is None:
        logger.info("Connecting to Social Neo4j at %s", settings.social_neo4j_uri)
        _driver = AsyncGraphDatabase.driver(
            settings.social_neo4j_uri,
            auth=(settings.social_neo4j_user, settings.social_neo4j_password),
        )
    return _driver


async def close_social_driver() -> None:
    global _driver
    if _driver is not None:
        await _driver.close()
        _driver = None
