"""Filter-token utilities for fine-grained access control.

A filter token is a JWT that encodes an orb_id and one or more filter keywords.
When a shared link includes this token, the public API excludes any node
whose string fields contain any of the keywords.
"""

from __future__ import annotations

from datetime import datetime, timezone

from jose import JWTError, jwt

from app.config import settings


def create_filter_token(orb_id: str, keywords: list[str]) -> str:
    """Create a JWT encoding the orb_id and filter keywords (no expiry)."""
    payload = {
        "orb_id": orb_id,
        "filters": [kw.strip().lower() for kw in keywords if kw.strip()],
        "iat": datetime.now(timezone.utc),
        "type": "filter",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_filter_token(token: str) -> dict | None:
    """Decode a filter token. Returns {"orb_id": ..., "filters": [...]} or None."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"verify_exp": False},
        )
        if payload.get("type") != "filter":
            return None
        orb_id = payload.get("orb_id")
        filters = payload.get("filters", [])
        if not orb_id or not filters:
            return None
        return {"orb_id": orb_id, "filters": filters}
    except JWTError:
        return None


def node_matches_filters(node: dict, keywords: list[str]) -> bool:
    """Check if any string property of a node contains any of the keywords (case-insensitive)."""
    for value in node.values():
        if isinstance(value, str):
            lower_val = value.lower()
            for kw in keywords:
                if kw.lower() in lower_val:
                    return True
    return False
