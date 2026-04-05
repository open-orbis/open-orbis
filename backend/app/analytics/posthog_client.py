"""PostHog SDK initialization and singleton client."""

from __future__ import annotations

import logging

import posthog

from app.config import settings

logger = logging.getLogger(__name__)

_initialized = False


def init_posthog() -> None:
    """Initialize the PostHog SDK. Safe to call multiple times."""
    global _initialized
    if _initialized:
        return

    if not settings.posthog_api_key:
        logger.warning("POSTHOG_API_KEY not set — analytics disabled")
        return

    posthog.api_key = settings.posthog_api_key
    posthog.host = settings.posthog_host
    posthog.debug = False
    posthog.disabled = False
    _initialized = True
    logger.info("PostHog initialized (host=%s)", settings.posthog_host)


def capture(distinct_id: str, event: str, properties: dict | None = None) -> None:
    """Send an event to PostHog. Never raises."""
    if not _initialized:
        return
    try:
        posthog.capture(distinct_id, event, properties=properties or {})
    except Exception:
        logger.warning("PostHog capture failed for event '%s'", event, exc_info=True)


def shutdown_posthog() -> None:
    """Flush pending events and shut down."""
    global _initialized
    if not _initialized:
        return
    try:
        posthog.shutdown()
    except Exception:
        logger.warning("PostHog shutdown error", exc_info=True)
    _initialized = False
