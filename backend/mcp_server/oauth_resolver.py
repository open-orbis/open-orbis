"""OAuth-token resolution for the MCP transport.

Mirrors the share-token resolver pattern. Takes a raw Bearer token,
looks it up in Postgres, and returns a grant dict or None.
"""

from __future__ import annotations

import asyncio
import logging

from app.oauth import db as oauth_db
from app.oauth.tokens import hash_token

logger = logging.getLogger(__name__)


async def resolve_oauth_token(pool, raw_token: str) -> dict | None:
    """Return a grant dict (user_id, share_token_id, scope) or None."""
    if not raw_token:
        return None
    h = hash_token(raw_token)
    grant = await oauth_db.resolve_access_token(pool, h)
    if grant is None:
        return None
    # Fire-and-forget last_used_at update. Must not block the tool call.
    asyncio.create_task(oauth_db.touch_access_token(pool, h))
    return grant
