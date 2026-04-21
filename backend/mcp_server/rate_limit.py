"""Per-credential rate limits for the MCP transport.

We key each request on the credential resolved by `APIKeyMiddleware`
(user_id OR share_token_id) so every credential gets its own bucket.
Exhausting one share token's budget does not affect another user
or share.

Implementation: in-memory sliding window per process. Cloud Run may
run multiple instances; the effective ceiling is
`N_instances * limit_per_minute`. That is acceptable for v1 — Redis-
backed rate limiting is documented as a follow-up in the spec if abuse
becomes a real pattern.
"""

from __future__ import annotations

from collections import defaultdict, deque
from threading import Lock
from time import monotonic

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from mcp_server.auth import get_current_user_id, get_share_context

# Limits per credential type. Keep in sync with spec §"Rate limiting".
USER_LIMIT_PER_MIN = 300
SHARE_LIMIT_PER_MIN = 120
WINDOW_SECONDS = 60

# Each credential's bucket is a deque of monotonic timestamps. We drop
# entries older than WINDOW_SECONDS at the top of each check.
_buckets: dict[str, deque[float]] = defaultdict(deque)
_lock = Lock()


def _credential_key_and_limit() -> tuple[str, int]:
    ctx = get_share_context()
    if ctx is not None:
        return f"s:{ctx.token_id}", SHARE_LIMIT_PER_MIN
    user_id = get_current_user_id()
    if user_id is not None:
        return f"u:{user_id}", USER_LIMIT_PER_MIN
    # Should not happen if APIKeyMiddleware ran first, but be defensive.
    return "anon", SHARE_LIMIT_PER_MIN


def _check(key: str, limit: int) -> tuple[bool, int]:
    """Return (allowed, retry_after_seconds)."""
    now = monotonic()
    cutoff = now - WINDOW_SECONDS
    with _lock:
        bucket = _buckets[key]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            # Seconds until the oldest entry ages out
            retry_after = max(1, int(bucket[0] + WINDOW_SECONDS - now) + 1)
            return False, retry_after
        bucket.append(now)
        return True, 0


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Enforce per-credential rate limits.

    Must be installed AFTER `APIKeyMiddleware` so the ContextVars are
    populated before `_credential_key_and_limit` runs.
    """

    async def dispatch(self, request: Request, call_next):
        key, limit = _credential_key_and_limit()
        allowed, retry_after = _check(key, limit)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={"error": f"rate limit exceeded ({limit}/min)"},
                headers={"Retry-After": str(retry_after)},
            )
        return await call_next(request)


def _reset_buckets_for_tests() -> None:
    """Test hook — clear all buckets between tests."""
    with _lock:
        _buckets.clear()
