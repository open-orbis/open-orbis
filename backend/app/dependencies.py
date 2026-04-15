from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt
from neo4j import AsyncDriver

from app.auth.service import SESSION_COOKIE, parse_session_cookie
from app.config import settings
from app.graph.neo4j_client import get_driver
from app.graph.queries import IS_ADMIN


async def get_db() -> AsyncDriver:
    return await get_driver()


def _decode_jwt(token: str) -> dict | None:
    """Decode a JWT and return the user dict, or ``None`` if invalid."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except JWTError:
        return None
    user_id = payload.get("sub")
    if user_id is None:
        return None
    return {"user_id": user_id, "email": payload.get("email", "")}


def _extract_token(request: Request) -> str | None:
    """Extract the access JWT from the ``__session`` cookie.

    The cookie holds ``<access_jwt>|<refresh_token>``; we only need the
    first part here.  Cookie-only — no Bearer header fallback.
    """
    access, _refresh = parse_session_cookie(request.cookies.get(SESSION_COOKIE))
    return access


async def get_current_user(request: Request) -> dict:
    token = _extract_token(request)
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    user = _decode_jwt(token)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )
    return user


async def get_current_user_optional(request: Request) -> dict | None:
    """Like ``get_current_user`` but returns ``None`` for missing/invalid auth.

    Used by endpoints that conditionally require auth based on resource
    state (e.g. restricted orbs require auth, public orbs don't).
    """
    token = _extract_token(request)
    if not token:
        return None
    return _decode_jwt(token)


async def require_admin(
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
) -> dict:
    """Allow only Persons with `is_admin = true`. Used by /admin/* endpoints.

    Implemented as a dedicated dependency rather than inside get_current_user
    so the JWT-only check stays cheap on the hot path of regular endpoints.
    """
    async with db.session() as session:
        result = await session.run(IS_ADMIN, user_id=current_user["user_id"])
        record = await result.single()
        if record is None or not record["is_admin"]:
            raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


async def require_gdpr_consent(
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
) -> dict:
    """Block any write / LLM endpoint until the user has granted GDPR consent.

    Used on endpoints that process or store user-controlled data: the CV
    pipeline, the LLM note enhancer, the orb node CRUD, and anything
    else that persists beyond the session. Returns ``current_user`` so
    consuming endpoints can drop-in replace ``Depends(get_current_user)``.
    """
    async with db.session() as session:
        result = await session.run(
            "MATCH (p:Person {user_id: $user_id}) "
            "RETURN coalesce(p.gdpr_consent, false) AS consent",
            user_id=current_user["user_id"],
        )
        record = await result.single()
    if record is None or not record["consent"]:
        raise HTTPException(status_code=403, detail="GDPR consent required")
    return current_user
