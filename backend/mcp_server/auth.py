"""API key authentication for the MCP server.

Every request to the streamable-http transport must carry `X-MCP-Key`.
The middleware branches by prefix:

- `orbk_...` → resolves to a `user_id` via `app.auth.mcp_keys`. The
  authenticated user's own orb is unfiltered; any public orb is
  readable with visibility filtering applied at the tool layer.
- `orbs_...` → resolves to a `ShareContext(orb_id, keywords,
  hidden_node_types, token_id)` via `app.orbs.share_token`. The request
  is scoped to one orb; filters from the token are auto-applied.

Both paths populate a task-local ContextVar (`_current_user_id` OR
`_current_share_context`) that tool helpers read on the hot path. No
prefix match → 401 before the request reaches any tool, so bulk
anonymous enumeration is impossible.
"""

from __future__ import annotations

import logging
from contextvars import ContextVar
from dataclasses import dataclass

from neo4j import AsyncDriver
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.auth.mcp_keys import resolve_api_key

logger = logging.getLogger(__name__)

_HEADER = "x-mcp-key"


@dataclass(frozen=True)
class ShareContext:
    """What a share-token-authenticated MCP request is scoped to.

    All filter data is carried on the context so tools never have to
    re-query the ShareToken row on every call.

    `keywords` and `hidden_node_types` are tuples (not lists) so they
    can't be mutated in place through a reference — `frozen=True` alone
    only blocks attribute reassignment, not content mutation of mutable
    containers.
    """

    orb_id: str
    keywords: tuple[str, ...]
    hidden_node_types: tuple[str, ...]
    token_id: str


# Task-local user_id, set by APIKeyMiddleware and read by tool helpers.
# ContextVar is the right primitive here: Starlette/asyncio propagate it
# across awaits within the same request, and each concurrent request runs
# in its own context so there is no cross-talk.
_current_user_id: ContextVar[str | None] = ContextVar(
    "mcp_current_user_id", default=None
)


def get_current_user_id() -> str | None:
    return _current_user_id.get()


_current_share_context: ContextVar[ShareContext | None] = ContextVar(
    "mcp_current_share_context", default=None
)


def get_share_context() -> ShareContext | None:
    return _current_share_context.get()


class APIKeyMiddleware(BaseHTTPMiddleware):
    """Reject any request without a valid X-MCP-Key header.

    The driver factory is injected at construction time so this module
    doesn't need to import app.graph.neo4j_client (which would create a
    cycle through config and encryption).
    """

    def __init__(self, app, driver_factory):
        super().__init__(app)
        self._driver_factory = driver_factory

    async def dispatch(self, request: Request, call_next):
        raw_key = request.headers.get(_HEADER) or request.headers.get(_HEADER.upper())
        if not raw_key:
            return JSONResponse(
                status_code=401,
                content={"error": "missing X-MCP-Key header"},
            )

        driver: AsyncDriver = await self._driver_factory()

        user_token = None
        share_token_reset = None

        if raw_key.startswith("orbk_"):
            user_id = await resolve_api_key(driver, raw_key=raw_key)
            if user_id is None:
                return JSONResponse(
                    status_code=401,
                    content={"error": "invalid or revoked API key"},
                )
            user_token = _current_user_id.set(user_id)

        elif raw_key.startswith("orbs_"):
            # Local import keeps the auth module free of app.orbs deps
            # at import time (resolved at first request).
            from app.orbs.share_token import validate_share_token_for_mcp

            bare = raw_key[len("orbs_") :]
            ctx = await validate_share_token_for_mcp(driver, bare)
            if ctx is None:
                return JSONResponse(
                    status_code=401,
                    content={"error": "invalid, expired, or revoked share token"},
                )
            share_token_reset = _current_share_context.set(ctx)

            # Fire-and-forget audit increment. Failures must not block.
            import asyncio

            from app.orbs.share_token import increment_mcp_use

            asyncio.create_task(increment_mcp_use(driver, ctx.token_id))

        else:
            return JSONResponse(
                status_code=401,
                content={"error": "unrecognized credential prefix"},
            )

        try:
            return await call_next(request)
        finally:
            if user_token is not None:
                _current_user_id.reset(user_token)
            if share_token_reset is not None:
                _current_share_context.reset(share_token_reset)
