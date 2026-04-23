"""API key authentication for the MCP server.

Every request to the streamable-http transport must carry a credential.
The middleware branches by credential type:

- `X-MCP-Key: orbk_...` → resolves to a `user_id` via `app.auth.mcp_keys`.
  The authenticated user's own orb is unfiltered; any public orb is
  readable with visibility filtering applied at the tool layer.
- `X-MCP-Key: orbs_...` → resolves to a `ShareContext(orb_id, keywords,
  hidden_node_types, token_id)` via `app.orbs.share_token`. The request
  is scoped to one orb; filters from the token are auto-applied.
- `Authorization: Bearer oauth_...` → resolves via `app.oauth` Postgres
  tables. Full-mode grants (no share_token_id) set `_current_user_id`;
  restricted grants (share_token_id bound) resolve the share token into
  a `ShareContext` and set `_current_share_context`.

All paths populate a task-local ContextVar (`_current_user_id` OR
`_current_share_context`) that tool helpers read on the hot path. No
valid credential → 401 before the request reaches any tool, so bulk
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
from app.config import settings

logger = logging.getLogger(__name__)

_HEADER = "x-mcp-key"


def _resource_metadata_url() -> str:
    """URL of the /.well-known/oauth-protected-resource endpoint.

    Used in the WWW-Authenticate challenge so MCP clients (ChatGPT, Claude,
    Cursor, etc.) can discover OAuth config per MCP spec 2025-03 + RFC 6750.
    """
    base = settings.cloud_run_url or "http://localhost:8081"
    return f"{base.rstrip('/')}/.well-known/oauth-protected-resource"


def _unauthorized(error: str, *, invalid_token: bool = False) -> JSONResponse:
    """Build a 401 response with the MCP-required WWW-Authenticate header.

    `invalid_token=True` signals a bad/expired/revoked credential was
    presented (RFC 6750: `error="invalid_token"`). Default is the "no
    credential presented" case — still returns WWW-Authenticate so
    discovery-driven clients can find the OAuth resource metadata.
    """
    parts = ['Bearer realm="mcp"']
    if invalid_token:
        parts.append('error="invalid_token"')
    parts.append(f'resource_metadata="{_resource_metadata_url()}"')
    return JSONResponse(
        status_code=401,
        content={"error": error},
        headers={"WWW-Authenticate": ", ".join(parts)},
    )


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
    """Authenticate every MCP request via one of three credential modes.

    Accepted headers:
      * `X-MCP-Key: orbk_<user-key>` → resolves to a user_id
      * `X-MCP-Key: orbs_<share-token>` → resolves to a ShareContext
      * `Authorization: Bearer oauth_<access-token>` → OAuth 2.1 grant,
        either user-equivalent or share-token-scoped depending on the
        grant type at consent time

    Missing or unrecognized credentials return 401. Requests to
    `/.well-known/*` paths bypass all auth for OAuth discovery.

    The driver factory is injected at construction time so this module
    doesn't need to import app.graph.neo4j_client (which would create a
    cycle through config and encryption).
    """

    def __init__(self, app, driver_factory):
        super().__init__(app)
        self._driver_factory = driver_factory

    async def _handle_bearer(self, bearer: str):
        """Resolve an OAuth Bearer token and return (user_token, share_token_reset).

        Returns a JSONResponse on failure, or (token, None) / (None, token)
        on success. Extracted to keep `dispatch` within complexity budget.
        """
        from app.db.postgres import get_pool
        from mcp_server.oauth_resolver import resolve_oauth_token

        pool = await get_pool()
        grant = await resolve_oauth_token(pool, bearer)
        if grant is None:
            return _unauthorized(
                "invalid, expired, or revoked access token", invalid_token=True
            )

        if grant.get("share_token_id"):
            # Restricted-mode grant — resolve the bound share token into a
            # ShareContext. Local import keeps auth.py free of app.orbs
            # deps at import time.
            from app.orbs.share_token import validate_share_token_for_mcp

            driver: AsyncDriver = await self._driver_factory()
            ctx = await validate_share_token_for_mcp(driver, grant["share_token_id"])
            if ctx is None:
                return _unauthorized(
                    "share token for this grant is no longer valid",
                    invalid_token=True,
                )
            return None, _current_share_context.set(ctx)
        else:
            # Full-access grant — token acts as user identity.
            return _current_user_id.set(grant["user_id"]), None

    async def dispatch(self, request: Request, call_next):
        # Public well-known paths pass through without auth.
        if request.url.path.startswith("/.well-known/"):
            return await call_next(request)

        raw_key = request.headers.get(_HEADER) or request.headers.get(_HEADER.upper())
        auth_header = request.headers.get("authorization") or request.headers.get(
            "Authorization"
        )

        user_token = None
        share_token_reset = None

        # Authorization: Bearer oauth_... path (no X-MCP-Key present)
        if not raw_key and auth_header and auth_header.startswith("Bearer "):
            bearer = auth_header[len("Bearer ") :]
            result = await self._handle_bearer(bearer)
            # _handle_bearer returns a JSONResponse on failure, or a 2-tuple on success.
            if isinstance(result, JSONResponse):
                return result
            user_token, share_token_reset = result

        elif not raw_key:
            return _unauthorized("authentication required")

        elif raw_key.startswith("orbk_"):
            driver: AsyncDriver = await self._driver_factory()
            user_id = await resolve_api_key(driver, raw_key=raw_key)
            if user_id is None:
                return _unauthorized("invalid or revoked API key", invalid_token=True)
            user_token = _current_user_id.set(user_id)

        elif raw_key.startswith("orbs_"):
            # Local import keeps the auth module free of app.orbs deps
            # at import time (resolved at first request).
            from app.orbs.share_token import validate_share_token_for_mcp

            driver: AsyncDriver = await self._driver_factory()
            bare = raw_key[len("orbs_") :]
            ctx = await validate_share_token_for_mcp(driver, bare)
            if ctx is None:
                return _unauthorized(
                    "invalid, expired, or revoked share token", invalid_token=True
                )
            share_token_reset = _current_share_context.set(ctx)

            # Fire-and-forget audit increment. Failures must not block.
            # Local import (same rationale as validate_share_token_for_mcp
            # above) keeps auth.py free of app.orbs deps at module load.
            import asyncio

            from app.orbs.share_token import increment_mcp_use

            asyncio.create_task(increment_mcp_use(driver, ctx.token_id))

        else:
            return _unauthorized("unrecognized credential prefix", invalid_token=True)

        try:
            return await call_next(request)
        finally:
            if user_token is not None:
                _current_user_id.reset(user_token)
            if share_token_reset is not None:
                _current_share_context.reset(share_token_reset)
