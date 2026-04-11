"""Visibility guard for orb access control.

Orbs have three visibility modes:
- ``private``: only the owner can view (all public access denied)
- ``public``: share-token gated access works
- ``restricted``: only logged-in users with an active ``AccessGrant``
  matching their email can view (managed by the owner via the
  access-grants endpoints)
"""

from __future__ import annotations

from fastapi import HTTPException
from neo4j import AsyncDriver

from app.graph.queries import GET_PERSON_BY_ORB_ID, GET_PERSON_VISIBILITY
from app.orbs.access_grants import user_has_access


async def get_orb_visibility(db: AsyncDriver, orb_id: str) -> str | None:
    """Return the visibility setting for an orb, or ``None`` if not found."""
    async with db.session() as session:
        result = await session.run(GET_PERSON_VISIBILITY, orb_id=orb_id)
        record = await result.single()
        if record is None:
            return None
        return record["visibility"]


def assert_orb_accessible(visibility: str | None) -> None:
    """Raise if the orb is private or missing.

    For ``restricted``, the caller must additionally call
    ``assert_user_can_access_restricted`` to enforce the allowlist.
    """
    if visibility is None:
        raise HTTPException(status_code=404, detail="Orb not found")
    if visibility == "private":
        raise HTTPException(status_code=403, detail="This orb is private.")


async def assert_user_can_access_restricted(
    db: AsyncDriver, orb_id: str, current_user: dict | None
) -> None:
    """Enforce the per-user allowlist on restricted orbs.

    Raises 401 if the caller is not authenticated, 403 if their email is
    not on the allowlist (and they are not the owner). Owners always
    have access to their own orb regardless of grants.
    """
    if current_user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    email = (current_user.get("email") or "").strip().lower()

    # Owner bypass
    async with db.session() as session:
        result = await session.run(GET_PERSON_BY_ORB_ID, orb_id=orb_id)
        record = await result.single()
        if record is not None:
            owner_id = dict(record["p"]).get("user_id")
            if owner_id == current_user.get("user_id"):
                return

    if not email:
        raise HTTPException(status_code=403, detail="No email on your account")
    if not await user_has_access(db, orb_id, email):
        raise HTTPException(status_code=403, detail="You don't have access to this orb")
