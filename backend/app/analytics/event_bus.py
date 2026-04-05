"""In-process event bus using contextvars for request-scoped event collection.

The middleware calls setup_request_context() at the start of each request and
collect_events() at the end. App code calls emit() to fire events.
If no context is set (e.g., in tests or outside middleware), emit() silently
discards the event.
"""

from __future__ import annotations

import logging
from contextvars import ContextVar

logger = logging.getLogger(__name__)

_events: ContextVar[list[tuple[str, dict]] | None] = ContextVar(
    "_analytics_events", default=None
)


def setup_request_context() -> None:
    """Initialize a fresh event collector for the current request."""
    _events.set([])


def emit(event_type: str, data: dict) -> None:
    """Fire-and-forget event emission. Never raises."""
    try:
        bucket = _events.get(None)
        if bucket is not None:
            bucket.append((event_type, data))
    except Exception:
        logger.debug("event_bus.emit suppressed an error", exc_info=True)


def collect_events() -> list[tuple[str, dict]]:
    """Return all events emitted during this request and reset the collector."""
    bucket = _events.get(None)
    if bucket is None:
        return []
    events = list(bucket)
    _events.set([])
    return events
