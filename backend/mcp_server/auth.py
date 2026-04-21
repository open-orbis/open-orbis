"""API key authentication for the MCP server.

Every request to the streamable-http transport must carry ``X-MCP-Key``.
The middleware resolves it to a user_id via ``app.auth.mcp_keys`` and
stores it in a ContextVar that the tool functions read on the hot path.

Tools may then serve:
- the authenticated user's own orb (any visibility), or
- any public orb (same scope the unauthenticated MCP used to serve).

No key → 401 before the request ever hits a tool, so bulk anonymous
enumeration is impossible.
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
    re-query the ShareToken row on every call."""

    orb_id: str
    keywords: list[str]
    hidden_node_types: list[str]
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
        user_id = await resolve_api_key(driver, raw_key=raw_key)
        if user_id is None:
            return JSONResponse(
                status_code=401,
                content={"error": "invalid or revoked API key"},
            )

        token = _current_user_id.set(user_id)
        try:
            return await call_next(request)
        finally:
            _current_user_id.reset(token)
