from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from neo4j import AsyncDriver

from app.config import settings
from app.graph.neo4j_client import get_driver
from app.graph.queries import IS_ADMIN

security = HTTPBearer()


async def get_db() -> AsyncDriver:
    return await get_driver()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )
        return {"user_id": user_id, "email": payload.get("email", "")}
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from None


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
