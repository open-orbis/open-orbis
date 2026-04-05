"""Admin authentication — completely separate from user Google OAuth."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import settings

admin_security = HTTPBearer()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def create_admin_jwt(admin_id: str) -> str:
    payload = {
        "type": "admin",
        "admin_id": admin_id,
        "exp": datetime.now(timezone.utc)
        + timedelta(minutes=settings.admin_jwt_expire_minutes),
    }
    return jwt.encode(
        payload, settings.admin_jwt_secret, algorithm=settings.admin_jwt_algorithm
    )


def verify_admin_jwt(token: str) -> str:
    """Decode and validate an admin JWT. Returns admin_id or raises HTTPException."""
    try:
        payload = jwt.decode(
            token,
            settings.admin_jwt_secret,
            algorithms=[settings.admin_jwt_algorithm],
        )
        if payload.get("type") != "admin":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not an admin token",
            )
        admin_id = payload.get("admin_id")
        if not admin_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid admin token",
            )
        return admin_id
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin token",
        ) from None


async def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(admin_security),
) -> str:
    """FastAPI dependency — returns admin_id from a valid admin JWT."""
    return verify_admin_jwt(credentials.credentials)
