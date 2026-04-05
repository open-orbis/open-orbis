"""ASGI middleware that captures request-level metrics and flushes the event bus.

This is the analytics "second layer" — it wraps the app without modifying it.
App code never imports this module.
"""

from __future__ import annotations

import logging
import time

from jose import jwt
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.analytics import event_bus, posthog_client
from app.config import settings

logger = logging.getLogger(__name__)

_EXCLUDED_PREFIXES = ("/docs", "/openapi.json", "/health", "/api/admin")


class AnalyticsMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        path = request.url.path

        # Skip excluded paths
        if any(path.startswith(prefix) for prefix in _EXCLUDED_PREFIXES):
            return await call_next(request)

        # Set up event bus for this request
        event_bus.setup_request_context()

        # Extract user_id from JWT (read-only, no auth enforcement)
        user_id = _extract_user_id(request)

        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000)

        # Capture request-level event
        distinct_id = user_id or "anonymous"
        posthog_client.capture(distinct_id, "http_request", properties={
            "method": request.method,
            "path": path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
        })

        # Flush event bus (LLM usage events, etc.)
        for event_type, data in event_bus.collect_events():
            posthog_client.capture(distinct_id, event_type, properties=data)

        return response


def _extract_user_id(request: Request) -> str | None:
    """Try to extract user_id from the Authorization header. Never raises."""
    try:
        auth = request.headers.get("authorization", "")
        if not auth.startswith("Bearer "):
            return None
        token = auth[7:]
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        return payload.get("sub")
    except Exception:
        return None
