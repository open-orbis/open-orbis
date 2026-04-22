"""Opaque token generation + sha256 hashing for OAuth artifacts."""

from __future__ import annotations

import hashlib
import secrets


def generate_opaque_token(prefix: str) -> str:
    """Generate a prefixed, URL-safe opaque token.

    The prefix is purely informational — it lets logs and DB dumps
    distinguish token kinds at a glance (`oauth_`, `refresh_`, etc.).
    Authorization always hashes the full string, so the prefix has no
    security role.
    """
    body = secrets.token_urlsafe(32)
    return f"{prefix}_{body}"


def hash_token(raw: str) -> str:
    """Return sha256 hex digest of the raw token.

    Orbis stores only this hash. A DB dump therefore never exposes
    live bearer tokens.
    """
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
