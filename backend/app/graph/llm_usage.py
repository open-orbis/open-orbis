"""Service for recording LLM usage in Neo4j."""

from __future__ import annotations

import logging
import uuid

from neo4j import AsyncDriver

from app.graph.queries import CREATE_LLM_USAGE

logger = logging.getLogger(__name__)


async def record_llm_usage(
    db: AsyncDriver,
    user_id: str,
    endpoint: str,
    llm_provider: str,
    llm_model: str,
    cost_usd: float | None = None,
    duration_ms: int | None = None,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
) -> str | None:
    """Create an LLMUsage node linked to the user. Returns usage_id."""
    usage_id = str(uuid.uuid4())
    total_tokens = None
    if input_tokens is not None and output_tokens is not None:
        total_tokens = input_tokens + output_tokens

    try:
        async with db.session() as session:
            await session.run(
                CREATE_LLM_USAGE,
                usage_id=usage_id,
                user_id=user_id,
                endpoint=endpoint,
                llm_provider=llm_provider,
                llm_model=llm_model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
                cost_usd=cost_usd,
                duration_ms=duration_ms,
            )
        return usage_id
    except Exception:
        logger.exception("Failed to record LLM usage for user %s", user_id)
        return None
